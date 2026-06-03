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
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const term   = `%${q.trim().toLowerCase()}%`;
    const prefix = `${q.trim()}%`;

    // Search registered patients - deduplicate by name & mobile
    const { rows: regRows } = await pool.query(
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
       WHERE LOWER(p.name) LIKE $1
          OR p.mobile LIKE $2
          OR p.abha_number LIKE $2
          OR EXISTS (
            SELECT 1 FROM emr_appointments ax
            WHERE ax.patient_mobile = p.mobile
              AND LOWER(ax.uhid) LIKE $1
          )
       GROUP BY p.id, p.name, p.mobile, p.dob, p.gender, p.abha_number
       ORDER BY p.name
       LIMIT 10`,
      [term, prefix]
    );

    // Also search appointment records for patients not yet registered
    const knownMobiles = new Set(regRows.map(r => r.mobile).filter(Boolean));
    const { rows: apptRows } = await pool.query(
      `SELECT DISTINCT NULL           AS id,
              patient_name   AS name,
              patient_mobile AS mobile,
              patient_dob    AS dob,
              patient_gender AS gender,
              NULL           AS abha_number,
              MAX(uhid)      AS uhid
       FROM emr_appointments
       WHERE (LOWER(patient_name) LIKE $1
              OR patient_mobile   LIKE $2
              OR LOWER(uhid)      LIKE $1)
       GROUP BY patient_name, patient_mobile, patient_dob, patient_gender
       ORDER BY patient_name
       LIMIT 10`,
      [term, prefix]
    );

    // Deduplicate: filter appointment patients not in registered list
    // Normalize mobile numbers for comparison (remove spaces, dashes, +91 prefix)
    const normalizeMobile = (m) => m ? m.replace(/[\s\-+]/g, '').slice(-10) : '';
    const knownNormalized = new Set(regRows.map(r => normalizeMobile(r.mobile)).filter(Boolean));

    const unique = apptRows.filter(r => {
      const normalized = normalizeMobile(r.mobile);
      return !normalized || !knownNormalized.has(normalized);
    });

    // Also deduplicate by name + mobile to catch variations
    const seen = new Set();
    const allResults = [...regRows, ...unique];
    const deduped = allResults.filter(p => {
      const key = `${(p.name || '').toLowerCase().trim()}_${normalizeMobile(p.mobile)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json(deduped.slice(0, 10));
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
