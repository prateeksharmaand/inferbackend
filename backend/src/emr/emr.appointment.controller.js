const { pool } = require('../config/database');

const VALID_STATUSES = ['booked','checked_in','ongoing','completed','cancelled',
  'rescheduled','follow_up','parked','no_show','aborted'];

// GET /api/emr/appointments?queue_id=&date=&status=
const listAppointments = async (req, res) => {
  const { queue_id, date, status, doctor_id } = req.query;
  const apptDate = date || new Date().toISOString().slice(0, 10);

  let sql = `SELECT a.*, d.name AS doctor_name
             FROM emr_appointments a
             LEFT JOIN emr_doctors d ON d.id = a.doctor_id
             WHERE a.clinic_id = $1 AND a.appointment_date = $2`;
  const params = [req.emrUser.clinic_id, apptDate];
  let idx = 3;

  if (queue_id)  { sql += ` AND a.queue_id = $${idx++}`;  params.push(queue_id); }
  if (doctor_id) { sql += ` AND a.doctor_id = $${idx++}`; params.push(doctor_id); }
  if (status)    { sql += ` AND a.status = $${idx++}`;    params.push(status); }

  sql += ` ORDER BY COALESCE(a.token_number, 9999), a.appointment_time NULLS LAST, a.created_at`;

  const { rows } = await pool.query(sql, params);

  // Group for the board
  const booked    = rows.filter(r => ['booked','rescheduled'].includes(r.status));
  const myOpd     = rows.filter(r => ['checked_in','ongoing','parked'].includes(r.status));
  const completed = rows.filter(r => ['completed','no_show','aborted','cancelled'].includes(r.status));

  res.json({ date: apptDate, booked, my_opd: myOpd, completed, total: rows.length });
};

// POST /api/emr/appointments
const createAppointment = async (req, res) => {
  const {
    queue_id, doctor_id, emr_patient_id,
    patient_name, patient_mobile, patient_dob, patient_gender, patient_abha,
    visit_type, channel, appointment_date, appointment_time, notes, tags, uhid, medical_history,
  } = req.body;

  if (!patient_name) return res.status(400).json({ error: 'patient_name required' });

  // Auto token: max token for this queue+date + 1
  const { rows: [tok] } = await pool.query(
    `SELECT COALESCE(MAX(token_number), 0) + 1 AS next_token
     FROM emr_appointments
     WHERE queue_id=$1 AND appointment_date=$2`,
    [queue_id || null, appointment_date || new Date().toISOString().slice(0, 10)]
  );

  const { rows } = await pool.query(
    `INSERT INTO emr_appointments
       (queue_id, clinic_id, doctor_id, emr_patient_id,
        patient_name, patient_mobile, patient_dob, patient_gender, patient_abha,
        token_number, visit_type, channel, appointment_date, appointment_time, notes, tags, uhid, medical_history)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [
      queue_id || null, req.emrUser.clinic_id, doctor_id || null, emr_patient_id || null,
      patient_name, patient_mobile || null,
      patient_dob || null, patient_gender || null, patient_abha || null,
      tok.next_token, visit_type || 'OPConsultation',
      channel || 'walk_in',
      appointment_date || new Date().toISOString().slice(0, 10),
      appointment_time || null, notes || null,
      JSON.stringify(tags || []),
      uhid || null,
      JSON.stringify(medical_history || []),
    ]
  );
  res.status(201).json(rows[0]);
};

// PATCH /api/emr/appointments/:id/status  { status }
const updateStatus = async (req, res) => {
  const {
    status, payment_status, assessment_status, notes, tags,
    patient_name, patient_mobile, patient_dob, patient_gender, patient_abha,
    visit_type, channel, medical_history,
  } = req.body;
  if (status && !VALID_STATUSES.includes(status))
    return res.status(400).json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });

  const setClauses = [];
  const params     = [];
  let idx = 1;

  if (status) {
    setClauses.push(`status=$${idx++}`); params.push(status);
    if (status === 'checked_in') { setClauses.push(`checked_in_at=$${idx++}`); params.push(new Date()); }
    if (status === 'completed')  { setClauses.push(`completed_at=$${idx++}`);  params.push(new Date()); }
  }
  if (payment_status)    { setClauses.push(`payment_status=$${idx++}`);    params.push(payment_status); }
  if (assessment_status) { setClauses.push(`assessment_status=$${idx++}`); params.push(assessment_status); }
  if (notes !== undefined)          { setClauses.push(`notes=$${idx++}`);          params.push(notes); }
  if (tags  !== undefined)          { setClauses.push(`tags=$${idx++}`);           params.push(JSON.stringify(tags)); }
  if (patient_name !== undefined)   { setClauses.push(`patient_name=$${idx++}`);   params.push(patient_name); }
  if (patient_mobile !== undefined) { setClauses.push(`patient_mobile=$${idx++}`); params.push(patient_mobile); }
  if (patient_dob !== undefined)    { setClauses.push(`patient_dob=$${idx++}`);    params.push(patient_dob || null); }
  if (patient_gender !== undefined) { setClauses.push(`patient_gender=$${idx++}`); params.push(patient_gender); }
  if (patient_abha !== undefined)   { setClauses.push(`patient_abha=$${idx++}`);   params.push(patient_abha); }
  if (visit_type !== undefined)       { setClauses.push(`visit_type=$${idx++}`);       params.push(visit_type); }
  if (channel !== undefined)          { setClauses.push(`channel=$${idx++}`);          params.push(channel); }
  if (medical_history !== undefined)  { setClauses.push(`medical_history=$${idx++}`);  params.push(JSON.stringify(medical_history)); }

  if (!setClauses.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id, req.emrUser.clinic_id);
  const { rows } = await pool.query(
    `UPDATE emr_appointments SET ${setClauses.join(', ')}
     WHERE id=$${idx++} AND clinic_id=$${idx++} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Appointment not found' });
  res.json(rows[0]);
};

// GET /api/emr/appointments/:id
const getAppointment = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, d.name AS doctor_name, e.id AS encounter_id,
       e.chief_complaint, e.diagnosis, e.medications, e.instructions, e.next_visit_date, e.vitals
     FROM emr_appointments a
     LEFT JOIN emr_doctors d ON d.id = a.doctor_id
     LEFT JOIN emr_encounters e ON e.appointment_id = a.id
     WHERE a.id=$1 AND a.clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
};

