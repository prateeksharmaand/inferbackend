const axios = require('axios');
const FormData = require('form-data');
const { spawn } = require('child_process');

const WHISPER_BASE  = process.env.WHISPER_BASE_URL || 'http://whisper:9000';
const GEMINI_KEY    = process.env.GEMINI_API_KEY;
const GEMINI_MODEL  = 'gemini-2.5-flash';
const GEMINI_BASE   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const WHISPER_PROMPT = encodeURIComponent(
  'This is a medical consultation between a doctor and patient. ' +
  'Medical terminology is used. Transcribe accurately: chief complaint, ' +
  'symptoms and duration, past medical history, current medications with dose and frequency, ' +
  'allergies, vital signs (blood pressure, pulse, temperature, SpO2, respiratory rate, weight, height, BMI), ' +
  'physical examination findings, diagnosis, prescribed medications with instructions, ' +
  'lab tests ordered, referrals, follow-up date and instructions, and patient advice.'
);

function cleanAudio(buffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const errLines = [];
    const ff = spawn('ffmpeg', [
      '-nostdin',
      '-i', 'pipe:0',
      '-af', 'afftdn=nf=-25,loudnorm',
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

async function transcribeAudio(buffer, mimetype = 'audio/webm') {
  let audioBuffer = buffer;
  let audioMime = mimetype;
  let filename = 'audio.webm';

  try {
    audioBuffer = await cleanAudio(buffer);
    audioMime = 'audio/wav';
    filename = 'audio.wav';
  } catch (err) {
    console.warn('[scribe] ffmpeg preprocessing failed, sending raw audio:', err.message);
  }

  const form = new FormData();
  form.append('audio_file', audioBuffer, { filename, contentType: audioMime });

  const res = await axios.post(
    `${WHISPER_BASE}/asr?task=transcribe&language=en&output=json&initial_prompt=${WHISPER_PROMPT}`,
    form,
    { headers: form.getHeaders(), timeout: 60_000 }
  );
  return (res.data?.text || '').trim();
}

const HALLUCINATION_GUARD =
  'STRICT RULES: ' +
  '(1) Do not assume, infer, or add any symptom, diagnosis, medication, test, or advice not explicitly stated in the transcript. ' +
  '(2) If a field value is uncertain or not clearly stated, write "unclear" for string fields or null for missing ones. ' +
  '(3) Only extract what was directly said. Do not complete, guess, or embellish.';

const CLEANUP_PROMPT =
  'You are a medical transcription editor. Your only task is to clean up the raw speech-to-text transcript below.\n' +
  'Rules:\n' +
  '- Fix grammar and punctuation.\n' +
  '- Expand common medical abbreviations (e.g. "BP" → "blood pressure", "SOB" → "shortness of breath", "Hx" → "history", "Rx" → "prescription", "OD" → "once daily", "BD" → "twice daily", "TDS" → "three times daily").\n' +
  '- Correct obvious mis-transcriptions of medical terms (e.g. "hamoglobin" → "hemoglobin").\n' +
  '- Keep the meaning and all factual content exactly as spoken. Do not add, remove, or rephrase clinical information.\n' +
  HALLUCINATION_GUARD + '\n' +
  'Return ONLY the cleaned transcript text, nothing else.\n\n' +
  'Raw transcript:\n';

const SOAP_PROMPT =
  'You are a medical scribe. Extract structured SOAP notes from the cleaned doctor-patient conversation below.\n' +
  HALLUCINATION_GUARD + '\n' +
  'Return ONLY a valid JSON object with this exact structure (use null for missing fields, empty arrays [] if nothing found):\n' +
  '{\n' +
  '  "chief_complaint": "string or null",\n' +
  '  "symptoms": [{"name": "string", "since": "string or null", "severity": "Mild or Moderate or Severe or null"}],\n' +
  '  "diagnosis": [{"display": "string", "code": "SNOMED code or null", "system": "http://snomed.info/sct"}],\n' +
  '  "medications": [{"name": "string", "dose": "string or null", "frequency": "string or null", "duration": "string or null", "instructions": "string or null"}],\n' +
  '  "lab_investigations": [{"test": "string", "remarks": "string or null"}],\n' +
  '  "vitals": {"bp_systolic": null, "bp_diastolic": null, "pulse": null, "temp": null, "spo2": null, "respiratory_rate": null, "height": null, "weight": null},\n' +
  '  "examination_findings": "string or null",\n' +
  '  "notes": "string or null",\n' +
  '  "refer_to": "string or null",\n' +
  '  "advices": "string or null",\n' +
  '  "next_visit_date": "YYYY-MM-DD or null"\n' +
  '}\n\n' +
  'Cleaned transcript:\n';

async function geminiGenerate(prompt, json = false) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY env var not set');
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: json ? 8192 : 2048,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const res = await axios.post(`${GEMINI_BASE}?key=${GEMINI_KEY}`, body, { timeout: 60_000 });
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function cleanTranscript(rawTranscript) {
  try {
    const cleaned = await geminiGenerate(CLEANUP_PROMPT + rawTranscript, false);
    return cleaned.trim() || rawTranscript;
  } catch (err) {
    console.warn('[scribe] cleanup pass failed, using raw transcript:', err.message);
    return rawTranscript;
  }
}

async function extractSOAP(transcript) {
  const cleaned = await cleanTranscript(transcript);
  const raw = await geminiGenerate(SOAP_PROMPT + cleaned, true);
  try {
    return { cleaned, soap: JSON.parse(raw) };
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    return { cleaned, soap: match ? JSON.parse(match[0]) : {} };
  }
}

module.exports = { transcribeAudio, cleanTranscript, extractSOAP };
