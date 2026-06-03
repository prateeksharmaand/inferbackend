/**
 * Patient Search for Lab Portal
 * Searches EMR patients by name or UHID — same data as the clinic EMR.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const { verifyLabToken } = require('../../middleware/labAuth');

/**
 * GET /api/v1/patients/search?q=<name or uhid>
 * Returns up to 10 matching patients from emr_patients + emr_appointments.
 */
router.get('/search', verifyLabToken, async (req, res) => {
  // Disable caching for patient search
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) return res.json([]);

    const searchTerm = `%${q.trim()}%`;
    const clinicId = req.user.clinic_id || null;

    // 1) Appointment-based patients (most patients exist only here — name/mobile/UHID snapshot).
    //    Scoped to the lab staff's clinic. One row per patient (latest appointment wins).
    const apptParams = [searchTerm];
    let clinicFilter = '';
    if (clinicId) { apptParams.push(clinicId); clinicFilter = `AND a.clinic_id = $${apptParams.length}`; }

    const apptRes = await pool.query(
      `SELECT DISTINCT ON (LOWER(COALESCE(NULLIF(a.patient_mobile, ''), a.patient_name)))
              a.emr_patient_id          AS id,
              a.patient_name            AS name,
              a.patient_mobile          AS mobile,
              a.patient_dob             AS dob,
              a.patient_gender          AS gender,
              a.patient_abha            AS abha_number,
              a.uhid                    AS uhid
       FROM emr_appointments a
       WHERE (LOWER(a.patient_name) LIKE LOWER($1)
              OR a.patient_mobile LIKE $1
              OR LOWER(COALESCE(a.uhid, '')) LIKE LOWER($1)
              OR LOWER(COALESCE(a.patient_abha, '')) LIKE LOWER($1))
         ${clinicFilter}
       ORDER BY LOWER(COALESCE(NULLIF(a.patient_mobile, ''), a.patient_name)),
                (a.uhid IS NOT NULL) DESC, a.created_at DESC
       LIMIT 15`,
      apptParams
    );

    // 2) Registered patients (emr_patients) — global, may not have an appointment yet.
    const patRes = await pool.query(
      `SELECT p.id,
              p.name,
              p.mobile,
              p.dob,
              p.gender,
              p.abha_number,
              (SELECT MAX(a.uhid)
               FROM emr_appointments a
               WHERE a.patient_mobile = p.mobile
                 AND a.uhid IS NOT NULL AND a.uhid != '') AS uhid
       FROM emr_patients p
       WHERE LOWER(p.name) LIKE LOWER($1)
          OR p.mobile LIKE $1
          OR LOWER(COALESCE(p.abha_number, '')) LIKE LOWER($1)
       ORDER BY p.name
       LIMIT 15`,
      [searchTerm]
    );

    // Merge & de-duplicate by mobile → uhid → name. Registered patient wins (has a real id).
    const merged = new Map();
    const keyOf = (r) =>
      (r.mobile && `m:${String(r.mobile).toLowerCase()}`) ||
      (r.uhid && `u:${String(r.uhid).toLowerCase()}`) ||
      `n:${String(r.name || '').toLowerCase()}`;

    for (const r of patRes.rows) merged.set(keyOf(r), r);
    for (const r of apptRes.rows) {
      const k = keyOf(r);
      if (!merged.has(k)) merged.set(k, r);
      else if (!merged.get(k).uhid && r.uhid) merged.get(k).uhid = r.uhid; // backfill UHID
    }

    const results = Array.from(merged.values())
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .slice(0, 10);

    res.json(results);
  } catch (err) {
    console.error('Patient search error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/patients/debug/all - list all patients (debug only)
 */
router.get('/debug/all', verifyLabToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, name, mobile FROM emr_patients ORDER BY name LIMIT 50`);
    res.json({ total: rows.length, patients: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/patients/:id  — fetch single patient by EMR id
 */
router.get('/:id', verifyLabToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
              (SELECT MAX(a.uhid)
               FROM emr_appointments a
               WHERE a.patient_mobile = p.mobile
                 AND a.uhid IS NOT NULL AND a.uhid != '') AS uhid
       FROM emr_patients p WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
