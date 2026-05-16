const { query } = require('../config/database');

// Default thresholds for abnormality detection
const DEFAULT_THRESHOLDS = {
  systolic: { min: 90, max: 120, min_critical: 70, max_critical: 180 },
  diastolic: { min: 60, max: 80, min_critical: 40, max_critical: 120 },
  heart_rate: { min: 60, max: 100, min_critical: 40, max_critical: 150 },
  spo2: { min: 95, max: 100, min_critical: 88, max_critical: null },
  temperature: { min: 36.1, max: 37.2, min_critical: 35.0, max_critical: 40.0 },
  glucose_fasting: { min: 70, max: 100, min_critical: 55, max_critical: 300 },
  glucose_post_meal: { min: 70, max: 140, min_critical: 55, max_critical: 300 },
  weight_kg: { min: 40, max: 120, min_critical: 30, max_critical: 200 },
};

async function isAbnormal(profileId, vitalType, value, context = null) {
  let thresholds = null;

  const customKey = context === 'fasting' ? 'glucose_fasting' : context === 'post_meal' ? 'glucose_post_meal' : vitalType;

  const result = await query(
    `SELECT * FROM vital_thresholds WHERE (profile_id = $1 OR profile_id IS NULL) AND vital_type = $2
     ORDER BY is_custom DESC LIMIT 1`,
    [profileId, customKey]
  );

  if (result.rows.length) {
    thresholds = result.rows[0];
  } else {
    thresholds = DEFAULT_THRESHOLDS[customKey] || DEFAULT_THRESHOLDS[vitalType];
  }

  if (!thresholds) return false;

  if (value < thresholds.min_critical || (thresholds.max_critical && value > thresholds.max_critical)) {
    return true;
  }
  if (value < thresholds.min_normal || value > thresholds.max_normal) {
    return true;
  }

  return false;
}

async function checkBPAbnormal(profileId, systolic, diastolic) {
  const sysAbnormal = await isAbnormal(profileId, 'systolic', systolic);
  const diaAbnormal = await isAbnormal(profileId, 'diastolic', diastolic);
  return sysAbnormal || diaAbnormal;
}

module.exports = { isAbnormal, checkBPAbnormal };
