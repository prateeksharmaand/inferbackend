const multer = require('multer');
const scribe = require('../services/scribe.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/emr/scribe/transcribe  — multipart: audio_file
const transcribe = [
  upload.single('audio_file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'audio_file required' });
    try {
      const text = await scribe.transcribeAudio(req.file.buffer, req.file.mimetype);
      res.json({ text });
    } catch (err) {
      const detail = err.response?.data || err.message;
      res.status(502).json({ error: 'Whisper transcription failed', detail });
    }
  },
];

// POST /api/emr/scribe/soap  — { transcript: string }
const extractSOAP = async (req, res) => {
  const { transcript } = req.body;
  if (!transcript?.trim()) return res.status(400).json({ error: 'transcript required' });
  try {
    const soap = await scribe.extractSOAP(transcript);
    res.json(soap);
  } catch (err) {
    const detail = err.response?.data || err.message;
    res.status(502).json({ error: 'SOAP extraction failed', detail });
  }
};

// GET /api/emr/scribe/status  — health check for whisper + ollama
const status = async (req, res) => {
  const axios = require('axios');
  const WHISPER = process.env.WHISPER_BASE_URL || 'http://whisper:9000';
  const OLLAMA  = process.env.OLLAMA_BASE_URL  || 'http://ollama:11434';
  const check = async (url) => {
    try { await axios.get(url, { timeout: 3000 }); return 'ok'; }
    catch { return 'unavailable'; }
  };
  const [whisper, ollama] = await Promise.all([check(WHISPER), check(`${OLLAMA}/api/tags`)]);
  res.json({ whisper, ollama });
};

module.exports = { transcribe, extractSOAP, status };
