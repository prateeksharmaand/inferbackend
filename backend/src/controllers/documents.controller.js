const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { analyzeDocumentText } = require('../services/vitals-extractor.service');
const { processDocument } = require('../services/ocrService');
const { extractVitalsWithAI, extractVitalsWithVision } = require('../services/ai.service');
const { addTimelineEvent } = require('../services/timeline.service');
const logger = require('../utils/logger');

async function getDocuments(req, res) {
  const reqId = `GET /documents [user:${req.user.id}]`;
  logger.info(`${reqId} | query: ${JSON.stringify(req.query)}`);
  try {
    const { type, search, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM documents WHERE user_id = $1';
    const params = [req.user.id];
    let idx = 2;
    if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
    if (search) { sql += ` AND (title ILIKE $${idx} OR ocr_text ILIKE $${idx} OR doctor_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY uploaded_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));
    const result = await query(sql, params);
    const documents = result.rows.map(d => ({ ...d, file_url: d.file_path ? `/uploads/${req.user.id}/${path.basename(d.file_path)}` : null }));
    logger.info(`${reqId} | 200 | returned ${documents.length} documents`);
    res.json({ documents });
  } catch (err) {
    logger.error(`${reqId} | 500 | ${err.message}`, { stack: err.stack });
    throw err;
  }
}

async function uploadDocument(req, res) {
  const reqId = `POST /documents [user:${req.user.id}]`;
  logger.info(`${reqId} | file: ${req.file?.originalname} (${req.file?.size} bytes, ${req.file?.mimetype}) | body: ${JSON.stringify({ ...req.body, ocr_text: req.body.ocr_text ? `[${req.body.ocr_text.length} chars]` : null })}`);

  if (!req.file) {
    logger.warn(`${reqId} | 400 | No file in request`);
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { title, type, doctor_name, facility_name, document_date, tags } = req.body;
    const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const fileUrl = `/uploads/${req.user.id}/${req.file.filename}`;

    logger.info(`${reqId} | inserting document | title: "${title}" | type: ${type} | tags: [${tagArray}]`);

    const result = await query(
      `INSERT INTO documents (user_id, title, type, file_path, file_url, mime_type, file_size,
       is_encrypted, doctor_name, facility_name, document_date, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [req.user.id, title || req.file.originalname, type || 'Other',
       req.file.path, fileUrl, req.file.mimetype, req.file.size,
       false, doctor_name || null, facility_name || null, document_date || null, tagArray]
    );

    const doc = result.rows[0];
    logger.info(`${reqId} | document inserted | id: ${doc.id}`);

    await addTimelineEvent(req.user.id, 'document', `Document Uploaded: ${doc.title}`,
      `Type: ${doc.type}${doc.doctor_name ? ` | Dr. ${doc.doctor_name}` : ''}`, null, new Date(), doc.id, 'document');

    logger.info(`${reqId} | 201 | success | doc id: ${doc.id} | starting async OCR`);
    res.status(201).json({ document: doc });

    // Run OCR asynchronously after responding — does not block the client
    _processDocumentOcr(doc.id, req.file.path, req.user.id, req.file.mimetype)
      .catch(err => logger.error(`${reqId} | async OCR failed | doc: ${doc.id} | ${err.message}`, { stack: err.stack }));
  } catch (err) {
    logger.error(`${reqId} | 500 | ${err.message}`, { stack: err.stack, file: req.file?.path, body: req.body });
    throw err;
  }
}

async function deleteDocument(req, res) {
  const reqId = `DELETE /documents/${req.params.id} [user:${req.user.id}]`;
  logger.info(`${reqId} | request received`);
  try {
    const result = await query('SELECT file_path FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (result.rows.length === 0) {
      logger.warn(`${reqId} | 404 | document not found`);
      return res.status(404).json({ error: 'Document not found' });
    }
    const filePath = result.rows[0].file_path;
    await query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    logger.info(`${reqId} | 200 | deleted | file: ${filePath}`);
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    logger.error(`${reqId} | 500 | ${err.message}`, { stack: err.stack });
    throw err;
  }
}

async function reanalyzeDocument(req, res) {
  const reqId = `POST /documents/${req.params.id}/reanalyze [user:${req.user.id}]`;
  logger.info(`${reqId} | request received`);
  try {
    const result = await query(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      logger.warn(`${reqId} | 404 | document not found`);
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = result.rows[0];
    if (!doc.file_path) {
      return res.status(400).json({ error: 'No file associated with this document' });
    }

    logger.info(`${reqId} | running extraction on: ${doc.file_path} (${doc.mime_type})`);

    // Try vision first; fall back to text OCR
    const [{ text }, visionVitals] = await Promise.all([
      processDocument(doc.file_path),
      extractVitalsWithVision(doc.file_path, doc.mime_type || ''),
    ]);

    let vitals;
    if (visionVitals !== null) {
      logger.info(`${reqId} | using Gemini Vision results`);
      vitals = visionVitals;
    } else {
      if (!text || !text.trim()) {
        return res.status(422).json({ error: 'Could not extract text from document' });
      }
      logger.info(`${reqId} | vision unavailable, using text OCR (${text.length} chars)`);
      vitals = await extractVitalsWithAI(text);
    }
    const vitalsFound = Object.keys(vitals);
    logger.info(`${reqId} | extracted ${vitalsFound.length} vitals: [${vitalsFound.join(', ')}]`);

    await query(
      `UPDATE documents SET ocr_text = $1, extracted_vitals = $2 WHERE id = $3`,
      [text, vitalsFound.length > 0 ? JSON.stringify(vitals) : null, doc.id]
    );

    if (vitalsFound.length > 0) {
      await _saveExtractedVitals(req.user.id, vitals, doc.id);
    }

    const updated = await query('SELECT * FROM documents WHERE id = $1', [doc.id]);
    const updatedDoc = updated.rows[0];
    const fileUrl = updatedDoc.file_path ? `/uploads/${req.user.id}/${path.basename(updatedDoc.file_path)}` : null;
    logger.info(`${reqId} | 200 | reanalysis complete`);
    res.json({ document: { ...updatedDoc, file_url: fileUrl } });
  } catch (err) {
    logger.error(`${reqId} | 500 | ${err.message}`, { stack: err.stack });
    throw err;
  }
}

async function _processDocumentOcr(docId, filePath, userId, mimeType) {
  logger.info(`OCR | start | doc: ${docId} | file: ${filePath} | mime: ${mimeType}`);
  try {
    // Extract text (for storage) and try vision-based vitals extraction in parallel
    const [{ text }, visionVitals] = await Promise.all([
      processDocument(filePath),
      extractVitalsWithVision(filePath, mimeType || ''),
    ]);

    if (!text || !text.trim()) {
      logger.warn(`OCR | no text extracted | doc: ${docId}`);
    } else {
      logger.info(`OCR | extracted ${text.length} chars | doc: ${docId}`);
    }

    // Vision succeeded → use it; vision returned null → fall back to text OCR
    let vitals;
    if (visionVitals !== null) {
      logger.info(`OCR | using Gemini Vision results | doc: ${docId}`);
      vitals = visionVitals;
    } else {
      logger.info(`OCR | vision unavailable, using text OCR | doc: ${docId}`);
      vitals = text ? await extractVitalsWithAI(text) : {};
    }

    const analysis = text ? analyzeDocumentText(text) : {};
    const vitalsFound = Object.keys(vitals);

    logger.info(`OCR | vitals found: [${vitalsFound.join(', ') || 'none'}] | type: ${analysis.document_type || 'none'} | doc: ${docId}`);

    await query(
      `UPDATE documents SET ocr_text = $1, extracted_vitals = $2 WHERE id = $3`,
      [text, vitalsFound.length > 0 ? JSON.stringify(vitals) : null, docId]
    );
    logger.info(`OCR | document updated | doc: ${docId}`);

    if (vitalsFound.length > 0) {
      await _saveExtractedVitals(userId, vitals, docId);
      logger.info(`OCR | saved ${vitalsFound.length} vitals | doc: ${docId}`);
    }
  } catch (err) {
    logger.error(`OCR | failed | doc: ${docId} | ${err.message}`, { stack: err.stack });
  }
}

async function _saveExtractedVitals(userId, vitals, documentId) {
  const { determineVitalStatus, getLoincCode } = require('../services/loinc.service');
  for (const [type, values] of Object.entries(vitals)) {
    if (!values || (typeof values === 'object' && Object.keys(values).length === 0)) continue;
    const normalizedValues = typeof values === 'number' ? { value: values } : values;
    // Use LOINC threshold if available, otherwise trust Gemini's status
    const loincStatus = determineVitalStatus(type, normalizedValues);
    const status = loincStatus !== 'unknown' ? loincStatus : (normalizedValues.status || 'unknown');
    const loincCode = getLoincCode(type);
    await query(
      `INSERT INTO vitals (user_id, type, values, status, loinc_code, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, JSON.stringify(normalizedValues), status, loincCode, 'document_ocr', `Extracted from document ${documentId}`]
    ).catch(err => logger.error(`_saveExtractedVitals | failed for type "${type}" | ${err.message}`, { stack: err.stack }));
  }
}

module.exports = { getDocuments, uploadDocument, deleteDocument, reanalyzeDocument };
