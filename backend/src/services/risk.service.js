const { query } = require('../config/database');
const { analyzeWithAI } = require('./ai.service');
const logger = require('../utils/logger');

// ── Rules ─────────────────────────────────────────────────────────────────────
// extract() handles BOTH manual-entry shape  (values.bpm / values.systolic)
// AND OCR-extracted shape (values.value) so lab-report vitals score correctly.

const RULES = [
  // Heart rate
  { types: ['heart_rate'],
    extract: v => v?.values?.bpm ?? v?.values?.value,
    weight: 30, category: 'cardiac',
    label: 'Tachycardia (HR > 120 bpm)', check: n => n > 120 },
  { types: ['heart_rate'],
    extract: v => v?.values?.bpm ?? v?.values?.value,
    weight: 18, category: 'cardiac',
    label: 'Elevated Heart Rate (100–120 bpm)', check: n => n > 100 && n <= 120 },
  { types: ['heart_rate'],
    extract: v => v?.values?.bpm ?? v?.values?.value,
    weight: 18, category: 'cardiac',
    label: 'Bradycardia (HR < 60 bpm)', check: n => n < 60 },

  // Blood pressure systolic — manual entry stores type=blood_pressure values.systolic
  //                          OCR stores type=blood_pressure_systolic values.value
  { types: ['blood_pressure'],
    extract: v => v?.values?.systolic,
    weight: 40, category: 'cardiovascular',
    label: 'Hypertensive Crisis (SBP ≥ 180 mmHg)', check: n => n >= 180 },
  { types: ['blood_pressure'],
    extract: v => v?.values?.systolic,
    weight: 28, category: 'cardiovascular',
    label: 'Stage 2 Hypertension (SBP 140–179 mmHg)', check: n => n >= 140 && n < 180 },
  { types: ['blood_pressure'],
    extract: v => v?.values?.systolic,
    weight: 18, category: 'cardiovascular',
    label: 'Stage 1 Hypertension (SBP 130–139 mmHg)', check: n => n >= 130 && n < 140 },
  { types: ['blood_pressure'],
    extract: v => v?.values?.systolic,
    weight: 8, category: 'cardiovascular',
    label: 'Elevated Blood Pressure (SBP 120–129 mmHg)', check: n => n >= 120 && n < 130 },

  // Blood pressure systolic — OCR shape
  { types: ['blood_pressure_systolic'],
    extract: v => v?.values?.value,
    weight: 40, category: 'cardiovascular',
    label: 'Hypertensive Crisis (SBP ≥ 180 mmHg)', check: n => n >= 180 },
  { types: ['blood_pressure_systolic'],
    extract: v => v?.values?.value,
    weight: 28, category: 'cardiovascular',
    label: 'Stage 2 Hypertension (SBP 140–179 mmHg)', check: n => n >= 140 && n < 180 },
  { types: ['blood_pressure_systolic'],
    extract: v => v?.values?.value,
    weight: 18, category: 'cardiovascular',
    label: 'Stage 1 Hypertension (SBP 130–139 mmHg)', check: n => n >= 130 && n < 140 },
  { types: ['blood_pressure_systolic'],
    extract: v => v?.values?.value,
    weight: 8, category: 'cardiovascular',
    label: 'Elevated Blood Pressure (SBP 120–129 mmHg)', check: n => n >= 120 && n < 130 },

  // Blood pressure diastolic — OCR shape
  { types: ['blood_pressure', 'blood_pressure_diastolic'],
    extract: v => v?.values?.diastolic ?? v?.values?.value,
    weight: 25, category: 'cardiovascular',
    label: 'High Diastolic Pressure (DBP ≥ 90 mmHg)', check: n => n >= 90 },

  // Glucose — manual: type=glucose values.value
  //           OCR:    type=fasting_glucose / glucose_fasting / glucose_random values.value
  { types: ['glucose', 'fasting_glucose', 'glucose_fasting', 'glucose_random', 'random_glucose', 'blood_glucose', 'glucose_pp', 'glucose_post_prandial', 'pp_glucose'],
    extract: v => v?.values?.value,
    weight: 35, category: 'metabolic',
    label: 'Diabetic Glucose Level (≥ 200 mg/dL)', check: n => n >= 200 },
  { types: ['glucose', 'fasting_glucose', 'glucose_fasting', 'glucose_random', 'random_glucose', 'blood_glucose', 'glucose_pp', 'glucose_post_prandial', 'pp_glucose'],
    extract: v => v?.values?.value,
    weight: 22, category: 'metabolic',
    label: 'Pre-diabetic Glucose (126–199 mg/dL)', check: n => n >= 126 && n < 200 },
  { types: ['glucose', 'fasting_glucose', 'glucose_fasting', 'glucose_random', 'random_glucose', 'blood_glucose'],
    extract: v => v?.values?.value,
    weight: 12, category: 'metabolic',
    label: 'Borderline Glucose (100–125 mg/dL)', check: n => n >= 100 && n < 126 },
  { types: ['glucose', 'fasting_glucose', 'glucose_fasting', 'glucose_random', 'random_glucose', 'blood_glucose'],
    extract: v => v?.values?.value,
    weight: 22, category: 'metabolic',
    label: 'Hypoglycemia (Glucose < 70 mg/dL)', check: n => n < 70 },

  // HbA1c — OCR only
  { types: ['hba1c', 'hemoglobin_a1c'],
    extract: v => v?.values?.value,
    weight: 30, category: 'metabolic',
    label: 'Diabetic HbA1c (≥ 6.5%)', check: n => n >= 6.5 },
  { types: ['hba1c', 'hemoglobin_a1c'],
    extract: v => v?.values?.value,
    weight: 15, category: 'metabolic',
    label: 'Pre-diabetic HbA1c (5.7–6.4%)', check: n => n >= 5.7 && n < 6.5 },

  // SpO2
  { types: ['spo2', 'oxygen_saturation'],
    extract: v => v?.values?.value,
    weight: 40, category: 'respiratory',
    label: 'Critical Oxygen Saturation (SpO2 < 90%)', check: n => n < 90 },
  { types: ['spo2', 'oxygen_saturation'],
    extract: v => v?.values?.value,
    weight: 22, category: 'respiratory',
    label: 'Low Oxygen Saturation (SpO2 90–94%)', check: n => n >= 90 && n < 95 },

  // Temperature
  { types: ['temperature'],
    extract: v => v?.values?.value,
    weight: 25, category: 'infection',
    label: 'High Fever (≥ 39 °C)', check: n => n >= 39 },
  { types: ['temperature'],
    extract: v => v?.values?.value,
    weight: 14, category: 'infection',
    label: 'Fever (38–38.9 °C)', check: n => n >= 38 && n < 39 },
  { types: ['temperature'],
    extract: v => v?.values?.value,
    weight: 14, category: 'infection',
    label: 'Hypothermia (< 36 °C)', check: n => n < 36 },

  // Cholesterol
  { types: ['total_cholesterol', 'cholesterol'],
    extract: v => v?.values?.value,
    weight: 20, category: 'cardiovascular',
    label: 'High Total Cholesterol (≥ 240 mg/dL)', check: n => n >= 240 },
  { types: ['total_cholesterol', 'cholesterol'],
    extract: v => v?.values?.value,
    weight: 10, category: 'cardiovascular',
    label: 'Borderline Cholesterol (200–239 mg/dL)', check: n => n >= 200 && n < 240 },
  { types: ['ldl_cholesterol', 'ldl'],
    extract: v => v?.values?.value,
    weight: 18, category: 'cardiovascular',
    label: 'High LDL Cholesterol (≥ 160 mg/dL)', check: n => n >= 160 },
  { types: ['triglycerides'],
    extract: v => v?.values?.value,
    weight: 15, category: 'cardiovascular',
    label: 'High Triglycerides (≥ 200 mg/dL)', check: n => n >= 200 },

  // Haemoglobin
  { types: ['hemoglobin', 'hb', 'hgb'],
    extract: v => v?.values?.value,
    weight: 20, category: 'blood',
    label: 'Anaemia — Low Haemoglobin (< 10 g/dL)', check: n => n < 10 },
  { types: ['hemoglobin', 'hb', 'hgb'],
    extract: v => v?.values?.value,
    weight: 10, category: 'blood',
    label: 'Mild Anaemia (10–12 g/dL)', check: n => n >= 10 && n < 12 },

  // Creatinine (kidney)
  { types: ['serum_creatinine', 'creatinine'],
    extract: v => v?.values?.value,
    weight: 20, category: 'kidney',
    label: 'High Creatinine — Kidney Stress (> 1.5 mg/dL)', check: n => n > 1.5 },
];

