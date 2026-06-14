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

  // Track in emr_consent_requests (single source of truth)
  // Use result.reqId (the ID we sent to ABDM, not ABDM's response)
  await pool.query(
    `INSERT INTO emr_consent_requests (clinic_id, request_id, patient_abha, hiu_id, purpose, hi_types, status)
     VALUES (
       (SELECT MIN(id) FROM emr_clinics),
       $1, $2, $3, $4, $5, 'REQUESTED'
     )
     ON CONFLICT (request_id) DO NOTHING`,
    [result.reqId, rows[0].abha_address, hiuId, purpose, JSON.stringify(hiTypes)]
  ).catch(err => logger.warn('createConsent: insert failed', { error: err.message }));

  res.json(result);
};

const getConsents = async (req, res) => {
  // Consents now tracked in emr_consent_requests only — PHR app can query via EMR endpoints
  res.json([]);
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

    // Store ABDM's assigned consent ID in abdm_request_id (keep our reqId as request_id for stability).
    // The GRANTED notify will use ABDM's ID, so we need it stored separately to match later.
    const res = await pool.query(
      `UPDATE emr_consent_requests
         SET abdm_request_id=$1, updated_at=NOW()
       WHERE request_id=$2`,
      [abdmConsentId, ourRequestId]
    );
    logger.info('consent-requests/on-init: stored abdm_request_id', {
      abdmConsentId, ourRequestId, emrRowsUpdated: res.rowCount,
    });
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

      if (patientAbha) {
        const hiuId = process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID;
        await pool.query(
          `INSERT INTO emr_consent_requests
             (clinic_id, request_id, abdm_request_id, patient_abha, hip_id, hiu_id, purpose, hi_types, status)
           VALUES (
             (SELECT MIN(id) FROM emr_clinics),
             $1, $1, $2, $3, $4, $5, $6, $7
           )
           ON CONFLICT (request_id) DO UPDATE
             SET status=$7, abdm_request_id=$1, updated_at=NOW()`,
          [consentRequestId, patientAbha, hipId, hiuId, purpose, hiTypes, notification.status]
        ).catch(err => logger.warn('HIU consent notify: upsert failed', { error: err.message }));
        logger.info('HIU consent notify: inserted patient-initiated consent', { consentRequestId, patientAbha, purpose });
      } else {
        logger.warn('HIU consent notify: no patient ABHA found for upsert', { consentRequestId, artefactId });
      }
    }

    // When granted, automatically request health info from HIP
    if (notification.status === 'GRANTED' && notification.consentArtefacts?.length) {
      await pool.query(
        `UPDATE emr_consent_requests SET artefacts=$1, updated_at=NOW()
         WHERE request_id=$2 OR abdm_request_id=$2`,
        [JSON.stringify(notification.consentArtefacts), consentRequestId]
      );
      const dataPushUrl = `${process.env.BACKEND_URL}/api/abdm/health-info/push`;
      logger.info('HIU consent GRANTED — initiating health-info fetch', {
        consentRequestId: notification.consentRequestId,
        artefactIds: notification.consentArtefacts.map(a => a.id),
        dataPushUrl,
      });

      for (const artefact of notification.consentArtefacts) {
        try {
          logger.info('HIU fetching health-info for artefact', { artefactId: artefact.id, dataPushUrl });
          const result = await abdm.fetchHealthInfo(artefact.id, dataPushUrl);
          const txnId = result?.hiRequest?.transactionId ?? abdm.uuid();
          logger.info('HIU health-info request sent to CM', { artefactId: artefact.id, txnId });
          await pool.query(
            `UPDATE emr_consent_requests SET transaction_id=$1, updated_at=NOW()
             WHERE request_id=$2 OR abdm_request_id=$2`,
            [txnId, consentRequestId]
          );
        } catch (err) {
          logger.error('HIU fetchHealthInfo failed', {
            artefactId: artefact.id,
            message: err.message,
            response: err.response?.data,
            status: err.response?.status,
          });
        }
      }
    } else if (notification.status === 'GRANTED' && !notification.consentArtefacts?.length) {
      logger.warn('HIU consent GRANTED but no artefacts in notification', { consentRequestId: notification.consentRequestId });
    }
  } catch (err) {
    logger.error('consentNotify error', err);
  }
};

const healthInfoPush = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
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

    // Find the consent artefact ID for this transaction so we can retrieve the stored HIU key
    let hiuKeyEntry = null;
    if (hipPubKey && hipNonce) {
      const { rows: hrRows } = await pool.query(
        'SELECT consent_id FROM hip_health_requests WHERE transaction_id=$1 LIMIT 1',
        [transactionId]
      ).catch(() => ({ rows: [] }));
      const consentId = hrRows[0]?.consent_id;
      if (consentId) hiuKeyEntry = abdm.getHiuKey(consentId);
      logger.info('HIU health-info push: key lookup', { transactionId, consentId, hasKey: !!hiuKeyEntry });
    }

    for (const entry of entries) {
      let content = entry.content;
      if (hipPubKey && hipNonce && hiuKeyEntry) {
        const decrypted = abdm.decryptHipEntry(content, hipPubKey, hipNonce, hiuKeyEntry);
        if (decrypted) {
          content = Buffer.from(decrypted).toString('base64');
          logger.info('HIU decrypted health record', { transactionId, careContextReference: entry.careContextReference });
        } else {
          logger.warn('HIU decrypt failed — storing raw content', { transactionId });
        }
      }

      logger.info('HIU storing health record', {
        transactionId,
        careContextReference: entry.careContextReference,
        media: entry.media,
        contentLen: content?.length,
      });
      await pool.query(
        `INSERT INTO health_records
           (transaction_id, care_context_reference, content, media, checksum, page_number, page_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        [transactionId, entry.careContextReference, content, entry.media, entry.checksum, pageNumber, pageCount]
      );
    }
    logger.info('HIU health-info push stored', { transactionId, count: entries.length });
  } catch (err) {
    logger.error('healthInfoPush error', { message: err.message });
  }
};

// ─── M3: Fetch stored health records ──────────────────────────────────────────

const getHealthRecords = async (req, res) => {
  // Health records now tracked via emr_consent_requests only
  // PHR users should use EMR endpoints
  res.json([]);
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
  debugToken, debugBridge, debugUpdateHipServices, debugHipSessions,
};
