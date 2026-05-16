const { analyzeWithAI } = require('../services/ai.service');
const { checkDrugInteractions } = require('../services/drug-interaction.service');

async function chat(req, res) {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const userId = req.user.id;
  const systemPrompt = `You are HealthBot, an empathetic AI health assistant for a Personal Health Record app.
You help users understand their health metrics, symptoms, and medications.
IMPORTANT: Always recommend consulting a doctor for medical decisions.
You have access to general health knowledge. Be concise but thorough.
For abnormal vitals, explain what they mean and advise seeking medical care.
Never diagnose conditions - only provide educational information.`;

  const aiResponse = await analyzeWithAI(message, history, systemPrompt);
  const suggestions = _generateSuggestions(message, aiResponse);

  res.json({
    message: {
      id: `bot_${Date.now()}`,
      content: aiResponse,
      is_user: false,
      timestamp: new Date().toISOString(),
      message_type: 'text',
    },
    suggestions,
  });
}

async function checkInteractions(req, res) {
  const { drugs } = req.body;
  if (!drugs || drugs.length < 2) return res.status(400).json({ error: 'Provide at least 2 drug names' });
  const interactions = await checkDrugInteractions(drugs);
  res.json({ interactions, drug_count: drugs.length });
}

async function symptomCheck(req, res) {
  const { symptoms, age, gender } = req.body;
  if (!symptoms || symptoms.length === 0) return res.status(400).json({ error: 'Symptoms required' });
  const prompt = `Patient info: Age ${age || 'unknown'}, Gender ${gender || 'unknown'}. Symptoms: ${symptoms.join(', ')}.
Provide a brief educational overview of possible common conditions associated with these symptoms (NOT a diagnosis).
Include when to seek immediate medical care. Keep response under 300 words.`;
  const analysis = await analyzeWithAI(prompt, [], '');
  res.json({ analysis, disclaimer: 'This is educational information only. Consult a healthcare professional for medical advice.' });
}

async function getMedicineInfo(req, res) {
  const { medicine } = req.query;
  if (!medicine) return res.status(400).json({ error: 'Medicine name required' });
  const prompt = `Provide brief educational information about the medicine "${medicine}": common uses, typical dosage range, common side effects, and important warnings. Keep it under 200 words.`;
  const info = await analyzeWithAI(prompt, [], '');
  res.json({ medicine, info, disclaimer: 'Always follow your doctor\'s prescription.' });
}

function _generateSuggestions(message, response) {
  const suggestions = [];
  const lower = message.toLowerCase();
  if (lower.includes('blood pressure') || lower.includes('bp')) suggestions.push('What are normal BP ranges?', 'How to lower blood pressure?');
  else if (lower.includes('diabetes') || lower.includes('glucose') || lower.includes('sugar')) suggestions.push('What are normal glucose levels?', 'Diet tips for diabetes');
  else if (lower.includes('heart') || lower.includes('pulse')) suggestions.push('What is a normal heart rate?', 'Signs of heart problems');
  else suggestions.push('What are my recent vitals?', 'When should I see a doctor?');
  return suggestions.slice(0, 3);
}

module.exports = { chat, checkInteractions, symptomCheck, getMedicineInfo };
