const axios = require('axios');
const { query } = require('../config/database');

const SYSTEM_PROMPT = `You are HealthBot, an AI health assistant for a Personal Health Record (PHR) application.
You help users with:
- Symptom assessment and guidance (always recommend seeing a doctor for serious symptoms)
- Medicine information and dosage queries
- Understanding lab results and vital signs
- General health and wellness advice
- Interpreting trends in health data

IMPORTANT RULES:
- Always recommend consulting a qualified healthcare professional for medical decisions
- Never diagnose conditions definitively
- For emergency symptoms (chest pain, difficulty breathing, severe bleeding), immediately advise calling emergency services
- Be empathetic and clear in your responses
- Keep responses concise but complete`;

async function chat(req, res, next) {
  try {
    const { profileId, sessionId, message } = req.body;

    let activeSessionId = sessionId;

    // Create session if not provided
    if (!activeSessionId) {
      const session = await query(
        `INSERT INTO healthbot_sessions (profile_id, title) VALUES ($1, $2) RETURNING id`,
        [profileId, message.substring(0, 50)]
      );
      activeSessionId = session.rows[0].id;
    }

    // Get conversation history
    const history = await query(
      `SELECT role, content FROM healthbot_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 20`,
      [activeSessionId]
    );

    // Get profile context
    const profile = await query(
      `SELECT full_name, date_of_birth, gender, blood_group, allergies, chronic_conditions FROM profiles WHERE id = $1`,
      [profileId]
    );

    // Get recent vitals for context
    const recentVitals = await query(
      `SELECT DISTINCT ON (vital_type) vital_type, systolic, diastolic, heart_rate, glucose_level, spo2_percentage, temperature, weight_kg, recorded_at
       FROM vitals WHERE profile_id = $1 ORDER BY vital_type, recorded_at DESC LIMIT 10`,
      [profileId]
    );

    const profileCtx = profile.rows[0];
    const profileContext = profileCtx
      ? `User profile: ${profileCtx.full_name}, ${profileCtx.gender || 'unknown gender'}, DOB: ${profileCtx.date_of_birth || 'unknown'}, Blood group: ${profileCtx.blood_group || 'unknown'}, Allergies: ${profileCtx.allergies?.join(', ') || 'none'}, Chronic conditions: ${profileCtx.chronic_conditions?.join(', ') || 'none'}`
      : '';

    const vitalsCtx = recentVitals.rows.map(v => {
      if (v.vital_type === 'bp') return `BP: ${v.systolic}/${v.diastolic} mmHg`;
      if (v.vital_type === 'heart_rate') return `HR: ${v.heart_rate} bpm`;
      if (v.vital_type === 'spo2') return `SpO2: ${v.spo2_percentage}%`;
      if (v.vital_type === 'sugar') return `Blood Sugar: ${v.glucose_level} mg/dL`;
      if (v.vital_type === 'temperature') return `Temp: ${v.temperature}°C`;
      if (v.vital_type === 'weight') return `Weight: ${v.weight_kg} kg`;
      return '';
    }).filter(Boolean).join(', ');

    const systemWithContext = `${SYSTEM_PROMPT}\n\n${profileContext}\nRecent vitals: ${vitalsCtx || 'none available'}`;

    const messages = [
      ...history.rows.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    // Call Claude API
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemWithContext,
        messages,
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const assistantMessage = response.data.content[0].text;

    // Save messages
    await query(
      `INSERT INTO healthbot_messages (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
      [activeSessionId, message, assistantMessage]
    );

    await query(`UPDATE healthbot_sessions SET updated_at = NOW() WHERE id = $1`, [activeSessionId]);

    res.json({ sessionId: activeSessionId, message: assistantMessage });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(503).json({ error: 'HealthBot is temporarily unavailable' });
    }
    next(err);
  }
}

async function getSessions(req, res, next) {
  try {
    const { profileId } = req.params;
    const result = await query(
      `SELECT hs.*, (SELECT content FROM healthbot_messages WHERE session_id = hs.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM healthbot_sessions hs WHERE profile_id = $1 ORDER BY updated_at DESC LIMIT 20`,
      [profileId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getSession(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM healthbot_messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [req.params.sessionId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { chat, getSessions, getSession };
