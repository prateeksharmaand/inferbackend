const axios = require('axios');
const fs = require('fs');
const logger = require('../utils/logger');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function analyzeWithAI(message, history = [], systemPrompt = '') {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set — using fallback');
    return _fallbackResponse(message);
  }

  const contents = [
    ...history.slice(-10).map(h => ({
      role: h.is_user ? 'user' : 'model',
      parts: [{ text: h.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const body = {
    contents,
    generationConfig: { maxOutputTokens: 1024 },
  };

  // systemInstruction is camelCase in Gemini REST API
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  console.log('[Gemini] REQUEST:', JSON.stringify(body, null, 2));

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
    );

    console.log('[Gemini] RESPONSE:', JSON.stringify(response.data, null, 2));

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('[Gemini] Unexpected response shape:', JSON.stringify(response.data));
      return _fallbackResponse(message);
    }
    return text;
  } catch (e) {
    if (e.response?.status === 429) return 'I am currently busy. Please try again in a moment.';
    console.error('[Gemini] ERROR:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    return _fallbackResponse(message);
  }
}

function _fallbackResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes('blood pressure') || lower.includes('bp') || lower.includes('hypertension')) {
    return 'Blood pressure is the force of blood against artery walls. Normal is below 120/80 mmHg. High blood pressure (hypertension) is 140/90 or above. It can be managed with lifestyle changes and medication. Please consult your doctor for personalized advice.';
  }
  if (lower.includes('diabetes') || lower.includes('glucose') || lower.includes('sugar')) {
    return 'Blood glucose levels help diagnose and monitor diabetes. Fasting glucose: Normal <100 mg/dL, Prediabetes 100-125 mg/dL, Diabetes ≥126 mg/dL. Management includes diet, exercise, and medication. Consult your doctor for personalized treatment.';
  }
  if (lower.includes('heart') || lower.includes('pulse') || lower.includes('bpm')) {
    return 'Normal resting heart rate is 60-100 BPM. Athletes may have lower rates. Factors affecting heart rate include fitness, medications, and stress. Consult a doctor if you experience persistent abnormal heart rates.';
  }
  if (lower.includes('oxygen') || lower.includes('spo2')) {
    return 'Blood oxygen saturation (SpO2) measures oxygen in your blood. Normal range is 95-100%. Below 90% requires medical attention. Conditions like COPD or COVID-19 can affect oxygen levels.';
  }
  return 'I\'m here to help with your health questions. For specific medical concerns, please consult your healthcare provider. I can provide general health information about blood pressure, glucose, heart rate, and other vital signs.';
}

// ─── Shared prompt & schema ───────────────────────────────────────────────────

const VITALS_EXTRACT_PROMPT = `You are a medical document parser. Extract EVERY numeric lab test result and vital sign — do not skip any value.

Include ALL of the following categories when present:
- Blood glucose: fasting_glucose, glucose_random, glucose_post_prandial, hba1c
- Lipid panel: total_cholesterol, hdl_cholesterol, ldl_cholesterol, vldl_cholesterol, triglycerides, non_hdl_cholesterol
- CBC: hemoglobin, hematocrit, rbc_count, wbc_count, platelet_count, mcv, mch, mchc, rdw, neutrophils, lymphocytes, monocytes, eosinophils, basophils
- Liver function (LFT): sgot, sgpt, alp, total_bilirubin, direct_bilirubin, indirect_bilirubin, albumin, total_protein, ggt
- Kidney function (KFT): serum_creatinine, bun, uric_acid, egfr, sodium, potassium, chloride, calcium
- Thyroid: tsh, t3, t4, free_t3, free_t4
- Vitamins & minerals: vitamin_d, vitamin_b12, folate, ferritin, serum_iron, tibc
- Vitals: blood_pressure_systolic, blood_pressure_diastolic, heart_rate, spo2, temperature, weight, height, bmi
- Any other numeric result present

REFERENCE RANGE — THIS IS MANDATORY:
Lab reports always have a reference range column (labelled "Biological Reference Interval", "Normal Range", "Reference Range", "Ref. Range", or similar).
For EVERY test you must read that column and set reference_min and reference_max to the lower and upper bound numbers.
Example: if the reference range column shows "4.5 - 5.5" then reference_min = 4.5 and reference_max = 5.5.
Example: if it shows "< 5.7" then reference_min = 0 and reference_max = 5.7.
Example: if it shows "> 60" then reference_min = 60 and reference_max = 999.
Only omit reference_min and reference_max if the column is completely absent from the document.

Other rules:
- name must be snake_case (e.g. "total_cholesterol", "fasting_glucose")
- For blood pressure output TWO separate entries: blood_pressure_systolic and blood_pressure_diastolic
- status: normal | high | low | critical | unknown
- Parse EVERY row of every table — do not stop after the first section`;

const VITALS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name:          { type: 'string' },
      value:         { type: 'number' },
      unit:          { type: 'string' },
      status:        { type: 'string', enum: ['normal', 'high', 'low', 'critical', 'unknown'] },
      reference_min: { type: 'number' },
      reference_max: { type: 'number' },
    },
    required: ['name', 'value', 'unit', 'status'],
  },
};

