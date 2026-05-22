const crypto   = require('crypto');
const { pool } = require('../config/database');
const hip      = require('./hip.service');
const abdmSvc  = require('../services/abdm.service');

// ── Patients ──────────────────────────────────────────────────────────────────

const listPatients = async (req, res) => {
  const { q } = req.query;
  const clinicId = req.emrUser?.clinic_id;
  const uhidSub = clinicId
    ? `(SELECT a.uhid FROM emr_appointments a
        WHERE a.patient_mobile = p.mobile AND a.uhid IS NOT NULL AND a.uhid != ''
          AND a.clinic_id = ${parseInt(clinicId, 10)}
        ORDER BY a.created_at DESC LIMIT 1) AS uhid`
    : `NULL AS uhid`;

  if (q && q.trim().length >= 2) {
    const term   = `%${q.trim().toLowerCase()}%`;
    const prefix = `${q.trim()}%`;
    const cid    = parseInt(clinicId, 10);

    // 1. Search the patient registry (name, mobile, ABHA, or UHID from appointments)
    const { rows: regRows } = await pool.query(
      `SELECT p.id, p.name, p.mobile, p.dob, p.gender, p.abha_number, p.abha_address,
              COUNT(DISTINCT c.id)::int AS context_count, ${uhidSub}
       FROM emr_patients p
       LEFT JOIN emr_care_contexts c ON c.patient_id = p.id
       WHERE LOWER(p.name) LIKE $1 OR p.mobile LIKE $2 OR p.abha_number LIKE $2
          OR EXISTS (
            SELECT 1 FROM emr_appointments ax
            WHERE ax.patient_mobile = p.mobile
              AND LOWER(ax.uhid) LIKE $1
              AND ax.clinic_id = $3
          )
       GROUP BY p.id ORDER BY p.name LIMIT 10`,
      [term, prefix, cid]
    );

    // 2. Search appointments for patients not yet in the registry
    const knownMobiles = new Set(regRows.map(r => r.mobile).filter(Boolean));
    const { rows: apptRows } = await pool.query(
      `SELECT NULL           AS id,
              patient_name   AS name,
              patient_mobile AS mobile,
              patient_dob    AS dob,
              patient_gender AS gender,
              patient_abha   AS abha_number,
              NULL           AS abha_address,
              0              AS context_count,
              MAX(uhid)      AS uhid
       FROM emr_appointments
       WHERE clinic_id = $3
         AND (LOWER(patient_name) LIKE $1
              OR patient_mobile   LIKE $2
              OR LOWER(uhid)      LIKE $1
              OR patient_abha     LIKE $2)
       GROUP BY patient_name, patient_mobile, patient_dob, patient_gender, patient_abha
       ORDER BY patient_name
       LIMIT 10`,
      [term, prefix, cid]
    );

    // Deduplicate in JS — avoids NULL-mobile issues with SQL ANY()
    const unique = apptRows.filter(r => !r.mobile || !knownMobiles.has(r.mobile));
    return res.json([...regRows, ...unique].slice(0, 10));
  }

  const { rows } = await pool.query(
    `SELECT p.*, COUNT(c.id)::int AS context_count, ${uhidSub}
     FROM emr_patients p
     LEFT JOIN emr_care_contexts c ON c.patient_id = p.id
     GROUP BY p.id ORDER BY p.created_at DESC`
  );
  res.json(rows);
};

