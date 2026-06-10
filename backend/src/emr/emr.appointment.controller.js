const { pool } = require('../config/database');
const fhir     = require('../services/fhir.service');

const VALID_STATUSES = ['booked','checked_in','ongoing','completed','cancelled',
  'rescheduled','follow_up','parked','no_show','aborted'];

// GET /api/emr/appointments?queue_id=&date=&status=
const listAppointments = async (req, res) => {
  const { queue_id, date, status, doctor_id } = req.query;
  const apptDate = date || new Date().toISOString().slice(0, 10);

  let sql = `SELECT a.*, d.name AS doctor_name,
               CASE
                 WHEN a.patient_mobile IS NOT NULL AND a.patient_mobile != ''
                 THEN (SELECT COUNT(*) FROM emr_appointments p
                       WHERE p.clinic_id = a.clinic_id
                         AND p.patient_mobile = a.patient_mobile
                         AND p.id < a.id) = 0
                 ELSE false
               END AS is_new_patient
             FROM emr_appointments a
             LEFT JOIN emr_doctors d ON d.id = a.doctor_id
             WHERE a.clinic_id = $1 AND a.appointment_date = $2`;
  const params = [req.emrUser.clinic_id, apptDate];
  let idx = 3;

  if (queue_id) {
    // Show appointments for this queue OR inbound-booked appointments for the same clinic/date
    sql += ` AND (a.queue_id = $${idx} OR (a.queue_id IS NULL AND a.channel IN ('whatsapp','sms','ivr','chat','online','follow_up')))`;
    params.push(queue_id); idx++;
  }
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
  const created = rows[0];
  fhir.pushAppointmentBundle(created).catch(err =>
    console.error('[FHIR] appointment push failed:', err.message)
  );
  res.status(201).json(created);
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
       e.chief_complaint, e.symptoms, e.diagnosis, e.medications, e.instructions,
       e.next_visit_date, e.next_visit_notes, e.vitals,
       e.lab_investigations, e.lab_results, e.examination_findings,
       e.notes, e.refer_to, e.advices, e.procedures, e.canvas_image, e.custom_sections, e.vaccinations, e.rx_language, e.calc_results
     FROM emr_appointments a
     LEFT JOIN emr_doctors d ON d.id = a.doctor_id
     LEFT JOIN emr_encounters e ON e.appointment_id = a.id
     WHERE a.id=$1 AND a.clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const appt = rows[0];

  // Fetch past encounter notes for the same patient (by mobile)
  let past_encounter_notes = [];
  if (appt.patient_mobile) {
    const { rows: prev } = await pool.query(
      `SELECT e.notes, a.appointment_date, d.name AS doctor_name
       FROM emr_encounters e
       JOIN emr_appointments a ON a.id = e.appointment_id
       LEFT JOIN emr_doctors d ON d.id = a.doctor_id
       WHERE a.clinic_id = $1
         AND a.patient_mobile = $2
         AND a.id != $3
         AND e.notes IS NOT NULL AND e.notes != ''
       ORDER BY a.appointment_date DESC
       LIMIT 10`,
      [req.emrUser.clinic_id, appt.patient_mobile, req.params.id]
    );
    past_encounter_notes = prev;
  }

  res.json({ ...appt, past_encounter_notes });
};

