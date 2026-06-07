const axios = require('axios');
const logger = require('../utils/logger');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── Prompts ───────────────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `You are DocAssist AI, an intelligent clinical decision-support copilot built for doctors in India. Always respond in English regardless of the language of the question.

You assist with:
- Drug choices, dosages, interactions, contraindications, and therapeutic alternatives
- Treatment protocols based on international and Indian guidelines (ICMR, API, IAP, ESC, ADA, WHO)
- Safe prescribing in special populations: pregnancy, paediatrics, elderly, renal/hepatic impairment
- Diet charts, lifestyle advice, and preventive care recommendations
- Differential diagnosis, diagnostic reasoning, and investigation selection
- Patient-specific clinical questions when context is provided

Format rules:
- Use **bold** for drug names, key warnings, and critical values
- Use bullet lists or numbered steps for treatment protocols
- Be concise — doctors need quick answers, not long essays
- Always note important contraindications or safety caveats
- If a patient context is provided, tailor your answer to that specific patient
- End medical advice with: *Always verify with current guidelines and your clinical judgment.*
- Do NOT hallucinate drug doses — if uncertain, say so and recommend consulting a formulary.`;

const DOC_PROMPTS = {
  soap: (context, patient) => `Generate a structured SOAP note for a physician.
${patient ? `Patient: ${patient}` : ''}
${context ? `Clinical context: ${context}` : 'Use a realistic example if no context provided.'}

Format exactly as:
**S – Subjective**
(Chief complaint, HPI, symptoms, patient-reported history)

**O – Objective**
(Vitals, examination findings, investigations)

**A – Assessment**
(Diagnosis / differential diagnoses with ICD-10 codes if possible)

**P – Plan**
(Medications with dose/frequency, investigations ordered, referrals, follow-up)

Be clinically specific and use proper medical terminology.`,

  discharge: (context, patient) => `Generate a professional hospital Discharge Summary.
${patient ? `Patient: ${patient}` : ''}
${context ? `Clinical context: ${context}` : ''}

Include sections:
**Discharge Summary**
- **Patient Demographics**
- **Admission Date / Discharge Date**
- **Admitting Diagnosis**
- **Final Diagnosis** (with ICD-10)
- **History of Present Illness**
- **Investigations & Results** (key findings)
- **Treatment Given** (drugs, procedures, surgeries)
- **Condition at Discharge**
- **Discharge Medications** (with dose, frequency, duration)
- **Dietary Advice**
- **Follow-up Instructions**
- **Emergency Contact**`,

  referral: (context, patient) => `Draft a formal specialist Referral Letter for a doctor.
${patient ? `Patient: ${patient}` : ''}
${context ? `Context: ${context}` : ''}

Format:
**Referral Letter**

Date: [Today's date]

Dear Dr. [Specialist Name],

[Opening paragraph — reason for referral]

**Clinical Summary:**
[Brief history, diagnosis, current management]

**Investigations:**
[Relevant results]

**Reason for Referral:**
[Specific question or management needed]

**Current Medications:**
[List]

Thank you for seeing this patient.
Yours sincerely,
Dr. [Referring Physician]`,

  followup: (context, patient) => `Generate a detailed Follow-up Plan for a patient.
${patient ? `Patient: ${patient}` : ''}
${context ? `Context: ${context}` : ''}

Include:
**Follow-up Plan**

**Review Date:** [Suggested timeframe]

**Symptoms to Monitor:**
- [List]

**Investigations to Order at Follow-up:**
- [Tests with rationale]

**Medication Review:**
- [What to continue, titrate, or stop]

**Lifestyle & Dietary Goals:**
- [Specific targets]

**Red Flag Symptoms (seek immediate care if):**
- [List warning signs]

**Next Review:** [Recommended interval]`,

  prescription: (context, patient) => `Draft a structured Prescription for a physician.
${patient ? `Patient: ${patient}` : ''}
${context ? `Clinical context: ${context}` : ''}

Format:
**Prescription**

**Diagnosis:** [ICD-10 if possible]

**Medications:**
| Drug | Dose | Route | Frequency | Duration | Instructions |
|------|------|-------|-----------|----------|--------------|
[Fill in table rows]

**PRN (as needed):**
[Any PRN medications]

**Special Instructions:**
- [Food interaction, timing, monitoring]

**Investigations:**
- [Any tests to be done]

**Follow-up:** [When to return]

*Note: Prescriber must verify doses and review for patient-specific contraindications.*`,
};

// ── Gemini helper ─────────────────────────────────────────────────────────────