const createPatient = async (req, res) => {
  const { name, mobile, dob, gender, abha_number, abha_address } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { rows } = await pool.query(
    `INSERT INTO emr_patients (name, mobile, dob, gender, abha_number, abha_address)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, mobile ?? null, dob ?? null, gender ?? 'M', abha_number ?? null, abha_address ?? null]
  );
  res.status(201).json(rows[0]);
};

const getPatient = async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM emr_patients WHERE id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
  const patient = rows[0];
  const { rows: ctxs } = await pool.query(
    `SELECT * FROM emr_care_contexts WHERE patient_id=$1 ORDER BY created_at DESC`,
    [patient.id]
  );
  res.json({ ...patient, care_contexts: ctxs });
};

const updatePatient = async (req, res) => {
  const { name, mobile, dob, gender, abha_number, abha_address } = req.body;
  const { rows } = await pool.query(
    `UPDATE emr_patients SET name=COALESCE($1,name), mobile=COALESCE($2,mobile),
       dob=COALESCE($3,dob), gender=COALESCE($4,gender),
       abha_number=COALESCE($5,abha_number), abha_address=COALESCE($6,abha_address)
     WHERE id=$7 RETURNING *`,
    [name, mobile, dob, gender, abha_number, abha_address, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
  res.json(rows[0]);
};

const deletePatient = async (req, res) => {
  await pool.query(`DELETE FROM emr_patients WHERE id=$1`, [req.params.id]);
  res.json({ message: 'Deleted' });
};

// ── Care contexts ─────────────────────────────────────────────────────────────

const addCareContext = async (req, res) => {
  const { display, hi_type, fhir_content } = req.body;
  if (!display) return res.status(400).json({ error: 'display required' });
  const refNum = `REF-${hip.uuid().slice(0, 8).toUpperCase()}`;
  const { rows } = await pool.query(
    `INSERT INTO emr_care_contexts (patient_id, reference_number, display, hi_type, fhir_content)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, refNum, display, hi_type ?? 'OPConsultation', fhir_content ?? null]
  );
  res.status(201).json(rows[0]);
};

const deleteCareContext = async (req, res) => {
  await pool.query(`DELETE FROM emr_care_contexts WHERE id=$1 AND patient_id=$2`,
    [req.params.ctxId, req.params.id]);
  res.json({ message: 'Deleted' });
};

// ── Pending OTPs (EMR staff sees these to relay to patient) ──────────────────

const pendingOtps = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, p.name AS patient_name, p.mobile AS patient_mobile
     FROM hip_link_sessions s
     LEFT JOIN emr_patients p ON p.id = s.patient_id
     WHERE s.status='pending_otp' AND s.otp_expires_at > NOW()
     ORDER BY s.created_at DESC`
  );
  res.json(rows);
};

// ── Health info requests log ──────────────────────────────────────────────────

const healthRequests = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM hip_health_requests ORDER BY created_at DESC LIMIT 50`
  );
  res.json(rows);
};

// ── Activity log (recent HIP events) ─────────────────────────────────────────

const activityLog = async (req, res) => {
  const [sessions, healthReqs] = await Promise.all([
    pool.query(`SELECT 'link' AS type, status, created_at, patient_id,
                  jsonb_array_length(care_contexts) AS ctx_count
                FROM hip_link_sessions ORDER BY created_at DESC LIMIT 20`),
    pool.query(`SELECT 'health_info' AS type, status, created_at, transaction_id
                FROM hip_health_requests ORDER BY created_at DESC LIMIT 20`),
  ]);
  const merged = [...sessions.rows, ...healthReqs.rows]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 30);
  res.json(merged);
};

// ── Consent management (EMR acting as HIU) ────────────────────────────────────

const createConsentRequest = async (req, res) => {
  const { patientAbha, hipId, purpose, hiTypes, dateFrom, dateTo } = req.body;
  if (!patientAbha || !hipId || !purpose || !hiTypes?.length)
    return res.status(400).json({ error: 'patientAbha, hipId, purpose, hiTypes required' });

  const clinicId = req.emrUser.clinic_id;
  const hiuId    = process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID;

  let result = {};
  try {
    result = await abdmSvc.createConsentRequest(
      patientAbha, hiuId, purpose, hiTypes,
      { from: dateFrom ?? new Date(0).toISOString(), to: dateTo ?? new Date().toISOString() }
    );
  } catch (e) {
    console.error('ABDM consent-requests/init failed:', e.message);
    // Proceed with local DB insert so patient can still see the request internally
  }

  const requestId = result.consentRequest?.id ?? abdmSvc.uuid();

  await pool.query(
    `INSERT INTO emr_consent_requests
       (clinic_id, request_id, patient_abha, hip_id, hiu_id, purpose, hi_types)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (request_id) DO NOTHING`,
    [clinicId, requestId, patientAbha, hipId, hiuId, purpose, hiTypes]
  );

  // Mirror into consent_requests so the patient sees it in the Flutter PHR app.
  // Use case-insensitive lookup and match both @sbx and @abdm domain variants.
  const baseAbha = patientAbha.split('@')[0].toLowerCase();
  const { rows: userRows } = await pool.query(
    `SELECT user_id FROM abha_accounts
     WHERE LOWER(abha_address) = LOWER($1)
        OR LOWER(abha_address) LIKE $2
     LIMIT 1`,
    [patientAbha, baseAbha + '@%']
  );

  let patientLinked = false;
  if (userRows.length) {
    await pool.query(
      `INSERT INTO consent_requests (user_id, request_id, hiu_id, purpose, status)
       VALUES ($1,$2,$3,$4,'REQUESTED') ON CONFLICT (request_id) DO NOTHING`,
      [userRows[0].user_id, requestId, hiuId, purpose]
    );
    patientLinked = true;
  }

  res.json({ requestId, patientLinked, ...result });
};

