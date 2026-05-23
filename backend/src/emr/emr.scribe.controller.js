const multer = require('multer');
const scribe = require('../services/scribe.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/emr/scribe/transcribe  — multipart: audio_file
const transcribe = [
  upload.single('audio_file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'audio_file required' });
    try {
      const language = req.body.language || 'en';
      const text = await scribe.transcribeAudio(req.file.buffer, req.file.mimetype, language);
      res.json({ text });
    } catch (err) {
      const detail = err.response?.data || err.message;
      res.status(502).json({ error: 'Whisper transcription failed', detail });
    }
  },
];

// POST /api/emr/scribe/soap  — { transcript: string }
// Returns { cleaned, soap }
const extractSOAP = async (req, res) => {
  const { transcript } = req.body;
  if (!transcript?.trim()) return res.status(400).json({ error: 'transcript required' });
  try {
    const { cleaned, soap } = await scribe.extractSOAP(transcript);
    res.json({ cleaned, soap });
  } catch (err) {
    const detail = err.response?.data || err.message;
    res.status(502).json({ error: 'SOAP extraction failed', detail });
  }
};

// GET /api/emr/scribe/status  — health check for whisper + gemini
const status = async (req, res) => {
  const axios = require('axios');
  const WHISPER = process.env.WHISPER_BASE_URL || 'http://whisper:9000';
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  const checkWhisper = async () => {
    try { await axios.get(WHISPER, { timeout: 3000 }); return 'ok'; }
    catch { return 'unavailable'; }
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

  const [whisper, gemini] = await Promise.all([checkWhisper(), checkGemini()]);
  res.json({ whisper, gemini });
};

module.exports = { transcribe, extractSOAP, status };