async function callGemini(contents, systemPrompt, maxTokens = 1024) {
  if (!process.env.GEMINI_API_KEY) return null;

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 1,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const response = await axios.post(
    `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
    body,
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
  );

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// ── Chat endpoint ─────────────────────────────────────────────────────────────

exports.chat = async (req, res) => {
  const { message, history = [], patient_context } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ reply: _chatFallback(message) });
  }

  const contents = [
    ...history.slice(-12).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    })),
    {
      role: 'user',
      parts: [{
        text: patient_context
          ? `[Patient context: ${patient_context}]\n\n${message}`
          : message,
      }],
    },
  ];

  try {
    const reply = await callGemini(contents, CHAT_SYSTEM_PROMPT, 1024);
    if (!reply) return res.json({ reply: _chatFallback(message) });
    res.json({ reply });
  } catch (e) {
    if (e.response?.status === 429) return res.json({ reply: 'I am currently busy. Please try again in a moment.' });
    logger.error('[DocAssist Chat] Gemini error:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    res.json({ reply: _chatFallback(message) });
  }
};

// ── Document generation endpoint ──────────────────────────────────────────────

exports.generateDocument = async (req, res) => {
  const { doc_type, context, patient_context } = req.body;

  const validTypes = ['soap', 'discharge', 'referral', 'followup', 'prescription'];
  if (!doc_type || !validTypes.includes(doc_type)) {
    return res.status(400).json({ error: `doc_type must be one of: ${validTypes.join(', ')}` });
  }

  const promptFn = DOC_PROMPTS[doc_type];
  const prompt = promptFn(context || '', patient_context || '');

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ document: _docFallback(doc_type) });
  }

  try {
    const document = await callGemini(
      [{ role: 'user', parts: [{ text: prompt }] }],
      'You are a medical documentation expert. Generate professional, clinically accurate medical documents in proper format. Use markdown formatting.',
      2048,
    );
    if (!document) return res.json({ document: _docFallback(doc_type) });
    res.json({ document });
  } catch (e) {
    if (e.response?.status === 429) return res.status(429).json({ error: 'Rate limited. Please try again.' });
    logger.error('[DocAssist Doc] Gemini error:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    res.json({ document: _docFallback(doc_type) });
  }
};

// ── Fallbacks ─────────────────────────────────────────────────────────────────

function _chatFallback(message) {
  const q = message.toLowerCase();
  if (q.includes('asthma') && (q.includes('hypertensive') || q.includes('anti-hyp') || q.includes('bp'))) {
    return `**Anti-hypertensives safe in asthma:**\n\n- **CCBs** (amlodipine, nifedipine) — first choice; no bronchospasm risk\n- **ACE inhibitors** (ramipril) — safe, but watch for dry cough (~15%); switch to ARB if cough occurs\n- **ARBs** (losartan, telmisartan) — safe, no cough\n- **Thiazides** (hydrochlorothiazide) — generally safe\n- ⚠️ **Avoid:** Non-selective beta-blockers (propranolol, atenolol) — can cause bronchoconstriction\n\n*Always verify with current guidelines and your clinical judgment.*`;
  }
  if (q.includes('pregnant') || q.includes('pregnancy')) {
    return `For prescriptions in pregnancy, always check FDA/WHO pregnancy safety categories.\n\n- **Avoid:** NSAIDs after 20 weeks, ACE inhibitors, statins, tetracyclines, warfarin (1st trimester)\n- **Safe:** Paracetamol (short-term), amoxicillin, metformin (discuss risks), insulin\n\n*Always verify with current guidelines and your clinical judgment.*`;
  }
  if (q.includes('drug interaction') || q.includes('interaction')) {
    return `Common dangerous drug interactions to monitor:\n\n- **Warfarin** + NSAIDs → increased bleeding risk\n- **Metformin** + iodinated contrast → lactic acidosis risk (hold 48h)\n- **SSRIs** + tramadol → serotonin syndrome\n- **Statins** + macrolide antibiotics → myopathy risk\n- **ACE inhibitors** + potassium-sparing diuretics → hyperkalaemia\n\n*Always verify with current guidelines and your clinical judgment.*`;
  }
  return `I can help with drug choices, treatment protocols, dosages, clinical decision support, and patient-specific questions. Please describe your clinical question in detail.\n\n*Always verify with current guidelines and your clinical judgment.*`;
}

function _docFallback(doc_type) {
  const labels = { soap: 'SOAP Note', discharge: 'Discharge Summary', referral: 'Referral Letter', followup: 'Follow-up Plan', prescription: 'Prescription Draft' };
  return `**${labels[doc_type] || 'Document'} — AI Generation Unavailable**\n\nThe AI document generation service is currently unavailable (API key not configured).\n\nPlease configure GEMINI_API_KEY to enable document generation.`;
}
