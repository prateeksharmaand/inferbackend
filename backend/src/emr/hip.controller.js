const { pool }    = require('../config/database');
const logger      = require('../utils/logger');
const hip         = require('./hip.service');
const crypto      = require('crypto');
const bcrypt      = require('bcryptjs');
const audit       = require('../services/auditLogger');
const AbhaIdentity = require('./abha.identity');

// BLOCKER-4 fix: UUID format validation for request-ID and transaction-ID
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function _validateIds(requestId, transactionId) {
  if (requestId && !_UUID_RE.test(requestId)) {
    logger.warn('HIP: invalid request-id format', { requestId: String(requestId).slice(0, 36) });
  }
  if (transactionId && !_UUID_RE.test(transactionId)) {
    logger.warn('HIP: invalid transaction-id format', { transactionId: String(transactionId).slice(0, 36) });
  }
}

// M3-SEC: DB-backed rate limiting for health-information requests (survives restarts)
const HEALTH_INFO_RATE_LIMIT = parseInt(process.env.HEALTH_INFO_RATE_LIMIT || '10', 10);
const RATE_LIMIT_WINDOW_MS   = parseInt(process.env.RATE_LIMIT_WINDOW_MS   || String(60 * 60 * 1000), 10);

async function checkHealthInfoRateLimit(patientAbha) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  try {
    const { rows } = await pool.query(
      `INSERT INTO hip_rate_limits (key, count, window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (key) DO UPDATE
         SET count        = CASE WHEN hip_rate_limits.window_start < $2
                                 THEN 1
                                 ELSE hip_rate_limits.count + 1 END,
             window_start = CASE WHEN hip_rate_limits.window_start < $2
                                 THEN NOW()
                                 ELSE hip_rate_limits.window_start END
       RETURNING count`,
      [patientAbha, windowStart]
    );
    const count = rows[0]?.count ?? 1;
    return { allowed: count <= HEALTH_INFO_RATE_LIMIT, remaining: Math.max(0, HEALTH_INFO_RATE_LIMIT - count) };
  } catch (err) {
    // If rate limit table doesn't exist yet, allow and log
    logger.warn('HIP rate limit check failed, allowing request', { error: err.message });
    return { allowed: true, remaining: HEALTH_INFO_RATE_LIMIT };
  }
}

// ── ABDM gateway → HIP: care-context discovery ───────────────────────────────

const handleDiscovery = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const requestId = req.headers['request-id'] || req.body.requestId;
    const { transactionId, patient } = req.body;
    _validateIds(requestId, transactionId);
    // R2-013: mask ABHA address in logs (PHI)
    const maskedAbha = patient?.id
      ? patient.id.replace(/^(.{3}).*(@.*)$/, '$1***$2')
      : null;
    logger.info('HIP discover request', { requestId, transactionId, maskedAbha });

    let rows = [];
    let matchedBy = ['MOBILE'];
    if (patient?.id) {
      // Check abha_mappings first (supports multiple ABHA addresses per patient)
      ({ rows } = await pool.query(
        `SELECT p.* FROM emr_patients p
         JOIN abha_mappings m ON m.patient_id = p.id
         WHERE (m.abha_address=$1 OR m.abha_number=$1) AND m.status='active' AND p.deleted_at IS NULL
         LIMIT 1`,
        [patient.id]
      ));
      // Fallback: legacy columns
      if (!rows.length) {
        ({ rows } = await pool.query(
          `SELECT * FROM emr_patients WHERE (abha_address=$1 OR abha_number=$1) AND deleted_at IS NULL LIMIT 1`,
          [patient.id]
        ));
      }
      if (rows.length) matchedBy = ['ABHA_ID'];
    }
    if (!rows.length && patient?.verifiedIdentifiers?.length) {
      const mobiles = patient.verifiedIdentifiers
        .filter(i => i.type === 'MOBILE')
        .map(i => i.value);
      if (mobiles.length) {
        ({ rows } = await pool.query(
          `SELECT * FROM emr_patients WHERE mobile = ANY($1) AND deleted_at IS NULL LIMIT 1`,
          [mobiles]
        ));
        if (rows.length) matchedBy = ['MOBILE'];
      }
    }

    if (!rows.length) {
      // BLOCKER-2 fix: send explicit error callback, not silent null
      await hip.gwPost('/v0.5/care-contexts/on-discover', {
        requestId: hip.uuid(), timestamp: new Date().toISOString(),
        transactionId,
        error: { code: 'PATIENT_NOT_FOUND', message: 'No patient found matching the provided identifiers' },
        resp: { requestId },
      }).catch(e => logger.warn('HIP discover not-found callback failed', { error: e.message }));
      return;
    }

    const pt = rows[0];
    // R3-010: select only metadata columns — fhir_content not needed for discovery
    const { rows: ctxRows } = await pool.query(
      `SELECT id, reference_number, display, hi_type, created_at
       FROM emr_care_contexts
       WHERE patient_id=$1
       ORDER BY created_at DESC
       LIMIT 20`,
      [pt.id]
    );

    // ABDM: discovery response must echo back the exact identifier used in the request.
    // If query used abha_address, respond with abha_address — never substitute abha_number.
    const queriedId = patient?.id; // the identifier ABDM sent us in the discover request
    const abhaId = queriedId || pt.abha_address || pt.abha_number || `${pt.id}@hip`;
    await hip.sendDiscoverResult({
      requestId,
      transactionId,
      patientId:   abhaId,
      patientRef:  abhaId,
      patientName: pt.name || 'Patient',
      careContexts: ctxRows,
      matchedBy,
    });
    audit.abdmDiscovery(req, true, ctxRows.length);
    logger.info('HIP discover: matched patient', { contexts: ctxRows.length });
  } catch (err) {
    logger.error('handleDiscovery error', err);
  }
};