const listConsentRequests = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT request_id, patient_abha, hip_id, hiu_id, purpose, hi_types, status, transaction_id, artefacts, created_at, updated_at, 'emr' AS source
     FROM emr_consent_requests WHERE clinic_id=$1
     UNION ALL
     SELECT request_id, NULL AS patient_abha, NULL AS hip_id, hiu_id, purpose, NULL AS hi_types, status, transaction_id, NULL AS artefacts, created_at, updated_at, 'app' AS source
     FROM consent_requests
     ORDER BY created_at DESC LIMIT 100`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

const respondConsent = async (req, res) => {
  const { requestId } = req.params;
  const { action } = req.body;  // 'GRANT' | 'DENY'
  if (!['GRANT', 'DENY'].includes(action))
    return res.status(400).json({ error: 'action must be GRANT or DENY' });

  const status = action === 'GRANT' ? 'GRANTED' : 'DENIED';

  // Update EMR table
  const { rowCount } = await pool.query(
    `UPDATE emr_consent_requests SET status=$1, updated_at=NOW() WHERE request_id=$2 AND clinic_id=$3`,
    [status, requestId, req.emrUser.clinic_id]
  );
  // Also update PHR table if it exists there
  await pool.query(
    `UPDATE consent_requests SET status=$1, updated_at=NOW() WHERE request_id=$2`,
    [status, requestId]
  );

  if (rowCount === 0 && action === 'GRANT') {
    // Came from PHR app — still continue with health info fetch
  }

  if (action === 'GRANT') {
    // Directly pull health data from EMR (sandbox shortcut — no ABDM gateway needed)
    await _pullHealthData(requestId, req.emrUser.clinic_id).catch(() => {});
  }

  res.json({ status });
};

// ── Direct health data pull (sandbox bypass — reads from EMR's own care contexts) ──
async function _pullHealthData(requestId, clinicId) {
  const { rows: [consent] } = await pool.query(
    'SELECT * FROM emr_consent_requests WHERE request_id=$1 AND clinic_id=$2',
    [requestId, clinicId]
  );
  if (!consent || consent.status !== 'GRANTED') return { count: 0, txnId: null };

  const patientAbha = consent.patient_abha;
  if (!patientAbha) return { count: 0, txnId: null };

  const { rows: ctxRows } = await pool.query(
    `SELECT ecc.*, ep.name AS patient_name, ep.gender, ep.dob, ep.mobile
     FROM emr_care_contexts ecc
     JOIN emr_patients ep ON ep.id = ecc.patient_id
     WHERE ep.abha_address=$1 OR ep.abha_number=$1
     ORDER BY ecc.created_at DESC`,
    [patientAbha]
  );
  if (!ctxRows.length) return { count: 0, txnId: null };

  const txnId = consent.transaction_id ?? abdmSvc.uuid();

  for (const ctx of ctxRows) {
    const patient     = { name: ctx.patient_name, gender: ctx.gender, dob: ctx.dob, mobile: ctx.mobile };
    const careContext = { display: ctx.display, hi_type: ctx.hi_type, created_at: ctx.created_at, reference_number: ctx.reference_number };
    const fhir = ctx.fhir_content
      ? (typeof ctx.fhir_content === 'string' ? ctx.fhir_content : JSON.stringify(ctx.fhir_content))
      : hip.buildFhirBundle(patient, careContext);
    const content  = Buffer.from(fhir).toString('base64');
    const checksum = crypto.createHash('md5').update(fhir).digest('hex');

    await pool.query(
      `INSERT INTO health_records (transaction_id, care_context_reference, content, media, checksum)
       VALUES ($1,$2,$3,'application/fhir+json',$4)
       ON CONFLICT (transaction_id, care_context_reference)
       DO UPDATE SET content=$3, checksum=$4`,
      [txnId, ctx.reference_number, content, checksum]
    );
  }

  await pool.query(
    'UPDATE emr_consent_requests SET transaction_id=$1, updated_at=NOW() WHERE request_id=$2',
    [txnId, requestId]
  );
  return { count: ctxRows.length, txnId };
}

const pullConsentData = async (req, res) => {
  const { requestId } = req.params;
  const clinicId = req.emrUser.clinic_id;
  const result = await _pullHealthData(requestId, clinicId);
  if (!result.txnId) return res.status(400).json({ error: 'Consent not found, not GRANTED, or patient has no care contexts' });
  res.json({ message: `Fetched ${result.count} health record(s) from EMR`, ...result });
};

const getConsentHealthRecords = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT hr.*
     FROM health_records hr
     WHERE hr.transaction_id IN (
       SELECT transaction_id FROM emr_consent_requests WHERE clinic_id=$1 AND transaction_id IS NOT NULL
       UNION
       SELECT transaction_id FROM consent_requests WHERE transaction_id IS NOT NULL
     )
     ORDER BY hr.received_at DESC LIMIT 100`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

