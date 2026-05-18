const { query } = require('../config/database');
const { determineVitalStatus, getLoincCode } = require('../services/loinc.service');
const { addTimelineEvent } = require('../services/timeline.service');
const { sendVitalAlert } = require('../services/notification.service');

async function getVitals(req, res) {
  const { type, from, to, limit = 50, offset = 0 } = req.query;
  let sql = 'SELECT * FROM vitals WHERE user_id = $1';
  const params = [req.user.id];
  let idx = 2;
  if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
  if (from) { sql += ` AND recorded_at >= $${idx++}`; params.push(from); }
  if (to) { sql += ` AND recorded_at <= $${idx++}`; params.push(to); }
  sql += ` ORDER BY recorded_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(parseInt(limit), parseInt(offset));
  const result = await query(sql, params);
  res.json({ vitals: result.rows, total: result.rowCount });
}

async function getLatestVitals(req, res) {
  const types = ['blood_pressure', 'glucose', 'weight', 'spo2', 'heart_rate', 'temperature'];
  const latest = {};
  await Promise.all(types.map(async (type) => {
    const result = await query('SELECT * FROM vitals WHERE user_id = $1 AND type = $2 ORDER BY recorded_at DESC LIMIT 1', [req.user.id, type]);
    if (result.rows.length > 0) latest[type] = result.rows[0];
  }));
  res.json(latest);
}

async function addVital(req, res) {
  const { type, values, recorded_at, notes, source = 'manual' } = req.body;
  if (!type || !values) return res.status(400).json({ error: 'Type and values are required' });
  const status = determineVitalStatus(type, values);
  const loincCode = getLoincCode(type);
  const unit = _getUnit(type);
  const result = await query(
    `INSERT INTO vitals (user_id, type, values, unit, status, loinc_code, recorded_at, notes, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.user.id, type, JSON.stringify(values), unit, status, loincCode, recorded_at || new Date(), notes, source]
  );
  const vital = result.rows[0];
  await addTimelineEvent(req.user.id, 'vital', `${_formatType(type)} Recorded`, `${_displayValue(type, values)} ${unit}`, values, new Date(recorded_at || Date.now()), vital.id, 'vital');
  if (['critical', 'high', 'low'].includes(status)) {
    await sendVitalAlert(req.user.id, type, _displayValue(type, values), status).catch(() => {});
  }
  res.status(201).json({ vital });
}

async function deleteVital(req, res) {
  const result = await query('DELETE FROM vitals WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Vital not found' });
  res.json({ message: 'Deleted successfully' });
}

async function getVitalStats(req, res) {
  const { type, days = 30 } = req.query;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await query(
    `SELECT type, COUNT(*) as count, MIN(recorded_at) as first, MAX(recorded_at) as last FROM vitals
     WHERE user_id = $1 AND ($2::text IS NULL OR type = $2) AND recorded_at >= $3 GROUP BY type`,
    [req.user.id, type || null, from]
  );
  res.json({ stats: result.rows });
}

function _getUnit(type) {
  const units = { blood_pressure: 'mmHg', glucose: 'mg/dL', weight: 'kg', spo2: '%', heart_rate: 'bpm', temperature: '°C' };
  return units[type] || '';
}

function _formatType(type) {
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function _displayValue(type, values) {
  if (type === 'blood_pressure') return `${values.systolic}/${values.diastolic}`;
  return String(values.value || values.bpm || Object.values(values)[0]);
}

async function getAllLatestVitals(req, res) {
  // One row per vital type — the most recently recorded
  const result = await query(
    `SELECT DISTINCT ON (type) id, type, values, unit, status, loinc_code, recorded_at, source
     FROM vitals
     WHERE user_id = $1
     ORDER BY type, recorded_at DESC`,
    [req.user.id],
  );
  const vitals = {};
  for (const row of result.rows) {
    vitals[row.type] = row; // JSONB values field is auto-parsed by pg
  }
  res.json({ vitals });
}

module.exports = { getVitals, getLatestVitals, getAllLatestVitals, addVital, deleteVital, getVitalStats };
