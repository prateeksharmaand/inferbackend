const multer = require('multer');
const scribe = require('../services/scribe.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/emr/scribe/transcribe  — multipart: audio_file
const transcribe = [
  upload.single('audio_file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'audio_file required' });
    try {
      const language       = req.body.language       || 'auto';
      const specialization = req.body.specialization || 'general';
      const drugFormulary  = req.body.drugFormulary  || '';
      const text = await scribe.transcribeAudio(req.file.buffer, req.file.mimetype, language, specialization, drugFormulary);
      res.json({ text });
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error('[scribe] transcribe failed:', JSON.stringify(detail));
      res.status(502).json({ error: 'Transcription failed', detail });
    }
  },
];

// POST /api/emr/scribe/soap  — { transcript: string, context?: object, focusPrompt?: string }
// Returns { cleaned, soap }
const extractSOAP = async (req, res) => {
  const { transcript, context, focusPrompt } = req.body;
  if (!transcript?.trim()) return res.status(400).json({ error: 'transcript required' });
  try {
    const { cleaned, soap } = await scribe.extractSOAP(transcript, context || null, focusPrompt || '');
    res.json({ cleaned, soap });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[scribe] SOAP extraction failed:', detail);
    res.status(502).json({ error: 'SOAP extraction failed', detail });
  }
};

// GET /api/emr/scribe/status  — health check for groq + gemini
const status = async (req, res) => {
  const axios = require('axios');
  const GROQ_KEY   = process.env.GROQ_API_KEY || '';
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  const checkGroq = async () => {
    if (!GROQ_KEY) return 'no api key';
    try {
      await axios.get('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${GROQ_KEY}` }, timeout: 5000,
      });
      return 'ok';
    } catch { return 'unavailable'; }
  };
  const checkGemini = async () => {
    if (!GEMINI_KEY) return 'no api key';
    try {
      await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${GEMINI_KEY}`,
        { timeout: 5000 }
      );
      return 'ok';
    } catch { return 'unavailable'; }
  };

  const [groq, gemini] = await Promise.all([checkGroq(), checkGemini()]);
  res.json({ groq, gemini });
};

module.exports = { transcribe, extractSOAP, status };
