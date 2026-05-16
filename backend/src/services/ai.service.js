const axios = require('axios');

async function analyzeWithAI(message, history = [], systemPrompt = '') {
  if (!process.env.ANTHROPIC_API_KEY) {
    return _fallbackResponse(message);
  }

  const messages = [
    ...history.slice(-10).map(h => ({ role: h.is_user ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: message }
  ];

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt || 'You are a helpful health assistant. Be concise and accurate. Always recommend consulting a doctor for medical advice.',
      messages,
    }, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    });

    return response.data.content[0].text;
  } catch (e) {
    if (e.response?.status === 429) return 'I am currently busy. Please try again in a moment.';
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

module.exports = { analyzeWithAI };
