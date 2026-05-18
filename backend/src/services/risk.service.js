const { query } = require('../config/database');
const { analyzeWithAI } = require('./ai.service');
const logger = require('../utils/logger');

// ── Rule definitions ──────────────────────────────────────────────────────────
// Each rule targets one vital type, extracts a numeric value, and assigns a
// risk weight (0-100 additive, capped at 100 total).

const RULES = [
  // Heart rate
  { type: 'heart_rate', extract: v => v?.values?.bpm, weight: 30, category: 'cardiac',
    label: 'Tachycardia (HR > 120 bpm)', check: n => n > 120 },
  { type: 'heart_rate', extract: v => v?.values?.bpm, weight: 18, category: 'cardiac',
    label: 'Elevated Heart Rate (100–120 bpm)', check: n => n > 100 && n <= 120 },
  { type: 'heart_rate', extract: v => v?.values?.bpm, weight: 18, category: 'cardiac',
    label: 'Bradycardia (HR < 60 bpm)', check: n => n < 60 },

  // Blood pressure — systolic
  { type: 'blood_pressure', extract: v => v?.values?.systolic, weight: 40, category: 'cardiovascular',
    label: 'Hypertensive Crisis (SBP ≥ 180 mmHg)', check: n => n >= 180 },
  { type: 'blood_pressure', extract: v => v?.values?.systolic, weight: 28, category: 'cardiovascular',
    label: 'Stage 2 Hypertension (SBP 140–179 mmHg)', check: n => n >= 140 && n < 180 },
  { type: 'blood_pressure', extract: v => v?.values?.systolic, weight: 18, category: 'cardiovascular',
    label: 'Stage 1 Hypertension (SBP 130–139 mmHg)', check: n => n >= 130 && n < 140 },
  { type: 'blood_pressure', extract: v => v?.values?.systolic, weight: 8, category: 'cardiovascular',
    label: 'Elevated Blood Pressure (SBP 120–129 mmHg)', check: n => n >= 120 && n < 130 },

  // Blood pressure — diastolic
  { type: 'blood_pressure', extract: v => v?.values?.diastolic, weight: 25, category: 'cardiovascular',
    label: 'High Diastolic Pressure (DBP ≥ 90 mmHg)', check: n => n >= 90 },

  // Glucose
  { type: 'glucose', extract: v => v?.values?.value, weight: 35, category: 'metabolic',
    label: 'Diabetic Glucose Level (≥ 200 mg/dL)', check: n => n >= 200 },
  { type: 'glucose', extract: v => v?.values?.value, weight: 22, category: 'metabolic',
    label: 'Pre-diabetic Glucose (126–199 mg/dL)', check: n => n >= 126 && n < 200 },
  { type: 'glucose', extract: v => v?.values?.value, weight: 12, category: 'metabolic',
    label: 'Borderline Glucose (100–125 mg/dL)', check: n => n >= 100 && n < 126 },
  { type: 'glucose', extract: v => v?.values?.value, weight: 22, category: 'metabolic',
    label: 'Hypoglycemia (Glucose < 70 mg/dL)', check: n => n < 70 },

  // SpO2
  { type: 'spo2', extract: v => v?.values?.value, weight: 40, category: 'respiratory',
    label: 'Critical Oxygen Saturation (SpO2 < 90%)', check: n => n < 90 },
  { type: 'spo2', extract: v => v?.values?.value, weight: 22, category: 'respiratory',
    label: 'Low Oxygen Saturation (SpO2 90–94%)', check: n => n >= 90 && n < 95 },

  // Temperature
  { type: 'temperature', extract: v => v?.values?.value, weight: 25, category: 'infection',
    label: 'High Fever (≥ 39 °C)', check: n => n >= 39 },
  { type: 'temperature', extract: v => v?.values?.value, weight: 14, category: 'infection',
    label: 'Fever (38–38.9 °C)', check: n => n >= 38 && n < 39 },
  { type: 'temperature', extract: v => v?.values?.value, weight: 14, category: 'infection',
    label: 'Hypothermia (< 36 °C)', check: n => n < 36 },
];

// ── Scoring ───────────────────────────────────────────────────────────────────

function _computeScore(latestVitals) {
  const factors = [];
  let raw = 0;

  for (const rule of RULES) {
    const vital = latestVitals[rule.type];
    if (!vital) continue;
    const val = rule.extract(vital);
    if (val === null || val === undefined || isNaN(Number(val))) continue;
    if (rule.check(Number(val))) {
      factors.push({ label: rule.label, weight: rule.weight, category: rule.category, value: Number(val) });
      raw += rule.weight;
    }
  }

  return { score: Math.min(100, raw), factors };
}

