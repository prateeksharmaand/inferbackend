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

module.exports = router;
