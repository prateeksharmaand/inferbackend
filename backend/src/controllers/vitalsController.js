const { query } = require('../config/database');
const { isAbnormal, checkBPAbnormal } = require('../services/vitalThresholdService');
const { sendAbnormalVitalAlert } = require('../services/notificationService');
const { getLoincInfo } = require('../services/loincService');

async function addVital(req, res, next) {
  try {
    const { profileId, vitalType, systolic, diastolic, glucoseLevel, glucoseUnit, measurementContext,
      weightKg, temperature, temperatureUnit, spo2Percentage, heartRate, heartRateMethod, notes, recordedAt } = req.body;

    let loincCode = null;
    let isAbnormalReading = false;

    const loincInfo = getLoincInfo(vitalType);
    if (loincInfo) loincCode = loincInfo.code;

    // Check abnormality per vital type
    if (vitalType === 'bp' && systolic && diastolic) {
      isAbnormalReading = await checkBPAbnormal(profileId, systolic, diastolic);
    } else if (vitalType === 'heart_rate' && heartRate) {
      isAbnormalReading = await isAbnormal(profileId, 'heart_rate', heartRate);
    } else if (vitalType === 'spo2' && spo2Percentage) {
      isAbnormalReading = await isAbnormal(profileId, 'spo2', spo2Percentage);
    } else if (vitalType === 'temperature' && temperature) {
      isAbnormalReading = await isAbnormal(profileId, 'temperature', temperature);
    } else if (vitalType === 'sugar' && glucoseLevel) {
      isAbnormalReading = await isAbnormal(profileId, `glucose_${measurementContext || 'random'}`, glucoseLevel);
    }

    const result = await query(
      `INSERT INTO vitals (profile_id, vital_type, systolic, diastolic, glucose_level, glucose_unit,
        measurement_context, weight_kg, temperature, temperature_unit, spo2_percentage, heart_rate,
        heart_rate_method, loinc_code, notes, recorded_at, is_abnormal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [profileId, vitalType, systolic, diastolic, glucoseLevel, glucoseUnit || 'mg/dL',
        measurementContext, weightKg, temperature, temperatureUnit || 'C', spo2Percentage,
        heartRate, heartRateMethod || 'manual', loincCode, notes, recordedAt || new Date(), isAbnormalReading]
    );

    const vital = result.rows[0];

    // Add to timeline
    await query(
      `INSERT INTO timeline_events (profile_id, event_type, title, reference_id, reference_type, event_date)
       VALUES ($1, 'vital_recorded', $2, $3, 'vital', $4)`,
      [profileId, buildVitalTitle(vitalType, req.body), vital.id, vital.recorded_at]
    );

    // Send alert if abnormal
    if (isAbnormalReading) {
      const profile = await query('SELECT full_name, account_id FROM profiles WHERE id = $1', [profileId]);
      if (profile.rows.length) {
        const { full_name, account_id } = profile.rows[0];
        await sendAbnormalVitalAlert(account_id, profileId, full_name, vitalType, getVitalValue(vitalType, req.body));
      }
    }

    res.status(201).json(vital);
  } catch (err) {
    next(err);
  }
}

async function getVitals(req, res, next) {
  try {
    const { profileId } = req.params;
    const { type, from, to, limit = 50, offset = 0 } = req.query;

    let sql = 'SELECT * FROM vitals WHERE profile_id = $1';
    const params = [profileId];
    let idx = 2;

    if (type) { sql += ` AND vital_type = $${idx++}`; params.push(type); }
    if (from) { sql += ` AND recorded_at >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND recorded_at <= $${idx++}`; params.push(to); }

    sql += ` ORDER BY recorded_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getVitalStats(req, res, next) {
  try {
    const { profileId } = req.params;
    const { type, period = '30d' } = req.query;

    const periodMap = { '7d': '7 days', '30d': '30 days', '90d': '90 days', '1y': '1 year' };
    const interval = periodMap[period] || '30 days';

    const result = await query(
      `SELECT
        vital_type,
        COUNT(*) as count,
        AVG(CASE WHEN vital_type = 'bp' THEN systolic END) as avg_systolic,
        AVG(CASE WHEN vital_type = 'bp' THEN diastolic END) as avg_diastolic,
        AVG(CASE WHEN vital_type = 'heart_rate' THEN heart_rate END) as avg_heart_rate,
        AVG(CASE WHEN vital_type = 'spo2' THEN spo2_percentage END) as avg_spo2,
        AVG(CASE WHEN vital_type = 'temperature' THEN temperature END) as avg_temperature,
        AVG(CASE WHEN vital_type = 'sugar' THEN glucose_level END) as avg_glucose,
        AVG(CASE WHEN vital_type = 'weight' THEN weight_kg END) as avg_weight,
        SUM(CASE WHEN is_abnormal THEN 1 ELSE 0 END) as abnormal_count
       FROM vitals
       WHERE profile_id = $1
         AND recorded_at >= NOW() - INTERVAL '${interval}'
         ${type ? 'AND vital_type = $2' : ''}
       GROUP BY vital_type`,
      type ? [profileId, type] : [profileId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getLatestVitals(req, res, next) {
  try {
    const { profileId } = req.params;

    const result = await query(
      `SELECT DISTINCT ON (vital_type) *
       FROM vitals WHERE profile_id = $1
       ORDER BY vital_type, recorded_at DESC`,
      [profileId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function deleteVital(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM vitals v USING profiles p
       WHERE v.id = $1 AND v.profile_id = p.id AND p.account_id = $2`,
      [req.params.vitalId, req.accountId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

function buildVitalTitle(type, body) {
  if (type === 'bp') return `Blood Pressure: ${body.systolic}/${body.diastolic} mmHg`;
  if (type === 'heart_rate') return `Heart Rate: ${body.heartRate} bpm`;
  if (type === 'spo2') return `SpO2: ${body.spo2Percentage}%`;
  if (type === 'temperature') return `Temperature: ${body.temperature}°${body.temperatureUnit || 'C'}`;
  if (type === 'sugar') return `Blood Sugar: ${body.glucoseLevel} ${body.glucoseUnit || 'mg/dL'}`;
  if (type === 'weight') return `Weight: ${body.weightKg} kg`;
  return `${type} recorded`;
}

function getVitalValue(type, body) {
  if (type === 'bp') return `${body.systolic}/${body.diastolic}`;
  if (type === 'heart_rate') return body.heartRate;
  if (type === 'spo2') return body.spo2Percentage;
  if (type === 'temperature') return body.temperature;
  if (type === 'sugar') return body.glucoseLevel;
  if (type === 'weight') return body.weightKg;
  return null;
}

module.exports = { addVital, getVitals, getVitalStats, getLatestVitals, deleteVital };
