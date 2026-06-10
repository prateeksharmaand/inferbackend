const axios = require('axios');
const logger = require('../utils/logger');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';

async function _callGroq(prompt) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const response = await axios.post(
    GROQ_URL,
    {
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      timeout: 30000,
    },
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty Groq response');
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
- Include at least 2 multiple_choice questions

Return a JSON object with this exact structure:
{
  "questions": [
    {
      "id": 1,
      "text": "question text",
      "type": "single_choice" or "multiple_choice",
      "options": ["option1", "option2", "option3"]
    }
  ]
}`;

  try {
    const data = await _callGroq(prompt);
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

Return a JSON object with this exact structure:
{
  "risk_level": "low" | "moderate" | "high" | "critical",
  "risk_score": integer 0-100,
  "summary": "2-3 plain-language sentences summarizing the overall health picture",
  "findings": ["key observation 1", "key observation 2", "key observation 3"],
  "recommendations": ["action 1", "action 2", "action 3"],
  "warning_signs": ["warning sign 1", "warning sign 2"],
  "when_to_see_doctor": "one concise sentence on urgency and doctor type"
}

Important:
- Do NOT diagnose — provide risk assessment only
- Base everything strictly on "${subcategory}"
- Be non-alarmist for low-risk, appropriately cautious for high/critical
- If answers were skipped or vague, default to moderate assessment`;

  try {
    const data = await _callGroq(prompt);
    logger.info(`[Assessment] Analyzed ${answers.length} answers for "${category}" > "${subcategory}" | risk: ${data.risk_level} (${data.risk_score})`);
    res.json({ result: data });
  } catch (e) {
    logger.error('[Assessment] analyzeAnswers error:', e.message);
    res.status(500).json({ error: 'Failed to analyze answers. Please try again.' });
  }
}

module.exports = { generateQuestions, analyzeAnswers };
