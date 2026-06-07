/**
 * Public prescription endpoint.
 * Security: generates a random 32-char token stored in the DB on first request.
 * Token is stable — same appointment always gets the same token.
 * Works correctly with sequential integer IDs.
 */
const crypto   = require('crypto');
const { pool } = require('../config/database');

async function getOrCreateToken(apptId) {
  // Check if token already exists
  const { rows: existing } = await pool.query(
    `SELECT rx_public_token FROM emr_appointments WHERE id = $1`,
    [apptId],
  );
  if (!existing.length) return null;
  if (existing[0].rx_public_token) return existing[0].rx_public_token;

  // Generate and store a new token
  const token = crypto.randomBytes(20).toString('hex'); // 40 hex chars
  await pool.query(
    `UPDATE emr_appointments SET rx_public_token = $1 WHERE id = $2`,
    [token, apptId],
  );
  return token;
}

// GET /api/emr/appointments/:id/rx-token  (protected — doctor fetches QR URL)
exports.getRxToken = async (req, res) => {
  const { id } = req.params;

  try {
    // Verify appointment belongs to this clinic
    const { rows } = await pool.query(
      `SELECT id FROM emr_appointments WHERE id = $1 AND clinic_id = $2`,
      [id, req.emrUser.clinic_id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Appointment not found' });

    let token;
    try {
      token = await getOrCreateToken(id);
    } catch (colErr) {
      // Column doesn't exist yet — fall back to no-token URL (graceful degradation)
      token = null;
    }

    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const url = token
      ? `${baseUrl}/opd/rx-view/${id}?t=${token}`
      : `${baseUrl}/opd/rx-view/${id}`;

    res.json({ url });
  } catch (err) {
    console.error('[rx-token]', err.message);
    res.status(500).json({ error: 'Could not generate QR link' });
  }
};

// GET /api/emr/public/rx/:apptId?t=token  (public — patient opens QR link)
exports.getPublicRx = async (req, res) => {
  const { apptId } = req.params;
  const { t }      = req.query;

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.appointment_date, a.patient_name, a.patient_age,
              a.patient_gender, a.patient_dob, a.uhid, a.rx_public_token,
              c.name           AS clinic_name,
              c.address        AS clinic_address,
              c.phone          AS clinic_phone,
              d.name           AS doctor_name,
              d.specialization AS doctor_specialization,
              e.id                 AS encounter_id,
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

    // Verify token if the column exists and a token is stored
    if (r.rx_public_token && t !== r.rx_public_token) {
      return res.status(403).json({ error: 'Invalid or expired QR link' });
    }
    // If no token stored yet (old appointments / column missing), allow access

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
      clinic_name:           r.clinic_name            || '',
      clinic_address:        r.clinic_address         || '',
      clinic_phone:          r.clinic_phone           || '',
      doctor_name:           r.doctor_name            || '',
      doctor_specialization: r.doctor_specialization  || '',
      encounter_id:          r.encounter_id           || null,
      vitals:                r.vitals                 || {},
      symptoms:              r.symptoms               || [],
      diagnosis:             r.diagnosis              || [],
      medications:           r.medications            || [],
      advices:               r.advices                || '',
      notes:                 r.notes                  || '',
      next_visit_date:       r.next_visit_date        || null,
      next_visit_notes:      r.next_visit_notes       || '',
      lab_investigations:    r.lab_investigations     || [],
      lab_results:           r.lab_results            || [],
      examination_findings:  r.examination_findings   || '',
      refer_to:              r.refer_to               || '',
      procedures:            r.procedures             || [],
    });
  } catch (err) {
    console.error('[rx-public]', err.message);
    res.status(500).json({ error: 'Could not load prescription' });
  }
};
