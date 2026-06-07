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
      `SELECT a.*,
              c.name  AS clinic_name,
              c.address AS clinic_address,
              c.phone   AS clinic_phone,
              d.name  AS doctor_name,
              d.specialization AS doctor_specialization
       FROM emr_appointments a
       LEFT JOIN emr_clinics c  ON c.id = a.clinic_id
       LEFT JOIN emr_doctors d  ON d.id = a.doctor_id
       WHERE a.id = $1`,
      [apptId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Prescription not found' });

    const appt = rows[0];

    // Return only fields needed for the public view
    res.json({
      id:                 appt.id,
      appointment_date:   appt.appointment_date,
      patient_name:       appt.patient_name,
      patient_age:        appt.patient_age,
      patient_gender:     appt.patient_gender,
      uhid:               appt.uhid,
      clinic_name:        appt.clinic_name || appt.clinic_id,
      clinic_address:     appt.clinic_address || '',
      clinic_phone:       appt.clinic_phone || '',
      doctor_name:        appt.doctor_name || '',
      doctor_specialization: appt.doctor_specialization || '',
      vitals:             appt.vitals             || {},
      diagnosis:          appt.diagnosis          || [],
      medications:        appt.medications        || [],
      symptoms:           appt.symptoms           || [],
      advices:            appt.advices            || '',
      notes:              appt.notes              || '',
      next_visit_date:    appt.next_visit_date    || null,
      next_visit_notes:   appt.next_visit_notes   || '',
      lab_investigations: appt.lab_investigations || [],
      encounter_id:       appt.encounter_id       || null,
    });
  } catch (err) {
    console.error('[rx-public]', err.message);
    res.status(500).json({ error: 'Could not load prescription' });
  }
};
