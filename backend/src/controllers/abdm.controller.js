const abdm   = require('../services/abdm.service');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

// M3-SEC: Rate limiting for health-info requests (prevents DoS attacks)
// Key: consentId + patient ABHA; Value: { count, resetTime }
const _healthInfoRateLimits = new Map();
const HEALTH_INFO_RATE_LIMIT = 10; // Max 10 requests per patient
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkHealthInfoRateLimit(key) {
  const now = Date.now();
  const entry = _healthInfoRateLimits.get(key);

  if (!entry) {
    // First request - initialize
    _healthInfoRateLimits.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: HEALTH_INFO_RATE_LIMIT - 1 };
  }

  if (now > entry.resetTime) {
    // Window expired - reset
    _healthInfoRateLimits.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: HEALTH_INFO_RATE_LIMIT - 1 };
  }

  // Within window - check limit
  if (entry.count >= HEALTH_INFO_RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  // Increment and allow
  entry.count++;
  return { allowed: true, remaining: HEALTH_INFO_RATE_LIMIT - entry.count };
}

// ─── M1: Aadhaar OTP ─────────────────────────────────────────────────────────

const aadhaarGenerateOtp = async (req, res) => {
  const { aadhaar } = req.body;
  if (!aadhaar || !/^\d{12}$/.test(aadhaar))
    return res.status(400).json({ error: 'Aadhaar must be 12 digits' });

  const result = await abdm.generateAadhaarOtp(aadhaar);
  res.json({ txnId: result.txnId, message: 'OTP sent to your Aadhaar-linked mobile' });
};

const aadhaarVerifyOtp = async (req, res) => {
  const { otp, txnId } = req.body;
  let mobile = req.body.mobile ?? null;

  // Auto-use user's registered phone if mobile not supplied by client
  if (!mobile) {
    const { rows } = await pool.query('SELECT phone FROM users WHERE id=$1', [req.user.id]);
    const raw = rows[0]?.phone ?? '';
    const digits = raw.replace(/\D/g, '');
    mobile = digits.length >= 10 ? digits.slice(-10) : null;
  }

  const result = await abdm.verifyAadhaarOtp(otp, txnId, mobile);

  const profile = result.ABHAProfile ?? {};
  if (profile.ABHANumber) {
    await pool.query(
      `INSERT INTO abha_accounts
         (user_id, abha_number, abha_address, name, mobile, x_token, x_refresh_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE
         SET abha_number=$2, abha_address=$3, name=$4, mobile=$5,
             x_token=$6, x_refresh_token=$7, updated_at=NOW()`,
      [
        req.user.id,
        profile.ABHANumber,
        profile.phrAddress?.[0] ?? null,
        profile.name ?? null,
        profile.mobile ?? null,
        result.tokens?.token ?? null,
        result.tokens?.refreshToken ?? null,
      ]
    );
  }
  res.json(result);
};

// ─── M1: Mobile OTP ──────────────────────────────────────────────────────────

const mobileGenerateOtp = async (req, res) => {
  const { mobile } = req.body;
  if (!mobile || !/^\d{10}$/.test(mobile))
    return res.status(400).json({ error: 'Mobile must be 10 digits' });

  const result = await abdm.generateMobileLoginOtp(mobile);
  res.json({ txnId: result.txnId, message: 'OTP sent to your mobile' });
};

const mobileVerifyOtp = async (req, res) => {
  const { otp, txnId } = req.body;
  const result = await abdm.verifyMobileLoginOtp(otp, txnId);

  if (result.token) {
    await pool.query(
      `UPDATE abha_accounts SET x_token=$1, x_refresh_token=$2, updated_at=NOW()
       WHERE user_id=$3`,
      [result.token.token, result.token.refreshToken, req.user.id]
    );
  }
  res.json(result);
};

// ─── M1: ABHA Login ───────────────────────────────────────────────────────────

const loginGenerateOtp = async (req, res) => {
  const { abhaNumber, abhaAddress } = req.body;
  const input = abhaNumber || abhaAddress;
  if (!input) return res.status(400).json({ error: 'abhaNumber or abhaAddress required' });
  // loginHint is derived inside loginRequestAbhaOtp based on whether input contains '@'
  const result = await abdm.loginRequestAbhaOtp(input);
  res.json({ txnId: result.txnId });
};

const loginVerifyOtp = async (req, res) => {
  const { otp, txnId } = req.body;
  const result = await abdm.loginVerifyOtp(otp, txnId);

  if (result.token) {
    await pool.query(
      `UPDATE abha_accounts SET x_token=$1, x_refresh_token=$2, updated_at=NOW()
       WHERE user_id=$3`,
      [result.token.token, result.token.refreshToken, req.user.id]
    );
  }
  res.json(result);
};

// ─── M1: ABHA Status / Profile / Card ────────────────────────────────────────

const getAbhaStatus = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT abha_number, abha_address, name, mobile, created_at
     FROM abha_accounts WHERE user_id=$1`,
    [req.user.id]
  );
  if (!rows.length) return res.json({ linked: false });
  res.json({ linked: true, ...rows[0] });
};

const getAbhaProfile = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT x_token FROM abha_accounts WHERE user_id=$1',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'No ABHA linked' });
  const profile = await abdm.getAbhaProfile(rows[0].x_token);
  res.json(profile);
};

const getAbhaCard = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT x_token FROM abha_accounts WHERE user_id=$1',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'No ABHA linked' });
  if (!rows[0].x_token) return res.status(404).json({ error: 'ABHA token not available — re-login to ABHA' });
  const pngBuffer = await abdm.getAbhaPngCard(rows[0].x_token);
  res.set('Content-Type', 'image/png');
  res.send(pngBuffer);
};

// ─── M2: Care-context discovery (async — ABDM calls on-discover callback) ─────

const discoverCareContexts = async (req, res) => {
  // gateway/v0.5/care-contexts/discover removed from ABDM sandbox.
  // Use POST /api/abdm/care-contexts/link (HIP-initiated) instead.
  res.status(410).json({
    error: 'ABDM gateway discover endpoint is no longer available in v3. Use HIP-initiated linking: POST /api/abdm/care-contexts/link',
  });
};

// Called by ABDM gateway with discovered care contexts
const onDiscover = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const { patient, resp, transactionId, error } = req.body;
    const requestId = resp?.requestId;
    if (!requestId) return;
    if (error) {
      await pool.query(
        `UPDATE discover_sessions SET status='error', error_message=$1 WHERE request_id=$2`,
        [error.message ?? JSON.stringify(error), requestId]
      );
      return;
    }
    await pool.query(
      `UPDATE discover_sessions SET status='done', care_contexts=$1, transaction_id=$2 WHERE request_id=$3`,
      [JSON.stringify(patient?.careContexts ?? []), transactionId ?? null, requestId]
    );
  } catch (err) {
    logger.error('onDiscover error', err);
  }
};

// Flutter polls this until status = 'done' or 'error'
const discoverStatus = async (req, res) => {
  const { requestId } = req.params;
  const { rows } = await pool.query(
    `SELECT status, care_contexts, error_message FROM discover_sessions
     WHERE request_id=$1 AND user_id=$2`,
    [requestId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Session not found' });
  const s = rows[0];
  res.json({ status: s.status, careContexts: s.care_contexts ?? [], error: s.error_message ?? null });
};

// ─── M2: Patient-initiated link (gateway v0.5 async) ─────────────────────────

const linkInit = async (req, res) => {
  const { requestId: discoverRequestId, careContexts } = req.body;
  if (!discoverRequestId || !careContexts?.length)
    return res.status(400).json({ error: 'discoverRequestId and careContexts required' });

  const { rows } = await pool.query(
    `SELECT ds.transaction_id, ds.hip_id, aa.abha_address
     FROM discover_sessions ds
     JOIN abha_accounts aa ON aa.user_id = ds.user_id
     WHERE ds.request_id=$1 AND ds.user_id=$2`,
    [discoverRequestId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Discover session not found' });

  const { transaction_id, hip_id, abha_address } = rows[0];
  const linkRequestId = await abdm.linkInit(transaction_id, abha_address, hip_id, careContexts);

  await pool.query(
    `INSERT INTO link_sessions (user_id, request_id, transaction_id, hip_id, care_contexts)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.user.id, linkRequestId, transaction_id, hip_id, JSON.stringify(careContexts)]
  );
  res.json({ requestId: linkRequestId });
};

