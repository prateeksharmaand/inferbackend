const router = require('express').Router();
const { loginStaff } = require('../emr/emr.labstaff.controller');
const labManagementRoutes = require('./labs/labManagementRoutes');
const labUploadRoutes = require('./labs/labUploadRoutes');
const orderRoutes = require('./labs/orderRoutes');
const sampleRoutes = require('./labs/sampleRoutes');
const reportRoutes = require('./labs/reportRoutes');
const analyticsRoutes = require('./labs/analyticsRoutes');
const catalogRoutes = require('./labs/catalogRoutes');
const labResultRoutes = require('./doctors/labResultRoutes');

// Lab staff login (v1 API for OPD portal)
router.post('/auth/lab/login', loginStaff);

// Lab management endpoints
router.use('/admin', labManagementRoutes);

// Lab upload endpoints
router.use('/labs', labUploadRoutes);

// Order management
router.use('/orders', orderRoutes);

// Sample tracking
router.use('/samples', sampleRoutes);

// Reports
router.use('/reports', reportRoutes);

// Analytics (routes prefixed /analytics internally)
router.use('/', analyticsRoutes);

// Test catalog and panels (routes prefixed /catalog and /panels internally)
router.use('/', catalogRoutes);

// QA Events / Non-Conformity
router.use('/', require('./labs/qaRoutes'));

// Doctor-facing lab results
router.use('/doctors', labResultRoutes);

// Patient search (shared EMR + lab patients)
router.use('/patients', require('./labs/patientSearchRoutes'));

// Lab test name autocomplete — searches catalog + known LOINC names
router.get('/autocomplete/lab-tests', require('../middleware/auth').requireAuth, async (req, res) => {
  try {
    const { query } = require('../config/database');
    const { q, lab_id } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const term = `%${q.trim().toLowerCase()}%`;
    const params = [term];
    let labFilter = '';
    if (lab_id) { params.push(lab_id); labFilter = `AND (lab_id = $${params.length} OR lab_id IS NULL)`; }
    const { rows } = await query(
      `SELECT id, test_code, test_name, category, unit, reference_range_low, reference_range_high, price
       FROM lab_test_catalog
       WHERE is_active = TRUE
         AND (LOWER(test_name) LIKE $1 OR LOWER(test_code) LIKE $1)
         ${labFilter}
       ORDER BY test_name
       LIMIT 15`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /doctors - list doctors from EMR (accessible to lab staff)
// Doctors live in emr_doctors, scoped by clinic. The lab token carries clinic_id.
router.get('/doctors', require('../middleware/labAuth').verifyLabToken, async (req, res) => {
  try {
    const { query } = require('../config/database');
    const clinicId = req.user.clinic_id || null;
    const params = [];
    let clinicFilter = '';
    if (clinicId) { params.push(clinicId); clinicFilter = `AND clinic_id = $${params.length}`; }

    const { rows } = await query(
      `SELECT id, name, email, specialization, qualification
       FROM emr_doctors
       WHERE is_active = true ${clinicFilter}
       ORDER BY name`,
      params
    );
    res.json({ success: true, doctors: rows });
  } catch (err) {
    console.error('Doctors list error:', err);
    // If query fails, return empty array so the autocomplete still allows manual entry
    res.json({ success: true, doctors: [] });
  }
});

module.exports = router;
