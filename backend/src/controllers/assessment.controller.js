const axios = require('axios');
const logger = require('../utils/logger');

const { groqModelParams } = require('../config/groq');
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';

async function _callGroq(prompt) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const response = await axios.post(
    GROQ_URL,
    {
      ...groqModelParams(),
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
    logger.error(`[Assessment] generateQuestions error: ${e.message}${e.response ? ` | Groq ${e.response.status}: ${JSON.stringify(e.response.data)}` : ''}`);
    res.status(500).json({ error: 'Failed to generate questions. Please try again.' });
  }
}

async function analyzeAnswers(req, res) {
  const { category, subcategory, answers, appointment_id } = req.body;
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
    // Clinic users: keep the assessment with the appointment so it can be reviewed later
    let assessmentId = null;
    if (req.emrUser && appointment_id) {
      try {
        const { pool } = require('../config/database');
        const { rows: [a] } = await pool.query(
          `SELECT id, emr_patient_id, patient_mobile, patient_name FROM emr_appointments WHERE id = $1 AND clinic_id = $2`,
          [appointment_id, req.emrUser.clinic_id]);
        if (a) {
          const score = Number.isFinite(Number(data?.risk_score)) ? Math.round(Number(data.risk_score)) : null;
          const { rows: [row] } = await pool.query(
            `INSERT INTO emr_assessments (clinic_id, appointment_id, patient_id, patient_mobile, patient_name,
               category, subcategory, answers, result, risk_level, risk_score, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [req.emrUser.clinic_id, a.id, a.emr_patient_id, a.patient_mobile, a.patient_name, category, subcategory,
              JSON.stringify(answers), JSON.stringify(data || {}), data?.risk_level || null, score, req.emrUser.id]);
          assessmentId = row.id;
        }
      } catch (e) {
        logger.error(`[Assessment] save failed: ${e.message}`);   // the doctor still sees the result
      }
    }
    res.json({ result: data, assessment_id: assessmentId });
  } catch (e) {
    logger.error(`[Assessment] analyzeAnswers error: ${e.message}${e.response ? ` | Groq ${e.response.status}: ${JSON.stringify(e.response.data)}` : ''}`);
    res.status(500).json({ error: 'Failed to analyze answers. Please try again.' });
  }
}

// GET /api/emr/assessment/history?patient_mobile=…  or  ?appointment_id=…
async function listAssessments(req, res) {
  const { pool } = require('../config/database');
  const { patient_mobile, appointment_id } = req.query;
  const params = [req.emrUser.clinic_id];
  let where;
  if (appointment_id) { params.push(appointment_id); where = 'x.appointment_id = $2'; }
  else if (String(patient_mobile || '').replace(/\D/g, '').length >= 10) {
    params.push(patient_mobile);
    where = `right(regexp_replace(COALESCE(x.patient_mobile, ''), '\\D', '', 'g'), 10) = right(regexp_replace($2, '\\D', '', 'g'), 10)`;
  } else return res.json([]);
  const { rows } = await pool.query(
    `SELECT x.id, x.appointment_id, x.category, x.subcategory, x.answers, x.result, x.risk_level, x.risk_score,
            x.created_at, s.name AS assessed_by, a.appointment_date
       FROM emr_assessments x
       LEFT JOIN emr_clinic_staff s ON s.id = x.created_by
       LEFT JOIN emr_appointments a ON a.id = x.appointment_id
      WHERE x.clinic_id = $1 AND ${where}
      ORDER BY x.created_at DESC LIMIT 100`, params);
  res.json(rows);
}

module.exports = { generateQuestions, analyzeAnswers, listAssessments };
