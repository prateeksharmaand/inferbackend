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

  const prompt = `You are a medical data extractor. Extract ALL vital signs and lab values from the following medical document text.

Return ONLY a valid JSON object with no explanation or markdown. Each key is the vital/lab name in snake_case (e.g. hemoglobin, blood_pressure, glucose_fasting, total_cholesterol, wbc, platelets, sgot, tsh, vitamin_d), and each value is an object with:
- "value": numeric value (number type, not string)
- "unit": unit string (e.g. "g/dL", "mg/dL", "U/L")
- "status": "normal", "high", "low", "critical", or "unknown" based on standard reference ranges

For blood pressure use: { "systolic": 120, "diastolic": 80, "unit": "mmHg", "status": "normal" }
If no vitals are found return {}.

Document text:
${ocrText}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
  };

  logger.info('[Gemini] extractVitalsWithAI | sending OCR text for vitals extraction');

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 },
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    logger.info(`[Gemini] extractVitalsWithAI | raw response: ${raw.substring(0, 300)}`);

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const vitals = JSON.parse(cleaned);
    logger.info(`[Gemini] extractVitalsWithAI | extracted ${Object.keys(vitals).length} vitals: [${Object.keys(vitals).join(', ')}]`);
    return vitals;
  } catch (e) {
    logger.error(`[Gemini] extractVitalsWithAI | failed: ${e.message}`, { status: e.response?.status, data: e.response?.data });
    return {};
  }
}

module.exports = { analyzeWithAI, extractVitalsWithAI };
