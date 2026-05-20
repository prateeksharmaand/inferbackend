const { pool } = require('../config/database');
const hip      = require('./hip.service');

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
    const term = `%${q.trim().toLowerCase()}%`;
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.mobile, p.dob, p.gender, p.abha_number, p.abha_address,
              COUNT(c.id)::int AS context_count, ${uhidSub}
       FROM emr_patients p
       LEFT JOIN emr_care_contexts c ON c.patient_id = p.id
       WHERE LOWER(p.name) LIKE $1 OR p.mobile LIKE $2 OR p.abha_number LIKE $2
       GROUP BY p.id ORDER BY p.name LIMIT 10`,
      [term, q.trim() + '%']
    );
    return res.json(rows);
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

module.exports = {
  listPatients, createPatient, getPatient, updatePatient, deletePatient,
  addCareContext, deleteCareContext,
  pendingOtps, healthRequests, activityLog,
};
