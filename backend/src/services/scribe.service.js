const axios = require('axios');
const FormData = require('form-data');

const WHISPER_BASE = process.env.WHISPER_BASE_URL || 'http://whisper:9000';
const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL  || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL     || 'gemma2:2b';

async function transcribeAudio(buffer, mimetype = 'audio/webm') {
  const form = new FormData();
  form.append('audio_file', buffer, { filename: 'audio.webm', contentType: mimetype });

  const res = await axios.post(
    `${WHISPER_BASE}/asr?task=transcribe&language=en&output=json`,
    form,
    { headers: form.getHeaders(), timeout: 60_000 }
  );
  return (res.data?.text || '').trim();
}

const SOAP_PROMPT = `You are a medical scribe. Extract structured SOAP notes from the doctor-patient conversation below.
Return ONLY a valid JSON object with this exact structure (use null for missing fields, empty arrays [] if nothing found):
{
  "chief_complaint": "string or null",
  "symptoms": [{"name": "string", "since": "string or null", "severity": "Mild or Moderate or Severe or null"}],
  "diagnosis": [{"display": "string", "code": "SNOMED code or null", "system": "http://snomed.info/sct"}],
  "medications": [{"name": "string", "dose": "string or null", "frequency": "string or null", "duration": "string or null", "instructions": "string or null"}],
  "lab_investigations": [{"test": "string", "remarks": "string or null"}],
  "vitals": {"bp_systolic": null, "bp_diastolic": null, "pulse": null, "temp": null, "spo2": null, "respiratory_rate": null, "height": null, "weight": null},
  "examination_findings": "string or null",
  "notes": "string or null",
  "refer_to": "string or null",
  "advices": "string or null",
  "next_visit_date": "YYYY-MM-DD or null"
}

Transcript:
`;

async function extractSOAP(transcript) {
  const res = await axios.post(
    `${OLLAMA_BASE}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt: SOAP_PROMPT + transcript,
      stream: false,
      format: 'json',
      options: { temperature: 0.1, num_predict: 1024 },
    },
    { timeout: 120_000 }
  );

  const raw = res.data?.response || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

module.exports = { transcribeAudio, extractSOAP };
