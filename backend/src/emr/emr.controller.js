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

  const result = await abdmSvc.createConsentRequest(
    patientAbha, hiuId, purpose, hiTypes,
    { from: dateFrom ?? new Date(0).toISOString(), to: dateTo ?? new Date().toISOString() }
  );

  const requestId = result.consentRequest?.id ?? abdmSvc.uuid();

  await pool.query(
    `INSERT INTO emr_consent_requests
       (clinic_id, request_id, patient_abha, hip_id, hiu_id, purpose, hi_types)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [clinicId, requestId, patientAbha, hipId, hiuId, purpose, hiTypes]
  );

  // Mirror into consent_requests so the patient sees it in the Flutter app
  const { rows: userRows } = await pool.query(
    `SELECT user_id FROM abha_accounts WHERE abha_address=$1 LIMIT 1`,
    [patientAbha]
  );
  if (userRows.length) {
    await pool.query(
      `INSERT INTO consent_requests (user_id, request_id, hiu_id, purpose, status)
       VALUES ($1,$2,$3,$4,'REQUESTED') ON CONFLICT (request_id) DO NOTHING`,
      [userRows[0].user_id, requestId, hiuId, purpose]
    );
  }

  res.json({ requestId, ...result });
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
    const artefactId = abdmSvc.uuid();
    await pool.query(
      `UPDATE emr_consent_requests SET artefacts=$1, updated_at=NOW() WHERE request_id=$2`,
      [JSON.stringify([{ id: artefactId }]), requestId]
    );
    // Auto-fetch health info
    const dataPushUrl = `${process.env.BACKEND_URL}/api/abdm/health-info/push`;
    try {
      const result = await abdmSvc.fetchHealthInfo(artefactId, dataPushUrl, {
        cryptoAlg: 'ECDH',
        curve: 'Curve25519',
        dhPublicKey: { expiry: new Date(Date.now() + 3600_000).toISOString(), parameters: 'Curve25519', keyValue: '' },
        nonce: abdmSvc.uuid(),
      });
      const txnId = result.hiRequest?.transactionId ?? abdmSvc.uuid();
      await pool.query(
        `UPDATE emr_consent_requests SET transaction_id=$1, updated_at=NOW() WHERE request_id=$2`,
        [txnId, requestId]
      );
      await pool.query(
        `UPDATE consent_requests SET transaction_id=$1, updated_at=NOW() WHERE request_id=$2`,
        [txnId, requestId]
      );
    } catch (err) {
      // fetchHealthInfo may fail in sandbox — consent is still marked GRANTED
    }
  }

  res.json({ status });
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

module.exports = {
  listPatients, createPatient, getPatient, updatePatient, deletePatient,
  addCareContext, deleteCareContext,
  pendingOtps, healthRequests, activityLog,
  createConsentRequest, listConsentRequests, respondConsent, getConsentHealthRecords,
};
