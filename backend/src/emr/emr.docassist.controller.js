const axios = require('axios');
const logger = require('../utils/logger');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Prompts ───────────────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `You are InferAssist, an intelligent clinical decision-support copilot built for doctors in India. Always respond in English regardless of the language of the question.

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

// ── Groq helper ───────────────────────────────────────────────────────────────

async function callGroq(messages, maxTokens = 1024) {
  if (!process.env.GROQ_API_KEY) return null;

  const response = await axios.post(
    GROQ_URL,
    { model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      timeout: 30000,
    },
  );

  return response.data?.choices?.[0]?.message?.content || null;
}

// ── Chat endpoint ─────────────────────────────────────────────────────────────

// ── Patient context fetch ─────────────────────────────────────────────────────

exports.getPatientContext = async (req, res) => {
  const { pool } = require('../config/database');
  const { patientId } = req.params;
  const clinic_id = req.emrUser.clinic_id;

  try {
    // Basic patient info — try by UUID first, not fatal if missing
    const { rows: [p] } = await pool.query(
      `SELECT id, name, dob, gender, mobile, blood_type, allergies, chronic_conditions
       FROM emr_patients WHERE id=$1 AND clinic_id=$2`,
      [patientId, clinic_id]
    ).catch(() => ({ rows: [] }));

    const age = p?.dob ? Math.floor((Date.now() - new Date(p.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;

    // Past encounters — search by emr_patient_id OR by uhid (covers walk-in appointments)
    const { rows: encounters } = await pool.query(
      `SELECT a.appointment_date, a.appointment_time, a.uhid, a.patient_name,
              a.patient_dob, a.patient_gender, a.patient_mobile,
              e.symptoms, e.diagnosis, e.medications, e.notes, e.advices,
              e.vitals, e.lab_investigations, e.examination_findings, e.refer_to
       FROM emr_appointments a
       LEFT JOIN emr_encounters e ON e.appointment_id = a.id
       WHERE a.clinic_id=$2
         AND (a.emr_patient_id=$1 OR (
               a.uhid IS NOT NULL AND a.uhid = (
                 SELECT MAX(uhid) FROM emr_appointments
                 WHERE emr_patient_id=$1 AND clinic_id=$2 AND uhid IS NOT NULL
               )
             ))
         AND e.id IS NOT NULL
       ORDER BY a.appointment_date DESC, a.appointment_time DESC
       LIMIT 10`,
      [patientId, clinic_id]
    );

    // Latest vitals (most recent encounter with vitals)
    const latestVitals = encounters.find(e => e.vitals && Object.keys(e.vitals || {}).length > 0)?.vitals || null;

    // Use patient profile if found, else fall back to appointment row data
    const firstName = encounters[0];
    const patientName    = p?.name    || firstName?.patient_name    || 'Unknown';
    const patientDob     = p?.dob     || firstName?.patient_dob     || null;
    const patientGender  = p?.gender  || firstName?.patient_gender  || null;
    const patientMobile  = p?.mobile  || firstName?.patient_mobile  || null;
    const patientUhid    = firstName?.uhid || null;
    const effectiveAge   = age || (patientDob ? Math.floor((Date.now() - new Date(patientDob)) / (365.25 * 24 * 60 * 60 * 1000)) : null);

    // Build rich context string
    const lines = [
      `Patient: ${patientName}`,
      effectiveAge ? `Age: ${effectiveAge} years` : null,
      patientGender ? `Gender: ${patientGender === 'M' ? 'Male' : patientGender === 'F' ? 'Female' : patientGender}` : null,
      patientMobile ? `Mobile: ${patientMobile}` : null,
      patientUhid ? `UHID: ${patientUhid}` : null,
      p?.blood_type ? `Blood Type: ${p.blood_type}` : null,
      (p?.allergies?.length) ? `Allergies: ${Array.isArray(p.allergies) ? p.allergies.join(', ') : p.allergies}` : null,
      (p?.chronic_conditions?.length) ? `Chronic Conditions: ${Array.isArray(p.chronic_conditions) ? p.chronic_conditions.join(', ') : p.chronic_conditions}` : null,
    ].filter(Boolean);

    if (latestVitals) {
      const v = latestVitals;
      const vStr = [
        v.bp_systolic && v.bp_diastolic ? `BP: ${v.bp_systolic}/${v.bp_diastolic} mmHg` : null,
        v.pulse ? `Pulse: ${v.pulse} bpm` : null,
        v.temperature ? `Temp: ${v.temperature}°${v.temp_unit || 'F'}` : null,
        v.spo2 ? `SpO2: ${v.spo2}%` : null,
        v.weight ? `Weight: ${v.weight} kg` : null,
        v.height ? `Height: ${v.height} cm` : null,
        v.bmi ? `BMI: ${v.bmi}` : null,
        v.rbs ? `RBS: ${v.rbs} mg/dL` : null,
      ].filter(Boolean).join(', ');
      if (vStr) lines.push(`Latest Vitals: ${vStr}`);
    }

    if (encounters.length) {
      lines.push(`\nPast ${encounters.length} visit(s):`);
      encounters.forEach((e, i) => {
        const dateStr = e.appointment_date ? new Date(e.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown date';
        const parts = [];
        if (e.diagnosis) parts.push(`Dx: ${e.diagnosis}`);
        if (e.symptoms)  parts.push(`Sx: ${e.symptoms}`);
        if (e.medications?.length) {
          const meds = e.medications.slice(0, 5).map(m => m.name || m.drug_name || m).filter(Boolean);
          if (meds.length) parts.push(`Meds: ${meds.join(', ')}`);
        }
        if (e.lab_investigations?.length) {
          const labs = e.lab_investigations.slice(0, 3).map(l => l.name || l).filter(Boolean);
          if (labs.length) parts.push(`Labs: ${labs.join(', ')}`);
        }
        lines.push(`  ${i + 1}. ${dateStr}${parts.length ? ' — ' + parts.join(' | ') : ''}`);
      });
    }

    const contextStr = lines.join('\n');

    res.json({
      patient: {
        id: p?.id || patientId,
        name: patientName,
        age: effectiveAge,
        gender: patientGender,
        mobile: patientMobile,
        uhid: patientUhid,
        blood_type: p?.blood_type || null,
        allergies: p?.allergies || [],
        chronic_conditions: p?.chronic_conditions || [],
        latest_vitals: latestVitals,
        visit_count: encounters.length,
        last_visit: encounters[0]?.appointment_date || null,
      },
      context: contextStr,
    });
  } catch (e) {
    logger.error('[InferAssist] getPatientContext error:', e.message);
    res.status(500).json({ error: 'Failed to load patient context' });
  }
};

// ── Chat endpoint ─────────────────────────────────────────────────────────────

exports.chat = async (req, res) => {
  const { message, history = [], patient_context } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.json({ reply: _chatFallback(message) });
  }

  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...history.slice(-12).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content,
    })),
    {
      role: 'user',
      content: patient_context
        ? `[Patient context: ${patient_context}]\n\n${message}`
        : message,
    },
  ];

  try {
    const reply = await callGroq(messages, 1024);
    if (!reply) return res.json({ reply: _chatFallback(message) });
    res.json({ reply });
  } catch (e) {
    if (e.response?.status === 429) return res.json({ reply: 'I am currently busy. Please try again in a moment.' });
    logger.error('[InferAssist Chat] Groq error:', e.response?.status, JSON.stringify(e.response?.data || e.message));
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

  if (!process.env.GROQ_API_KEY) {
    return res.json({ document: _docFallback(doc_type) });
  }

  try {
    const document = await callGroq(
      [
        { role: 'system', content: 'You are a medical documentation expert. Generate professional, clinically accurate medical documents in proper format. Use markdown formatting.' },
        { role: 'user', content: prompt },
      ],
      2048,
    );
    if (!document) return res.json({ document: _docFallback(doc_type) });
    res.json({ document });
  } catch (e) {
    if (e.response?.status === 429) return res.status(429).json({ error: 'Rate limited. Please try again.' });
    logger.error('[InferAssist Doc] Groq error:', e.response?.status, JSON.stringify(e.response?.data || e.message));
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
  return `**${labels[doc_type] || 'Document'} — AI Generation Unavailable**\n\nThe AI document generation service is currently unavailable (API key not configured).\n\nPlease configure GROQ_API_KEY to enable document generation.`;
}