// POST /api/emr/appointments/:id/encounter  (save Rx / FHIR)
const saveEncounter = async (req, res) => {
  const {
    chief_complaint, symptoms, diagnosis, medications,
    instructions, next_visit_date, next_visit_notes, vitals,
  } = req.body;

  const appt = await pool.query(
    `SELECT * FROM emr_appointments WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!appt.rows.length) return res.status(404).json({ error: 'Appointment not found' });
  const a = appt.rows[0];

  // Build FHIR R4 Bundle
  const now = new Date().toISOString();
  const fhirBundle = {
    resourceType: 'Bundle',
    type: 'document',
    timestamp: now,
    entry: [
      {
        resource: {
          resourceType: 'Composition',
          status: 'final',
          type: { coding: [{ system: 'http://loinc.org', code: '11488-4', display: 'Consultation note' }] },
          subject: { display: a.patient_name },
          date: now,
          section: [
            { title: 'Chief Complaint', text: { div: chief_complaint } },
            { title: 'Symptoms',        entry: (symptoms || []).map(s => ({ display: s })) },
            { title: 'Diagnosis',       entry: (diagnosis || []).map(d => ({
                resourceType: 'Condition',
                code: { coding: [{ code: d.code, display: d.display, system: d.system || 'http://snomed.info/sct' }] },
                clinicalStatus: { coding: [{ code: d.status || 'active' }] },
              })) },
            { title: 'Medications',     entry: (medications || []).map(m => ({
                resourceType: 'MedicationRequest',
                status: 'active',
                intent: 'order',
                medicationCodeableConcept: { text: m.name },
                dosageInstruction: [{ text: `${m.dosage || ''} ${m.frequency || ''}`.trim(), additionalInstruction: [{ text: m.instructions || '' }] }],
              })) },
            { title: 'Instructions',    text: { div: instructions } },
            { title: 'Follow Up',       text: { div: next_visit_date ? `Next visit: ${next_visit_date}. ${next_visit_notes || ''}` : next_visit_notes } },
          ],
        },
      },
    ],
  };

  const { rows } = await pool.query(
    `INSERT INTO emr_encounters
       (appointment_id, clinic_id, doctor_id, emr_patient_id,
        chief_complaint, symptoms, diagnosis, medications,
        instructions, next_visit_date, next_visit_notes, vitals, fhir_bundle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (appointment_id) DO UPDATE SET
       chief_complaint  = EXCLUDED.chief_complaint,
       symptoms         = EXCLUDED.symptoms,
       diagnosis        = EXCLUDED.diagnosis,
       medications      = EXCLUDED.medications,
       instructions     = EXCLUDED.instructions,
       next_visit_date  = EXCLUDED.next_visit_date,
       next_visit_notes = EXCLUDED.next_visit_notes,
       vitals           = EXCLUDED.vitals,
       fhir_bundle      = EXCLUDED.fhir_bundle,
       updated_at       = NOW()
     RETURNING *`,
    [
      a.id, a.clinic_id, a.doctor_id, a.emr_patient_id,
      chief_complaint || null,
      JSON.stringify(symptoms || []),
      JSON.stringify(diagnosis || []),
      JSON.stringify(medications || []),
      instructions || null, next_visit_date || null, next_visit_notes || null,
      JSON.stringify(vitals || {}),
      JSON.stringify(fhirBundle),
    ]
  );

  // Auto-mark appointment as completed
  await pool.query(`UPDATE emr_appointments SET status='completed', completed_at=NOW() WHERE id=$1`, [a.id]);

  res.json(rows[0]);
};

module.exports = { listAppointments, createAppointment, updateStatus, getAppointment, saveEncounter };
