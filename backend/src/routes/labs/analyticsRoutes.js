/**
 * Analytics Routes
 * Lab performance metrics and reporting endpoints
 */

const router = require('express').Router();
const authMiddleware = require('../../middleware/auth');
const analyticsService = require('../../services/laboratory/analyticsService');

const requireAuth = authMiddleware.requireAuth;

// All analytics routes require a lab_id query param or resolved from user context
function getLabId(req) {
  return req.query.lab_id || req.user.lab_id;
}

// GET /analytics/dashboard
router.get('/analytics/dashboard', requireAuth, async (req, res) => {
  try {
    const lab_id = getLabId(req);
    if (!lab_id) return res.status(400).json({ error: 'lab_id is required' });
    const days = parseInt(req.query.days) || 30;
    const dashboard = await analyticsService.getDashboard(lab_id, days);
    return res.json({ success: true, dashboard });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /analytics/test-volume
router.get('/analytics/test-volume', requireAuth, async (req, res) => {
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
router.get('/analytics/turnaround', requireAuth, async (req, res) => {
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
router.get('/analytics/critical-values', requireAuth, async (req, res) => {
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
router.get('/analytics/revenue', requireAuth, async (req, res) => {
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
router.get('/analytics/compliance', requireAuth, async (req, res) => {
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
