/**
 * Gemini 1.5 Flash — AI/NLP gateway for appointment booking
 * Handles multi-turn conversation with function calling
 * Falls back to keyword matching if API key is missing
 */
const { GoogleGenerativeAI, FunctionCallingMode } = require('@google/generative-ai');
const logger = require('../../utils/logger');

// ── Tool declarations ──────────────────────────────────────────────────────
const TOOL_DECLARATIONS = [
  {
    name: 'get_doctors',
    description: 'Get the list of available doctors at the clinic. Call this when patient asks who is available or does not specify a doctor.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_availability',
    description: 'Check available appointment time slots for a specific doctor on a given date. Always call this before confirming a booking.',
    parameters: {
      type: 'object',
      properties: {
        doctor_id:  { type: 'number',  description: 'The numeric ID of the doctor' },
        date:       { type: 'string',  description: 'Date in YYYY-MM-DD format. Use relative terms like "today" or "tomorrow" resolved to actual dates.' },
      },
      required: ['doctor_id', 'date'],
    },
  },
  {
    name: 'find_patient',
    description: 'Look up an existing patient by mobile number to pre-fill their name and history.',
    parameters: {
      type: 'object',
      properties: {
        mobile: { type: 'string', description: 'Patient mobile in E.164 or local format' },
      },
      required: ['mobile'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Create the appointment after the patient has confirmed all details. Only call after explicit patient confirmation.',
    parameters: {
      type: 'object',
      properties: {
        patient_name:   { type: 'string', description: 'Full name of the patient' },
        patient_mobile: { type: 'string', description: 'Patient mobile number' },
        doctor_id:      { type: 'number', description: 'Doctor ID chosen' },
        date:           { type: 'string', description: 'Appointment date YYYY-MM-DD' },
        time:           { type: 'string', description: 'Appointment time HH:MM (24h)' },
        visit_reason:   { type: 'string', description: 'Reason for the visit' },
      },
      required: ['patient_name', 'patient_mobile', 'doctor_id', 'date', 'time'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment by appointment ID or by patient mobile + date.',
    parameters: {
      type: 'object',
      properties: {
        appointment_id: { type: 'number', description: 'Appointment ID if known' },
        patient_mobile: { type: 'string', description: 'Patient mobile if ID is unknown' },
        date:           { type: 'string', description: 'Date of the appointment to cancel' },
      },
      required: [],
    },
  },
  {
    name: 'request_handoff',
    description: 'Hand off to a human staff member when the conversation cannot proceed or patient explicitly asks for a person.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why handoff is needed' },
      },
      required: ['reason'],
    },
  },
];

// ── Build system prompt ────────────────────────────────────────────────────
function buildSystemPrompt(clinicName, doctors, today) {
  const doctorList = doctors.map(d =>
    `  - ${d.name} (ID: ${d.id})${d.specialization ? `, ${d.specialization}` : ''}`
  ).join('\n');

  return `You are a friendly, professional appointment booking assistant for ${clinicName}.
You communicate via SMS/WhatsApp, so keep every reply SHORT (under 160 chars when possible) and conversational.

Today's date: ${today}

Available doctors at this clinic:
${doctorList || '  (No doctors listed yet)'}

Your job:
1. Greet the patient warmly on first contact.
2. Collect: patient name, preferred doctor, reason for visit, preferred date & time.
3. ALWAYS call check_availability before quoting or confirming a slot.
4. Show at most 5 slot options. Ask patient to reply with a number.
5. Summarise before booking: "Confirm: [Name] with [Doctor] on [Date] at [Time]? Reply YES to book."
6. ONLY call book_appointment after the patient replies YES/confirm/ok.
7. After booking, send: "✅ Booked! Token: [N]. See you on [Date] at [Time] with [Doctor]. Reply CANCEL to cancel."
8. If patient says CANCEL or similar, use cancel_appointment.
9. If you cannot handle the request, call request_handoff.
10. Never make up availability — always call check_availability first.
11. For ambiguous input, ask a single clarifying question.
12. Keep messages in the same language the patient uses.`;
}

// ── Convert DB messages to Gemini history format ───────────────────────────
function formatHistory(dbMessages) {
  // dbMessages: [{role: 'user'|'model', content: string, ts: string}]
  // Gemini expects: [{role: 'user'|'model', parts: [{text}]}]
  return dbMessages.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

// ── Execute a single Gemini turn (may handle multiple tool call rounds) ────
async function processConversationTurn(clinicContext, dbMessages, userMessage, toolExecutor) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('[Gemini] GEMINI_API_KEY not set — using keyword fallback');
    return keywordFallback(userMessage, clinicContext);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: buildSystemPrompt(
        clinicContext.clinicName,
        clinicContext.doctors,
        new Date().toISOString().slice(0, 10)
      ),
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    });

    const history = formatHistory(dbMessages);
    const chat    = model.startChat({ history });

    let result = await chat.sendMessage(userMessage);

    // Handle iterative tool calls (model may chain multiple calls)
    for (let round = 0; round < 5; round++) {
      const candidate = result.response.candidates?.[0];
      if (!candidate) break;

      const parts         = candidate.content?.parts || [];
      const funcCallParts = parts.filter(p => p.functionCall);
      if (funcCallParts.length === 0) break;

      const toolResponses = [];
      for (const part of funcCallParts) {
        const { name, args } = part.functionCall;
        logger.info(`[Gemini] tool call: ${name}`, args);
        let toolResult;
        try {
          toolResult = await toolExecutor(name, args);
        } catch (err) {
          toolResult = { error: err.message };
        }
        toolResponses.push({
          functionResponse: { name, response: { result: toolResult } },
        });
      }

      result = await chat.sendMessage(toolResponses);
    }

    const text = result.response.text();
    const confidence = _estimateConfidence(result.response);
    return { text, confidence, toolCalls: [] };

  } catch (err) {
    logger.error('[Gemini] API error', err.message);
    return { text: "I'm having trouble right now. Please call the clinic directly or try again in a moment.", confidence: 0, toolCalls: [] };
  }
}

// ── Simple confidence heuristic ────────────────────────────────────────────
function _estimateConfidence(response) {
  try {
    const reason = response.candidates?.[0]?.finishReason;
    if (reason === 'STOP') return 0.92;
    if (reason === 'MAX_TOKENS') return 0.70;
    return 0.50;
  } catch {
    return 0.50;
  }
}

// ── Keyword fallback (no API key) ──────────────────────────────────────────
function keywordFallback(text, clinicContext) {
  const t = (text || '').toLowerCase();
  let reply = '';

  if (/(book|appoint|schedule|see doctor|consult)/i.test(t)) {
    const names = clinicContext.doctors.map(d => d.name).join(', ');
    reply = `Hi! To book an appointment at ${clinicContext.clinicName}, please tell us: your name, preferred doctor (${names || 'any'}), and preferred date. Or call us directly.`;
  } else if (/(cancel|reschedul)/i.test(t)) {
    reply = `To cancel or reschedule, please share your mobile number and appointment date, or call us directly.`;
  } else if (/(hi|hello|hey|namaste)/i.test(t)) {
    reply = `Hello! Welcome to ${clinicContext.clinicName}. Reply with BOOK to schedule an appointment or CANCEL to cancel one.`;
  } else {
    reply = `Sorry, I didn't understand that. Reply BOOK to book an appointment or call us directly.`;
  }

  return { text: reply, confidence: 0.3, toolCalls: [] };
}

module.exports = { processConversationTurn, buildSystemPrompt, formatHistory };
