// Gemini model shared by every Gemini feature (PHR document analysis, EMR lab summary,
// WhatsApp booking assistant, scribe status check). Google closes older models to new
// keys (gemini-2.5-flash) and retires others (gemini-1.5-flash), so this is overridable
// with GEMINI_MODEL instead of a code change next time.
// gemini-3.5-flash over 3.8-flash: on this key 3.8 took ~35 s for a 400-token reply
// (past the 30 s request timeout), 3.5 took ~5 s for the same prompt (2026-11-09).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const geminiUrl = (method = 'generateContent') =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}${method ? `:${method}` : ''}`;

module.exports = { GEMINI_MODEL, geminiUrl };
