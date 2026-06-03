/**
 * Report Routes
 * Lab report creation, approval, release, and PDF download
 */

const path = require('path');
const fs = require('fs');
const router = require('express').Router();
const labAuth = require('../../middleware/labAuth');
const reportService = require('../../services/laboratory/reportService');

const verifyLabToken = labAuth.verifyLabToken;

// POST /reports - create report
router.post('/', verifyLabToken, async (req, res) => {
  try {
    const {
      order_id, patient_id, lab_id, doctor_id, report_type,
      clinical_notes, observations, recommendations,
    } = req.body;

    if (!patient_id || !lab_id) {
      return res.status(400).json({ error: 'patient_id and lab_id are required' });
    }

    const report = await reportService.createReport({
      order_id, patient_id, lab_id, doctor_id,
      report_type, clinical_notes, observations, recommendations,
      performed_by: req.user.id,
    });

    return res.status(201).json({ success: true, report });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /reports/:report_id - get report
router.get('/:report_id', verifyLabToken, async (req, res) => {
  try {
    const report = await reportService.getReport(req.params.report_id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    return res.json({ success: true, report });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /reports/:report_id/pdf - download PDF
router.get('/:report_id/pdf', verifyLabToken, async (req, res) => {
  try {
    const { pdf_path, file_path } = await reportService.generatePDF(req.params.report_id);

    if (fs.existsSync(file_path)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="report_${req.params.report_id}.pdf"`);
      return fs.createReadStream(file_path).pipe(res);
    }

    // Fallback: redirect to html
    const htmlPath = file_path.replace(/\.pdf$/, '.html');
    if (fs.existsSync(htmlPath)) {
      res.setHeader('Content-Type', 'text/html');
      return fs.createReadStream(htmlPath).pipe(res);
    }

    return res.status(404).json({ error: 'PDF file not found', pdf_path });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /patients/:patient_id/reports - patient reports
router.get('/patients/:patient_id/reports', verifyLabToken, async (req, res) => {
  try {
    const { status, start_date, end_date } = req.query;
    const reports = await reportService.getReportsByPatient(req.params.patient_id, {
      status, start_date, end_date,
    });
    return res.json({ success: true, reports });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /reports/:report_id/approve - approve report
router.post('/:report_id/approve', verifyLabToken, async (req, res) => {
  try {
    const report = await reportService.approveReport(req.params.report_id, req.user.id);
    return res.json({ success: true, report });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /reports/:report_id/release - release to doctor
router.post('/:report_id/release', verifyLabToken, async (req, res) => {
  try {
    const report = await reportService.releaseReport(req.params.report_id, req.user.id);
    return res.json({ success: true, report });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /patients/:patient_id/trends/:test_code - trend data
router.get('/patients/:patient_id/trends/:test_code', verifyLabToken, async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;
    const trends = await reportService.getTrendData(
      req.params.patient_id, req.params.test_code, months
    );
    return res.json({ success: true, trends });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