function _scoreToLevel(score) {
  if (score >= 76) return 'critical';
  if (score >= 56) return 'high';
  if (score >= 31) return 'moderate';
  return 'low';
}

// ── Gemini narrative ──────────────────────────────────────────────────────────

async function _aiRecommendation(latestVitals, factors, score, level, user) {
  const age = user.date_of_birth
    ? Math.floor((Date.now() - new Date(user.date_of_birth)) / (365.25 * 24 * 3600 * 1000))
    : null;

  const vitalsLines = Object.entries(latestVitals).map(([type, v]) => {
    switch (type) {
      case 'blood_pressure': return `Blood Pressure: ${v.values?.systolic}/${v.values?.diastolic} mmHg (${v.status})`;
      case 'heart_rate':     return `Heart Rate: ${v.values?.bpm} bpm (${v.status})`;
      case 'glucose':        return `Glucose: ${v.values?.value} mg/dL (${v.status})`;
      case 'spo2':           return `SpO2: ${v.values?.value}% (${v.status})`;
      case 'temperature':    return `Temperature: ${v.values?.value} °C (${v.status})`;
      default:               return `${type}: ${JSON.stringify(v.values)} (${v.status})`;
    }
  }).join('\n');

  const factorLines = factors.length
    ? factors.map(f => `• ${f.label} (+${f.weight} pts)`).join('\n')
    : '• No risk factors detected';

  const prompt = `You are a clinical health advisor. Analyze the patient data below and respond with a JSON object having exactly these fields:
{
  "summary": "<2-sentence plain-language status summary>",
  "recommendations": ["<action 1>", "<action 2>", "<action 3>"],
  "urgent": <true|false>
}

Patient:
- Age: ${age ?? 'Unknown'} years
- Gender: ${user.gender ?? 'Unknown'}
- Known conditions: ${(user.conditions || []).join(', ') || 'None'}

Vitals:
${vitalsLines}

Risk score: ${score}/100 (${level.toUpperCase()})
Contributing factors:
${factorLines}

Rules: be concise, non-alarmist, actionable. Do not diagnose. Return only the JSON object.`;

  try {
    const raw = await analyzeWithAI(prompt);
    // Extract JSON from the response
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        summary: parsed.summary || '',
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        urgent: Boolean(parsed.urgent),
      };
    }
  } catch (e) {
    logger.error('[Risk] Gemini parse error:', e.message);
  }
  return _fallbackRecommendation(level, factors);
}

function _fallbackRecommendation(level, _factors) {
  const map = {
    low:      { summary: 'Your vital signs are within normal ranges. Keep up your healthy habits.', recommendations: ['Continue regular exercise', 'Maintain a balanced diet', 'Schedule your annual check-up'], urgent: false },
    moderate: { summary: 'Some vitals show readings that warrant attention. Monitor them closely.', recommendations: ['Check the flagged vitals again in 24 hours', 'Reduce sodium and processed food intake', 'Consult your doctor if readings persist'], urgent: false },
    high:     { summary: 'Multiple risk factors are present in your health data. Medical review is advised.', recommendations: ['Book a doctor appointment this week', 'Monitor vitals twice daily', 'Avoid strenuous activity until reviewed'], urgent: false },
    critical: { summary: 'Critical health indicators detected. Prompt medical attention is recommended.', recommendations: ['Seek medical attention today', 'Do not self-medicate', 'Keep someone informed of your condition'], urgent: true },
  };
  return map[level] || map.low;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function predictRisk(userId) {
  // Fetch latest vitals for each type
  const vitalTypes = ['heart_rate', 'blood_pressure', 'glucose', 'spo2', 'temperature', 'weight'];
  const latestVitals = {};
  await Promise.all(vitalTypes.map(async (type) => {
    const result = await query(
      'SELECT * FROM vitals WHERE user_id = $1 AND type = $2 ORDER BY recorded_at DESC LIMIT 1',
      [userId, type],
    );
    if (result.rows.length > 0) latestVitals[type] = result.rows[0];
  }));

  // Fetch user profile context
  const userResult = await query(
    'SELECT date_of_birth, gender, conditions FROM users WHERE id = $1',
    [userId],
  );
  const user = userResult.rows[0] || {};

  // Rule-based scoring
  const { score, factors } = _computeScore(latestVitals);
  const level = _scoreToLevel(score);

  // AI narrative
  const aiResult = await _aiRecommendation(latestVitals, factors, score, level, user);

  // Upsert result
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