// ── ABDM gateway → HIP: link init (generate OTP) ─────────────────────────────

const handleLinkInit = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const requestId = req.headers['request-id'] || req.body.requestId;
    const { transactionId, patient } = req.body;
    _validateIds(requestId, transactionId);
    const careContexts = patient?.careContexts ?? req.body.careContexts ?? [];
    const patientId    = patient?.id ?? req.body.abhaAddress ?? req.body.patientId ?? '';
    logger.info('HIP link/init', { requestId, transactionId, careContextCount: careContexts.length });

    // Check abha_mappings first (supports multiple ABHA addresses per patient)
    const { patient: foundPt } = await AbhaIdentity.findPatient(pool, {
      abhaNumber: patientId, abhaAddress: patientId,
    });
    const pt = foundPt ?? null;

    // R2-011: supersede ALL pending sessions for this patient (expired or not)
    // so the unique index never blocks the new INSERT
    if (pt?.id) {
      await pool.query(
        `UPDATE hip_link_sessions SET status='superseded'
         WHERE patient_id=$1 AND status IN ('pending_otp','pending')`,
        [pt.id]
      );
    }

    // SEC-004: cryptographically secure OTP
    const otp           = String(crypto.randomInt(100000, 1000000));
    // R2-007: hash OTP before storing — never store plaintext in DB
    const otpHash       = await bcrypt.hash(otp, 10);
    const linkRefNumber = hip.uuid();
    const expiresAt     = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO hip_link_sessions
         (patient_id, transaction_id, request_id, care_contexts, otp_hash, otp_expires_at, link_ref_number, status, otp_attempt_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_otp',0)`,
      [pt?.id ?? null, transactionId, requestId,
       JSON.stringify(careContexts),
       otpHash, expiresAt, linkRefNumber]
    );

    // SEC-003: OTP never logged in production
    // In sandbox (NODE_ENV !== 'production'), print OTP to console so you can test without SMS
    if (process.env.ABDM_DEV_SHOW_OTP === 'true') {
      console.log(`\n========== SANDBOX OTP ==========\nRef : ${linkRefNumber}\nOTP : ${otp}\n=================================\n`);
    }
    logger.info('HIP OTP generated', { linkRefNumber, careContextCount: careContexts.length });
    // TODO: wire up SMS: await sendSms(pt?.mobile, `Your ABDM linking OTP: ${otp}. Valid 10 min.`);
    audit.abdmLinkInit(req, linkRefNumber);

    await hip.sendLinkInitResult({ requestId, transactionId, linkRefNumber });
  } catch (err) {
    logger.error('handleLinkInit error', err);
  }
};

// ── ABDM gateway → HIP: link confirm (verify OTP) ────────────────────────────

const MAX_OTP_ATTEMPTS = 3;

