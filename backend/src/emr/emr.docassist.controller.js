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
    // Step 1: get mobile/name from the appointment itself to use the proven history query
    const { rows: [apptRow] } = await pool.query(
      `SELECT patient_name, patient_mobile, patient_dob, patient_gender, uhid, emr_patient_id
       FROM emr_appointments
       WHERE (emr_patient_id=$1 OR uhid=(SELECT MAX(uhid) FROM emr_appointments WHERE emr_patient_id=$1 AND clinic_id=$2))
         AND clinic_id=$2
       ORDER BY appointment_date DESC LIMIT 1`,
      [patientId, clinic_id]
    );

    const mobile = apptRow?.patient_mobile;
    const uhid   = apptRow?.uhid;

    // Step 2: use the same query as /patients/history — proven to return full encounter data
    let rows = [];
    if (mobile) {
      const { rows: byMobile } = await pool.query(
        `SELECT a.id, a.appointment_date, a.appointment_time, a.status,
                a.patient_name, a.patient_mobile, a.patient_gender, a.patient_dob, a.uhid, a.visit_type,
                d.name AS doctor_name,
                e.chief_complaint, e.symptoms, e.diagnosis, e.medications,
                e.vitals, e.lab_investigations, e.lab_results,
                e.advices, e.notes AS encounter_notes,
                e.next_visit_date, e.examination_findings, e.refer_to, e.vaccinations
         FROM emr_appointments a
         LEFT JOIN emr_doctors    d ON d.id = a.doctor_id
         LEFT JOIN emr_encounters e ON e.appointment_id = a.id
         WHERE a.clinic_id=$1 AND a.patient_mobile=$2
           AND (e.id IS NULL OR (
             (e.symptoms IS NOT NULL AND jsonb_array_length(e.symptoms::jsonb) > 0)
             OR (e.diagnosis IS NOT NULL AND jsonb_array_length(e.diagnosis::jsonb) > 0)
             OR (e.medications IS NOT NULL AND jsonb_array_length(e.medications::jsonb) > 0)
             OR (e.chief_complaint IS NOT NULL AND TRIM(e.chief_complaint) != '')
             OR (e.vitals IS NOT NULL AND e.vitals::text != '{}' AND e.vitals::text != 'null')
           ))
         ORDER BY a.appointment_date DESC, a.created_at DESC LIMIT 20`,
        [clinic_id, mobile]
      );
      rows = byMobile;
    } else if (uhid) {
      const { rows: byUhid } = await pool.query(
        `SELECT a.id, a.appointment_date, a.appointment_time, a.status,
                a.patient_name, a.patient_mobile, a.patient_gender, a.patient_dob, a.uhid, a.visit_type,
                d.name AS doctor_name,
                e.chief_complaint, e.symptoms, e.diagnosis, e.medications,
                e.vitals, e.lab_investigations, e.lab_results,
                e.advices, e.notes AS encounter_notes,
                e.next_visit_date, e.examination_findings, e.refer_to, e.vaccinations
         FROM emr_appointments a
         LEFT JOIN emr_doctors    d ON d.id = a.doctor_id
         LEFT JOIN emr_encounters e ON e.appointment_id = a.id
         WHERE a.clinic_id=$1 AND a.uhid=$2
         ORDER BY a.appointment_date DESC LIMIT 20`,
        [clinic_id, uhid]
      );
      rows = byUhid;
    }

    if (!rows.length) {
      // Nothing found — return minimal context from appointment row
      const name = apptRow?.patient_name || 'Unknown';
      const age  = apptRow?.patient_dob ? Math.floor((Date.now() - new Date(apptRow.patient_dob)) / (365.25*24*60*60*1000)) : null;
      return res.json({
        patient: { id: patientId, name, age, mobile, uhid, visit_count: 0, last_visit: null, allergies: [], chronic_conditions: [], latest_vitals: null },
        context: [`Patient: ${name}`, age ? `Age: ${age} years` : null, mobile ? `Mobile: ${mobile}` : null, uhid ? `UHID: ${uhid}` : null].filter(Boolean).join('\n'),
      });
    }

    // Step 3: build rich context from history rows
    const first = rows[0];
    const patientName   = first.patient_name;
    const patientDob    = first.patient_dob;
    const patientGender = first.patient_gender;
    const patientMobile = first.patient_mobile || mobile;
    const patientUhid   = first.uhid || uhid;
    const age = patientDob ? Math.floor((Date.now() - new Date(patientDob)) / (365.25*24*60*60*1000)) : null;

    const visitRows = rows.filter(r => r.appointment_date);

    // Latest vitals
    const latestVitals = visitRows.find(r => r.vitals && r.vitals !== '{}')?.vitals || null;

    const lines = [
      `Patient: ${patientName}`,
      age             ? `Age: ${age} years`                                                                    : null,
      patientGender   ? `Gender: ${patientGender === 'M' ? 'Male' : patientGender === 'F' ? 'Female' : patientGender}` : null,
      patientMobile   ? `Mobile: ${patientMobile}`                                                             : null,
      patientUhid     ? `UHID: ${patientUhid}`                                                                 : null,
    ].filter(Boolean);

    if (latestVitals && typeof latestVitals === 'object') {
      const v = latestVitals;
      const vStr = [
        v.bp_systolic && v.bp_diastolic ? `BP: ${v.bp_systolic}/${v.bp_diastolic} mmHg` : null,
        v.pulse       ? `Pulse: ${v.pulse} bpm`                    : null,
        v.temperature ? `Temp: ${v.temperature}°${v.temp_unit||''}`: null,
        v.spo2        ? `SpO2: ${v.spo2}%`                         : null,
        v.weight      ? `Weight: ${v.weight} kg`                   : null,
        v.height      ? `Height: ${v.height} cm`                   : null,
        v.bmi         ? `BMI: ${v.bmi}`                            : null,
        v.rbs         ? `RBS: ${v.rbs} mg/dL`                      : null,
      ].filter(Boolean).join(', ');
      if (vStr) lines.push(`Latest Vitals: ${vStr}`);
    }

    const completedVisits = visitRows.filter(r => r.diagnosis || r.medications || r.symptoms || r.chief_complaint);
    if (completedVisits.length) {
      lines.push(`\nPast ${completedVisits.length} visit(s):`);
      completedVisits.forEach((r, i) => {
        const dateStr = r.appointment_date
          ? new Date(r.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'Unknown date';
        const parts = [];
        if (r.doctor_name)      parts.push(`Dr. ${r.doctor_name}`);
        if (r.chief_complaint)  parts.push(`CC: ${r.chief_complaint}`);
        if (r.diagnosis?.length)  {
          const dx = Array.isArray(r.diagnosis) ? r.diagnosis.map(d => d.name || d.text || d).filter(Boolean).join(', ') : r.diagnosis;
          if (dx) parts.push(`Dx: ${dx}`);
        }
        if (r.symptoms?.length) {
          const sx = Array.isArray(r.symptoms) ? r.symptoms.map(s => s.name || s.text || s).filter(Boolean).join(', ') : r.symptoms;
          if (sx) parts.push(`Sx: ${sx}`);
        }
        if (r.medications?.length) {
          const meds = Array.isArray(r.medications)
            ? r.medications.slice(0, 5).map(m => m.name || m.drug_name || m.generic_name || m).filter(Boolean).join(', ')
            : r.medications;
          if (meds) parts.push(`Meds: ${meds}`);
        }
        if (r.lab_investigations?.length) {
          const labs = Array.isArray(r.lab_investigations)
            ? r.lab_investigations.slice(0, 3).map(l => l.name || l.test || l).filter(Boolean).join(', ')
            : r.lab_investigations;
          if (labs) parts.push(`Labs: ${labs}`);
        }
        if (r.advices)          parts.push(`Advice: ${r.advices}`);
        if (r.refer_to)         parts.push(`Referred to: ${r.refer_to}`);
        if (r.next_visit_date)  parts.push(`Next visit: ${r.next_visit_date}`);
        lines.push(`  ${i + 1}. ${dateStr}${parts.length ? ' — ' + parts.join(' | ') : ''}`);
      });
    }

    const contextStr = lines.join('\n');

    res.json({
      patient: {
        id: patientId,
        name: patientName,
        age,
        gender: patientGender,
        mobile: patientMobile,
        uhid: patientUhid,
        allergies: [],
        chronic_conditions: [],
        latest_vitals: latestVitals,
        visit_count: completedVisits.length,
        last_visit: visitRows[0]?.appointment_date || null,
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
