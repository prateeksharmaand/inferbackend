const { query } = require('../config/database');
const { processDocument } = require('../services/ocrService');
const { encryptFile } = require('../services/encryptionService');
const { addVital } = require('./vitalsController');
const path = require('path');
const fs = require('fs');

async function uploadDocument(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { profileId, title, documentType, doctorName, hospitalName, reportDate, tags } = req.body;
    const filePath = req.file.path;

    // Encrypt file
    const encryptedPath = filePath + '.enc';
    const encryptionIv = await encryptFile(filePath, encryptedPath);
    fs.unlinkSync(filePath); // Remove unencrypted file

    const doc = await query(
      `INSERT INTO documents (profile_id, title, document_type, file_path, file_name, file_size,
        mime_type, is_encrypted, encryption_iv, ocr_status, doctor_name, hospital_name, report_date, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,'processing',$9,$10,$11,$12) RETURNING *`,
      [profileId, title, documentType, encryptedPath, req.file.originalname, req.file.size,
        req.file.mimetype, encryptionIv, doctorName, hospitalName, reportDate,
        tags ? (Array.isArray(tags) ? tags : [tags]) : null]
    );

    const document = doc.rows[0];

    // Process OCR async
    processDocumentOCR(document.id, filePath, encryptedPath, encryptionIv, profileId).catch(console.error);

    // Add to timeline
    await query(
      `INSERT INTO timeline_events (profile_id, event_type, title, reference_id, reference_type)
       VALUES ($1, 'document_uploaded', $2, $3, 'document')`,
      [profileId, `Document: ${title}`, document.id]
    );

    res.status(201).json(document);
  } catch (err) {
    next(err);
  }
}

async function processDocumentOCR(documentId, originalPath, encryptedPath, iv, profileId) {
  try {
    // Decrypt to temp for OCR
    const { decryptFile } = require('../services/encryptionService');
    const tempPath = encryptedPath.replace('.enc', '_temp' + path.extname(originalPath));
    await decryptFile(encryptedPath, tempPath, iv);

    const { text, extractedVitals } = await processDocument(tempPath);
    fs.unlinkSync(tempPath);

    await query(
      `UPDATE documents SET ocr_text = $1, ocr_status = 'completed', extracted_vitals = $2, updated_at = NOW()
       WHERE id = $3`,
      [text, JSON.stringify(extractedVitals), documentId]
    );

    // Auto-add extracted vitals
    for (const v of extractedVitals) {
      try {
        const vitalBody = buildVitalFromExtracted(v, profileId);
        if (vitalBody) {
          await query(
            `INSERT INTO vitals (profile_id, vital_type, systolic, diastolic, glucose_level, glucose_unit,
              measurement_context, weight_kg, temperature, temperature_unit, spo2_percentage, heart_rate,
              loinc_code, source, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ocr',$14)`,
            [profileId, vitalBody.vital_type, vitalBody.systolic, vitalBody.diastolic,
              vitalBody.glucose, 'mg/dL', vitalBody.context, vitalBody.weight,
              vitalBody.temperature, 'C', vitalBody.spo2, vitalBody.heart_rate,
              v.loinc_code, `Extracted from document: ${documentId}`]
          );
        }
      } catch (e) { /* skip individual vital failures */ }
    }
  } catch (err) {
    await query(`UPDATE documents SET ocr_status = 'failed' WHERE id = $1`, [documentId]);
    console.error('OCR processing failed:', err);
  }
}

function buildVitalFromExtracted(v, profileId) {
  if (v.vital_type === 'blood_pressure') return { vital_type: 'bp', systolic: v.systolic, diastolic: v.diastolic };
  if (v.vital_type === 'heart_rate') return { vital_type: 'heart_rate', heart_rate: v.value };
  if (v.vital_type === 'spo2') return { vital_type: 'spo2', spo2: v.value };
  if (v.vital_type === 'temperature') return { vital_type: 'temperature', temperature: v.value };
  if (v.vital_type === 'glucose') return { vital_type: 'sugar', glucose: v.glucose, context: v.context };
  if (v.vital_type === 'weight') return { vital_type: 'weight', weight: v.value };
  return null;
}

async function getDocuments(req, res, next) {
  try {
    const { profileId } = req.params;
    const { type, search, from, to, limit = 20, offset = 0 } = req.query;

    let sql = `SELECT id, profile_id, title, document_type, file_name, file_size, mime_type,
      ocr_status, tags, doctor_name, hospital_name, report_date, created_at
      FROM documents WHERE profile_id = $1`;
    const params = [profileId];
    let idx = 2;

    if (type) { sql += ` AND document_type = $${idx++}`; params.push(type); }
    if (search) { sql += ` AND (title ILIKE $${idx} OR ocr_text ILIKE $${idx} OR doctor_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (from) { sql += ` AND created_at >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND created_at <= $${idx++}`; params.push(to); }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getDocument(req, res, next) {
  try {
    const result = await query(
      `SELECT d.* FROM documents d
       JOIN profiles p ON d.profile_id = p.id
       WHERE d.id = $1 AND p.account_id = $2`,
      [req.params.documentId, req.accountId]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function downloadDocument(req, res, next) {
  try {
    const result = await query(
      `SELECT d.* FROM documents d
       JOIN profiles p ON d.profile_id = p.id
       WHERE d.id = $1 AND p.account_id = $2`,
      [req.params.documentId, req.accountId]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const { decryptFile } = require('../services/encryptionService');
    const tempPath = doc.file_path.replace('.enc', '_dl' + path.extname(doc.file_name));

    await decryptFile(doc.file_path, tempPath, doc.encryption_iv);

    res.download(tempPath, doc.file_name, () => {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    });
  } catch (err) {
    next(err);
  }
}

async function deleteDocument(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM documents d USING profiles p
       WHERE d.id = $1 AND d.profile_id = p.id AND p.account_id = $2 RETURNING d.file_path`,
      [req.params.documentId, req.accountId]
    );

    if (result.rows.length && fs.existsSync(result.rows[0].file_path)) {
      fs.unlinkSync(result.rows[0].file_path);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadDocument, getDocuments, getDocument, downloadDocument, deleteDocument };