// POST /api/emr/appointments/:id/encounter  (save Rx / FHIR)
const saveEncounter = async (req, res) => {
  const {
    chief_complaint, symptoms, diagnosis, medications,
    instructions, next_visit_date, next_visit_notes, vitals,
    lab_investigations, lab_results, examination_findings,
    notes, refer_to, advices, procedures, canvas_image, custom_sections, vaccinations, rx_language, calc_results,
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
        instructions, next_visit_date, next_visit_notes, vitals, fhir_bundle,
        lab_investigations, lab_results, examination_findings,
        notes, refer_to, advices, procedures, canvas_image, custom_sections, vaccinations, rx_language, calc_results)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     ON CONFLICT (appointment_id) DO UPDATE SET
       chief_complaint      = EXCLUDED.chief_complaint,
       symptoms             = EXCLUDED.symptoms,
       diagnosis            = EXCLUDED.diagnosis,
       medications          = EXCLUDED.medications,
       instructions         = EXCLUDED.instructions,
       next_visit_date      = EXCLUDED.next_visit_date,
       next_visit_notes     = EXCLUDED.next_visit_notes,
       vitals               = EXCLUDED.vitals,
       fhir_bundle          = EXCLUDED.fhir_bundle,
       lab_investigations   = EXCLUDED.lab_investigations,
       lab_results          = EXCLUDED.lab_results,
       examination_findings = EXCLUDED.examination_findings,
       notes                = EXCLUDED.notes,
       refer_to             = EXCLUDED.refer_to,
       advices              = EXCLUDED.advices,
       procedures           = EXCLUDED.procedures,
       canvas_image         = EXCLUDED.canvas_image,
       custom_sections      = EXCLUDED.custom_sections,
       vaccinations         = EXCLUDED.vaccinations,
       rx_language          = EXCLUDED.rx_language,
       calc_results         = EXCLUDED.calc_results,
       updated_at           = NOW()
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
      JSON.stringify(lab_investigations || []),
      JSON.stringify(lab_results || []),
      examination_findings || null,
      notes || null,
      refer_to || null,
      advices || null,
      JSON.stringify(procedures || []),
      canvas_image || null,
      JSON.stringify(custom_sections || []),
      JSON.stringify(vaccinations || {}),
      rx_language || '',
      JSON.stringify(calc_results || {}),
    ]
  );

  // Auto-mark appointment as completed
  await pool.query(`UPDATE emr_appointments SET status='completed', completed_at=NOW() WHERE id=$1`, [a.id]);

  fhir.pushEncounterBundle(a, rows[0]).catch(err =>
    console.error('[FHIR] encounter push failed:', err.message)
  );
  res.json(rows[0]);
};

// POST /api/emr/appointments/:id/reminder
const sendReminder = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, patient_name, patient_mobile, appointment_date, appointment_time
     FROM emr_appointments WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Appointment not found' });
  // Reminder dispatch (SMS/WhatsApp) would be wired here
  res.json({ ok: true, message: 'Reminder queued' });
};

// GET /api/emr/patients/history?mobile=&name=
const listPatientHistory = async (req, res) => {
  const { mobile, name } = req.query;
  const cid = req.emrUser.clinic_id;
  if (!mobile && !name) return res.json([]);

  const condition = mobile ? `a.patient_mobile = $2` : `LOWER(a.patient_name) = LOWER($2)`;
  const param     = mobile || name;

  const { rows } = await pool.query(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.status,
            a.patient_name, a.patient_mobile, a.patient_gender, a.patient_dob,
            a.patient_abha, a.uhid, a.visit_type, a.channel,
            a.medical_history, a.checked_in_at, a.completed_at,
            d.name AS doctor_name,
            e.id             AS encounter_id,
            e.chief_complaint, e.symptoms, e.diagnosis, e.medications,
            e.vitals, e.lab_investigations, e.lab_results,
            e.advices, e.notes AS encounter_notes,
            e.next_visit_date, e.procedures, e.examination_findings, e.refer_to,
            e.vaccinations, e.calc_results
     FROM emr_appointments a
     LEFT JOIN emr_doctors    d ON d.id = a.doctor_id
     LEFT JOIN emr_encounters e ON e.appointment_id = a.id
     WHERE a.clinic_id = $1 AND ${condition}
       AND (
         e.id IS NULL
         OR (
           (e.symptoms         IS NOT NULL AND jsonb_array_length(e.symptoms::jsonb)         > 0)
           OR (e.diagnosis     IS NOT NULL AND jsonb_array_length(e.diagnosis::jsonb)        > 0)
           OR (e.medications   IS NOT NULL AND jsonb_array_length(e.medications::jsonb)      > 0)
           OR (e.lab_investigations IS NOT NULL AND jsonb_array_length(e.lab_investigations::jsonb) > 0)
           OR (e.lab_results   IS NOT NULL AND jsonb_array_length(e.lab_results::jsonb)      > 0)
           OR (e.chief_complaint IS NOT NULL AND TRIM(e.chief_complaint) != '')
           OR (e.advices       IS NOT NULL AND TRIM(e.advices)           != '')
           OR (e.notes         IS NOT NULL AND TRIM(e.notes)             != '')
           OR (e.refer_to      IS NOT NULL AND TRIM(e.refer_to)          != '')
           OR (e.examination_findings IS NOT NULL AND TRIM(e.examination_findings) != '')
           OR (e.vitals        IS NOT NULL AND e.vitals::text != '{}' AND e.vitals::text != 'null')
         )
       )
     ORDER BY a.appointment_date DESC, a.created_at DESC
     LIMIT 50`,
    [cid, param]
  );
  res.json(rows);
};

module.exports = { listAppointments, createAppointment, updateStatus, getAppointment, saveEncounter, sendReminder, listPatientHistory };
