const abdm   = require('../services/abdm.service');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

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
  const { abhaNumber } = req.body;
  if (!abhaNumber) return res.status(400).json({ error: 'abhaNumber required' });
  const result = await abdm.loginRequestOtp(abhaNumber);
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
  const tokenRes = await abdm.generateLinkToken(
    hipId, abha_number, abha_address, name,
    patientGender ?? 'M', patientYearOfBirth ?? 1990
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

// ─── M2: Consent management ───────────────────────────────────────────────────

const createConsent = async (req, res) => {
  const { hiuId, purpose, hiTypes, dateFrom, dateTo } = req.body;
  if (!hiuId || !purpose || !hiTypes?.length)
    return res.status(400).json({ error: 'hiuId, purpose, hiTypes required' });

  const { rows } = await pool.query(
    'SELECT abha_address FROM abha_accounts WHERE user_id=$1',
    [req.user.id]
  );
  if (!rows.length) return res.status(400).json({ error: 'ABHA not linked' });

  const result = await abdm.createConsentRequest(
    rows[0].abha_address, hiuId, purpose, hiTypes,
    {
      from: dateFrom ?? new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
      to:   dateTo && new Date(dateTo) <= new Date() ? dateTo : new Date().toISOString(),
    }
  );

  await pool.query(
    `INSERT INTO consent_requests
       (user_id, request_id, hiu_id, purpose, status)
     VALUES ($1,$2,$3,$4,'REQUESTED')`,
    [req.user.id, result.consentRequest?.id ?? abdm.uuid(), hiuId, purpose]
  );
  res.json(result);
};

const getConsents = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM consent_requests WHERE user_id=$1 ORDER BY created_at DESC',
    [req.user.id]
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
    if (!abdmConsentId || !ourRequestId) return;

    // If ABDM assigned a different ID from what we generated, update both tables
    if (abdmConsentId !== ourRequestId) {
      await pool.query(
        `UPDATE emr_consent_requests SET request_id=$1 WHERE request_id=$2`,
        [abdmConsentId, ourRequestId]
      );
      await pool.query(
        `UPDATE consent_requests SET request_id=$1 WHERE request_id=$2`,
        [abdmConsentId, ourRequestId]
      );
    }
  } catch (err) {
    logger.error('consentOnInit error', err.message);
  }
};

const consentNotify = async (req, res) => {
  // Respond immediately – ABDM requires 202 within 5 s
  res.status(202).json({ status: 'accepted' });
  try {
    const { notification } = req.body;
    logger.info('ABDM consent notification', notification);
    if (!notification?.consentRequestId) return;

    // Update PHR consent table
    await pool.query(
      `UPDATE consent_requests SET status=$1, updated_at=NOW() WHERE request_id=$2`,
      [notification.status, notification.consentRequestId]
    );
    // Update EMR consent table
    await pool.query(
      `UPDATE emr_consent_requests SET status=$1, updated_at=NOW() WHERE request_id=$2`,
      [notification.status, notification.consentRequestId]
    );

    // When granted, automatically request health info from HIP
    if (notification.status === 'GRANTED' && notification.consentArtefacts?.length) {
      await pool.query(
        `UPDATE emr_consent_requests SET artefacts=$1, updated_at=NOW() WHERE request_id=$2`,
        [JSON.stringify(notification.consentArtefacts), notification.consentRequestId]
      );
      const dataPushUrl = `${process.env.BACKEND_URL}/api/abdm/health-info/push`;
      for (const artefact of notification.consentArtefacts) {
        try {
          const result = await abdm.fetchHealthInfo(artefact.id, dataPushUrl, {
            cryptoAlg: 'ECDH',
            curve: 'Curve25519',
            dhPublicKey: { expiry: new Date(Date.now() + 3600_000).toISOString(), parameters: 'Curve25519', keyValue: '' },
            nonce: abdm.uuid(),
          });
          const txnId = result.hiRequest?.transactionId ?? abdm.uuid();
          await pool.query(
            `UPDATE consent_requests SET transaction_id=$1, updated_at=NOW() WHERE request_id=$2`,
            [txnId, notification.consentRequestId]
          );
          await pool.query(
            `UPDATE emr_consent_requests SET transaction_id=$1, updated_at=NOW() WHERE request_id=$2`,
            [txnId, notification.consentRequestId]
          );
          logger.info('Health info requested', { txnId, artefactId: artefact.id });
        } catch (err) {
          logger.error('fetchHealthInfo failed for artefact', artefact.id, err.message);
        }
      }
    }
  } catch (err) {
    logger.error('consentNotify error', err);
  }
};

const healthInfoPush = async (req, res) => {
  try {
    const { transactionId, entries, pageNumber, pageCount } = req.body;
    logger.info('ABDM health-info push', { transactionId, pages: `${pageNumber}/${pageCount}` });
    for (const entry of entries ?? []) {
      await pool.query(
        `INSERT INTO health_records
           (transaction_id, care_context_reference, content, media, checksum, page_number, page_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        [
          transactionId,
          entry.careContextReference,
          entry.content,
          entry.media,
          entry.checksum,
          pageNumber,
          pageCount,
        ]
      );
    }
  } catch (err) {
    logger.error('healthInfoPush error', err);
  }
  res.status(202).json({ status: 'accepted' });
};

// ─── M3: Fetch stored health records ──────────────────────────────────────────

const getHealthRecords = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT hr.*
     FROM health_records hr
     JOIN consent_requests cr ON cr.transaction_id = hr.transaction_id
     WHERE cr.user_id=$1
     ORDER BY hr.received_at DESC`,
    [req.user.id]
  );
  res.json(rows);
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
    `UPDATE consent_requests SET status=$1, updated_at=NOW()
     WHERE request_id=$2 AND user_id=$3`,
    [status, requestId, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Consent request not found' });

  // Mirror into EMR table
  await pool.query(
    `UPDATE emr_consent_requests SET status=$1, updated_at=NOW() WHERE request_id=$2`,
    [status, requestId]
  );

  if (action === 'GRANT') {
    const artefactId = abdm.uuid();
    await pool.query(
      `UPDATE emr_consent_requests SET artefacts=$1, updated_at=NOW() WHERE request_id=$2`,
      [JSON.stringify([{ id: artefactId }]), requestId]
    );
    const dataPushUrl = `${process.env.BACKEND_URL}/api/abdm/health-info/push`;
    try {
      const result = await abdm.fetchHealthInfo(artefactId, dataPushUrl, {
        cryptoAlg: 'ECDH',
        curve: 'Curve25519',
        dhPublicKey: { expiry: new Date(Date.now() + 3600_000).toISOString(), parameters: 'Curve25519', keyValue: '' },
        nonce: abdm.uuid(),
      });
      const txnId = result.hiRequest?.transactionId ?? abdm.uuid();
      await pool.query(
        `UPDATE consent_requests SET transaction_id=$1, updated_at=NOW() WHERE request_id=$2`,
        [txnId, requestId]
      );
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
  linkCareContexts,     getLinkedCareContexts,
  createConsent, getConsents, respondConsent,
  consentOnInit, consentNotify, healthInfoPush,
  getHealthRecords,
  debugToken,
};
