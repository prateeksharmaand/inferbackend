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
    if (!q || q.trim().length < 1) return res.json([]);

    const searchTerm = `%${q.trim()}%`;

    // Search registered patients by name or UHID
    const { rows } = await pool.query(
      `SELECT DISTINCT p.id,
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
       LEFT JOIN emr_appointments a ON a.patient_mobile = p.mobile
       WHERE LOWER(p.name) LIKE LOWER($1)
          OR LOWER(p.mobile) LIKE LOWER($1)
          OR LOWER(p.abha_number) LIKE LOWER($1)
          OR LOWER(a.uhid) LIKE LOWER($1)
       ORDER BY p.name
       LIMIT 10`,
      [searchTerm]
    );

    res.json(rows);
  } catch (err) {
    console.error('Patient search error:', err);
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