// ── Scoring ───────────────────────────────────────────────────────────────────

// Status-based weights for vitals not covered by a specific rule.
// Every extracted vital already has a status set by LOINC thresholds or Gemini.
const STATUS_WEIGHT = { critical: 25, high: 12, elevated: 8, low: 10 };

function _computeScore(vitalsMap) {
  const fired = new Set(); // prevent duplicate labels from multi-type rules
  const factors = [];
  let raw = 0;

  // 1. Apply specific threshold rules
  for (const rule of RULES) {
    for (const type of rule.types) {
      const vital = vitalsMap[type];
      if (!vital) continue;
      const val = rule.extract(vital);
      if (val === null || val === undefined || isNaN(Number(val))) continue;
      if (rule.check(Number(val))) {
        if (fired.has(rule.label)) break;
        fired.add(rule.label);
        // Mark all aliases as fired so status fallback doesn't double-count
        for (const t of rule.types) fired.add(`_status_${t}`);
        factors.push({ label: rule.label, weight: rule.weight, category: rule.category, value: Number(val) });
        raw += rule.weight;
        break;
      }
    }
  }

  // 2. Status-based fallback — score ANY vital marked high/critical/low
  //    that wasn't already handled by a specific rule above.
  for (const [type, vital] of Object.entries(vitalsMap)) {
    if (fired.has(`_status_${type}`)) continue; // already scored by a specific rule
    const status = vital.status;
    const weight = STATUS_WEIGHT[status];
    if (!weight) continue; // normal / unknown — skip
    const label = `${_fmt(type)} — ${status}`;
    if (fired.has(label)) continue;
    fired.add(label);
    fired.add(`_status_${type}`);
    const val = vital.values?.value ?? vital.values?.bpm ?? vital.values?.systolic;
    factors.push({ label, weight, category: _guessCategory(type), value: val ?? 0 });
    raw += weight;
  }

  return { score: Math.min(100, raw), factors };
}