const VISION_SUPPORTED = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png',
  'image/webp', 'image/heic', 'image/heif', 'image/gif',
]);

// Parse Gemini JSON response (with truncation recovery) → vitals map
function _parseVitalsResponse(raw, tag) {
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (_) {
    arr = _recoverPartialArray(raw);
    logger.warn(`[${tag}] JSON truncated — recovered ${arr.length} items`);
  }
  if (!Array.isArray(arr) || arr.length === 0) return {};

  const vitals = {};
  for (const item of arr) {
    if (item.name && typeof item.value === 'number') {
      vitals[item.name] = {
        value: item.value,
        unit: item.unit || '',
        status: item.status || 'unknown',
        ...(typeof item.reference_min === 'number' && { reference_min: item.reference_min }),
        ...(typeof item.reference_max === 'number' && { reference_max: item.reference_max }),
      };
    }
  }
  return vitals;
}

// ─── Vision extraction (sends actual file to Gemini) ─────────────────────────

async function extractVitalsWithVision(filePath, mimeType) {
  if (!process.env.GEMINI_API_KEY) return null;

  const mime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  if (!VISION_SUPPORTED.has(mime)) {
    logger.warn(`[Gemini Vision] Unsupported MIME: ${mimeType} — will fall back to text OCR`);
    return null;
  }

  let fileBuffer;
  try { fileBuffer = fs.readFileSync(filePath); }
  catch (err) { logger.error(`[Gemini Vision] Cannot read file: ${err.message}`); return null; }

  const sizeKB = (fileBuffer.length / 1024).toFixed(1);
  if (fileBuffer.length > 20 * 1024 * 1024) {
    logger.warn(`[Gemini Vision] File too large (${sizeKB} KB) — falling back to text OCR`);
    return null;
  }

  logger.info(`[Gemini Vision] Sending ${sizeKB} KB (${mime}) to Gemini`);

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: mime, data: fileBuffer.toString('base64') } },
        { text: VITALS_EXTRACT_PROMPT },
      ],
    }],
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 1,           // required when thinkingBudget = 0
      responseMimeType: 'application/json',
      responseSchema: VITALS_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },  // disable thinking — saves all tokens for output
    },
  };

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 180000 },
    );
    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = response.data?.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') logger.warn(`[Gemini Vision] Hit MAX_TOKENS — output truncated at ${raw.length} chars`);
    logger.info(`[Gemini Vision] raw length: ${raw.length} | finishReason: ${finishReason}`);

    const vitals = _parseVitalsResponse(raw, 'Gemini Vision');
    logger.info(`[Gemini Vision] extracted ${Object.keys(vitals).length} vitals: [${Object.keys(vitals).join(', ')}]`);
    return vitals;
  } catch (e) {
    logger.error(`[Gemini Vision] failed: ${e.message}`, { status: e.response?.status, data: JSON.stringify(e.response?.data) });
    return null; // null = caller should fall back to text OCR
  }
}

// ─── Text-based extraction (fallback when vision unavailable) ─────────────────

async function extractVitalsWithAI(ocrText) {
  if (!process.env.GEMINI_API_KEY) {
    logger.warn('[Gemini] GEMINI_API_KEY not set — skipping AI vitals extraction');
    return {};
  }

  const trimmedText = ocrText.length > 25000 ? ocrText.substring(0, 25000) : ocrText;
  const textPrompt = `${VITALS_EXTRACT_PROMPT}\n\nDocument text:\n${trimmedText}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: textPrompt }] }],
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 1,           // required when thinkingBudget = 0
      responseMimeType: 'application/json',
      responseSchema: VITALS_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },  // disable thinking — saves all tokens for output
    },
  };

  logger.info(`[Gemini Text] extractVitalsWithAI | text length: ${trimmedText.length} chars`);

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 90000 },
    );
    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = response.data?.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') logger.warn(`[Gemini Text] Hit MAX_TOKENS — output truncated at ${raw.length} chars`);
    logger.info(`[Gemini Text] raw length: ${raw.length} | finishReason: ${finishReason}`);

    const vitals = _parseVitalsResponse(raw, 'Gemini Text');
    logger.info(`[Gemini Text] extracted ${Object.keys(vitals).length} vitals: [${Object.keys(vitals).join(', ')}]`);
    return vitals;
  } catch (e) {
    logger.error(`[Gemini Text] failed: ${e.message}`, { status: e.response?.status, data: JSON.stringify(e.response?.data) });
    return {};
  }
}

// Recovers all complete JSON objects from a truncated array string like [{...},{...}, {"na
function _recoverPartialArray(raw) {
  const results = [];
  const objPattern = /\{[^{}]*\}/g;
  let match;
  while ((match = objPattern.exec(raw)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.name && typeof obj.value === 'number') results.push(obj);
    } catch (_) {}
  }
  return results;
}

module.exports = { analyzeWithAI, extractVitalsWithAI, extractVitalsWithVision };