const handleLinkConfirm = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const requestId = req.headers['request-id'] || req.body.requestId;
    const { transactionId, confirmation } = req.body;
    _validateIds(requestId, transactionId);
    const { linkRefNumber, token: submittedOtp } = confirmation ?? {};
    logger.info('HIP link/confirm', { requestId, linkRefNumber });

    const { rows } = await pool.query(
      `SELECT * FROM hip_link_sessions WHERE link_ref_number=$1`,
      [linkRefNumber]
    );
    if (!rows.length) {
      logger.warn('HIP: link session not found', { linkRefNumber });
      return;
    }
    const session = rows[0];

    // BLOCKER-1 fix: check expiry FIRST, then lockout — prevents orphaned locked sessions
    if (new Date() > new Date(session.otp_expires_at)) {
      await pool.query(`UPDATE hip_link_sessions SET status='expired' WHERE id=$1`, [session.id]);
      logger.warn('HIP: OTP expired', { linkRefNumber });
      audit.abdmOtpResult(req, audit.EVENTS.ABDM_LINK_OTP_EXPIRED, linkRefNumber, 0);
      await hip.gwPostWithRetry('/v0.5/links/link/on-confirm', {
        requestId: hip.uuid(), timestamp: new Date().toISOString(),
        error: { code: 'OTP_EXPIRED', message: 'OTP has expired. Please initiate linking again.' },
        resp: { requestId },
      });
      return;
    }

    if (session.status === 'locked' || (session.otp_attempt_count ?? 0) >= MAX_OTP_ATTEMPTS) {
      logger.warn('HIP: OTP locked out', { linkRefNumber });
      await hip.gwPostWithRetry('/v0.5/links/link/on-confirm', {
        requestId: hip.uuid(), timestamp: new Date().toISOString(),
        error: { code: 'OTP_LOCKED', message: 'Too many incorrect attempts. Please initiate linking again.' },
        resp: { requestId },
      });
      return;
    }

    if (!['pending_otp', 'pending'].includes(session.status)) {
      logger.warn('HIP: link already processed', { linkRefNumber, status: session.status });
      return;
    }

    // R2-007 + SEC-022: bcrypt compare (constant-time by design)
    const isMatch = await bcrypt.compare(submittedOtp ?? '', session.otp_hash ?? '');

    if (!isMatch) {
      // SEC-007: increment attempt counter, lock after MAX_OTP_ATTEMPTS
      const newCount = (session.otp_attempt_count ?? 0) + 1;
      const newStatus = newCount >= MAX_OTP_ATTEMPTS ? 'locked' : session.status;
      await pool.query(
        `UPDATE hip_link_sessions SET otp_attempt_count=$1, status=$2 WHERE id=$3`,
        [newCount, newStatus, session.id]
      );
      logger.warn('HIP: OTP mismatch', { linkRefNumber, attemptsRemaining: MAX_OTP_ATTEMPTS - newCount });
      audit.abdmOtpResult(req, newStatus === 'locked' ? audit.EVENTS.ABDM_LINK_OTP_LOCKED : audit.EVENTS.ABDM_LINK_OTP_FAIL, linkRefNumber, MAX_OTP_ATTEMPTS - newCount);
      await hip.gwPost('/v0.5/links/link/on-confirm', {
        requestId: hip.uuid(), timestamp: new Date().toISOString(),
        error: { code: newStatus === 'locked' ? 'OTP_LOCKED' : 'OTP_INVALID', message: 'Invalid OTP' },
        resp: { requestId },
      });
      return;
    }

    await pool.query(`UPDATE hip_link_sessions SET status='confirmed' WHERE id=$1`, [session.id]);
    audit.abdmOtpResult(req, audit.EVENTS.ABDM_LINK_OTP_SUCCESS, linkRefNumber, MAX_OTP_ATTEMPTS);

    let careContexts = session.care_contexts ?? [];
    if (!Array.isArray(careContexts)) careContexts = Object.values(careContexts);

    const ptId = session.patient_id
      ? (await pool.query(`SELECT abha_address, abha_number, id FROM emr_patients WHERE id=$1 AND deleted_at IS NULL`, [session.patient_id]))
          .rows[0]
      : null;
    const patientRef = ptId?.abha_address ?? ptId?.abha_number ?? `${ptId?.id}@hip`;

    if (!careContexts.length && session.patient_id) {
      const { rows: ctxRows } = await pool.query(
        `SELECT reference_number AS "referenceNumber", display
         FROM emr_care_contexts WHERE patient_id=$1 ORDER BY created_at DESC`,
        [session.patient_id]
      );
      careContexts = ctxRows;
      logger.info('HIP link confirm: loaded care contexts from EMR DB', { count: careContexts.length });
    }

    if (!careContexts.length) {
      logger.warn('HIP link confirm: patient has no care contexts', { linkRefNumber });
      await hip.gwPostWithRetry('/v0.5/links/link/on-confirm', {
        requestId: hip.uuid(), timestamp: new Date().toISOString(),
        error: { code: 'CARE_CONTEXT_NOT_FOUND', message: 'No care contexts available for this patient' },
        resp: { requestId },
      });
      return;
    }

    // BLOCKER-3 fix: validate confirmed care contexts exist in EMR DB for this patient
    if (session.patient_id) {
      const requestedRefs = careContexts
        .map(c => c.careContextReference ?? c.referenceNumber ?? c.reference_number)
        .filter(Boolean);
      if (requestedRefs.length) {
        const { rows: validCtxs } = await pool.query(
          `SELECT reference_number FROM emr_care_contexts
           WHERE patient_id=$1 AND reference_number = ANY($2::text[])`,
          [session.patient_id, requestedRefs]
        );
        if (validCtxs.length !== requestedRefs.length) {
          logger.warn('HIP link confirm: care context mismatch', {
            requested: requestedRefs.length, found: validCtxs.length, linkRefNumber,
          });
          // Use only verified contexts to prevent linking phantom references
          const validRefs = new Set(validCtxs.map(r => r.reference_number));
          careContexts = careContexts.filter(c => {
            const ref = c.careContextReference ?? c.referenceNumber ?? c.reference_number;
            return validRefs.has(ref);
          });
        }
      }
    }

    logger.info('HIP link confirm payload', { patientRef, count: careContexts.length });
    await hip.sendLinkConfirmResultWithRetry({ requestId, patientId: patientRef, careContexts });
    logger.info('HIP link confirmed', { linkRefNumber, contexts: careContexts.length });
  } catch (err) {
    logger.error('handleLinkConfirm error', err);
  }
};

