const { pool }  = require('../config/database');
const logger    = require('../utils/logger');
const hip       = require('./hip.service');

// ── ABDM gateway → HIP: care-context discovery ───────────────────────────────

const handleDiscovery = async (req, res) => {
  res.status(202).json({ status: 'accepted' });
  try {
    // ABDM v3 sends requestId in REQUEST-ID header; v0.5 sends it in body
    const requestId = req.headers['request-id'] || req.body.requestId;
    const { transactionId, patient } = req.body;
    logger.info('HIP discover request', { requestId, transactionId, patientId: patient?.id });

    // Match patient by ABHA address, then mobile, then name
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
      await hip.sendDiscoverResult({ requestId, transactionId, patientId: null, careContexts: [], matchedBy: [] });
      return;
    }

    const pt = rows[0];
    const { rows: ctxRows } = await pool.query(
      `SELECT * FROM emr_care_contexts WHERE patient_id=$1 ORDER BY created_at DESC`,
      [pt.id]
    );

    const abhaId = pt.abha_address ?? pt.abha_number ?? `${pt.id}@hip`;
    await hip.sendDiscoverResult({
      requestId,
      transactionId,
      patientId: abhaId,
      patientRef: abhaId,   // patient.referenceNumber — patient's HIP record identifier
      careContexts: ctxRows,
      matchedBy,
    });
    logger.info('HIP discover: matched patient', { name: pt.name, contexts: ctxRows.length });
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
    // ABDM v3 sends careContexts at root level; v0.5 nests under patient
    const careContexts = patient?.careContexts ?? req.body.careContexts ?? [];
    const patientId    = patient?.id ?? req.body.abhaAddress ?? req.body.patientId ?? '';
    logger.info('HIP link/init', { requestId, transactionId, patientId, careContexts: careContexts.length });

    // Find patient
    const { rows } = await pool.query(
      `SELECT * FROM emr_patients WHERE abha_address=$1 OR abha_number=$1 LIMIT 1`,
      [patientId]
    );
    const pt = rows[0] ?? null;

    const otp           = String(Math.floor(100000 + Math.random() * 900000));
    const linkRefNumber = hip.uuid();
    const expiresAt     = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO hip_link_sessions
         (patient_id, transaction_id, request_id, care_contexts, otp, otp_expires_at, link_ref_number, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_otp')`,
      [pt?.id ?? null, transactionId, requestId,
       JSON.stringify(careContexts),
       otp, expiresAt, linkRefNumber]
    );

    logger.info('HIP OTP generated', { otp, linkRefNumber, patientId, contexts: careContexts.length });

    await hip.sendLinkInitResult({ requestId, transactionId, linkRefNumber });
  } catch (err) {
    logger.error('handleLinkInit error', err);
  }
};