// ── M1: Patient profile shares (QR walk-in — SHARE_PATIENT_PROFILE_701) ──────

const listProfileShares = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM hip_profile_shares ORDER BY created_at DESC LIMIT 50`
  );
  res.json(rows);
};

const dismissProfileShare = async (req, res) => {
  await pool.query(
    `UPDATE hip_profile_shares SET status='dismissed' WHERE id=$1`,
    [req.params.id]
  );
  res.json({ ok: true });
};

const linkProfileShareToPatient = async (req, res) => {
  const { patientId } = req.body;
  const { rows } = await pool.query(
    `UPDATE hip_profile_shares SET status='linked', patient_id=$1 WHERE id=$2 RETURNING *`,
    [patientId, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Share not found' });
  // Also update the patient's ABHA fields from the share
  const s = rows[0];
  if (s.abha_number || s.abha_address) {
    await pool.query(
      `UPDATE emr_patients SET abha_number=COALESCE($1,abha_number), abha_address=COALESCE($2,abha_address) WHERE id=$3`,
      [s.abha_number, s.abha_address, patientId]
    );
  }
  res.json(rows[0]);
};

// ── M1: ABHA Creation & Verification (EMR patient workflow) ───────────────────

// Step 1 – send Aadhaar OTP (creates new ABHA)
const abhaCreateOtp = async (req, res) => {
  const { aadhaar } = req.body;
  const clean = (aadhaar || '').replace(/\D/g, '');
  if (clean.length !== 12) return res.status(400).json({ error: 'Valid 12-digit Aadhaar number required' });
  try {
    const result = await abdmSvc.generateAadhaarOtp(clean);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 2 – verify Aadhaar OTP → receive xToken + profile
const abhaCreateVerify = async (req, res) => {
  const { otp, txnId, mobile } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const result = await abdmSvc.verifyAadhaarOtp(otp, txnId, mobile || null);
    // result.tokens.token is the enrollment X-Token
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 3a – mobile OTP (if Aadhaar-linked mobile differs from patient mobile)
const abhaCreateMobileOtp = async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: 'mobile required' });
  try {
    const result = await abdmSvc.generateMobileLoginOtp(mobile);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 3b – verify mobile OTP
const abhaCreateMobileVerify = async (req, res) => {
  const { otp, txnId } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const result = await abdmSvc.verifyMobileLoginOtp(otp, txnId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 4 – ABHA address suggestions
const abhaGetSuggestions = async (req, res) => {
  const { xToken } = req.body;
  if (!xToken) return res.status(400).json({ error: 'xToken required' });
  try {
    const result = await abdmSvc.getAbhaSuggestions(xToken);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 5 – set ABHA address and save to patient record
const abhaSetAddress = async (req, res) => {
  const { xToken, abhaAddress, txnId } = req.body;
  if (!xToken || !abhaAddress) return res.status(400).json({ error: 'xToken and abhaAddress required' });
  try {
    const result = await abdmSvc.setAbhaAddress(xToken, abhaAddress, txnId);
    // Fetch full profile to get ABHA number
    const profile = await abdmSvc.getAbhaProfile(xToken);
    const abhaNum = profile.ABHANumber || profile.abhaNumber || null;
    if (abhaNum) {
      await pool.query(
        'UPDATE emr_patients SET abha_number=$1, abha_address=$2 WHERE id=$3',
        [abhaNum, abhaAddress, req.params.id]
      );
    }
    res.json({ ...result, profile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// ABHA card PNG → base64 JSON response
const abhaGetCard = async (req, res) => {
  const xToken = req.query.xToken || req.body?.xToken;
  if (!xToken) return res.status(400).json({ error: 'xToken required' });
  try {
    const imgBuf = await abdmSvc.getAbhaPngCard(xToken);
    res.json({ image: Buffer.from(imgBuf).toString('base64'), mimeType: 'image/png' });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Verify/link ABHA – Step 1: request login OTP by ABHA number or mobile
const abhaVerifyOtp = async (req, res) => {
  const { abhaId, mobile } = req.body;
  try {
    let result;
    if (abhaId) {
      result = await abdmSvc.loginRequestOtp(abhaId);
    } else if (mobile) {
      result = await abdmSvc.generateMobileLoginOtp(mobile);
    } else {
      return res.status(400).json({ error: 'abhaId or mobile required' });
    }
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Verify/link ABHA – Step 2: confirm OTP, fetch profile, link to patient
const abhaVerifyConfirm = async (req, res) => {
  const { otp, txnId, byMobile } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    let verifyResult;
    if (byMobile) {
      verifyResult = await abdmSvc.verifyMobileLoginOtp(otp, txnId);
    } else {
      verifyResult = await abdmSvc.loginVerifyOtp(otp, txnId);
    }
    const xToken = verifyResult.token || verifyResult.tokens?.token;
    if (!xToken) return res.status(502).json({ error: 'No token returned from ABDM' });

    const profile = await abdmSvc.getAbhaProfile(xToken);
    const abhaNum  = profile.ABHANumber   || profile.abhaNumber   || null;
    const abhaAddr = profile.preferredAbhaAddress || profile.abhaAddress || null;

    if (abhaNum || abhaAddr) {
      await pool.query(
        'UPDATE emr_patients SET abha_number=COALESCE($1,abha_number), abha_address=COALESCE($2,abha_address) WHERE id=$3',
        [abhaNum, abhaAddr, req.params.id]
      );
    }
    res.json({ profile, xToken });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Add Patient via Aadhaar – set ABHA address with ABDM before finalize
const abhaAadhaarSetAddress = async (req, res) => {
  const { xToken, abhaAddress, txnId } = req.body;
  if (!xToken || !abhaAddress) return res.status(400).json({ error: 'xToken and abhaAddress required' });
  const local = abhaAddress.includes('@') ? abhaAddress.split('@')[0] : abhaAddress;
  if (local.length < 8 || local.length > 18)
    return res.status(400).json({ error: 'ABHA address must be 8–18 characters' });
  if (!/^[a-zA-Z0-9]/.test(local) || !/[a-zA-Z0-9]$/.test(local))
    return res.status(400).json({ error: 'ABHA address must start and end with a letter or number' });
  if (!/^[a-zA-Z0-9._]+$/.test(local))
    return res.status(400).json({ error: 'Only letters, numbers, dot and underscore are allowed' });
  if ((local.match(/\./g) || []).length > 1) return res.status(400).json({ error: 'Only one dot (.) allowed' });
  if ((local.match(/_/g) || []).length > 1)  return res.status(400).json({ error: 'Only one underscore (_) allowed' });
  try {
    const result = await abdmSvc.setAbhaAddress(xToken, abhaAddress, txnId);
    res.json(result);
  } catch (err) {
    console.error('setAbhaAddress error', err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Add Patient via Aadhaar – finalize: use profile from byAadhaar response, create patient
const abhaAadhaarCreate = async (req, res) => {
  const { abdmProfile, abhaAddress } = req.body;
  if (!abdmProfile) return res.status(400).json({ error: 'abdmProfile required' });
  try {
    const profile    = abdmProfile;
    const abhaNum    = profile.ABHANumber  || profile.abhaNumber  || null;
    const abhaAddr   = abhaAddress || profile.preferredAbhaAddress || profile.abhaAddress || null;
    const name       = profile.name || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || null;
    const mobile     = profile.mobile || null;
    const gender     = profile.gender || null;
    const dob        = profile.dateOfBirth ||
      (profile.yearOfBirth ? `${profile.yearOfBirth}-${String(profile.monthOfBirth||1).padStart(2,'0')}-${String(profile.dayOfBirth||1).padStart(2,'0')}` : null);
    const { rows: ex } = await pool.query(
      'SELECT id,name FROM emr_patients WHERE abha_number=$1 OR abha_address=$2 LIMIT 1',
      [abhaNum, abhaAddr]
    );
    if (ex.length) {
      await pool.query('UPDATE emr_patients SET abha_number=$1,abha_address=$2 WHERE id=$3', [abhaNum, abhaAddr, ex[0].id]);
      return res.json({ patient: ex[0], created: false, profile });
    }
    const { rows } = await pool.query(
      `INSERT INTO emr_patients (name, mobile, dob, gender, abha_number, abha_address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, mobile, dob, gender, abhaNum, abhaAddr]
    );
    res.status(201).json({ patient: rows[0], created: true, profile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Add Patient via ABHA – Step 1: request OTP (no existing patient needed)
const abhaAddOtp = async (req, res) => {
  const { abhaNumber, mobile } = req.body;
  try {
    let result;
    if (abhaNumber)   result = await abdmSvc.loginRequestOtp(abhaNumber);
    else if (mobile)  result = await abdmSvc.generateMobileLoginOtp(mobile);
    else return res.status(400).json({ error: 'abhaNumber or mobile required' });
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Add Patient via ABHA – Step 2: verify OTP, fetch profile, create patient
const abhaAddCreate = async (req, res) => {
  const { otp, txnId, byMobile } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const verifyResult = byMobile
      ? await abdmSvc.verifyMobileLoginOtp(otp, txnId)
      : await abdmSvc.loginVerifyOtp(otp, txnId);
    const xToken = verifyResult.token || verifyResult.tokens?.token;
    if (!xToken) return res.status(502).json({ error: 'No token returned from ABDM' });

    const profile  = await abdmSvc.getAbhaProfile(xToken);
    const abhaNum  = profile.ABHANumber  || profile.abhaNumber  || null;
    const abhaAddr = profile.preferredAbhaAddress || profile.abhaAddress || null;
    const name     = profile.name || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || null;
    const mobile   = profile.mobile || null;
    const gender   = profile.gender || null;
    const dob      = profile.dateOfBirth ||
      (profile.yearOfBirth ? `${profile.yearOfBirth}-${String(profile.monthOfBirth||1).padStart(2,'0')}-${String(profile.dayOfBirth||1).padStart(2,'0')}` : null);
    // Return existing patient if ABHA already registered
    if (abhaNum || abhaAddr) {
      const { rows: ex } = await pool.query(
        'SELECT id,name FROM emr_patients WHERE abha_number=$1 OR abha_address=$2 LIMIT 1',
        [abhaNum, abhaAddr]
      );
      if (ex.length) return res.json({ patient: ex[0], created: false, profile });
    }

    const { rows } = await pool.query(
      `INSERT INTO emr_patients (name, mobile, dob, gender, abha_number, abha_address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, mobile, dob, gender, abhaNum, abhaAddr]
    );
    res.status(201).json({ patient: rows[0], created: true, profile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// ── Login with ABHA ───────────────────────────────────────────────────────────

const abhaLoginRequestOtp = async (req, res) => {
  const { loginId, otpSystem } = req.body;
  if (!loginId) return res.status(400).json({ error: 'loginId required' });
  const loginHint = loginId.includes('@') ? 'abha-address' : 'abha-number';
  const system = otpSystem === 'aadhaar' ? 'aadhaar' : 'abdm';
  try {
    const result = await abdmSvc.loginRequestAbhaOtp(loginId, loginHint, system);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

const abhaLoginVerifyOtp = async (req, res) => {
  const { otp, txnId } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const verifyResult = await abdmSvc.loginVerifyOtp(otp, txnId);
    const xToken = verifyResult.token || verifyResult.tokens?.token || null;
    let profile = null;
    if (xToken) {
      try { profile = await abdmSvc.getAbhaProfile(xToken); } catch (_) {}
    }
    res.json({ ...verifyResult, xToken, profile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

const abhaLoginUpdateMobile = async (req, res) => {
  const { xToken, mobile } = req.body;
  if (!xToken || !mobile) return res.status(400).json({ error: 'xToken and mobile required' });
  try {
    const result = await abdmSvc.updateAbhaProfileMobile(xToken, mobile);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

const abhaLoginLinkPatient = async (req, res) => {
  const { profile } = req.body;
  if (!profile) return res.status(400).json({ error: 'profile required' });
  try {
    const abhaNum  = profile.ABHANumber || profile.abhaNumber || null;
    const abhaAddr = profile.preferredAbhaAddress || profile.abhaAddress || null;
    const name     = profile.name || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || null;
    const mobile   = profile.mobile || null;
    const gender   = profile.gender || null;
    const dob      = profile.dateOfBirth ||
      (profile.yearOfBirth ? `${profile.yearOfBirth}-${String(profile.monthOfBirth||1).padStart(2,'0')}-${String(profile.dayOfBirth||1).padStart(2,'0')}` : null);
    const { rows: ex } = await pool.query(
      'SELECT id,name,mobile FROM emr_patients WHERE abha_number=$1 OR abha_address=$2 LIMIT 1',
      [abhaNum, abhaAddr]
    );
    if (ex.length) {
      await pool.query('UPDATE emr_patients SET abha_number=$1,abha_address=$2 WHERE id=$3', [abhaNum, abhaAddr, ex[0].id]);
      const { rows } = await pool.query('SELECT * FROM emr_patients WHERE id=$1', [ex[0].id]);
      const mobileMismatch = !!(mobile && rows[0].mobile && mobile !== rows[0].mobile);
      return res.json({ patient: rows[0], created: false, mobileMismatch });
    }
    const { rows } = await pool.query(
      'INSERT INTO emr_patients (name,mobile,dob,gender,abha_number,abha_address) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, mobile, dob, gender, abhaNum, abhaAddr]
    );
    res.status(201).json({ patient: rows[0], created: true, mobileMismatch: false });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

module.exports = {
  listPatients, createPatient, getPatient, updatePatient, deletePatient,
  addCareContext, deleteCareContext,
  pendingOtps, healthRequests, activityLog,
  createConsentRequest, listConsentRequests, respondConsent, pullConsentData, getConsentHealthRecords,
  abhaCreateOtp, abhaCreateVerify, abhaCreateMobileOtp, abhaCreateMobileVerify,
  abhaGetSuggestions, abhaSetAddress, abhaGetCard,
  abhaVerifyOtp, abhaVerifyConfirm,
  abhaAadhaarSetAddress, abhaAadhaarCreate,
  abhaAddOtp, abhaAddCreate,
  abhaLoginRequestOtp, abhaLoginVerifyOtp, abhaLoginUpdateMobile, abhaLoginLinkPatient,
  listProfileShares, dismissProfileShare, linkProfileShareToPatient,
};
