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
  const result = await abdm.verifyAadhaarOtp(otp, txnId);

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

  const result = await abdm.generateMobileOtp(mobile);
  res.json({ txnId: result.txnId, message: 'OTP sent to your mobile' });
};

const mobileVerifyOtp = async (req, res) => {
  const { otp, txnId } = req.body;
  const result = await abdm.verifyMobileOtp(otp, txnId);
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
  const pngBuffer = await abdm.getAbhaPngCard(rows[0].x_token);
  res.set('Content-Type', 'image/png');
  res.send(pngBuffer);
};

// ─── M2: Care-context discovery ───────────────────────────────────────────────

const discoverCareContexts = async (req, res) => {
  const { hipId, patientMobile, patientName, dateOfBirth, gender } = req.body;
  if (!hipId) return res.status(400).json({ error: 'hipId required' });

  const { rows } = await pool.query(
    'SELECT abha_address FROM abha_accounts WHERE user_id=$1',
    [req.user.id]
  );
  if (!rows.length) return res.status(400).json({ error: 'ABHA not linked' });

  const patient = {
    id: rows[0].abha_address,
    name: patientName,
    gender: gender ?? 'M',
    dateOfBirth,
    verifiedIdentifiers: patientMobile
      ? [{ type: 'MOBILE', value: patientMobile }]
      : [],
    unverifiedIdentifiers: [],
  };

  const result = await abdm.discoverCareContexts(patient, hipId);
  res.json(result);
};

// ─── M2: Link care contexts ───────────────────────────────────────────────────

const linkCareContexts = async (req, res) => {
  const { accessToken: linkToken, careContexts, hipId } = req.body;
  if (!linkToken || !careContexts?.length || !hipId)
    return res.status(400).json({ error: 'accessToken, careContexts, hipId required' });

  const { rows } = await pool.query(
    'SELECT abha_address FROM abha_accounts WHERE user_id=$1',
    [req.user.id]
  );
  if (!rows.length) return res.status(400).json({ error: 'ABHA not linked' });

  const result = await abdm.linkCareContexts(linkToken, rows[0].abha_address, careContexts);

  for (const ctx of careContexts) {
    await pool.query(
      `INSERT INTO linked_care_contexts
         (user_id, hip_id, reference_number, display, hi_type)
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
    { from: dateFrom ?? new Date(0).toISOString(), to: dateTo ?? new Date().toISOString() }
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

const consentNotify = async (req, res) => {
  // Respond immediately – ABDM requires 202 within 5 s
  res.status(202).json({ status: 'accepted' });
  try {
    const { notification } = req.body;
    logger.info('ABDM consent notification', notification);
    if (!notification?.consentRequestId) return;

    await pool.query(
      `UPDATE consent_requests SET status=$1, updated_at=NOW()
       WHERE request_id=$2`,
      [notification.status, notification.consentRequestId]
    );

    // When granted, automatically request health info from HIP
    if (notification.status === 'GRANTED' && notification.consentArtefacts?.length) {
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
            `UPDATE consent_requests SET transaction_id=$1, updated_at=NOW()
             WHERE request_id=$2`,
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
  getAbhaStatus, getAbhaProfile, getAbhaCard,
  discoverCareContexts, linkCareContexts, getLinkedCareContexts,
  createConsent, getConsents,
  consentNotify, healthInfoPush,
  getHealthRecords,
  debugToken,
};
