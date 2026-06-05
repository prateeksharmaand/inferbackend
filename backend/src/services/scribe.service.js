const axios = require('axios');
const FormData = require('form-data');
const { spawn } = require('child_process');

// Read lazily so the server picks up .env changes without restart
const groqKey   = () => process.env.GROQ_API_KEY;
const groqModel = () => process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const GROQ_LLM_MODEL = process.env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile';

// Short clinical hint for Whisper — keeps initial_prompt small for speed
const WHISPER_PROMPT_BASE = 'Medical consultation. Doctor speaking with patient. Clinical terms, drug names, dosages.';

const SPECIALIZATION_VOCAB = {
  cardiology:       'troponin, stent, angiography, pacemaker, atrial fibrillation, coronary artery disease, ejection fraction, echocardiogram, stress test, beta blocker, ACE inhibitor, warfarin, catheterization, cardiac enzymes',
  dermatology:      'eczema, psoriasis, dermatitis, acne, rosacea, topical steroid, urticaria, seborrheic, antifungal, patch test, lesion, biopsy, melanoma, pruritus',
  orthopedics:      'fracture, dislocation, ligament tear, meniscus, arthritis, osteoporosis, physiotherapy, NSAID, calcium supplement, joint replacement, cast, splint, brace, scoliosis, tendon',
  pediatrics:       'immunization, vaccination, growth chart, milestone, jaundice, dehydration, oral rehydration, nebulization, vitamin D, zinc, iron drops, weight for age, birth weight',
  gynecology:       'menstruation, dysmenorrhea, PCOS, fibroid, ovarian cyst, prenatal, antenatal, contraception, FSH, LH, progesterone, estrogen, HRT, pap smear, fetal heart rate',
  neurology:        'seizure, epilepsy, migraine, stroke, EEG, nerve conduction, tremor, Parkinson, dementia, anticonvulsant, levetiracetam, valproate, phenytoin, sumatriptan, neuropathy',
  psychiatry:       'depression, anxiety, bipolar, schizophrenia, insomnia, SSRI, SNRI, antipsychotic, mood stabilizer, lithium, counseling, CBT, panic attack, OCD, PTSD, hallucination',
  ophthalmology:    'visual acuity, intraocular pressure, glaucoma, cataract, retina, diabetic retinopathy, fundus, slit lamp, refractive error, myopia, hyperopia, astigmatism, eye drops',
  ent:              'sinusitis, otitis media, hearing loss, tonsillitis, rhinitis, nasal polyp, vertigo, tinnitus, audiogram, laryngoscopy, decongestant, adenoids, mastoid',
  endocrinology:    'TSH, T3, T4, HbA1c, fasting glucose, insulin resistance, hypothyroidism, hyperthyroidism, adrenal, cortisol, DEXA scan, thyroid nodule, polycystic',
  pulmonology:      'spirometry, peak flow, inhaler, bronchodilator, salbutamol, budesonide, oxygen saturation, COPD, bronchitis, pneumonia, respiratory distress, pleural effusion',
  gastroenterology: 'GERD, peptic ulcer, IBS, Crohn, colitis, cirrhosis, hepatitis, endoscopy, colonoscopy, bilirubin, ALT, AST, PPI, antacid, prokinetic, dyspepsia',
  nephrology:       'creatinine, BUN, GFR, proteinuria, hematuria, kidney stone, dialysis, nephritis, diuretic, phosphate binder, erythropoietin, renal function test',
};

const DEFAULT_DRUG_FORMULARY =
  'paracetamol, ibuprofen, aspirin, diclofenac, amoxicillin, azithromycin, ciprofloxacin, ' +
  'doxycycline, cefixime, metronidazole, metformin, glipizide, sitagliptin, insulin, ' +
  'atorvastatin, rosuvastatin, amlodipine, losartan, telmisartan, ramipril, enalapril, ' +
  'omeprazole, pantoprazole, domperidone, ondansetron, cetirizine, levocetrizine, montelukast, ' +
  'salbutamol, budesonide, levothyroxine, prednisolone, dexamethasone, ' +
  'vitamin D3, vitamin B12, folic acid, iron tablets, calcium carbonate, ' +
  'alprazolam, clonazepam, escitalopram, sertraline';