function _fmt(key) {
  return key.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

function _guessCategory(type) {
  if (/glucose|hba1c|insulin|sugar/.test(type))                        return 'metabolic';
  if (/cholesterol|ldl|hdl|triglyceride|bp|blood_pressure|heart/.test(type)) return 'cardiovascular';
  if (/hemoglobin|wbc|rbc|platelet|hematocrit|neutrophil|lymphocyte/.test(type)) return 'blood';
  if (/creatinine|bun|urea|egfr|uric/.test(type))                      return 'kidney';
  if (/sgpt|sgot|alt|ast|bilirubin|albumin|alp|liver/.test(type))      return 'liver';
  if (/tsh|t3|t4|thyroid/.test(type))                                  return 'thyroid';
  if (/vitamin|ferritin|iron|folate/.test(type))                       return 'nutrition';
  if (/spo2|oxygen|respiratory/.test(type))                            return 'respiratory';
  if (/temperature|fever/.test(type))                                  return 'infection';
  return 'general';
}

function _scoreToLevel(score) {
  if (score >= 76) return 'critical';
  if (score >= 56) return 'high';
  if (score >= 31) return 'moderate';
  return 'low';
}

// ── Gemini narrative ──────────────────────────────────────────────────────────

async function _aiRecommendation(vitalsMap, factors, score, level, user) {
  const age = user.date_of_birth
    ? Math.floor((Date.now() - new Date(user.date_of_birth)) / (365.25 * 24 * 3600 * 1000))
    : null;

  const vitalsLines = Object.entries(vitalsMap).map(([type, v]) => {
    const val = v?.values?.value ?? v?.values?.bpm ?? v?.values?.systolic;
    const unit = v?.values?.unit ?? '';
    return `${type}: ${val ?? '?'} ${unit} (${v?.status ?? 'unknown'})`;
  }).join('\n');

  const factorLines = factors.length
    ? factors.map(f => `• ${f.label} (+${f.weight} pts)`).join('\n')
    : '• No risk factors detected';

  const prompt = `You are a clinical health advisor. Analyze the patient data and respond with ONLY a JSON object:
{
  "summary": "<2-sentence plain-language status summary>",
  "recommendations": ["<action 1>", "<action 2>", "<action 3>"],
  "urgent": <true|false>
}

Patient: Age ${age ?? 'Unknown'}, Gender ${user.gender ?? 'Unknown'}, Conditions: ${(user.conditions || []).join(', ') || 'None'}
Risk: ${score}/100 (${level.toUpperCase()})
Factors:\n${factorLines}
Vitals:\n${vitalsLines}

Be concise, non-alarmist, actionable. Do not diagnose. Return only the JSON.`;

  try {
    const raw = await analyzeWithAI(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        summary:         parsed.summary || '',
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        urgent:          Boolean(parsed.urgent),
      };
    }
  } catch (e) {
    logger.error('[Risk] Gemini parse error:', e.message);
  }
  return _fallbackRecommendation(level);
}

