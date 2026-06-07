/**
 * Public prescription endpoint — no auth required.
 * Token is HMAC-SHA256(apptId, QR_SECRET) to prevent enumeration.
 */
const crypto = require('crypto');
const { pool } = require('../config/database');

const SECRET = process.env.QR_SECRET || 'infer_rx_qr_secret_2025';

function makeToken(apptId) {
  return crypto.createHmac('sha256', SECRET).update(String(apptId)).digest('hex').slice(0, 24);
}

// GET /api/emr/appointments/:id/rx-token  (protected — doctor fetches this)
exports.getRxToken = async (req, res) => {
  const { id } = req.params;

  // Verify appointment belongs to this clinic
  const { rows } = await pool.query(
    `SELECT id FROM emr_appointments WHERE id = $1 AND clinic_id = $2`,
    [id, req.emrUser.clinic_id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Appointment not found' });

  const token = makeToken(id);
  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/opd/rx-view/${id}?t=${token}`;

  res.json({ token, url });
};

// GET /api/emr/public/rx/:apptId?t=token  (public — patient opens QR link)
exports.getPublicRx = async (req, res) => {
  const { apptId } = req.params;
  const { t } = req.query;

  const expected = makeToken(apptId);
  if (t !== expected) return res.status(403).json({ error: 'Invalid or expired QR link' });

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.appointment_date, a.patient_name, a.patient_age,
              a.patient_gender, a.patient_dob, a.uhid,
              c.name        AS clinic_name,
              c.address     AS clinic_address,
              c.phone       AS clinic_phone,
              d.name        AS doctor_name,
              d.specialization AS doctor_specialization,
              e.id              AS encounter_id,
              e.vitals,
              e.symptoms,
              e.diagnosis,
              e.medications,
              e.advices,
              e.notes,
              e.next_visit_date,
              e.next_visit_notes,
              e.lab_investigations,
              e.lab_results,
              e.examination_findings,
              e.refer_to,
              e.procedures
       FROM emr_appointments a
       LEFT JOIN emr_clinics   c ON c.id = a.clinic_id
       LEFT JOIN emr_doctors   d ON d.id = a.doctor_id
       LEFT JOIN emr_encounters e ON e.appointment_id = a.id
       WHERE a.id = $1`,
      [apptId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Prescription not found' });

    const r = rows[0];

    // Derive age from dob if patient_age not stored
    let age = r.patient_age;
    if (!age && r.patient_dob) {
      age = Math.floor((Date.now() - new Date(r.patient_dob)) / (365.25 * 24 * 60 * 60 * 1000));
    }

    res.json({
      id:                    r.id,
      appointment_date:      r.appointment_date,
      patient_name:          r.patient_name,
      patient_age:           age || null,
      patient_gender:        r.patient_gender,
      uhid:                  r.uhid,
      clinic_name:           r.clinic_name   || '',
      clinic_address:        r.clinic_address || '',
      clinic_phone:          r.clinic_phone   || '',
      doctor_name:           r.doctor_name    || '',
      doctor_specialization: r.doctor_specialization || '',
      encounter_id:          r.encounter_id   || null,
      vitals:                r.vitals             || {},
      symptoms:              r.symptoms           || [],
      diagnosis:             r.diagnosis          || [],
      medications:           r.medications        || [],
      advices:               r.advices            || '',
      notes:                 r.notes              || '',
      next_visit_date:       r.next_visit_date    || null,
      next_visit_notes:      r.next_visit_notes   || '',
      lab_investigations:    r.lab_investigations || [],
      lab_results:           r.lab_results        || [],
      examination_findings:  r.examination_findings || '',
      refer_to:              r.refer_to           || '',
      procedures:            r.procedures         || [],
    });
  } catch (err) {
    console.error('[rx-public]', err.message);
    res.status(500).json({ error: 'Could not load prescription' });
  }
};