// Called by ABDM when the HIP is ready for OTP confirmation
const onLinkInit = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const { link, resp, error } = req.body;
    const requestId = resp?.requestId;
    if (!requestId) return;
    if (error) {
      await pool.query(
        `UPDATE link_sessions SET status='error', error_message=$1 WHERE request_id=$2`,
        [error.message ?? JSON.stringify(error), requestId]
      );
      return;
    }
    await pool.query(
      `UPDATE link_sessions SET status='otp_ready', link_ref_number=$1 WHERE request_id=$2`,
      [link?.referenceNumber, requestId]
    );
  } catch (err) {
    logger.error('onLinkInit error', err);
  }
};

// Flutter polls until status = 'otp_ready'
const linkStatus = async (req, res) => {
  const { requestId } = req.params;
  const { rows } = await pool.query(
    `SELECT status, link_ref_number, error_message FROM link_sessions
     WHERE request_id=$1 AND user_id=$2`,
    [requestId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Link session not found' });
  const s = rows[0];
  res.json({ status: s.status, linkRefNumber: s.link_ref_number ?? null, error: s.error_message ?? null });
};

// Flutter submits OTP
const linkConfirm = async (req, res) => {
  const { requestId, token } = req.body;
  if (!requestId || !token) return res.status(400).json({ error: 'requestId and token required' });

  const { rows } = await pool.query(
    `SELECT link_ref_number FROM link_sessions WHERE request_id=$1 AND user_id=$2`,
    [requestId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Link session not found' });
  if (!rows[0].link_ref_number)
    return res.status(400).json({ error: 'OTP not yet received from ABDM — please wait and retry' });

  const confirmRequestId = await abdm.linkConfirm(rows[0].link_ref_number, token);
  await pool.query(
    `UPDATE link_sessions SET status='confirming', confirm_request_id=$1 WHERE request_id=$2`,
    [confirmRequestId, requestId]
  );
  res.json({ message: 'OTP submitted' });
};

// Called by ABDM when link is confirmed
const onLinkConfirm = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const { patient, resp, error } = req.body;
    const confirmRequestId = resp?.requestId;
    if (!confirmRequestId) return;

    if (error) {
      await pool.query(
        `UPDATE link_sessions SET status='error', error_message=$1 WHERE confirm_request_id=$2`,
        [error.message ?? JSON.stringify(error), confirmRequestId]
      );
      return;
    }

    const { rows } = await pool.query(
      `SELECT user_id, hip_id, care_contexts FROM link_sessions WHERE confirm_request_id=$1`,
      [confirmRequestId]
    );
    if (!rows.length) return;
    const { user_id, hip_id, care_contexts } = rows[0];

    await pool.query(
      `UPDATE link_sessions SET status='confirmed' WHERE confirm_request_id=$1`,
      [confirmRequestId]
    );

    const contexts = patient?.careContexts ?? care_contexts ?? [];
    for (const ctx of contexts) {
      await pool.query(
        `INSERT INTO linked_care_contexts (user_id, hip_id, reference_number, display, hi_type)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, hip_id, reference_number) DO NOTHING`,
        [user_id, hip_id, ctx.referenceNumber ?? ctx.reference_number, ctx.display, ctx.hiType ?? 'OPConsultation']
      );
    }
    logger.info('Care contexts linked via patient-initiated flow', { user_id, hip_id, count: contexts.length });
  } catch (err) {
    logger.error('onLinkConfirm error', err);
  }
};

// Flutter polls until status = 'confirmed' or 'error'
const confirmStatus = async (req, res) => {
  const { requestId } = req.params;
  const { rows } = await pool.query(
    `SELECT status, error_message FROM link_sessions WHERE request_id=$1 AND user_id=$2`,
    [requestId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Link session not found' });
  res.json({ status: rows[0].status, error: rows[0].error_message ?? null });
};

// ─── M2: HIP-initiated link (HIECM v3, kept for direct HIU linking) ──────────

// Fetch care contexts available for this patient from the HIP's EMR (v3 replacement for discover)
const getAvailableCareContexts = async (req, res) => {
  const hipId = req.query.hipId || process.env.ABDM_HIP_ID;

  const { rows: abhaRows } = await pool.query(
    'SELECT abha_address, abha_number FROM abha_accounts WHERE user_id=$1',
    [req.user.id]
  );
  if (!abhaRows.length) return res.status(400).json({ error: 'ABHA not linked' });

  const { abha_address, abha_number } = abhaRows[0];

  const { rows } = await pool.query(
    `SELECT ecc.id, ecc.reference_number, ecc.display, ecc.hi_type, ecc.created_at, $1 AS hip_id
     FROM emr_care_contexts ecc
     JOIN emr_patients ep ON ep.id = ecc.patient_id
     WHERE ep.abha_address = $2 OR ep.abha_number = $2 OR ep.abha_address = $3 OR ep.abha_number = $3
     ORDER BY ecc.created_at DESC`,
    [hipId, abha_address ?? '', abha_number ?? '']
  );
  res.json(rows);
};

const linkCareContexts = async (req, res) => {
  const { careContexts, hipId, patientGender, patientYearOfBirth } = req.body;
  if (!careContexts?.length || !hipId)
    return res.status(400).json({ error: 'careContexts, hipId required' });

  const { rows } = await pool.query(
    'SELECT abha_number, abha_address, name FROM abha_accounts WHERE user_id=$1',
    [req.user.id]
  );
  if (!rows.length) return res.status(400).json({ error: 'ABHA not linked' });

  const { abha_number, abha_address, name } = rows[0];

  // Prefer Aadhaar-authoritative values stored in emr_patients over request body
  const { rows: ptRows } = await pool.query(
    `SELECT gender, EXTRACT(YEAR FROM dob)::int AS year_of_birth
     FROM emr_patients
     WHERE (abha_number=$1 OR abha_address=$2) AND deleted_at IS NULL
     LIMIT 1`,
    [abha_number, abha_address]
  );
  const resolvedGender      = ptRows[0]?.gender      ?? patientGender;
  const resolvedYearOfBirth = ptRows[0]?.year_of_birth ?? patientYearOfBirth;

  logger.info('ABDM demographic verification (linkCareContexts)', {
    abhaNumber:        abha_number?.slice(-4) + ' (last 4)',
    abhaAddress:       abha_address,
    gender:            resolvedGender,
    yearOfBirth:       resolvedYearOfBirth,
    sourceGender:      ptRows[0]?.gender ? 'emr_patients' : 'request_body',
    sourceYearOfBirth: ptRows[0]?.year_of_birth ? 'emr_patients' : 'request_body',
  });

  const tokenRes = await abdm.generateLinkToken(
    hipId, abha_number, abha_address, name,
    resolvedGender, resolvedYearOfBirth
  );
  const result = await abdm.linkCareContexts(hipId, tokenRes.linkToken, abha_number, abha_address, name, careContexts);

  for (const ctx of careContexts) {
    await pool.query(
      `INSERT INTO linked_care_contexts (user_id, hip_id, reference_number, display, hi_type)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, hip_id, reference_number) DO NOTHING`,
      [req.user.id, hipId, ctx.referenceNumber, ctx.display, ctx.hiType ?? 'OPConsultation']
    );
  }
  res.json(result);
};

const getLinkedCareContexts = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM linked_care_contexts WHERE user_id=$1 ORDER BY linked_at DESC',
    [req.user.id]
  );
  res.json(rows);
};

const unlinkCareContext = async (req, res) => {
  const { contextRef } = req.params;
  if (!contextRef) return res.status(400).json({ error: 'contextRef required' });

  try {
    // M2: Delete linked care context
    const { rowCount } = await pool.query(
      'DELETE FROM linked_care_contexts WHERE user_id=$1 AND reference_number=$2',
      [req.user.id, contextRef]
    );

    if (!rowCount) {
      return res.status(404).json({ error: 'Care context not found or not linked' });
    }

    logger.info('Care context unlinked', {
      userId: req.user.id,
      contextRef,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: 'Care context unlinked successfully', contextRef });
  } catch (err) {
    logger.error('unlinkCareContext error', { error: err.message, contextRef });
    res.status(500).json({ error: 'Failed to unlink care context' });
  }
};

// ─── M2: Consent management ───────────────────────────────────────────────────

const ALL_HI_TYPES = [
  'OPConsultation', 'DiagnosticReport', 'DischargeSummary', 'Prescription',
  'ImmunizationRecord', 'HealthDocumentRecord', 'WellnessRecord',
];

const createConsent = async (req, res) => {
  const { purpose, dateFrom, dateTo } = req.body;
  // hiuId must always be our registered HIU ID — never trust the frontend value
  const hiuId = process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID;
  if (!hiuId) return res.status(500).json({ error: 'ABDM_HIP_ID not configured' });
  if (!purpose) return res.status(400).json({ error: 'purpose required' });
  // Always send all 7 HI types — sending a subset disables grant in PHR if the
  // patient's care context hiType is not in the list
  const hiTypes = ALL_HI_TYPES;

  const [abhaRes, clinicRes] = await Promise.all([
    pool.query('SELECT abha_address FROM abha_accounts WHERE user_id=$1', [req.user.id]),
    pool.query('SELECT name FROM emr_clinics ORDER BY id LIMIT 1'),
  ]);
  if (!abhaRes.rows.length) return res.status(400).json({ error: 'ABHA not linked' });

  const clinicName = clinicRes.rows[0]?.name || process.env.ABDM_REQUESTER_NAME || 'Clinic HIU';

  // Build consent dateRange (required by ABDM, persisted for health-info fetch)
  const consentDateRange = {
    from: dateFrom ?? new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
    to:   dateTo && new Date(dateTo) <= new Date() ? dateTo : new Date().toISOString(),
  };

  const result = await abdm.createConsentRequest(
    abhaRes.rows[0].abha_address, hiuId, purpose, hiTypes,
    consentDateRange,
    { name: clinicName }
  );

  // Track in emr_consent_requests (single source of truth)
  // Use result.reqId (the ID we sent to ABDM, not ABDM's response)
  await pool.query(
    `INSERT INTO emr_consent_requests (clinic_id, request_id, patient_abha, hiu_id, purpose, hi_types, permission_date_range, status)
     VALUES (
       (SELECT MIN(id) FROM emr_clinics),
       $1, $2, $3, $4, $5, $6, 'REQUESTED'
     )
     ON CONFLICT (request_id) DO NOTHING`,
    [result.reqId, abhaRes.rows[0].abha_address, hiuId, purpose, JSON.stringify(hiTypes), JSON.stringify(consentDateRange)]
  ).catch(err => logger.warn('createConsent: insert failed', { error: err.message }));

  logger.info('HIU consent request created', {
    requestId: result.reqId,
    purpose,
    patientAbha: abhaRes.rows[0].abha_address?.slice(-10),
    dateRangeFrom: consentDateRange.from,
    dateRangeTo: consentDateRange.to,
  });

  res.json(result);
};

const getConsents = async (req, res) => {
  const { rows: acct } = await pool.query(
    'SELECT abha_number, abha_address FROM abha_accounts WHERE user_id=$1',
    [req.user.id]
  );
  if (!acct.length) return res.json([]);
  const { abha_number, abha_address } = acct[0];
  const { rows } = await pool.query(
    `SELECT request_id, patient_abha, hiu_id, purpose, hi_types, status,
            artefacts, created_at, updated_at
     FROM emr_consent_requests
     WHERE patient_abha = $1
        OR patient_abha = $2
        OR patient_abha = $3
     ORDER BY created_at DESC`,
    [abha_address, abha_number, (abha_number || '').replace(/-/g, '')]
  );
  res.json(rows);
};

// ─── M3: Webhooks (no auth – called by ABDM gateway) ─────────────────────────

// ABDM calls this after consent-requests/init with the real consentRequest.id
const consentOnInit = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    const abdmConsentId = req.body?.consentRequest?.id;
    const ourRequestId  = req.body?.resp?.requestId;
    logger.info('consent-requests/on-init', { abdmConsentId, ourRequestId });
    if (!abdmConsentId) return;

    // If ABDM didn't send back our requestId, find the most recent pending consent for any patient
    // (ABDM spec doesn't guarantee resp.requestId in on-init callback)
    let updateResult;
    if (ourRequestId) {
      updateResult = await pool.query(
        `UPDATE emr_consent_requests
           SET abdm_request_id=$1, updated_at=NOW()
         WHERE request_id=$2`,
        [abdmConsentId, ourRequestId]
      );
    } else {
      // Fallback: update the most recent REQUESTED consent with this ABDM ID
      // (assumes only one consent-request/init in flight per patient at a time)
      updateResult = await pool.query(
        `UPDATE emr_consent_requests
           SET abdm_request_id=$1, updated_at=NOW()
         WHERE id = (
           SELECT id FROM emr_consent_requests
           WHERE abdm_request_id IS NULL AND status='REQUESTED'
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [abdmConsentId]
      );
    }
    logger.info('consent-requests/on-init: stored abdm_request_id', {
      abdmConsentId, ourRequestId, rowsUpdated: updateResult.rowCount,
    });
  } catch (err) {
    logger.error('consentOnInit error', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack?.split('\n').slice(0, 3).join(' | '),
    });
  }
};

const consentNotify = async (req, res) => {
  // Respond immediately – ABDM requires 202 within 5 s
  res.status(202).json({ status: 'accepted' });
  try {
    // CRITICAL: Log COMPLETE incoming payload BEFORE any transformations
    logger.info('ABDM consent notification: COMPLETE INCOMING PAYLOAD', {
      fullBody: JSON.stringify(req.body, null, 2),
      bodyKeys: Object.keys(req.body || {}),
      notificationKeys: Object.keys(req.body?.notification || {}),
    });

    const { notification } = req.body;
    logger.info('ABDM consent notification extracted', notification);
    // ABDM uses different ID fields across notification types
    const consentRequestId = notification.consentRequestId ?? notification.consentId ?? notification.id;
    if (!consentRequestId) {
      logger.warn('HIU consent notify: no consentRequestId in payload', { body: req.body });
      return;
    }
    // Override with resolved ID for all downstream use
    notification.consentRequestId = consentRequestId;

    // Single source of truth: emr_consent_requests only
    const res = await pool.query(
      `UPDATE emr_consent_requests SET status=$1, updated_at=NOW()
       WHERE request_id=$2 OR abdm_request_id=$2`,
      [notification.status, consentRequestId]
    );

    logger.info('HIU consent notify: status update', {
      consentRequestId,
      status: notification.status,
      artefacts: notification.consentArtefacts?.length ?? 0,
      rowsUpdated: res.rowCount,
    });

    if (res.rowCount === 0) {
      // No row found — this is likely a patient-initiated consent (purpose: PATRQT) from ABHA app.
      // Look up patient ABHA from the stored HIP artifact, then upsert a row so the UI shows it.
      const artefactId = notification.consentArtefacts?.[0]?.id ?? consentRequestId;
      const { rows: artRows } = await pool.query(
        `SELECT patient_abha, raw FROM hip_consent_artifacts WHERE consent_id=$1 LIMIT 1`,
        [artefactId]
      ).catch(() => ({ rows: [] }));

      const patientAbha = artRows[0]?.patient_abha
        ?? artRows[0]?.raw?.consentDetail?.patient?.id
        ?? null;
      const purpose = artRows[0]?.raw?.consentDetail?.purpose?.code ?? 'PATRQT';
      const hiTypes = artRows[0]?.raw?.consentDetail?.hiTypes ?? [];
      const hipId   = artRows[0]?.raw?.consentDetail?.hip?.id ?? null;
      // CRITICAL: Extract permission.dateRange from stored HIP artifact (patient-initiated consents)
      const permissionDateRange = artRows[0]?.raw?.consentDetail?.permission?.dateRange
        ?? artRows[0]?.raw?.permission?.dateRange
        ?? null;

      if (patientAbha) {
        const hiuId = process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID;
        // Check if this ABDM ID already exists to prevent duplicates
        const { rows: existing } = await pool.query(
          `SELECT id, status FROM emr_consent_requests WHERE abdm_request_id=$1 LIMIT 1`,
          [consentRequestId]
        );

        if (existing.length && existing[0].status === 'GRANTED') {
          // Already processed — idempotent handling
          logger.info('HIU consent notify: already GRANTED (idempotent)', { consentRequestId });
        } else {
          await pool.query(
            `INSERT INTO emr_consent_requests
               (clinic_id, request_id, abdm_request_id, patient_abha, hip_id, hiu_id, purpose, hi_types, permission_date_range, status)
             VALUES (
               (SELECT MIN(id) FROM emr_clinics),
               $1, $1, $2, $3, $4, $5, $6, $7, $8
             )
             ON CONFLICT (request_id) DO UPDATE
               SET status=$8, abdm_request_id=$1, permission_date_range=$7, updated_at=NOW()`,
            [consentRequestId, patientAbha, hipId, hiuId, purpose, hiTypes, JSON.stringify(permissionDateRange), notification.status]
          ).catch(err => logger.warn('HIU consent notify: upsert failed', { error: err.message }));
          logger.info('HIU consent notify: inserted patient-initiated consent', {
            consentRequestId,
            patientAbha,
            purpose,
            hasPermissionDateRange: !!permissionDateRange,
            dateRangeFrom: permissionDateRange?.from,
            dateRangeTo: permissionDateRange?.to,
          });
        }
      } else {
        logger.warn('HIU consent notify: no patient ABHA found for upsert', { consentRequestId, artefactId });
      }
    }

    // When granted, automatically request health info from each HIP artefact
    if (notification.status === 'GRANTED' && notification.consentArtefacts?.length) {
      // Get permission dateRange from our stored consent request (ABDM doesn't echo it back in notification)
      // Try multiple lookups: by our request ID, by ABDM's request ID, or from the notification itself
      let permissionDateRange = null;

      const { rows: storedConsent } = await pool.query(
        `SELECT permission_date_range FROM emr_consent_requests
         WHERE request_id=$1 OR abdm_request_id=$1
         LIMIT 1`,
        [consentRequestId]
      ).catch(() => ({ rows: [] }));

      if (storedConsent[0]?.permission_date_range) {
        permissionDateRange = storedConsent[0].permission_date_range;
      } else {
        // Fallback: try to extract from notification (in case ABDM includes it)
        permissionDateRange = notification.consentDetail?.permission?.dateRange
          || notification.grants?.dateRange
          || null;
      }

      // Get permission.dateRange for health-info requests (prevents ABDM-1063).
      // For multi-HIP consents, artefacts[0] may belong to an EXTERNAL HIP whose
      // artifact is NEVER stored in our hip_consent_artifacts table.
      // Strategy: scan ALL artefacts for one we have locally (own HIP), then
      // fall back to ABDM API expansion for external HIPs.
      if (!permissionDateRange?.from || !permissionDateRange?.to) {
        const allArtefactIds = notification.consentArtefacts.map(a => a.id);

        logger.info('HIU consent GRANTED: scanning all artefacts for permission metadata', {
          consentRequestId,
          artefactCount: allArtefactIds.length,
          artefactIds: allArtefactIds,
        });

        // Tier 1: Check our own hip_consent_artifacts for ANY of the artefacts
        let hipRaw = null;
        let foundArtefactId = null;
        for (const artId of allArtefactIds) {
          const { rows } = await pool.query(
            `SELECT raw FROM hip_consent_artifacts WHERE consent_id=$1 LIMIT 1`,
            [artId]
          ).catch(() => ({ rows: [] }));
          if (rows[0]?.raw) {
            hipRaw = rows[0].raw;
            foundArtefactId = artId;
            logger.info('HIU consent: found own HIP artifact', { artefactId: artId, consentRequestId });
            break;
          }
        }

        // Tier 2: Call ABDM API to expand the first artefact (works for external HIPs too)
        if (!hipRaw) {
          logger.info('HIU consent: no local artifact found — calling ABDM to expand first artefact', {
            artefactId: allArtefactIds[0],
            consentRequestId,
          });
          const expanded = await abdm.fetchConsentArtefact(allArtefactIds[0]);
          if (expanded?.permission?.dateRange) {
            permissionDateRange = expanded.permission.dateRange;
            logger.info('HIU consent: dateRange from ABDM artefact expansion', {
              consentRequestId,
              artefactId: allArtefactIds[0],
              dateRangeFrom: permissionDateRange.from,
              dateRangeTo: permissionDateRange.to,
            });
            await pool.query(
              `UPDATE emr_consent_requests SET permission_date_range=$1, updated_at=NOW() WHERE request_id=$2 OR abdm_request_id=$2`,
              [JSON.stringify(permissionDateRange), consentRequestId]
            ).catch(() => {});
          } else {
            // No local artifact AND ABDM expansion failed → wait for own HIP to notify
            logger.warn('HIU consent: ABDM expansion failed — marking AWAITING_HIP_METADATA (will retry when own HIP notifies)', {
              consentRequestId,
              artefactIds: allArtefactIds,
            });
            await pool.query(
              `UPDATE emr_consent_requests SET status='AWAITING_HIP_METADATA', updated_at=NOW() WHERE request_id=$1 OR abdm_request_id=$1`,
              [consentRequestId]
            ).catch(() => {});
            return;
          }
        } else {
          // Extract from local HIP artifact
          const hipPermission = hipRaw.consentDetail?.permission ?? hipRaw.permission ?? null;
          if (hipPermission?.dateRange) {
            permissionDateRange = hipPermission.dateRange;
            logger.info('HIU consent: extracted permission.dateRange from HIP artifact', {
              consentRequestId,
              artefactId: foundArtefactId,
              source: 'hip_consent_artifacts.raw',
              dateRangeFrom: permissionDateRange.from,
              dateRangeTo: permissionDateRange.to,
            });
            await pool.query(
              `UPDATE emr_consent_requests SET permission_date_range=$1, updated_at=NOW() WHERE request_id=$2 OR abdm_request_id=$2`,
              [JSON.stringify(permissionDateRange), consentRequestId]
            ).catch(() => {});
          } else {
            // Local artifact exists but has no permission — try ABDM expansion
            const expanded = await abdm.fetchConsentArtefact(allArtefactIds[0]);
            if (expanded?.permission?.dateRange) {
              permissionDateRange = expanded.permission.dateRange;
              await pool.query(
                `UPDATE emr_consent_requests SET permission_date_range=$1, updated_at=NOW() WHERE request_id=$2 OR abdm_request_id=$2`,
                [JSON.stringify(permissionDateRange), consentRequestId]
              ).catch(() => {});
            } else {
              logger.error('HIU consent GRANTED but permission.dateRange unavailable from all sources', {
                consentRequestId, artefactIds: allArtefactIds,
              });
              await pool.query(
                `UPDATE emr_consent_requests SET status='INVALID_METADATA', updated_at=NOW() WHERE request_id=$1 OR abdm_request_id=$1`,
                [consentRequestId]
              ).catch(() => {});
              return;
            }
          }
        }
      }

      logger.info('HIU consent GRANTED: storing artefacts and dateRange', {
        consentRequestId,
        artefactCount: notification.consentArtefacts.length,
        dateRange: permissionDateRange,
        source: storedConsent[0]?.permission_date_range ? 'stored_request' : 'notification',
      });

      // Store full artefact metadata including dateRange for use in fetchHealthInfo
      const enrichedArtefacts = notification.consentArtefacts.map(a => ({
        id: a.id,
        hip: a.hip,
        hipId: a.hipId,
        careContexts: a.careContexts,
        hiTypes: a.hiTypes,
        dateRange: permissionDateRange, // Store for validation in health-info request
      }));

      await pool.query(
        `UPDATE emr_consent_requests
         SET artefacts=$1,
             permission_date_range=$2,
             updated_at=NOW()
         WHERE request_id=$3 OR abdm_request_id=$3`,
        [JSON.stringify(enrichedArtefacts), JSON.stringify(permissionDateRange), consentRequestId]
      );
      const dataPushUrl = `${process.env.BACKEND_URL}/api/abdm/health-info/push`;
      const ourHipId    = process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID;

      // MULTI-HIP OBSERVABILITY: log complete artefact inventory before processing
      logger.info('HIU consent GRANTED — multi-HIP inventory', {
        consentRequestId,
        totalArtefacts:  notification.consentArtefacts.length,
        artefactIds:     notification.consentArtefacts.map(a => a.id),
        artefactKeys:    notification.consentArtefacts.map(a => Object.keys(a)),
        knownHips:       notification.consentArtefacts.map(a => a.hip?.id || a.hipId || 'EXPAND_NEEDED'),
        dataPushUrl,
        permissionDateRange,
        EXPECTED_SEQUENCE: `Will call fetchHealthInfo ${notification.consentArtefacts.length}x — one per artefact`,
      });

      // Per-artefact transaction map — stored as JSONB to avoid last-write-wins overwrite
      const artefactTxnMap = {};

      for (const artefact of notification.consentArtefacts) {
        // ABDM notification only sends {id} in consentArtefacts — no hip.id.
        // Try to resolve HIP from: artefact top-level → stored hip_consent_artifacts
        let artefactHip = artefact.hip?.id || artefact.hipId
          || artefact.consentDetail?.hip?.id;

        if (!artefactHip) {
          // 1. Try local HIP artifact store (populated if our HIP also received notify)
          const { rows: artRows } = await pool.query(
            `SELECT raw FROM hip_consent_artifacts WHERE consent_id=$1 LIMIT 1`,
            [artefact.id]
          ).catch(() => ({ rows: [] }));
          artefactHip = artRows[0]?.raw?.consentDetail?.hip?.id
            || artRows[0]?.raw?.hip?.id
            || null;

          // 2. If still missing (external HIP — artifact not in our DB), call ABDM to expand
          if (!artefactHip) {
            const expanded = await abdm.fetchConsentArtefact(artefact.id);
            artefactHip = expanded?.hip?.id ?? null;

            // Enrich artefact object with data from expanded response
            if (expanded) {
              artefact._expanded = expanded;
              logger.info('HIU consentNotify: artefact expanded via ABDM GET', {
                artefactId: artefact.id,
                hipId: artefactHip,
                careContextCount: expanded.careContexts?.length ?? 0,
                hiTypes: expanded.hiTypes,
                dateRange: expanded.permission?.dateRange,
              });

              // If permission.dateRange missing from notification, use expanded value
              if ((!permissionDateRange?.from || !permissionDateRange?.to) && expanded.permission?.dateRange) {
                permissionDateRange = expanded.permission.dateRange;
                logger.info('HIU consentNotify: dateRange resolved from ABDM artefact expansion', {
                  artefactId: artefact.id,
                  dateRangeFrom: permissionDateRange.from,
                  dateRangeTo: permissionDateRange.to,
                });
                await pool.query(
                  `UPDATE emr_consent_requests SET permission_date_range=$1, updated_at=NOW()
                   WHERE request_id=$2 OR abdm_request_id=$2`,
                  [JSON.stringify(permissionDateRange), consentRequestId]
                ).catch(() => {});
              }
            }
          }
        }

        logger.info('HIU consentNotify: artefact HIP resolved', {
          artefactId: artefact.id,
          artefactHip: artefactHip || 'UNKNOWN — ABDM will route to correct HIP',
          source: artefactHip ? 'resolved' : 'unresolved',
          isOwnHip: artefactHip === (process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID),
        });

        // Full diagnostic dump so we can see exactly what ABDM sent
        logger.info('HIU consent artefact detail', {
          artefactId:       artefact.id,
          artefactKeys:     Object.keys(artefact),
          artefactHip:      artefactHip || 'unspecified',
          artefactPatient:  artefact.patient?.id || artefact.consentDetail?.patient?.id,
          careContextCount: (artefact.careContexts || artefact.consentDetail?.careContexts || []).length,
          careContextHips:  (artefact.careContexts || artefact.consentDetail?.careContexts || [])
                              .map(c => c.hipId || c.hip?.id || 'none'),
          isOwnHip:         !artefactHip || artefactHip === ourHipId,
          permissionDateRangeFrom: permissionDateRange?.from,
          permissionDateRangeTo:   permissionDateRange?.to,
          hasPerm: !!permissionDateRange,
        });

        if (!permissionDateRange || !permissionDateRange.from || !permissionDateRange.to) {
          logger.warn('HIU consent artefact: missing permission dateRange', {
            artefactId: artefact.id,
            consentRequestId,
            permissionDateRange,
          });
        }

        try {
          logger.info('HIU fetching health-info for artefact', {
            artefactId: artefact.id,
            artefactHip: artefactHip || 'unspecified — ABDM will route to correct HIP',
            dataPushUrl,
            dateRangeFrom: permissionDateRange?.from,
            dateRangeTo: permissionDateRange?.to,
          });
          // Pass the consent's approved dateRange to ABDM (required by spec, prevents ABDM-1063)
          const result = await abdm.fetchHealthInfo(artefact.id, dataPushUrl, { dateRange: permissionDateRange });
          const txnId  = result?.reqId ?? abdm.uuid();
          logger.info('HIU health-info request sent to CM', {
            artefactId: artefact.id,
            txnId,
            consentId: artefact.id,
            dateRangeUsed: permissionDateRange,
          });

          artefactTxnMap[artefact.id] = txnId;

          // Persist HIU key per artefact in emr_consent_requests
          const hiuKey = abdm.getHiuKey(artefact.id);
          if (hiuKey) {
            const serialisedKey = JSON.stringify({
              privKey: Buffer.from(hiuKey.privBytes).toString('base64'),
              nonce:   hiuKey.nonce,
            });
            // Store per-artefact map: {artefactId: {hipId, careContexts, status, privKey, nonce, txnId}}
            const artefactEntry = {
              hipId:        artefactHip || ourHipId,
              careContexts: artefact.careContexts || artefact.consentDetail?.careContexts || [],
              status:       'GRANTED',
              privKey:      JSON.parse(serialisedKey).privKey,
              nonce:        JSON.parse(serialisedKey).nonce,
              txnId,
            };
            await pool.query(
              `UPDATE emr_consent_requests
               SET hiu_key_material   = COALESCE(hiu_key_material, '{}'::jsonb) || $1::jsonb,
                   transaction_id_map = COALESCE(transaction_id_map, '{}'::jsonb) || $2::jsonb,
                   transaction_id     = $3,
                   updated_at         = NOW()
               WHERE request_id=$4 OR abdm_request_id=$4`,
              [
                JSON.stringify({ [artefact.id]: artefactEntry }),
                JSON.stringify({ [artefact.id]: txnId }),
                txnId,
                consentRequestId,
              ]
            ).catch(() => {});
          }
        } catch (err) {
          logger.error('HIU fetchHealthInfo failed', {
            artefactId: artefact.id,
            message: err.message,
            response: err.response?.data,
            status: err.response?.status,
          });
        }
      }

      logger.info('HIU health-info fetch loop complete', {
        consentRequestId,
        totalArtefacts: notification.consentArtefacts.length,
        processed:      Object.keys(artefactTxnMap).length,
        skipped:        notification.consentArtefacts.length - Object.keys(artefactTxnMap).length,
        txnMap:         artefactTxnMap,
        MULTI_HIP_VERDICT: Object.keys(artefactTxnMap).length === notification.consentArtefacts.length
          ? `ALL ${notification.consentArtefacts.length} HIPs requested ✓`
          : `WARNING: ${notification.consentArtefacts.length - Object.keys(artefactTxnMap).length} HIP(s) skipped`,
        NOTE: notification.consentArtefacts.length === 1
          ? 'Only 1 artefact — patient may have care contexts linked in only 1 HIP in ABDM ecosystem'
          : `${notification.consentArtefacts.length} artefacts from ${notification.consentArtefacts.length} HIPs`,
      });
    } else if (notification.status === 'GRANTED' && !notification.consentArtefacts?.length) {
      logger.warn('HIU consent GRANTED but no artefacts in notification', { consentRequestId });
    }
  } catch (err) {
    logger.error('consentNotify error', err);
  }
};

const healthInfoPush = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  // Run all processing with a client checked out directly to avoid pool queue blocking
  const client = await pool.connect().catch(err => {
    logger.error('healthInfoPush: failed to get DB client', { error: err.message });
    return null;
  });
  if (!client) return;
  try {
    const { transactionId, entries, pageNumber, pageCount, keyMaterial } = req.body;
    logger.info('HIU health-info push received', {
      transactionId,
      page: `${pageNumber}/${pageCount}`,
      entries: entries?.length ?? 0,
      careContextRefs: entries?.map(e => e.careContextReference),
      encrypted: !!keyMaterial,
    });

    if (!entries?.length) {
      logger.warn('HIU health-info push: empty entries array', { transactionId });
      return;
    }

    // Look up HIU private key to decrypt HIP's response
    // HIP push includes its own keyMaterial; we need HIU's stored key to derive shared secret
    const hipPubKey = keyMaterial?.dhPublicKey?.keyValue;
    const hipNonce  = keyMaterial?.nonce;

    // Find the consent artefact ID and HIU key for decryption
    let hiuKeyEntry = null;
    let consentIdForAck = null;
    if (hipPubKey && hipNonce) {
      // Primary: look up from hip_health_requests (HIP side stores consent_id here)
      const { rows: hrRows } = await client.query(
        'SELECT consent_id, hiu_key_material FROM hip_health_requests WHERE transaction_id=$1 LIMIT 1',
        [transactionId]
      ).catch(() => ({ rows: [] }));
      const consentId = hrRows[0]?.consent_id;
      consentIdForAck = consentId;

      if (consentId) {
        // 1. Try in-memory cache
        hiuKeyEntry = abdm.getHiuKey(consentId);
        // 2. Try DB from hip_health_requests
        if (!hiuKeyEntry && hrRows[0]?.hiu_key_material) {
          const km = hrRows[0].hiu_key_material;
          hiuKeyEntry = { privBytes: Buffer.from(km.privKey, 'base64'), nonce: km.nonce };
          logger.info('HIU key restored from hip_health_requests', { transactionId, consentId });
        }
        // 3. Try per-artefact JSONB map in emr_consent_requests
        if (!hiuKeyEntry) {
          const { rows: crRows } = await client.query(
            'SELECT hiu_key_material FROM emr_consent_requests WHERE (request_id=$1 OR abdm_request_id=$1) AND hiu_key_material IS NOT NULL LIMIT 1',
            [consentId]
          ).catch(() => ({ rows: [] }));
          if (crRows[0]?.hiu_key_material) {
            const km = crRows[0].hiu_key_material;
            // New format: {artefactId: {privKey, nonce, txnId}} — find by consentId key
            const entry = km[consentId] ?? Object.values(km)[0];
            if (entry?.privKey) {
              hiuKeyEntry = { privBytes: Buffer.from(entry.privKey, 'base64'), nonce: entry.nonce };
              logger.info('HIU key restored from emr_consent_requests (per-artefact map)', { transactionId, consentId });
            }
          }
        }
      }
      logger.info('HIU health-info push: key lookup', { transactionId, consentId, hasKey: !!hiuKeyEntry });
    }

    const rowsToInsert = [];
    for (const entry of entries) {
      logger.info('HIU: loop entry start', { careContextRef: entry.careContextReference });
      try {
      let content = entry.content;
      let plaintext = null;

      // M3-SEC: Decrypt entry if keyMaterial provided
      if (hipPubKey && hipNonce && hiuKeyEntry) {
        logger.info('HIU: calling decryptHipEntry', { careContextRef: entry.careContextReference });
        let decrypted;
        try {
          decrypted = abdm.decryptHipEntry(content, hipPubKey, hipNonce, hiuKeyEntry);
        } catch (decErr) {
          logger.error('HIU: decryptHipEntry threw', { careContextRef: entry.careContextReference, error: decErr.message });
          decrypted = null;
        }
        logger.info('HIU: decryptHipEntry returned', { careContextRef: entry.careContextReference, hasResult: !!decrypted });
        if (decrypted) {
          plaintext = decrypted; // Keep plaintext for checksum verification
          content = Buffer.from(decrypted).toString('base64');
          logger.info('HIU decrypted health record', { transactionId, careContextReference: entry.careContextReference });
        } else {
          logger.warn('HIU decrypt failed — storing raw content', { transactionId });
        }
      }

      // M3-SEC: Verify MD5 checksum if we have plaintext (ABDM spec §4.3.2)
      if (plaintext && entry.checksum) {
        const crypto = require('crypto');
        const computedChecksum = crypto.createHash('md5').update(plaintext).digest('hex');
        if (computedChecksum !== entry.checksum) {
          logger.error('Checksum mismatch — rejecting entry', {
            transactionId,
            careContextReference: entry.careContextReference,
            expected: entry.checksum,
            computed: computedChecksum,
          });
          continue; // Skip this entry due to checksum mismatch
        }
        logger.info('Checksum verified', {
          transactionId,
          careContextReference: entry.careContextReference,
          checksum: entry.checksum.slice(0, 16) + '...',
        });
      }

      logger.info('HIU: post-checksum reached', { careContextRef: entry.careContextReference });

      logger.info('HIU storing health record', {
        transactionId,
        careContextReference: entry.careContextReference,
        media: entry.media,
        contentLen: content?.length,
        checksumVerified: !!plaintext && !!entry.checksum,
      });
      rowsToInsert.push([transactionId, entry.careContextReference, entry.hiType || null, content, entry.media, entry.checksum, pageNumber, pageCount]);
      logger.info('HIU: loop entry done', { careContextRef: entry.careContextReference });
      } catch (entryErr) {
        logger.error('HIU: loop entry error', { careContextRef: entry.careContextReference, error: entryErr.message, stack: entryErr.stack?.slice(0, 300) });
      }
    }
    logger.info('HIU: loop complete', { rowsToInsert: rowsToInsert.length });

    logger.info('HIU health-info push: inserting rows', { transactionId, rowCount: rowsToInsert.length });
    for (let ri = 0; ri < rowsToInsert.length; ri++) {
      const row = rowsToInsert[ri];
      logger.info('HIU health-info push: insert row', { transactionId, ri, careContextRef: row[1] });
      await client.query(
        `INSERT INTO health_records
           (transaction_id, care_context_reference, hi_type, content, media, checksum, page_number, page_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        row
      );
      logger.info('HIU health-info push: insert row done', { transactionId, ri });
    }
    logger.info('HIU health-info push stored', {
      transactionId,
      count:              entries.length,
      careContextRefs:    entries.map(e => e.careContextReference),
      consentId:          consentIdForAck,
      MULTI_HIP_TRACKING: `Stored ${entries.length} bundle(s) under txn=${transactionId} consent=${consentIdForAck}`,
    });

    // Step 9: HIU sends notification to ABDM acknowledging receipt of health data
    // (ABDM spec: POST /v0.5/health-information/notify)
    if (consentIdForAck) {
      const notifyPayload = {
        requestId:     abdm.uuid(),
        timestamp:     new Date().toISOString(),
        notification: {
          consentId:      consentIdForAck,
          transactionId,
          doneAt:         new Date().toISOString(),
          notifier:       { type: 'HIU', id: process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID },
          statusNotification: {
            sessionStatus: 'TRANSFERRED',
            hipId:         process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID,
            statusResponses: entries.map(e => ({
              careContextReference: e.careContextReference,
              hiStatus: 'OK',
              description: 'Received and stored',
            })),
          },
        },
      };
      abdm.gwReqSilent('POST', `${process.env.ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/gateway'}/v0.5/health-information/notify`, notifyPayload)
        .catch(err => logger.warn('HIU health-info notify failed (non-critical)', { error: err.message }));
    }
  } catch (err) {
    logger.error('healthInfoPush error', { message: err.message, stack: err.stack?.slice(0, 300) });
  } finally {
    client.release();
  }
};

// ─── M3: Fetch & decrypt stored health records ────────────────────────────────

const getHealthRecords = async (req, res) => {
  const { consentId, transactionId, decrypt } = req.query;

  if (!consentId && !transactionId) {
    return res.status(400).json({ error: 'consentId or transactionId required' });
  }

  try {
    // M3: Query health records by consentId or transactionId
    let query = `SELECT * FROM health_records WHERE `;
    let params = [];

    if (transactionId) {
      query += `transaction_id = $1`;
      params = [transactionId];
    } else {
      // If only consentId provided, find transactionId first
      const { rows: txRows } = await pool.query(
        'SELECT DISTINCT transaction_id FROM hip_health_requests WHERE consent_id=$1',
        [consentId]
      ).catch(() => ({ rows: [] }));

      if (!txRows.length) {
        return res.json({ records: [], message: 'No health records found for consent' });
      }

      const txIds = txRows.map(r => r.transaction_id);
      query += `transaction_id = ANY($1::text[])`;
      params = [txIds];
    }

    query += ` ORDER BY received_at DESC`;
    const { rows: records } = await pool.query(query, params);

    if (!records.length) {
      return res.json({ records: [], message: 'No health records found' });
    }

    logger.info('Fetched health records', {
      consentId,
      transactionId,
      recordCount: records.length,
      decrypt: decrypt === 'true',
    });

    // M3: If decrypt requested, decrypt all entries using HIU's private key
    if (decrypt === 'true') {
      const crypto = require('crypto');
      const decryptedRecords = [];

      for (const record of records) {
        try {
          // Retrieve HIU private key
          const hiuKeyEntry = consentId ? abdm.getHiuKey(consentId) : null;

          if (!hiuKeyEntry) {
            logger.warn('HIU key not found — cannot decrypt', {
              transactionId: record.transaction_id,
              consentId,
            });
            // Return encrypted content if key unavailable
            decryptedRecords.push({
              ...record,
              decrypted: false,
              error: 'HIU key not available for decryption',
            });
            continue;
          }

          // For encrypted entries, we would need the HIP's public key and nonce
          // which should be stored or recoverable. For now, return with flag.
          // In production, retrieve HIP's keyMaterial from hip_health_requests
          const { rows: hhrRows } = await pool.query(
            'SELECT key_material FROM hip_health_requests WHERE transaction_id=$1',
            [record.transaction_id]
          ).catch(() => ({ rows: [] }));

          const hipKeyMaterial = hhrRows[0]?.key_material;
          if (!hipKeyMaterial) {
            decryptedRecords.push({
              ...record,
              decrypted: false,
              error: 'HIP key material not available',
            });
            continue;
          }

          const hipPubKey = hipKeyMaterial.dhPublicKey?.keyValue;
          const hipNonce = hipKeyMaterial.nonce;

          if (!hipPubKey || !hipNonce) {
            decryptedRecords.push({
              ...record,
              decrypted: false,
              error: 'HIP key material incomplete',
            });
            continue;
          }

          // Decrypt entry using Curve25519 ECDH
          const decrypted = abdm.decryptHipEntry(record.content, hipPubKey, hipNonce, hiuKeyEntry);

          if (!decrypted) {
            decryptedRecords.push({
              ...record,
              decrypted: false,
              error: 'Decryption failed',
            });
            continue;
          }

          // Verify checksum
          const computedChecksum = crypto.createHash('md5').update(decrypted).digest('hex');
          const checksumValid = computedChecksum === record.checksum;

          if (!checksumValid) {
            logger.warn('Decrypted content checksum mismatch', {
              transactionId: record.transaction_id,
              expected: record.checksum,
              computed: computedChecksum,
            });
          }

          // Parse FHIR bundle if applicable
          let fhirBundle = null;
          if (record.media === 'application/fhir+json') {
            try {
              fhirBundle = JSON.parse(decrypted);
            } catch (parseErr) {
              logger.warn('Failed to parse FHIR bundle', {
                transactionId: record.transaction_id,
                error: parseErr.message,
              });
            }
          }

          decryptedRecords.push({
            ...record,
            content: fhirBundle || decrypted, // Return parsed FHIR or plaintext
            decrypted: true,
            checksumValid,
          });
        } catch (err) {
          logger.error('Error decrypting health record', {
            transactionId: record.transaction_id,
            error: err.message,
          });
          decryptedRecords.push({
            ...record,
            decrypted: false,
            error: err.message,
          });
        }
      }

      return res.json({
        records: decryptedRecords,
        totalRecords: decryptedRecords.length,
        decryptedCount: decryptedRecords.filter(r => r.decrypted).length,
      });
    }

    // Return encrypted records as-is (for backup/audit purposes)
    res.json({
      records,
      totalRecords: records.length,
      note: 'Records are encrypted. Use ?decrypt=true to decrypt.',
    });
  } catch (err) {
    logger.error('getHealthRecords error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch health records' });
  }
};