function _fallbackRecommendation(level) {
  const map = {
    low:      { summary: 'Your vital signs are within normal ranges. Keep up your healthy habits.', recommendations: ['Continue regular exercise', 'Maintain a balanced diet', 'Schedule your annual check-up'], urgent: false },
    moderate: { summary: 'Some vitals show readings that warrant attention. Monitor them closely.', recommendations: ['Check the flagged vitals again in 24 hours', 'Reduce sodium and processed food intake', 'Consult your doctor if readings persist'], urgent: false },
    high:     { summary: 'Multiple risk factors are present. Medical review is advised soon.', recommendations: ['Book a doctor appointment this week', 'Monitor vitals twice daily', 'Avoid strenuous activity until reviewed'], urgent: false },
    critical: { summary: 'Critical health indicators detected. Prompt medical attention is recommended.', recommendations: ['Seek medical attention today', 'Do not self-medicate', 'Keep someone informed of your condition'], urgent: true },
  };
  return map[level] || map.low;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function predictRisk(userId) {
  // Fetch the latest reading for EVERY vital type this user has recorded
  const rows = await query(
    `SELECT DISTINCT ON (type) *
     FROM vitals
     WHERE user_id = $1
     ORDER BY type, recorded_at DESC`,
    [userId],
  );

  // Build type → vital map
  const vitalsMap = {};
  for (const row of rows.rows) vitalsMap[row.type] = row;

  logger.info(`[Risk] ${userId} | ${rows.rows.length} distinct vital types: [${Object.keys(vitalsMap).join(', ')}]`);

  // Fetch user profile
  const userResult = await query(
    'SELECT date_of_birth, gender, conditions FROM users WHERE id = $1',
    [userId],
  );
  const user = userResult.rows[0] || {};

  const { score, factors } = _computeScore(vitalsMap);
  const level = _scoreToLevel(score);

  logger.info(`[Risk] ${userId} | score: ${score} | level: ${level} | factors: ${factors.length}`);

  const aiResult = await _aiRecommendation(vitalsMap, factors, score, level, user);

  const result = await query(
    `INSERT INTO risk_predictions (user_id, score, level, factors, recommendation, computed_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET score = $2, level = $3, factors = $4, recommendation = $5, computed_at = NOW()
     RETURNING *`,
    [userId, score, level, JSON.stringify(factors), JSON.stringify(aiResult)],
  );

  return result.rows[0];
}

async function getCachedRisk(userId) {
  const result = await query('SELECT * FROM risk_predictions WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

module.exports = { predictRisk, getCachedRisk };