// ── ABDM gateway → HIP: health information request ───────────────────────────

const handleHealthInfoRequest = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  let transactionId; // Declare at function scope so catch block can access it
  try {
    const { hiRequest } = req.body;

    // ABDM v3 puts transactionId inside hiRequest; v0.5 puts it at the top level.
    // Always prefer hiRequest.transactionId — that is what ABDM validates at the transfer endpoint.
    const topLevelTxnId    = req.body?.transactionId;
    const hiRequestTxnId   = hiRequest?.transactionId;
    const rawTransactionId = hiRequestTxnId ?? topLevelTxnId;

    // Diagnostic log — compare both locations so ABDM-1017 mismatches are immediately visible
    logger.info('ABDM handleHealthInfoRequest transactionId sources', {
      topLevelTransactionId:   topLevelTxnId,
      hiRequestTransactionId:  hiRequestTxnId,
      resolved:                rawTransactionId,
      dataPushUrl:             hiRequest?.dataPushUrl,
      bodyKeys:                Object.keys(req.body || {}),
      hiRequestKeys:           Object.keys(hiRequest || {}),
    });

    if (!rawTransactionId) {
      logger.error('ABDM Transaction Trace', {
        stage: 'request_received',
        error: 'Missing transactionId in both req.body and req.body.hiRequest',
        bodyKeys: Object.keys(req.body || {}),
      });
      return;
    }

    const transactionIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof rawTransactionId !== 'string' || !transactionIdRegex.test(rawTransactionId)) {
      logger.error('ABDM Transaction Trace', {
        stage: 'request_received',
        error: 'Invalid transactionId format',
        transactionId: rawTransactionId,
      });
      return;
    }

    transactionId = rawTransactionId;
    const consentId   = hiRequest?.consent?.id;
    const dataPushUrl = hiRequest?.dataPushUrl;
    const keyMaterial = hiRequest?.keyMaterial;

    logger.info('ABDM handleHealthInfoRequest extracted', {
      transactionId,
      consentId,
      dataPushUrl,
      hasKeyMaterial: !!keyMaterial,
    });

    logger.info('ABDM Transaction Trace', {
      stage: 'request_received',
      transactionId,
      consentId,
      hasKeyMaterial: !!keyMaterial,
    });

    await pool.query(
      `INSERT INTO hip_health_requests (transaction_id, consent_id, data_push_url, key_material)
       VALUES ($1,$2,$3,$4) ON CONFLICT (transaction_id) DO NOTHING`,
      [transactionId, consentId, dataPushUrl, JSON.stringify(keyMaterial ?? {})]
    );

    logger.info('ABDM Transaction Trace', {
      stage: 'transaction_saved',
      transactionId,
      consentId,
    });

    // SEC-008 + R3-009: verify consent exists, is GRANTED, and not expired (dataEraseAt)
    const { rows: artifactRows } = await pool.query(
      `SELECT * FROM hip_consent_artifacts
       WHERE consent_id=$1
         AND status IN ('GRANTED','ACTIVE')
         AND (
           (raw->'consentDetail'->'permission'->>'dataEraseAt') IS NULL
           OR (raw->'consentDetail'->'permission'->>'dataEraseAt')::timestamptz > NOW()
           OR (raw->'permission'->>'dataEraseAt')::timestamptz > NOW()
         )
       LIMIT 1`,
      [consentId]
    ).catch(() => ({ rows: [] }));

    const inlineConsent = hiRequest?.consent;
    const artifact      = artifactRows[0];
    const raw           = artifact?.raw ?? {};

    // SEC-008: reject revoked/expired consent
    if (!artifactRows.length && !inlineConsent) {
      logger.warn('HIP health-info: consent not found or not GRANTED', { consentId });
      audit.abdmHealthInfoRequest(req, transactionId, consentId, 'DENIED');
      const requestId = req.headers['request-id'] || req.body.requestId;
      await hip.sendHealthInfoOnRequest({ requestId, transactionId, sessionStatus: 'DENIED' });
      await pool.query(`UPDATE hip_health_requests SET status='denied' WHERE transaction_id=$1`, [transactionId]);
      return;
    }
    audit.abdmHealthInfoRequest(req, transactionId, consentId, 'ACKNOWLEDGED');

    // SEC-008: verify inline consent has required fields (no DB artifact → must have valid structure)
    if (!artifact && inlineConsent) {
      const consentId2  = inlineConsent?.id ?? inlineConsent?.consentId;
      const hasPatient  = !!(inlineConsent?.patient?.id || inlineConsent?.consentDetail?.patient?.id);
      const hasPurpose  = !!(inlineConsent?.purpose?.code || inlineConsent?.consentDetail?.purpose?.code);
      const hasExpiry   = !!(inlineConsent?.permission?.dataEraseAt || inlineConsent?.consentDetail?.permission?.dataEraseAt);
      if (!consentId2 || !hasPatient || !hasPurpose) {
        logger.warn('HIP health-info: inline consent missing required fields', {
          consentId, hasConsentId: !!consentId2, hasPatient, hasPurpose, hasExpiry,
        });
        const requestId = req.headers['request-id'] || req.body.requestId;
        await hip.sendHealthInfoOnRequest({ requestId, transactionId, sessionStatus: 'DENIED' });
        await pool.query(`UPDATE hip_health_requests SET status='denied' WHERE transaction_id=$1`, [transactionId]);
        return;
      }
      // Verify inline consent dataEraseAt has not passed
      const eraseAt = inlineConsent?.permission?.dataEraseAt ?? inlineConsent?.consentDetail?.permission?.dataEraseAt;
      if (eraseAt && new Date(eraseAt) < new Date()) {
        logger.warn('HIP health-info: inline consent expired', { consentId, eraseAt });
        const requestId = req.headers['request-id'] || req.body.requestId;
        await hip.sendHealthInfoOnRequest({ requestId, transactionId, sessionStatus: 'DENIED' });
        await pool.query(`UPDATE hip_health_requests SET status='denied' WHERE transaction_id=$1`, [transactionId]);
        return;
      }
      logger.info('HIP health-info: using inline consent (no stored artifact)', { consentId });
    }

    // M3-SEC: Rate limit health-info requests per patient (prevents DoS)
    const patientAbha = artifact?.patient_abha || inlineConsent?.patient?.id;
    if (patientAbha) {
      const rateCheck = await checkHealthInfoRateLimit(patientAbha);
      if (!rateCheck.allowed) {
        logger.warn('Health-info request rate limit exceeded', {
          patientAbha,
          transactionId,
          limit: HEALTH_INFO_RATE_LIMIT,
          window: '1 hour',
        });
        // Return DENIED instead of blocking (per ABDM async pattern)
        const requestId = req.headers['request-id'] || req.body.requestId;
        await hip.sendHealthInfoOnRequest({ requestId, transactionId, sessionStatus: 'DENIED' });
        await pool.query(`UPDATE hip_health_requests SET status='rate_limited' WHERE transaction_id=$1`, [transactionId]);
        return;
      }
      logger.debug('Health-info rate limit check', { patientAbha, remaining: rateCheck.remaining });
    }

    const ctxList =
      inlineConsent?.careContexts ??
      inlineConsent?.consentDetail?.careContexts ??
      raw.grants?.careContexts ??
      raw.careContexts ??
      raw.consentDetail?.careContexts ??
      [];

    const consentedRefs = ctxList.map(c => c.careContextReference).filter(Boolean);

    // SEC-008: extract consent date range for filtering
    const consentFrom = raw.consentDetail?.permission?.dateRange?.from
      ?? raw.grants?.dateRange?.from
      ?? inlineConsent?.consentDetail?.permission?.dateRange?.from;
    const consentTo = raw.consentDetail?.permission?.dateRange?.to
      ?? raw.grants?.dateRange?.to
      ?? inlineConsent?.consentDetail?.permission?.dateRange?.to;

    const patientId =
      inlineConsent?.patient?.id ??
      inlineConsent?.careContexts?.[0]?.patientReference ??
      raw.grants?.careContexts?.[0]?.patientReference ??
      raw.patient?.id ??
      raw.consentDetail?.patient?.id ??
      ctxList[0]?.patientReference;

    logger.info('HIP health-info: consent filter', {
      consentId,
      consentedRefCount: consentedRefs.length,
      hasPatientId: !!patientId,
      source: inlineConsent ? 'inline' : 'stored',
    });

    let resolvedPatientId = patientId;

    if (!resolvedPatientId && artifact?.patient_abha) {
      resolvedPatientId = artifact.patient_abha;
    }

    if (!resolvedPatientId && consentId) {
      const { rows: cr } = await pool.query(
        `SELECT patient_abha FROM emr_consent_requests WHERE request_id=$1 LIMIT 1`,
        [consentId]
      ).catch(() => ({ rows: [] }));
      resolvedPatientId = cr[0]?.patient_abha ?? null;
    }

    if (!resolvedPatientId && consentId) {
      try {
        const gwArtifact = await hip.gwGet(`/v0.5/consents/${consentId}`);
        const gp = gwArtifact?.consent?.patient?.id ?? gwArtifact?.consentDetail?.patient?.id;
        if (gp) {
          resolvedPatientId = gp;
          await pool.query(
            `UPDATE hip_consent_artifacts SET patient_abha=$1 WHERE consent_id=$2`,
            [gp, consentId]
          ).catch(() => {});
        }
      } catch (_) {}
    }

    let rows;
    if (consentedRefs.length) {
      const { rows: r } = await pool.query(
        `SELECT ecc.*, ep.name, ep.mobile, ep.dob, ep.gender
         FROM emr_care_contexts ecc
         JOIN emr_patients ep ON ep.id = ecc.patient_id
         WHERE ecc.reference_number = ANY($1::text[])
         ORDER BY ecc.created_at DESC`,
        [consentedRefs]
      );
      rows = r;
    } else if (resolvedPatientId) {
      // SEC-008: apply consent date range filter when no explicit refs
      const dateFilter = (consentFrom && consentTo)
        ? `AND ecc.created_at BETWEEN $2::timestamptz AND $3::timestamptz`
        : '';
      const params = consentFrom && consentTo
        ? [resolvedPatientId, consentFrom, consentTo]
        : [resolvedPatientId];
      // ABDM: scope care contexts to exact ABHA address used in consent/discovery.
      // Never use OR abha_number — two addresses are separate identities in ABDM.
      const { rows: r } = await pool.query(
        `SELECT ecc.*, ep.name, ep.mobile, ep.dob, ep.gender
         FROM emr_care_contexts ecc
         JOIN emr_patients ep ON ep.id = ecc.patient_id
         WHERE ep.abha_address = $1
         ${dateFilter}
         ORDER BY ecc.created_at DESC`,
        params
      );
      rows = r;
    } else {
      rows = [];
    }

    logger.info('HIP health-info: care contexts to push', { count: rows.length });

    if (!rows.length) {
      logger.warn('HIP health-info: no care contexts to push');
      await pool.query(`UPDATE hip_health_requests SET status='sent' WHERE transaction_id=$1`, [transactionId]);
      return;
    }

    const requestId = req.headers['request-id'] || req.body.requestId;
    await hip.sendHealthInfoOnRequest({ requestId, transactionId, sessionStatus: 'ACKNOWLEDGED' });

    // R3-002: include abhaNumber so FHIR bundle Patient.identifier is populated (ABDM IG)
    const patient = {
      name:       rows[0].name,
      mobile:     rows[0].mobile,
      dob:        rows[0].dob,
      gender:     rows[0].gender,
      abhaNumber: rows[0].abha_number ?? rows[0].abha_address ?? null,
    };

    logger.info('ABDM Transaction Trace', {
      stage: 'bundle_generated',
      transactionId,
      careContextCount: rows.length,
      dataPushUrl: dataPushUrl ? 'present' : 'missing',
    });

    await hip.pushHealthData({ dataPushUrl, transactionId, careContexts: rows, patient, keyMaterial });

    logger.info('ABDM Transaction Trace', {
      stage: 'transfer_request_sent',
      transactionId,
    });

    await pool.query(`UPDATE hip_health_requests SET status='sent' WHERE transaction_id=$1`, [transactionId]);
  } catch (err) {
    logger.error('handleHealthInfoRequest error', {
      message:   err.message,
      status:    err.response?.status,
      abdmError: JSON.stringify(err.response?.data),
      transactionId: transactionId || 'UNKNOWN',
    });
    // Use the validated transactionId from scope, fallback to req.body if error happened during validation
    const txId = transactionId || req.body?.transactionId;
    if (txId) {
      await pool.query(`UPDATE hip_health_requests SET status='failed' WHERE transaction_id=$1`,
        [txId]).catch(() => {});
    }
  }
};