// ── ABDM gateway → HIP: link confirm (verify OTP) ────────────────────────────

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
      logger.warn('HIP: link already processed', { linkRefNumber, status: session.status });
      return;
    }
    if (new Date() > new Date(session.otp_expires_at)) {
      await pool.query(`UPDATE hip_link_sessions SET status='expired' WHERE id=$1`, [session.id]);
      logger.warn('HIP: OTP expired', { linkRefNumber });
      return;
    }
    if (session.otp !== submittedOtp) {
      logger.warn('HIP: OTP mismatch', { expected: session.otp, got: submittedOtp });
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

    // ABDM v3 never sends careContexts in link/init — fetch from EMR DB by patient
    if (!careContexts.length && session.patient_id) {
      const { rows: ctxRows } = await pool.query(
        `SELECT reference_number AS "referenceNumber", display
         FROM emr_care_contexts WHERE patient_id=$1 ORDER BY created_at DESC`,
        [session.patient_id]
      );
      careContexts = ctxRows;
      logger.info('HIP link confirm: loaded care contexts from EMR DB', { count: careContexts.length, patientId: session.patient_id });
    }

    if (!careContexts.length) {
      logger.warn('HIP link confirm: patient has no care contexts in EMR', { linkRefNumber, patientId: session.patient_id });
      return;
    }

    logger.info('HIP link confirm payload', { patientRef, count: careContexts.length, careContexts });
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
    const consentId  = hiRequest?.consent?.id;
    const dataPushUrl = hiRequest?.dataPushUrl;
    const keyMaterial = hiRequest?.keyMaterial;
    logger.info('HIP health-info request', { transactionId, consentId, dataPushUrl, keyMaterial });

    await pool.query(
      `INSERT INTO hip_health_requests (transaction_id, consent_id, data_push_url, key_material)
       VALUES ($1,$2,$3,$4) ON CONFLICT (transaction_id) DO NOTHING`,
      [transactionId, consentId, dataPushUrl, JSON.stringify(keyMaterial ?? {})]
    );

    // Look up consent artifact to find which patient's data was consented
    const { rows: artifactRows } = await pool.query(
      `SELECT * FROM hip_consent_artifacts WHERE consent_id=$1 LIMIT 1`,
      [consentId]
    ).catch(() => ({ rows: [] }));

    const artifact = artifactRows[0];
    const raw      = artifact?.raw ?? {};

    logger.info('HIP health-info: consent artifact raw keys', { keys: Object.keys(raw), raw: JSON.stringify(raw).slice(0, 400) });

    // Extract consented care context references — try all known ABDM v2/v3 locations
    const ctxList =
      raw.grants?.careContexts ??           // ABDM v3: notification.grants.careContexts
      raw.careContexts ??                    // ABDM v0.5 flat
      raw.consentDetail?.careContexts ??     // ABDM v0.5 nested
      [];

    const consentedRefs = ctxList.map(c => c.careContextReference).filter(Boolean);

    const patientId =
      raw.grants?.careContexts?.[0]?.patientReference ??
      raw.patient?.id ??
      raw.consentDetail?.patient?.id ??
      ctxList[0]?.patientReference;

    logger.info('HIP health-info: consent filter', { patientId, consentedRefs });

    // Fetch only the care contexts that were explicitly consented to
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
    } else if (patientId) {
      const { rows: r } = await pool.query(
        `SELECT ecc.*, ep.name, ep.mobile, ep.dob, ep.gender
         FROM emr_care_contexts ecc
         JOIN emr_patients ep ON ep.id = ecc.patient_id
         WHERE ep.abha_address=$1 OR ep.abha_number=$1
         ORDER BY ecc.created_at DESC`,
        [patientId]
      );
      rows = r;
    } else {
      rows = [];
    }

    logger.info('HIP health-info: care contexts to push', { count: rows.length, refs: rows.map(r => r.reference_number) });

    if (!rows.length) {
      logger.warn('HIP health-info: no care contexts to push', { patientId });
      await pool.query(`UPDATE hip_health_requests SET status='sent' WHERE transaction_id=$1`, [transactionId]);
      return;
    }

    const patient = { name: rows[0].name, mobile: rows[0].mobile, dob: rows[0].dob, gender: rows[0].gender };
    await hip.pushHealthData({ dataPushUrl, transactionId, careContexts: rows, patient, keyMaterial });
    await pool.query(`UPDATE hip_health_requests SET status='sent' WHERE transaction_id=$1`, [transactionId]);
  } catch (err) {
    logger.error('handleHealthInfoRequest error', {
      message: err.message,
      status: err.response?.status,
      abdmError: err.response?.data,
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
  // Add columns if table already existed without them
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
    logger.info('HIP patient share profile', { requestId, body: JSON.stringify(req.body) });

    const p           = profile?.patient ?? {};
    const abhaNumber  = p.abhaNumber  || p.ABHANumber  || null;
    const abhaAddress = p.abhaAddress || p.preferredAbhaAddress || null;
    const name        = p.name || [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || null;
    const mobile      = p.mobile || null;
    const gender      = p.gender || null;
    const dob         = (p.yearOfBirth && p.monthOfBirth && p.dayOfBirth)
      ? `${p.yearOfBirth}-${String(p.monthOfBirth).padStart(2,'0')}-${String(p.dayOfBirth).padStart(2,'0')}`
      : (p.dateOfBirth || null);

    // Generate a 6-digit token valid for 30 minutes
    const token          = String(Math.floor(100000 + Math.random() * 900000));
    const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      `INSERT INTO hip_profile_shares
         (request_id, share_code, abha_number, abha_address, name, mobile, gender, dob, raw_profile, token, token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (request_id) DO NOTHING`,
      [requestId, profile?.shareCode || null, abhaNumber, abhaAddress, name, mobile, gender, dob, profile || {}, token, tokenExpiresAt]
    );

    // Call ABDM back — this makes ABHA app show the token to the patient
    await hip.sendShareProfileAck({
      requestId,
      abhaAddress: abhaAddress || abhaNumber,
      tokenNumber: token,
    });

    logger.info('Patient profile share stored + ack sent', { name, abhaNumber, token });
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

    const consentId  = notification.consentId  ?? notification.consentRequestId;
    const status     = notification.status;
    const artefacts  = notification.consentArtefacts ?? [];

    // Persist consent artifact
    await pool.query(
      `INSERT INTO hip_consent_artifacts (consent_id, status, artefacts, raw)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (consent_id) DO UPDATE
         SET status=$2, artefacts=$3, raw=$4, updated_at=NOW()`,
      [consentId, status, JSON.stringify(artefacts), JSON.stringify(notification)]
    ).catch(() => {}); // table may not exist yet — log only

    // Send on-notify ack back to gateway
    await hip.gwPost('/v0.5/consents/hip/on-notify', {
      requestId: hip.uuid(),
      timestamp: new Date().toISOString(),
      acknowledgement: { status: 'OK', consentId },
      resp: { requestId },
    });

    logger.info('HIP consent notify ack sent', { consentId, status, artefacts: artefacts.length });
  } catch (err) {
    logger.error('handleConsentNotify error', err);
  }
};

module.exports = { handleDiscovery, handleLinkInit, handleLinkConfirm, handleHealthInfoRequest, handlePatientShareProfile, handleConsentNotify };
