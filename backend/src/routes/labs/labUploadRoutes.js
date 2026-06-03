/**
 * Laboratory Upload Routes
 * Handles HL7, FHIR, JSON, PDF, CSV uploads
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { query: dbQuery } = require('../../config/database');
const { verifyLabApiKey, verifyLabToken, checkLabPermission } = require('../../middleware/labAuth');
const dataParser = require('../../services/laboratory/dataParser');
const auditService = require('../../services/laboratory/auditService');
const criticalValueService = require('../../services/laboratory/criticalValueService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * POST /api/v1/labs/upload-result
 * Upload lab result in HL7/FHIR/JSON/CSV format
 * Auth: Lab API Key or JWT
 */
router.post(
  '/upload-result',
  (req, res, next) => {
    // Try API key first, then JWT
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.includes('.')) {
      // JWT token
      verifyLabToken(req, res, next);
    } else {
      // API key
      verifyLabApiKey(req, res, next);
    }
  },
  async (req, res) => {
    try {
      const { format, data, patient_id, is_critical } = req.body;
      const lab_id = req.user.lab_id;

      if (!format || !data || !patient_id) {
        return res.status(400).json({
          error: 'Missing required fields: format, data, patient_id'
        });
      }

      // Parse data based on format
      let parsed;
      try {
        parsed = await dataParser.parseLabData(data, format);
      } catch (parseError) {
        return res.status(400).json({
          error: `Failed to parse ${format} data: ${parseError.message}`
        });
      }

      if (!parsed.results || parsed.results.length === 0) {
        return res.status(400).json({ error: 'No results extracted from data' });
      }

      const savedResults = [];

      // Process each result
      for (const result of parsed.results) {
        // Check if critical value
        const isCritical =
          is_critical ||
          (await criticalValueService.isCriticalValue(lab_id, result.test_code, result.result_value));

        // Insert result
        const dbResult = await dbQuery(
          `INSERT INTO lab_test_results (
            patient_id, lab_id, test_code, test_name, result_value, result_unit,
            reference_range_low, reference_range_high, result_status, source_format,
            collection_timestamp, is_critical_value, visibility_status, raw_data_encrypted
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id, test_name, is_critical_value`,
          [
            patient_id,
            lab_id,
            result.test_code,
            result.test_name,
            result.result_value,
            result.result_unit,
            result.reference_range_low,
            result.reference_range_high,
            result.result_status || 'FINAL',
            format,
            result.collection_timestamp || new Date(),
            isCritical,
            'DOCTOR_VISIBLE',
            null
          ]
        );

        const newResult = dbResult.rows[0];
        savedResults.push(newResult);

        // Create anomaly alert if critical
        if (isCritical) {
          await dbQuery(
            `INSERT INTO lab_anomalies (
              result_id, patient_id, anomaly_type, severity,
              clinical_context, recommended_action
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              newResult.id,
              patient_id,
              'CRITICAL_VALUE',
              'CRITICAL',
              `${result.test_name} = ${result.result_value} (CRITICAL)`,
              'Immediate physician notification required'
            ]
          );
        }

        // Audit log
        await auditService.logAction({
          actor_user_id: req.user.id,
          actor_role: req.user.lab_role || 'LAB_API',
          action: 'RESULT_UPLOADED',
          resource_type: 'LAB_RESULT',
          resource_id: newResult.id,
          changes_made: {
            test_name: result.test_name,
            value: result.result_value,
            is_critical: isCritical
          },
          ip_address: req.ip
        });
      }

      res.status(201).json({
        status: 'success',
        results_uploaded: savedResults.length,
        results: savedResults,
        critical_count: savedResults.filter((r) => r.is_critical_value).length,
        message: `${savedResults.length} result(s) uploaded successfully`
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/v1/labs/upload-pdf
 * Upload PDF lab report with OCR
 */
router.post(
  '/upload-pdf',
  (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.includes('.')) {
      verifyLabToken(req, res, next);
    } else {
      verifyLabApiKey(req, res, next);
    }
  },
  upload.single('file'),
  async (req, res) => {
    try {
      const { patient_id, test_date } = req.body;
      const lab_id = req.user.lab_id;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Only PDF files are accepted' });
      }

      // Parse PDF
      let parsed;
      try {
        parsed = await dataParser.parsePDF(req.file.buffer);
      } catch (parseError) {
        return res.status(400).json({
          error: `Failed to parse PDF: ${parseError.message}`
        });
      }

      if (!parsed.results || parsed.results.length === 0) {
        return res.status(400).json({
          error: 'No lab values extracted from PDF',
          suggestion: 'Ensure PDF contains readable lab result tables'
        });
      }

      // Save encrypted file
      const fileResult = await dbQuery(
        `INSERT INTO encrypted_files (
          lab_id, original_filename, file_size_bytes, mime_type,
          ocr_extracted_text, ocr_confidence, encrypted_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          lab_id,
          req.file.originalname,
          req.file.size,
          req.file.mimetype,
          parsed.extracted_text,
          parsed.ocr_confidence || 0.7,
          req.file.buffer // In production, encrypt this
        ]
      );

      const fileId = fileResult.rows[0].id;
      const savedResults = [];

      // Save results linked to PDF
      for (const result of parsed.results) {
        const isCritical = await criticalValueService.isCriticalValue(
          lab_id,
          result.test_code,
          result.result_value
        );

        const dbResult = await dbQuery(
          `INSERT INTO lab_test_results (
            patient_id, lab_id, test_code, test_name, result_value, result_unit,
            reference_range_low, reference_range_high, source_format, file_reference_id,
            visibility_status, collection_timestamp, is_critical_value
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id, test_name`,
          [
            patient_id,
            lab_id,
            result.test_code || 'UNKNOWN',
            result.test_name || 'Unknown Test',
            result.result_value,
            result.result_unit,
            result.reference_range_low,
            result.reference_range_high,
            'PDF',
            fileId,
            'DOCTOR_VISIBLE',
            test_date || new Date(),
            isCritical
          ]
        );

        savedResults.push(dbResult.rows[0]);

        // Audit log
        await auditService.logAction({
          actor_user_id: req.user.id,
          actor_role: req.user.lab_role || 'LAB_API',
          action: 'PDF_UPLOADED',
          resource_type: 'LAB_RESULT',
          resource_id: dbResult.rows[0].id,
          changes_made: {
            original_filename: req.file.originalname,
            ocr_confidence: parsed.ocr_confidence
          },
          ip_address: req.ip
        });
      }

      res.status(201).json({
        status: 'success',
        file_id: fileId,
        results_extracted: savedResults.length,
        extracted_tests: savedResults.map((r) => ({
          id: r.id,
          name: r.test_name
        })),
        ocr_confidence: parsed.ocr_confidence,
        message: `PDF processed: ${savedResults.length} test(s) extracted`
      });
    } catch (error) {
      console.error('PDF upload error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/v1/labs/status
 * Check lab system status and connectivity
 */
router.get('/status', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.includes('.')) {
    verifyLabToken(req, res, next);
  } else {
    verifyLabApiKey(req, res, next);
  }
}, async (req, res) => {
  try {
    const lab_id = req.user.lab_id;

    const result = await dbQuery(
      'SELECT id, facility_name, status, api_key FROM laboratories WHERE id = $1',
      [lab_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Laboratory not found' });
    }

    const lab = result.rows[0];

    res.json({
      status: 'online',
      laboratory: {
        id: lab.id,
        facility_name: lab.facility_name,
        status: lab.status
      },
      server_time: new Date(),
      features: {
        hl7: true,
        fhir: true,
        pdf_ocr: true,
        csv: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
