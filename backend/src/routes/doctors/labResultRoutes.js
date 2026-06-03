/**
 * Doctor Lab Result Routes
 * Doctor viewing and managing lab results
 */

const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const db = { query };
const { requireAuth } = require('../../middleware/auth');
const auditService = require('../../services/laboratory/auditService');

/**
 * GET /api/v1/doctors/patients/:patient_id/lab-results
 * Get patient's lab results with filters
 */
router.get('/patients/:patient_id/lab-results', requireAuth, async (req, res) => {
  try {
    const { patient_id } = req.params;
    const { limit = 20, offset = 0, status, sort = 'newest' } = req.query;

    // Check access (you'll need a helper to verify doctor can access patient)
    // if (!canAccessPatient(req.user.id, patient_id)) {
    //   return res.status(403).json({ error: 'Access denied' });
    // }

    let query = `
      SELECT id, test_code, test_name, result_value, result_unit,
             reference_range_low, reference_range_high, result_status,
             result_timestamp, visible_to_doctor_at, is_critical_value,
             needs_immediate_attention, visibility_status, source_format, lab_id
      FROM lab_test_results
      WHERE patient_id = $1 AND visibility_status = 'DOCTOR_VISIBLE'
    `;

    const params = [patient_id];

    if (status) {
      query += ` AND result_status = $${params.length + 1}`;
      params.push(status);
    }

    if (sort === 'newest') {
      query += ` ORDER BY result_timestamp DESC`;
    } else if (sort === 'oldest') {
      query += ` ORDER BY result_timestamp ASC`;
    }

    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get summary stats
    const statsResult = await db.query(
      `SELECT
        COUNT(*) as total_results,
        SUM(CASE WHEN is_critical_value THEN 1 ELSE 0 END) as critical_count,
        MAX(result_timestamp) as latest_result_time
       FROM lab_test_results
       WHERE patient_id = $1 AND visibility_status = 'DOCTOR_VISIBLE'`,
      [patient_id]
    );

    const stats = statsResult.rows[0];

    // Log access
    await auditService.logAction({
      actor_user_id: req.user.id,
      actor_role: 'DOCTOR',
      action: 'PATIENT_RESULTS_VIEWED',
      resource_type: 'PATIENT_RESULTS',
      resource_id: patient_id,
      ip_address: req.ip
    });

    res.json({
      results: result.rows,
      summary: {
        total_results: parseInt(stats.total_results) || 0,
        critical_values: parseInt(stats.critical_count) || 0,
        latest_result_time: stats.latest_result_time
      },
      pagination: {
        limit,
        offset,
        total: parseInt(stats.total_results) || 0
      }
    });
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/doctors/lab-results/:result_id
 * Get single result details with anomalies
 */
router.get('/lab-results/:result_id', requireAuth, async (req, res) => {
  try {
    const { result_id } = req.params;

    const result = await db.query(
      `SELECT * FROM lab_test_results WHERE id = $1`,
      [result_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }

    const testResult = result.rows[0];

    // Get related anomalies
    const anomalies = await db.query(
      `SELECT id, anomaly_type, severity, clinical_context, recommended_action,
              doctor_alerted, alert_sent_at, alert_acknowledged_at, created_at
       FROM lab_anomalies
       WHERE result_id = $1
       ORDER BY created_at DESC`,
      [result_id]
    );

    // Get lab info
    const labInfo = await db.query(
      `SELECT facility_name, lab_type FROM laboratories WHERE id = $1`,
      [testResult.lab_id]
    );

    // Log access
    await auditService.logAction({
      actor_user_id: req.user.id,
      actor_role: 'DOCTOR',
      action: 'RESULT_VIEWED',
      resource_type: 'LAB_RESULT',
      resource_id: result_id,
      ip_address: req.ip
    });

    res.json({
      result: testResult,
      laboratory: labInfo.rows[0] || {},
      anomalies: anomalies.rows,
      reference_info: {
        normal_range: `${testResult.reference_range_low} - ${testResult.reference_range_high} ${testResult.result_unit}`
      }
    });
  } catch (error) {
    console.error('Get result details error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/doctors/lab-results/:result_id/acknowledge
 * Mark result as reviewed
 */
router.post('/lab-results/:result_id/acknowledge', requireAuth, async (req, res) => {
  try {
    const { result_id } = req.params;
    const { notes } = req.body;

    const result = await db.query(
      `UPDATE lab_test_results
       SET needs_immediate_attention = false, doctor_notified_at = NOW()
       WHERE id = $1
       RETURNING id, test_name`,
      [result_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }

    // Acknowledge anomalies
    await db.query(
      `UPDATE lab_anomalies
       SET alert_acknowledged_at = NOW(), doctor_alerted = true
       WHERE result_id = $1`,
      [result_id]
    );

    // Audit log
    await auditService.logAction({
      actor_user_id: req.user.id,
      actor_role: 'DOCTOR',
      action: 'RESULT_ACKNOWLEDGED',
      resource_type: 'LAB_RESULT',
      resource_id: result_id,
      changes_made: { notes },
      ip_address: req.ip
    });

    res.json({
      status: 'acknowledged',
      result: result.rows[0],
      message: 'Result marked as reviewed'
    });
  } catch (error) {
    console.error('Acknowledge error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/doctors/anomalies/:anomaly_id
 * Get anomaly details
 */
router.get('/anomalies/:anomaly_id', requireAuth, async (req, res) => {
  try {
    const { anomaly_id } = req.params;

    const anomaly = await db.query(
      `SELECT * FROM lab_anomalies WHERE id = $1`,
      [anomaly_id]
    );

    if (anomaly.rows.length === 0) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    const anom = anomaly.rows[0];

    // Get related result
    const result = await db.query(
      `SELECT test_name, result_value, result_unit, reference_range_low, reference_range_high
       FROM lab_test_results WHERE id = $1`,
      [anom.result_id]
    );

    res.json({
      anomaly: anom,
      result: result.rows[0] || {}
    });
  } catch (error) {
    console.error('Get anomaly error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/doctors/patients/:patient_id/lab-anomalies
 * Get patient's anomalies this week
 */
router.get('/patients/:patient_id/lab-anomalies', requireAuth, async (req, res) => {
  try {
    const { patient_id } = req.params;
    const { days = 7, limit = 10 } = req.query;

    const anomalies = await db.query(
      `SELECT a.id, a.anomaly_type, a.severity, a.clinical_context, a.recommended_action,
              r.test_name, r.result_value, r.result_unit, a.created_at
       FROM lab_anomalies a
       JOIN lab_test_results r ON a.result_id = r.id
       WHERE a.patient_id = $1 AND a.created_at > NOW() - INTERVAL '1 day' * $2
       ORDER BY a.severity DESC, a.created_at DESC
       LIMIT $3`,
      [patient_id, days, limit]
    );

    res.json({
      anomalies: anomalies.rows,
      period_days: days,
      total: anomalies.rowCount
    });
  } catch (error) {
    console.error('Get anomalies error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/doctors/critical-values
 * Get all critical values across assigned patients (for oncall)
 */
router.get('/critical-values', requireAuth, async (req, res) => {
  try {
    const { limit = 50, since } = req.query;

    let query = `
      SELECT id, test_name, result_value, result_unit, patient_id, lab_id, result_timestamp
      FROM lab_test_results
      WHERE is_critical_value = true AND visibility_status = 'DOCTOR_VISIBLE'
    `;

    const params = [];

    if (since) {
      query += ` AND result_timestamp > $${params.length + 1}`;
      params.push(since);
    } else {
      query += ` AND result_timestamp > NOW() - INTERVAL '24 hours'`;
    }

    query += ` ORDER BY result_timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    res.json({
      critical_values: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Get critical values error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
