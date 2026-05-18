const axios = require('axios');
const logger = require('../utils/logger');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:      { type: 'integer' },
          text:    { type: 'string' },
          type:    { type: 'string', enum: ['single_choice', 'multiple_choice'] },
          options: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'text', 'type', 'options'],
      },
    },
  },
  required: ['questions'],
};

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    risk_level:         { type: 'string', enum: ['low', 'moderate', 'high', 'critical'] },
    risk_score:         { type: 'integer' },
    summary:            { type: 'string' },
    findings:           { type: 'array', items: { type: 'string' } },
    recommendations:    { type: 'array', items: { type: 'string' } },
    warning_signs:      { type: 'array', items: { type: 'string' } },
    when_to_see_doctor: { type: 'string' },
  },
  required: ['risk_level', 'risk_score', 'summary', 'findings', 'recommendations', 'warning_signs', 'when_to_see_doctor'],
};

async function _callGemini(prompt, schema) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 1,
      responseMimeType: 'application/json',
      responseSchema: schema,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const response = await axios.post(
    `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
    body,
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return JSON.parse(text);
}

async function generateQuestions(req, res) {
  const { category, subcategory } = req.body;
  if (!category || !subcategory) {
    return res.status(400).json({ error: 'category and subcategory are required' });
  }

  const prompt = `You are a medical assessment expert. Generate exactly 6 health assessment questions for the specific subcategory "${subcategory}" under the broader health category "${category}".

Rules:
- Questions must be STRICTLY and ONLY about "${subcategory}" — absolutely no questions about other topics
- Mix of single_choice (one answer only) and multiple_choice (multiple answers allowed) — label clearly
- Each question must have 3 to 5 answer options
- Questions assess health risk level for this specific condition
- Use plain, patient-friendly language — avoid jargon
- Progress logically: start with symptom presence, move to frequency/severity, then impact/duration
- Do NOT ask for personal identifying information (name, DOB, etc.)
- Question 1: primary symptom or main concern presence
- Question 6: impact on daily life or duration/when symptoms started
- Include at least 2 multiple_choice questions`;

  try {
    const data = await _callGemini(prompt, QUESTIONS_SCHEMA);
    logger.info(`[Assessment] Generated ${data.questions?.length} questions for "${category}" > "${subcategory}"`);
    res.json({ questions: data.questions || [] });
  } catch (e) {
    logger.error('[Assessment] generateQuestions error:', e.message);
    res.status(500).json({ error: 'Failed to generate questions. Please try again.' });
  }
}

async function analyzeAnswers(req, res) {
  const { category, subcategory, answers } = req.body;
  if (!category || !subcategory || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'category, subcategory, and non-empty answers array are required' });
  }

  const qaLines = answers.map((a, i) => {
    const ans = Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer);
    return `Q${i + 1}: ${a.question}\nAnswer: ${ans || '(skipped)'}`;
  }).join('\n\n');

  const prompt = `You are a clinical health advisor. Analyze the following self-assessment responses for the topic "${subcategory}" (under health category "${category}") and provide a structured health risk assessment.

Assessment Responses:
${qaLines}

Provide a JSON result with:
- risk_level: "low", "moderate", "high", or "critical" — based strictly on the answers
- risk_score: integer 0–100 (0=no risk, 100=maximum risk)
- summary: 2–3 plain-language sentences summarizing the overall health picture for "${subcategory}"
- findings: 2–4 key specific observations derived from the answers (be concrete, reference actual answers)
- recommendations: 3–5 actionable steps — ordered by priority, specific to "${subcategory}"
- warning_signs: 2–3 specific signs that would require urgent medical attention for this condition
- when_to_see_doctor: one concise sentence on urgency and what type of doctor to consult

Important constraints:
- Do NOT diagnose — provide risk assessment only
- Base everything strictly on "${subcategory}" — do not generalize to unrelated conditions
- Be non-alarmist for low-risk results, appropriately cautious for high/critical
- If answers were skipped or vague, default to moderate assessment`;

  try {
    const data = await _callGemini(prompt, RESULT_SCHEMA);
    logger.info(`[Assessment] Analyzed ${answers.length} answers for "${category}" > "${subcategory}" | risk: ${data.risk_level} (${data.risk_score})`);
    res.json({ result: data });
  } catch (e) {
    logger.error('[Assessment] analyzeAnswers error:', e.message);
    res.status(500).json({ error: 'Failed to analyze answers. Please try again.' });
  }
}

module.exports = { generateQuestions, analyzeAnswers };
