/**
 * Analytics Routes
 * Lab performance metrics and reporting endpoints
 */

const router = require('express').Router();
const { verifyLabToken } = require('../../middleware/labAuth');
const analyticsService = require('../../services/laboratory/analyticsService');

// All analytics routes require a lab_id query param or resolved from user context
function getLabId(req) {
  return req.query.lab_id || req.user.lab_id;
}

// GET /analytics/dashboard
router.get('/analytics/dashboard', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    if (!lab_id) return res.status(400).json({ error: 'lab_id is required' });
    const days = parseInt(req.query.days) || 30;
    try {
      const dashboard = await analyticsService.getDashboard(lab_id, days);
      return res.json({ success: true, dashboard });
    } catch (dbErr) {
      // Return empty data if tables don't exist yet (migrations not run)
      if (dbErr.message.includes('does not exist') || dbErr.message.includes('undefined')) {
        return res.json({ success: true, dashboard: {
          lab_id, period_days: days,
          total_orders: 0, completed_orders: 0, cancelled_orders: 0,
          stat_orders: 0, urgent_orders: 0,
          avg_tat_hours: 0, min_tat_hours: 0, max_tat_hours: 0,
          critical_count: 0, total_revenue: 0
        }});
      }
      throw dbErr;
    }
  } catch (err) {
    console.error('Analytics dashboard error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/test-volume
router.get('/analytics/test-volume', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    if (!lab_id) return res.status(400).json({ error: 'lab_id is required' });
    const { start_date, end_date } = req.query;
    const data = await analyticsService.getTestVolume(lab_id, start_date, end_date);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/turnaround
router.get('/analytics/turnaround', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    if (!lab_id) return res.status(400).json({ error: 'lab_id is required' });
    const { start_date, end_date } = req.query;
    const data = await analyticsService.getTurnaroundStats(lab_id, start_date, end_date);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/critical-values
router.get('/analytics/critical-values', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    if (!lab_id) return res.status(400).json({ error: 'lab_id is required' });
    const days = parseInt(req.query.days) || 30;
    const data = await analyticsService.getCriticalValueStats(lab_id, days);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/revenue
router.get('/analytics/revenue', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    if (!lab_id) return res.status(400).json({ error: 'lab_id is required' });
    const { start_date, end_date } = req.query;
    const data = await analyticsService.getRevenueStats(lab_id, start_date, end_date);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/compliance
router.get('/analytics/compliance', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    if (!lab_id) return res.status(400).json({ error: 'lab_id is required' });
    const { start_date, end_date } = req.query;
    const data = await analyticsService.getComplianceReport(lab_id, start_date, end_date);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/clinical - abnormal patterns, critical value frequency, disease trends
router.get('/analytics/clinical', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    const days   = parseInt(req.query.days) || 30;
    const since  = new Date(); since.setDate(since.getDate() - days);
    const { query } = require('../../config/database');

    const [abnormal, criticals, trends] = await Promise.all([
      // Abnormal result % per test
      query(
        `SELECT test_name, test_code,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE result_value IS NOT NULL AND reference_range_high IS NOT NULL AND result_value > reference_range_high) AS high_count,
           COUNT(*) FILTER (WHERE result_value IS NOT NULL AND reference_range_low  IS NOT NULL AND result_value < reference_range_low)  AS low_count,
           COUNT(*) FILTER (WHERE is_critical_value = true) AS critical_count
         FROM lab_test_results
         WHERE lab_id = $1 AND collection_timestamp >= $2
         GROUP BY test_name, test_code
         HAVING COUNT(*) >= 5
         ORDER BY (COUNT(*) FILTER (WHERE result_value IS NOT NULL AND (result_value > reference_range_high OR result_value < reference_range_low))::float / NULLIF(COUNT(*), 0)) DESC
         LIMIT 15`,
        [lab_id, since.toISOString()]
      ),
      // Critical values summary
      query(
        `SELECT test_name, COUNT(*) AS cnt FROM lab_test_results
         WHERE lab_id = $1 AND is_critical_value = true AND collection_timestamp >= $2
         GROUP BY test_name ORDER BY cnt DESC LIMIT 10`,
        [lab_id, since.toISOString()]
      ),
      // Disease trends (tests with high positivity)
      query(
        `SELECT test_name, test_code,
           COUNT(*) AS tested,
           COUNT(*) FILTER (WHERE is_critical_value = true OR (result_value IS NOT NULL AND reference_range_high IS NOT NULL AND result_value > reference_range_high)) AS positive
         FROM lab_test_results
         WHERE lab_id = $1 AND collection_timestamp >= $2
           AND test_name ILIKE ANY(ARRAY['%dengue%','%malaria%','%typhoid%','%hbsag%','%hcv%','%hiv%','%widal%','%culture%'])
         GROUP BY test_name, test_code ORDER BY positive DESC`,
        [lab_id, since.toISOString()]
      ),
    ]);

    return res.json({ success: true, abnormal: abnormal.rows, criticals: criticals.rows, trends: trends.rows });
  } catch (err) {
    if (err.message.includes('does not exist')) return res.json({ success: true, abnormal: [], criticals: [], trends: [] });
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/demographics - patient age/gender distribution
router.get('/analytics/demographics', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    const days   = parseInt(req.query.days) || 30;
    const since  = new Date(); since.setDate(since.getDate() - days);
    const { query } = require('../../config/database');

    const [ageRes, genderRes, sourceRes] = await Promise.all([
      query(
        `SELECT
           CASE WHEN EXTRACT(YEAR FROM AGE(a.patient_dob)) < 18 THEN '0–18'
                WHEN EXTRACT(YEAR FROM AGE(a.patient_dob)) < 41 THEN '19–40'
                WHEN EXTRACT(YEAR FROM AGE(a.patient_dob)) < 61 THEN '41–60'
                ELSE '60+' END AS age_group,
           COUNT(*) AS cnt
         FROM lab_orders o
         JOIN patient_clinics pc ON pc.uhid = o.patient_uhid
         JOIN emr_patients a ON a.id = pc.patient_id
         WHERE o.lab_id = $1 AND o.created_at >= $2 AND a.patient_dob IS NOT NULL
         GROUP BY 1 ORDER BY 1`,
        [lab_id, since.toISOString()]
      ),
      query(
        `SELECT COALESCE(a.patient_gender, 'Unknown') AS gender, COUNT(*) AS cnt
         FROM lab_orders o
         JOIN patient_clinics pc ON pc.uhid = o.patient_uhid
         JOIN emr_patients a ON a.id = pc.patient_id
         WHERE o.lab_id = $1 AND o.created_at >= $2
         GROUP BY 1`,
        [lab_id, since.toISOString()]
      ),
      query(
        `SELECT SPLIT_PART(COALESCE(clinical_notes, 'Unknown'), '|', 1) AS source, COUNT(*) AS cnt
         FROM lab_orders WHERE lab_id = $1 AND created_at >= $2
         GROUP BY 1 ORDER BY cnt DESC LIMIT 8`,
        [lab_id, since.toISOString()]
      ),
    ]);

    return res.json({ success: true, age: ageRes.rows, gender: genderRes.rows, source: sourceRes.rows });
  } catch (err) {
    if (err.message.includes('does not exist')) return res.json({ success: true, age: [], gender: [], source: [] });
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/quality - NC events summary + rejection rate
router.get('/analytics/quality', verifyLabToken, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    const days   = parseInt(req.query.days) || 30;
    const since  = new Date(); since.setDate(since.getDate() - days);
    const { query } = require('../../config/database');

    const [byType, byStage, bySeverity, trend, totalOrders] = await Promise.all([
      query(`SELECT event_type, COUNT(*) AS cnt FROM lab_qa_events WHERE lab_id=$1 AND created_at>=$2 GROUP BY event_type ORDER BY cnt DESC LIMIT 10`, [lab_id, since.toISOString()]),
      query(`SELECT stage, COUNT(*) AS cnt FROM lab_qa_events WHERE lab_id=$1 AND created_at>=$2 GROUP BY stage`, [lab_id, since.toISOString()]),
      query(`SELECT severity, COUNT(*) AS cnt FROM lab_qa_events WHERE lab_id=$1 AND created_at>=$2 GROUP BY severity`, [lab_id, since.toISOString()]),
      query(`SELECT DATE_TRUNC('week', created_at)::date AS week, COUNT(*) AS cnt FROM lab_qa_events WHERE lab_id=$1 AND created_at>=$2 GROUP BY 1 ORDER BY 1`, [lab_id, since.toISOString()]),
      query(`SELECT COUNT(*) AS cnt FROM lab_orders WHERE lab_id=$1 AND created_at>=$2`, [lab_id, since.toISOString()]),
    ]);

    const totalNC = byType.rows.reduce((s, r) => s + parseInt(r.cnt), 0);
    const totalOrd = parseInt(totalOrders.rows[0]?.cnt || 0);
    const rejectionRate = totalOrd > 0 ? ((totalNC / totalOrd) * 100).toFixed(2) : '0.00';

    return res.json({ success: true, by_type: byType.rows, by_stage: byStage.rows, by_severity: bySeverity.rows, trend: trend.rows, total_nc: totalNC, total_orders: totalOrd, rejection_rate: rejectionRate });
  } catch (err) {
    if (err.message.includes('does not exist')) return res.json({ success: true, by_type: [], by_stage: [], by_severity: [], trend: [], total_nc: 0, total_orders: 0, rejection_rate: '0.00' });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