// ── ABDM → HIP: patient shares profile via QR scan (SHARE_PATIENT_PROFILE_701) ─

const _ensureSharesTable = pool.query(`
  CREATE TABLE IF NOT EXISTS hip_profile_shares (
    id               SERIAL PRIMARY KEY,
    request_id       TEXT UNIQUE,
    share_code       TEXT,
    abha_number      TEXT,
    abha_address     TEXT,
    name             TEXT,
    mobile           TEXT,
    gender           TEXT,
    dob              DATE,
    raw_profile      JSONB,
    token            TEXT,
    token_expires_at TIMESTAMPTZ,
    status           TEXT NOT NULL DEFAULT 'pending',
    patient_id       INT REFERENCES emr_patients(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).then(() =>
  pool.query(`
    ALTER TABLE hip_profile_shares
      ADD COLUMN IF NOT EXISTS token TEXT,
      ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ
  `)
).catch(err => logger.error('hip_profile_shares table init error', err));

const handlePatientShareProfile = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    await _ensureSharesTable;
    const requestId = req.headers['request-id'] || req.body.requestId;
    const { profile } = req.body;
    logger.info('HIP patient share profile', { requestId });

    const p           = profile?.patient ?? {};
    const abhaNumber  = p.abhaNumber  || p.ABHANumber  || null;
    const abhaAddress = p.abhaAddress || p.preferredAbhaAddress || null;
    const name        = p.name || [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || null;
    const mobile      = p.mobile || null;
    const gender      = p.gender || null;
    const dob         = (p.yearOfBirth && p.monthOfBirth && p.dayOfBirth)
      ? `${p.yearOfBirth}-${String(p.monthOfBirth).padStart(2,'0')}-${String(p.dayOfBirth).padStart(2,'0')}`
      : (p.dateOfBirth || null);

    // SEC-004: cryptographically secure token
    const token          = String(crypto.randomInt(100000, 1000000));
    // R3-007: store SHA-256 hash, never plaintext
    const tokenHash      = crypto.createHash('sha256').update(token).digest('hex');
    const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      `INSERT INTO hip_profile_shares
         (request_id, share_code, abha_number, abha_address, name, mobile, gender, dob, raw_profile, token_hash, token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (request_id) DO NOTHING`,
      [requestId, profile?.shareCode || null, abhaNumber, abhaAddress, name, mobile, gender, dob, profile || {}, tokenHash, tokenExpiresAt]
    );

    await hip.sendShareProfileAck({
      requestId,
      abhaAddress: abhaAddress || abhaNumber,
      tokenNumber: token,
    });

    // SEC-003: token not logged
    logger.info('Patient profile share stored + ack sent', { hasAbhaNumber: !!abhaNumber });
  } catch (err) {
    logger.error('handlePatientShareProfile error', err);
  }
};

// ── CM → HIP: consent artifact notification (after patient approves) ─────────

const handleConsentNotify = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const requestId    = req.headers['request-id'] || req.body.requestId;
    const { notification } = req.body;
    logger.info('HIP consent notify', { requestId, status: notification?.status, consentId: notification?.consentId });

    if (!notification) return;

    // R3-011: validate required fields and known status values
    const consentId = notification.consentId ?? notification.consentRequestId;
    const status    = notification.status;
    if (!consentId || !status) {
      logger.warn('HIP consent notify: missing consentId or status', { requestId });
      return;
    }
    const VALID_STATUSES = ['GRANTED', 'DENIED', 'REVOKED', 'EXPIRED'];
    if (!VALID_STATUSES.includes(status)) {
      logger.warn('HIP consent notify: unknown status — ignoring', { status, consentId });
      return;
    }

    // R3-011: cap raw JSON size to 64KB
    const rawJson = JSON.stringify(notification);
    if (rawJson.length > 65536) {
      logger.warn('HIP consent notify: payload exceeds 64KB limit', { size: rawJson.length, consentId });
      return;
    }

    const artefacts  = notification.consentArtefacts ?? [];

    const patientAbha =
      notification.consentDetail?.patient?.id ??
      notification.grants?.careContexts?.[0]?.patientReference ??
      notification.careContexts?.[0]?.patientReference ??
      null;

    await pool.query(
      `INSERT INTO hip_consent_artifacts (consent_id, status, artefacts, raw, patient_abha)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (consent_id) DO UPDATE
         SET status=$2, artefacts=$3, raw=$4, patient_abha=COALESCE($5, hip_consent_artifacts.patient_abha), updated_at=NOW()`,
      [consentId, status, JSON.stringify(artefacts), JSON.stringify(notification), patientAbha]
    ).catch(() => {});

    logger.info('HIP consent notify: stored artifact', { consentId, status, hasPatientAbha: !!patientAbha });

    await hip.gwPost('/v0.5/consents/hip/on-notify', {
      requestId: hip.uuid(),
      timestamp: new Date().toISOString(),
      acknowledgement: { status: 'OK', consentId },
      resp: { requestId },
    });

    audit.abdmConsentNotify(req, consentId, status);
    logger.info('HIP consent notify ack sent', { consentId, status, artefactCount: artefacts.length });
  } catch (err) {
    logger.error('handleConsentNotify error', err);
  }
};

// ── ABDM → HIP: verify running token status ──────────────────────────────────

const handleRunningTokenStatus = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const requestId   = req.headers['request-id'] || req.body.requestId;
    const shareProfile = req.body.shareProfile ?? req.body;
    const tokenNumber  = shareProfile?.tokenNumber ?? shareProfile?.context;
    const hipId        = shareProfile?.hipId;
    logger.info('HIP running-token/status', { requestId, hipId });

    if (!tokenNumber) {
      logger.warn('HIP running-token/status: no tokenNumber in request');
      return;
    }

    // R3-007: look up by SHA-256 hash of token, not plaintext
    const tokenHash = crypto.createHash('sha256').update(String(tokenNumber)).digest('hex');
    const { rows } = await pool.query(
      `SELECT token_hash, token_expires_at, status FROM hip_profile_shares
       WHERE token_hash=$1 ORDER BY created_at DESC LIMIT 1`,
      [tokenHash]
    );

    const share      = rows[0];
    const isValid    = share && new Date() < new Date(share.token_expires_at) && share.status !== 'expired';
    const tokenStatus = isValid ? 'VALID' : 'EXPIRED';

    logger.info('HIP running-token/status result', { tokenStatus });

    await hip.hiecmPost('/patient-share/v3/on-running-token-status', {
      requestId: hip.uuid(),
      timestamp: new Date().toISOString(),
      acknowledgement: {
        tokenStatus,
        tokenNumber: String(tokenNumber),
        hipId: hipId ?? process.env.ABDM_HIP_ID ?? process.env.ABDM_CLIENT_ID,
      },
      response: { requestId },
    }).catch(err => logger.warn('HIP running-token/status ack failed', { error: err.message, status: err.response?.status }));
  } catch (err) {
    logger.error('handleRunningTokenStatus error', err);
  }
};

// ── ABDM async callback: on-generate-token ────────────────────────────────────
// ABDM calls this after HIP requests /v3/token/generate-token (async flow).
// The response contains the linkToken that must be used for /hip/v3/link/carecontext.
const { EventEmitter } = require('events');
const _linkTokenEmitter = new EventEmitter();
_linkTokenEmitter.setMaxListeners(100);

const handleOnGenerateToken = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const { linkToken, abhaNumber } = req.body;
    // ABDM echoes the REQUEST-ID header (not body requestId) in response.requestId
    const requestId = req.body?.response?.requestId ?? req.body?.requestId ?? null;
    const cleanAbha = abhaNumber ? String(abhaNumber).replace(/-/g, '') : null;

    // Step 6 diagnostic: log complete callback payload for ABDM-1207 debugging
    logger.info('HIP on-generate-token callback received', {
      requestId, hasToken: !!linkToken, hasAbhaNumber: !!abhaNumber,
      bodyKeys: Object.keys(req.body || {}),
      fullPayload: JSON.stringify(req.body),
    });

    // ── ERROR PATH: ABDM returned an error instead of a token ────────────────
    if (req.body?.error || !linkToken) {
      const errCode = req.body?.error?.code || 'ABDM_ERROR';
      const errMsg  = req.body?.error?.message || 'No linkToken in on-generate-token callback';
      const errObj  = Object.assign(new Error(`${errCode}: ${errMsg}`), { status: 400 });
      logger.warn('HIP on-generate-token: error callback received', { errCode, errMsg, fullError: JSON.stringify(req.body?.error) });

      const { pool } = require('../config/database');
      const hipId = process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID || 'infer-hip';

      // ABDM does not echo our REQUEST-ID in error callbacks — correlate by finding
      // all pending link token requests for this HIP and emit error to each
      const { rows: pending } = await pool.query(
        `UPDATE link_tokens SET status='failed', updated_at=NOW()
         WHERE hip_id=$1 AND status='pending'
         RETURNING patient_ref, abdm_request_id`,
        [hipId]
      ).catch(() => ({ rows: [] }));

      for (const row of pending) {
        _linkTokenEmitter.emit(`token:${row.patient_ref}`, null, errObj);
        if (row.abdm_request_id) _linkTokenEmitter.emit(`req:${row.abdm_request_id}`, null, errObj);
        logger.info('HIP on-generate-token: emitted error to pending request', { patientRef: row.patient_ref?.slice(-4) });
      }

      // Fallback: if cleanAbha was in body
      if (cleanAbha) _linkTokenEmitter.emit(`token:${cleanAbha}`, null, errObj);
      return;
    }

    // ── SUCCESS PATH: ABDM returned a linkToken ──────────────────────────────
    const abdmSvc = require('../services/abdm.service');
    const hipId   = process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID || 'infer-hip';

    // Primary: emit by requestId (correlates with the REQUEST-ID we sent to ABDM)
    if (requestId) {
      _linkTokenEmitter.emit(`req:${requestId}`, linkToken);
      logger.info('HIP on-generate-token: emitted by requestId', { requestId });
    }

    // Secondary: emit by abhaNumber if present (may or may not be in payload)
    if (cleanAbha) {
      _linkTokenEmitter.emit(`token:${cleanAbha}`, linkToken);
      await abdmSvc._storeLinkToken(`${cleanAbha}:${hipId}`, linkToken);
      logger.info('HIP on-generate-token: emitted by abhaNumber + stored', { cleanAbha: cleanAbha.slice(-4) });
    }

    // If no abhaNumber — store via requestId lookup from pending link_tokens row
    if (!cleanAbha && requestId) {
      const { pool } = require('../config/database');
      const { rows } = await pool.query(
        `SELECT patient_ref FROM link_tokens WHERE abdm_request_id=$1 LIMIT 1`,
        [requestId]
      ).catch(() => ({ rows: [] }));
      if (rows[0]?.patient_ref) {
        await abdmSvc._storeLinkToken(`${rows[0].patient_ref}:${hipId}`, linkToken);
        logger.info('HIP on-generate-token: stored via requestId→patient_ref lookup', { patientRef: rows[0].patient_ref.slice(-4) });
      } else {
        // Store with requestId as key so generateLinkToken can find it
        abdmSvc._storeLinkTokenByRequestId(requestId, linkToken);
        logger.info('HIP on-generate-token: stored by requestId (no patient_ref found)', { requestId });
      }
    }
  } catch (err) {
    logger.error('handleOnGenerateToken error', err);
  }
};

module.exports = {
  handleDiscovery, handleLinkInit, handleLinkConfirm, handleHealthInfoRequest,
  handlePatientShareProfile, handleConsentNotify, handleRunningTokenStatus,
  handleOnGenerateToken, _linkTokenEmitter,
};
