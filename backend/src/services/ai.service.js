const axios = require('axios');
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

async function extractVitalsWithAI(ocrText) {
  if (!process.env.GEMINI_API_KEY) {
    logger.warn('[Gemini] GEMINI_API_KEY not set — skipping AI vitals extraction');
    return {};
  }

  // Cap at 25000 chars to stay well within token limits
  const trimmedText = ocrText.length > 25000 ? ocrText.substring(0, 25000) : ocrText;

  const prompt = `You are a medical document parser. Extract EVERY numeric lab test result and vital sign from the document text below — do not skip any value.

Include ALL of the following categories when present:
- Blood glucose: fasting glucose, random glucose, post-prandial glucose, HbA1c
- Lipid panel: total cholesterol, HDL, LDL, VLDL, triglycerides, non-HDL cholesterol
- CBC: hemoglobin, hematocrit/PCV, RBC count, WBC/TLC, platelets, MCV, MCH, MCHC, RDW, neutrophils, lymphocytes, monocytes, eosinophils, basophils
- Liver function: SGOT/AST, SGPT/ALT, ALP, total bilirubin, direct bilirubin, indirect bilirubin, albumin, total protein, GGT
- Kidney function: serum creatinine, BUN/urea, uric acid, eGFR, sodium, potassium, chloride, calcium
- Thyroid: TSH, T3, T4, free T3, free T4
- Vitamins & minerals: vitamin D, vitamin B12, folate, ferritin, serum iron, TIBC
- Vitals: blood pressure systolic, blood pressure diastolic, heart rate, SpO2, temperature, weight, height, BMI
- Any other numeric result present in the document

Rules:
- Use snake_case for name (e.g. "total_cholesterol", "fasting_glucose", "blood_pressure_systolic")
- For blood pressure list systolic and diastolic as SEPARATE entries: blood_pressure_systolic and blood_pressure_diastolic
- Include reference_min and reference_max if a reference range is printed in the document
- Status must be one of: normal, high, low, critical, unknown
- If the document has a header row like "Test | Result | Unit | Reference Range", parse each data row
- Do NOT skip values just because they appear in a table or because they seem redundant

Document text:
${trimmedText}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
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
      },
    },
  };

  logger.info(`[Gemini] extractVitalsWithAI | text length: ${trimmedText.length} chars`);

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 },
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = response.data?.candidates?.[0]?.finishReason;
    logger.info(`[Gemini] extractVitalsWithAI | raw length: ${raw.length} | finishReason: ${finishReason}`);
    logger.info(`[Gemini] extractVitalsWithAI | raw: ${raw}`);

    let arr = null;
    try {
      arr = JSON.parse(raw);
    } catch (_) {
      // Response was truncated — recover all complete objects from the partial array
      arr = _recoverPartialArray(raw);
      logger.warn(`[Gemini] extractVitalsWithAI | JSON truncated, recovered ${arr.length} items from partial response`);
    }

    if (!Array.isArray(arr) || arr.length === 0) {
      logger.warn('[Gemini] extractVitalsWithAI | no vitals recovered');
      return {};
    }

    // Convert array → { name: { value, unit, status } } for _saveExtractedVitals
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

    logger.info(`[Gemini] extractVitalsWithAI | extracted ${Object.keys(vitals).length} vitals: [${Object.keys(vitals).join(', ')}]`);
    return vitals;
  } catch (e) {
    logger.error(`[Gemini] extractVitalsWithAI | failed: ${e.message}`, { status: e.response?.status, data: JSON.stringify(e.response?.data) });
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

module.exports = { analyzeWithAI, extractVitalsWithAI };