// ─── M1: ABHA Logout ──────────────────────────────────────────────────────────

const logoutAbha = async (req, res) => {
  await pool.query('DELETE FROM abha_accounts WHERE user_id=$1', [req.user.id]);
  res.json({ message: 'ABHA unlinked' });
};

const respondConsent = async (req, res) => {
  const { requestId } = req.params;
  const { action } = req.body;
  if (!['GRANT', 'DENY'].includes(action))
    return res.status(400).json({ error: 'action must be GRANT or DENY' });

  const status = action === 'GRANT' ? 'GRANTED' : 'DENIED';

  const { rowCount } = await pool.query(
    `UPDATE emr_consent_requests SET status=$1, updated_at=NOW()
     WHERE request_id=$2`,
    [status, requestId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Consent request not found' });

  if (action === 'GRANT') {
    const artefactId = abdm.uuid();

    // Get stored permission dateRange (ABDM-1063 fix)
    const { rows: existingConsent } = await pool.query(
      `SELECT permission_date_range FROM emr_consent_requests WHERE request_id=$1`,
      [requestId]
    ).catch(() => ({ rows: [] }));

    const permissionDateRange = existingConsent[0]?.permission_date_range;

    await pool.query(
      `UPDATE emr_consent_requests SET artefacts=$1, updated_at=NOW() WHERE request_id=$2`,
      [JSON.stringify([{ id: artefactId }]), requestId]
    );
    const dataPushUrl = `${process.env.BACKEND_URL}/api/abdm/health-info/push`;
    try {
      const options = {
        cryptoAlg: 'ECDH',
        curve: 'Curve25519',
        dhPublicKey: { expiry: new Date(Date.now() + 3600_000).toISOString(), parameters: 'Curve25519', keyValue: '' },
        nonce: abdm.uuid(),
      };
      // Add stored permission dateRange if available (prevents ABDM-1063)
      if (permissionDateRange) {
        options.dateRange = permissionDateRange;
      }
      const result = await abdm.fetchHealthInfo(artefactId, dataPushUrl, options);
      const txnId = result.hiRequest?.transactionId ?? abdm.uuid();
      await pool.query(
        `UPDATE emr_consent_requests SET transaction_id=$1, updated_at=NOW() WHERE request_id=$2`,
        [txnId, requestId]
      );
    } catch (_) { /* health info fetch may fail in sandbox — consent still marked GRANTED */ }
  }

  res.json({ status });
};

const debugToken = async (req, res) => {
  try {
    const token = await abdm.getGatewayToken();
    res.json({ ok: true, tokenPrefix: token?.slice(0, 20) + '...', clientId: process.env.ABDM_CLIENT_ID });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
};

const debugBridge = async (req, res) => {
  try {
    const info = await abdm.getBridgeInfo();
    res.json({ ok: true, bridge: info });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.response?.data ?? err.message });
  }
};

const debugHipSessions = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, link_ref_number, status, care_contexts, request_id, created_at
     FROM hip_link_sessions ORDER BY created_at DESC LIMIT 10`
  );
  res.json(rows);
};

const debugUpdateHipServices = async (req, res) => {
  try {
    const result = await abdm.updateHipServices();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.response?.data ?? err.message });
  }
};

const debugConsentDetails = async (req, res) => {
  const { consentId } = req.query;
  if (!consentId) return res.status(400).json({ error: 'consentId required' });

  try {
    const [consReq, hipArt] = await Promise.all([
      pool.query(
        `SELECT id, request_id, abdm_request_id, patient_abha, purpose, hi_types, permission_date_range, status, created_at
         FROM emr_consent_requests
         WHERE request_id=$1 OR abdm_request_id=$1 LIMIT 1`,
        [consentId]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT consent_id, status, artefacts, raw, patient_abha, created_at
         FROM hip_consent_artifacts
         WHERE consent_id=$1 LIMIT 1`,
        [consentId]
      ).catch(() => ({ rows: [] })),
    ]);

    res.json({
      emr_consent_request: consReq.rows[0] ?? null,
      hip_consent_artifact: hipArt.rows[0] ?? null,
      diagnostic: {
        emr_has_permission_date_range: !!consReq.rows[0]?.permission_date_range,
        hip_has_raw: !!hipArt.rows[0]?.raw,
        hip_raw_keys: Object.keys(hipArt.rows[0]?.raw || {}),
        hip_raw_permission: hipArt.rows[0]?.raw?.consentDetail?.permission || hipArt.rows[0]?.raw?.permission || null,
      },
    });
  } catch (err) {
    logger.error('debugConsentDetails error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

module.exports = {
  aadhaarGenerateOtp, aadhaarVerifyOtp,
  mobileGenerateOtp,  mobileVerifyOtp,
  loginGenerateOtp,   loginVerifyOtp,
  logoutAbha,
  getAbhaStatus, getAbhaProfile, getAbhaCard,
  discoverCareContexts, onDiscover,     discoverStatus,
  linkInit,             onLinkInit,     linkStatus,
  linkConfirm,          onLinkConfirm,  confirmStatus,
  getAvailableCareContexts,
  linkCareContexts,     getLinkedCareContexts,  unlinkCareContext,
  createConsent, getConsents, respondConsent,
  consentOnInit, consentNotify, healthInfoPush,
  getHealthRecords,
  debugToken, debugBridge, debugUpdateHipServices, debugHipSessions, debugConsentDetails,
};