function cleanAudio(buffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const errLines = [];
    const ff = spawn('ffmpeg', [
      '-nostdin',
      '-i', 'pipe:0',
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      '-y',
      'pipe:1',
    ]);
    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', d => errLines.push(d.toString()));
    ff.on('error', reject);
    ff.on('close', code => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const msg = errLines.join('').slice(-400);
        reject(new Error(`ffmpeg exited ${code}: ${msg}`));
      }
    });
    ff.stdin.write(buffer);
    ff.stdin.end();
  });
}

const HALLUCINATION_PHRASES = [
  'this is a medical consultation',
  'medical terminology is used',
  'transcribe accurately',
  'dose and frequency',
  'thank you for watching',
  'thank you for your time',
  'please subscribe',
];

function isHallucination(text) {
  if (!text || text.length < 4) return true;
  const lower = text.toLowerCase();
  if (HALLUCINATION_PHRASES.some(p => lower.includes(p))) return true;
  const words = lower.split(/\s+/);
  if (words.length > 16) {
    const unique = new Set(words).size;
    if (unique / words.length < 0.25) return true;
  }
  return false;
}

async function transcribeAudio(buffer, mimetype = 'audio/webm', language = 'en', specialization = 'general', drugFormulary = '') {
  const apiKey = groqKey();
  const model  = groqModel();
  if (!apiKey) throw new Error('GROQ_API_KEY not configured — add it to .env and restart');

  let audioBuffer = buffer;
  let audioMime   = mimetype;
  let filename    = 'audio.webm';

  try {
    audioBuffer = await cleanAudio(buffer);
    audioMime   = 'audio/wav';
    filename    = 'audio.wav';
  } catch (err) {
    console.warn('[scribe] ffmpeg preprocessing failed, sending raw audio:', err.message);
  }

  const form = new FormData();
  form.append('file',            audioBuffer, { filename, contentType: audioMime });
  form.append('model',           model);
  form.append('response_format', 'json');
  if (language && language !== 'auto') form.append('language', language);
  form.append('prompt', WHISPER_PROMPT_BASE);

  console.log('[scribe] calling groq model:', model);
  const res = await axios.post(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    form,
    {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` },
      timeout: 30_000,
    }
  );

  const text = (res.data?.text || '').trim();
  console.log('[scribe] groq raw:', JSON.stringify(res.data?.text?.slice(0, 80)), '| filtered:', isHallucination(text));
  return isHallucination(text) ? '' : text;
}

const HALLUCINATION_GUARD =
  'STRICT RULES: ' +
  '(1) Do not assume, infer, or add any symptom, diagnosis, medication, test, or advice not explicitly stated in the transcript. ' +
  '(2) If a field value is uncertain or not clearly stated, write "unclear" for string fields or null for missing ones. ' +
  '(3) Only extract what was directly said. Do not complete, guess, or embellish.';

function buildPatientContext(ctx) {
  if (!ctx) return '';
  const lines = [];

  if (ctx.patient) {
    const { name, age, gender, medical_history, medications } = ctx.patient;
    const parts = [];
    if (name)   parts.push(`Name: ${name}`);
    if (age)    parts.push(`Age: ${age}`);
    if (gender) parts.push(`Gender: ${gender}`);
    if (parts.length) lines.push('PATIENT: ' + parts.join(', '));

    if (medical_history?.length) {
      const conditions = medical_history
        .map(h => h.condition || h.label || h.key)
        .filter(Boolean);
      if (conditions.length) lines.push('KNOWN CONDITIONS: ' + conditions.join(', '));
    }
    if (medications?.length) {
      const meds = medications.map(m => m.name).filter(Boolean);
      if (meds.length) lines.push('CURRENT MEDICATIONS: ' + meds.join(', '));
    }
  }

  if (ctx.pastNotes?.length) {
    const recent = ctx.pastNotes.slice(0, 2);
    lines.push('RECENT ENCOUNTERS:');
    recent.forEach((note, i) => {
      const date = note.created_at
        ? new Date(note.created_at).toLocaleDateString('en-IN')
        : `visit ${i + 1}`;
      const parts = [];
      if (note.diagnosis?.length)
        parts.push('Dx: ' + note.diagnosis.map(d => d.display || d).join(', '));
      if (note.symptoms?.length)
        parts.push('Sx: ' + note.symptoms.map(s => s.name || s).join(', '));
      if (note.medications?.length)
        parts.push('Rx: ' + note.medications.map(m => m.name).filter(Boolean).join(', '));
      if (parts.length) lines.push(`  [${date}] ${parts.join(' | ')}`);
    });
  }

  // Inject specialization vocabulary so the LLM recognises domain-specific terms
  const specVocab = SPECIALIZATION_VOCAB[ctx.specialization?.toLowerCase()];
  if (specVocab) {
    lines.push(`SPECIALIZATION: ${ctx.specialization} — key terms: ${specVocab}`);
  }

  if (ctx.drugFormulary) {
    lines.push('CLINIC FORMULARY (prefer these drug names when they match what was said): ' + ctx.drugFormulary);
  }

  return lines.length
    ? '\n\n--- PATIENT CONTEXT (use only to improve accuracy; do not add unstated information) ---\n' +
      lines.join('\n') + '\n---\n\n'
    : '';
}

// Single-pass prompt: clean the transcript AND extract SOAP in one LLM call.
const MERGED_PROMPT =
  'You are a medical scribe. Given a raw speech-to-text transcript, perform two tasks in one response:\n' +
  '1. CLEAN: Fix grammar and punctuation. Expand medical abbreviations (BP→blood pressure, SOB→shortness of breath, OD→once daily, BD→twice daily, TDS→three times daily, Hx→history, Rx→prescription). Correct obvious mis-transcriptions. Translate everything to English preserving all clinical meaning. Use patient context (if provided) only to resolve ambiguous terms.\n' +
  '2. EXTRACT: Extract structured SOAP data from the cleaned transcript.\n' +
  'The transcript may be in English, Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, or a mix.\n' +
  '- Use the patient context (if provided) to correctly attribute known vs. newly mentioned conditions.\n' +
  '- Prefer drug names from the clinic formulary when they match what was said.\n' +
  HALLUCINATION_GUARD + '\n' +
  'Return ONLY a valid JSON object (use null for missing fields, [] if nothing found):\n' +
  '{\n' +
  '  "cleaned": "the full cleaned English transcript text",\n' +
  '  "chief_complaint": "string or null",\n' +
  '  "past_medical_history": [{"condition": "string", "since": "string or null"}],\n' +
  '  "symptoms": [{"name": "string", "since": "string or null", "severity": "Mild or Moderate or Severe or null"}],\n' +
  '  "diagnosis": [{"display": "string", "code": "SNOMED code or null", "system": "http://snomed.info/sct"}],\n' +
  '  "medications": [{"name": "string", "dose": "string or null", "frequency": "string or null", "duration": "string or null", "timing": "string or null", "instructions": "string or null"}],\n' +
  '  "lab_investigations": [{"test": "string", "remarks": "string or null"}],\n' +
  '  "lab_results": [{"test": "string", "result": "string or null", "unit": "string or null", "range": "string or null"}],\n' +
  '  "procedures": ["string"],\n' +
  '  "vitals": {"bp_systolic": null, "bp_diastolic": null, "pulse": null, "temp": null, "temp_f": null, "spo2": null, "respiratory_rate": null, "height": null, "weight": null, "abdominal_grade": null, "bsa": null, "waist": null, "hemoglobin": null, "platelets": null, "inr": null, "rbs": null, "fbs": null, "ppbs": null, "hba1c": null, "creatinine": null, "tsh": null, "pain_score": null, "lmp": null},\n' +
  '  "examination_findings": "string or null",\n' +
  '  "notes": "string or null",\n' +
  '  "refer_to": "string or null",\n' +
  '  "advices": "string or null",\n' +
  '  "next_visit_date": "YYYY-MM-DD or null",\n' +
  '  "next_visit_notes": "string or null"\n' +
  '}\n\n' +
  'Raw transcript:\n';

async function groqLLM(prompt) {
  const apiKey = groqKey();
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  const res = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: GROQ_LLM_MODEL,
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a medical scribe assistant. Always respond with valid JSON only.' },
        { role: 'user',   content: prompt },
      ],
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60_000,
    }
  );
  return res.data?.choices?.[0]?.message?.content || '';
}

async function extractSOAP(transcript, ctx = null, focusPrompt = '') {
  const patientContext = buildPatientContext(ctx);
  const templateSection = focusPrompt
    ? '\n\n--- TEMPLATE FOCUS (follow these extraction rules for this consultation type) ---\n' +
      focusPrompt.trim() + '\n---\n\n'
    : '';
  const prompt = MERGED_PROMPT + patientContext + templateSection + transcript;
  const raw = await groqLLM(prompt);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  }
  const { cleaned = transcript, ...soap } = parsed;
  return { cleaned, soap };
}

module.exports = { transcribeAudio, extractSOAP };
