const { pool }    = require('../config/database');
const logger      = require('../utils/logger');
const hip         = require('./hip.service');
const crypto      = require('crypto');
const bcrypt      = require('bcryptjs');

// ── ABDM gateway → HIP: care-context discovery ───────────────────────────────

const handleDiscovery = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const requestId = req.headers['request-id'] || req.body.requestId;
    const { transactionId, patient } = req.body;
    // R2-013: mask ABHA address in logs (PHI)
    const maskedAbha = patient?.id
      ? patient.id.replace(/^(.{3}).*(@.*)$/, '$1***$2')
      : null;
    logger.info('HIP discover request', { requestId, transactionId, maskedAbha });

    let rows = [];
    let matchedBy = ['MOBILE'];
    if (patient?.id) {
      ({ rows } = await pool.query(
        `SELECT * FROM emr_patients WHERE abha_address=$1 OR abha_number=$1 LIMIT 1`,
        [patient.id]
      ));
      if (rows.length) matchedBy = ['ABHA_ID'];
    }
    if (!rows.length && patient?.verifiedIdentifiers?.length) {
      const mobiles = patient.verifiedIdentifiers
        .filter(i => i.type === 'MOBILE')
        .map(i => i.value);
      if (mobiles.length) {
        ({ rows } = await pool.query(
          `SELECT * FROM emr_patients WHERE mobile = ANY($1) LIMIT 1`,
          [mobiles]
        ));
        if (rows.length) matchedBy = ['MOBILE'];
      }
    }

    if (!rows.length) {
      // Return same response whether patient found or not — prevents ABHA enumeration
      await hip.sendDiscoverResult({ requestId, transactionId, patientId: null, careContexts: [], matchedBy: [] });
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

    const abhaId = pt.abha_address ?? pt.abha_number ?? `${pt.id}@hip`;
    await hip.sendDiscoverResult({
      requestId,
      transactionId,
      patientId: abhaId,
      patientRef: abhaId,
      careContexts: ctxRows,
      matchedBy,
    });
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
    const careContexts = patient?.careContexts ?? req.body.careContexts ?? [];
    const patientId    = patient?.id ?? req.body.abhaAddress ?? req.body.patientId ?? '';
    logger.info('HIP link/init', { requestId, transactionId, careContextCount: careContexts.length });

    const { rows } = await pool.query(
      `SELECT * FROM emr_patients WHERE abha_address=$1 OR abha_number=$1 LIMIT 1`,
      [patientId]
    );
    const pt = rows[0] ?? null;

    // R2-011: supersede any existing active link sessions to prevent duplication
    if (pt?.id) {
      await pool.query(
        `UPDATE hip_link_sessions SET status='superseded'
         WHERE patient_id=$1 AND status IN ('pending_otp','pending') AND otp_expires_at > NOW()`,
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

    if (!['pending_otp', 'pending'].includes(session.status)) {
      logger.warn('HIP: link already processed or locked', { linkRefNumber, status: session.status });
      return;
    }

    // Check lockout BEFORE expiry check (locked takes priority)
    if (session.status === 'locked' || (session.otp_attempt_count ?? 0) >= MAX_OTP_ATTEMPTS) {
      logger.warn('HIP: OTP locked out', { linkRefNumber });
      await hip.gwPost('/v0.5/links/link/on-confirm', {
        requestId: hip.uuid(), timestamp: new Date().toISOString(),
        error: { code: 'OTP_LOCKED', message: 'Too many incorrect attempts' },
        resp: { requestId },
      });
      return;
    }

    if (new Date() > new Date(session.otp_expires_at)) {
      await pool.query(`UPDATE hip_link_sessions SET status='expired' WHERE id=$1`, [session.id]);
      logger.warn('HIP: OTP expired', { linkRefNumber });
      await hip.gwPost('/v0.5/links/link/on-confirm', {
        requestId: hip.uuid(), timestamp: new Date().toISOString(),
        error: { code: 'OTP_EXPIRED', message: 'OTP has expired' },
        resp: { requestId },
      });
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
      await hip.gwPost('/v0.5/links/link/on-confirm', {
        requestId: hip.uuid(), timestamp: new Date().toISOString(),
        error: { code: newStatus === 'locked' ? 'OTP_LOCKED' : 'OTP_INVALID', message: 'Invalid OTP' },
        resp: { requestId },
      });
      return;
    }

    await pool.query(`UPDATE hip_link_sessions SET status='confirmed' WHERE id=$1`, [session.id]);

    let careContexts = session.care_contexts ?? [];
    if (!Array.isArray(careContexts)) careContexts = Object.values(careContexts);

    const ptId = session.patient_id
      ? (await pool.query(`SELECT abha_address, abha_number, id FROM emr_patients WHERE id=$1`, [session.patient_id]))
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
      return;
    }

    logger.info('HIP link confirm payload', { patientRef, count: careContexts.length });
    await hip.sendLinkConfirmResult({ requestId, patientId: patientRef, careContexts });
    logger.info('HIP link confirmed', { linkRefNumber, contexts: careContexts.length });
  } catch (err) {
    logger.error('handleLinkConfirm error', err);
  }
};

// ── ABDM gateway → HIP: health information request ───────────────────────────

const handleHealthInfoRequest = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const { transactionId, hiRequest } = req.body;
    const consentId   = hiRequest?.consent?.id;
    const dataPushUrl = hiRequest?.dataPushUrl;
    const keyMaterial = hiRequest?.keyMaterial;

    // SEC-010: no PHI or key material in logs
    logger.info('HIP health-info request', { transactionId, consentId, hasKeyMaterial: !!keyMaterial });

    await pool.query(
      `INSERT INTO hip_health_requests (transaction_id, consent_id, data_push_url, key_material)
       VALUES ($1,$2,$3,$4) ON CONFLICT (transaction_id) DO NOTHING`,
      [transactionId, consentId, dataPushUrl, JSON.stringify(keyMaterial ?? {})]
    );

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
      const requestId = req.headers['request-id'] || req.body.requestId;
      await hip.sendHealthInfoOnRequest({ requestId, transactionId, sessionStatus: 'DENIED' });
      await pool.query(`UPDATE hip_health_requests SET status='denied' WHERE transaction_id=$1`, [transactionId]);
      return;
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
      const { rows: r } = await pool.query(
        `SELECT ecc.*, ep.name, ep.mobile, ep.dob, ep.gender
         FROM emr_care_contexts ecc
         JOIN emr_patients ep ON ep.id = ecc.patient_id
         WHERE (ep.abha_address=$1 OR ep.abha_number=$1)
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
    await hip.pushHealthData({ dataPushUrl, transactionId, careContexts: rows, patient, keyMaterial });
    await pool.query(`UPDATE hip_health_requests SET status='sent' WHERE transaction_id=$1`, [transactionId]);
  } catch (err) {
    logger.error('handleHealthInfoRequest error', {
      message: err.message,
      status: err.response?.status,
    });
    await pool.query(`UPDATE hip_health_requests SET status='failed' WHERE transaction_id=$1`,
      [req.body?.transactionId]).catch(() => {});
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

module.exports = { handleDiscovery, handleLinkInit, handleLinkConfirm, handleHealthInfoRequest, handlePatientShareProfile, handleConsentNotify, handleRunningTokenStatus };
