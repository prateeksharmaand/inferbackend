const { query } = require('../config/database');

async function getTimeline(req, res) {
  const { from, to, event_type, limit = 50, offset = 0 } = req.query;
  let sql = 'SELECT * FROM timeline_events WHERE user_id = $1';
  const params = [req.user.id];
  let idx = 2;
  if (from) { sql += ` AND event_date >= $${idx++}`; params.push(from); }
  if (to) { sql += ` AND event_date <= $${idx++}`; params.push(to); }
  if (event_type) { sql += ` AND event_type = $${idx++}`; params.push(event_type); }
  sql += ` ORDER BY event_date DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(parseInt(limit), parseInt(offset));
  const result = await query(sql, params);
  res.json({ events: result.rows });
}

async function getOcrAnalysis(req, res) {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });
  const { extractVitalsFromText } = require('../services/vitals-extractor.service');
  const { analyzeDocumentText } = require('../services/ocr.service');
  const vitals = extractVitalsFromText(text);
  const analysis = analyzeDocumentText(text);
  res.json({ vitals, ...analysis, confidence: Object.keys(vitals).length > 0 ? 0.85 : 0.4 });
}

module.exports = { getTimeline, getOcrAnalysis };
