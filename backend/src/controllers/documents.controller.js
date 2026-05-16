const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { extractVitalsFromText } = require('../services/vitals-extractor.service');
const { analyzeDocumentText } = require('../services/ocr.service');
const { addTimelineEvent } = require('../services/timeline.service');

async function getDocuments(req, res) {
  const { type, search, limit = 50, offset = 0 } = req.query;
  let sql = 'SELECT * FROM documents WHERE user_id = $1';
  const params = [req.user.id];
  let idx = 2;
  if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
  if (search) { sql += ` AND (title ILIKE $${idx} OR ocr_text ILIKE $${idx} OR doctor_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
  sql += ` ORDER BY uploaded_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(parseInt(limit), parseInt(offset));
  const result = await query(sql, params);
  res.json({ documents: result.rows.map(d => ({ ...d, file_url: d.file_path ? `/uploads/${req.user.id}/${path.basename(d.file_path)}` : null })) });
}

async function uploadDocument(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { title, type, doctor_name, facility_name, document_date, ocr_text, tags } = req.body;
  let extractedVitals = null;
  let analysisResult = null;

  if (ocr_text) {
    extractedVitals = extractVitalsFromText(ocr_text);
    analysisResult = analyzeDocumentText(ocr_text);
  }

  const fileUrl = `/uploads/${req.user.id}/${req.file.filename}`;
  const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  const result = await query(
    `INSERT INTO documents (user_id, title, type, file_path, mime_type, file_size, ocr_text, extracted_vitals,
     is_encrypted, doctor_name, facility_name, document_date, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [req.user.id, title || req.file.originalname, type || 'Other', req.file.path,
     req.file.mimetype, req.file.size, ocr_text, extractedVitals ? JSON.stringify(extractedVitals) : null,
     true, doctor_name, facility_name, document_date, tagArray]
  );

  const doc = result.rows[0];
  doc.file_url = fileUrl;

  // Auto-add extracted vitals to vitals table
  if (extractedVitals && Object.keys(extractedVitals).length > 0) {
    await _saveExtractedVitals(req.user.id, extractedVitals, doc.id);
  }

  await addTimelineEvent(req.user.id, 'document', `Document Uploaded: ${doc.title}`,
    `Type: ${doc.type}${doc.doctor_name ? ` | Dr. ${doc.doctor_name}` : ''}`, null, new Date(), doc.id, 'document');

  res.status(201).json({ document: doc, extracted_vitals: extractedVitals, analysis: analysisResult });
}

async function deleteDocument(req, res) {
  const result = await query('SELECT file_path FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
  const filePath = result.rows[0].file_path;
  await query('DELETE FROM documents WHERE id = $1', [req.params.id]);
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ message: 'Document deleted successfully' });
}

async function _saveExtractedVitals(userId, vitals, documentId) {
  const { determineVitalStatus, getLoincCode } = require('../services/loinc.service');
  for (const [type, values] of Object.entries(vitals)) {
    if (!values || (typeof values === 'object' && Object.keys(values).length === 0)) continue;
    const normalizedValues = typeof values === 'number' ? { value: values } : values;
    const status = determineVitalStatus(type, normalizedValues);
    const loincCode = getLoincCode(type);
    await query(
      `INSERT INTO vitals (user_id, type, values, status, loinc_code, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, JSON.stringify(normalizedValues), status, loincCode, 'document_ocr', `Extracted from document ${documentId}`]
    ).catch(() => {});
  }
}

module.exports = { getDocuments, uploadDocument, deleteDocument };
