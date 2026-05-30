/**
 * Exotel adapter — IVR Voice + WhatsApp + SMS (India)
 * Single provider for all inbound channels.
 *
 * Exotel provides Indian virtual numbers and is a Meta WhatsApp BSP.
 * Docs: https://developer.exotel.com
 *
 * API versions used:
 *  v1 — SMS send / Voice ExoML
 *  v2 — WhatsApp send / receive
 */
const crypto = require('crypto');
const axios  = require('axios');
const logger = require('../../utils/logger');

// ── Auth helpers ──────────────────────────────────────────────────────────
function _v1Auth() {
  return {
    username: process.env.EXOTEL_SID,
    password: process.env.EXOTEL_TOKEN,
  };
}

function _v2Headers() {
  // Exotel v2 uses Bearer token generated from SID + Token
  const token = Buffer.from(`${process.env.EXOTEL_SID}:${process.env.EXOTEL_TOKEN}`).toString('base64');
  return {
    'Authorization': `Basic ${token}`,
    'Content-Type':  'application/json',
  };
}

const _v1Base = () =>
  `https://api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}`;

const _v2Base = () =>
  `https://api.exotel.com/v2/accounts/${process.env.EXOTEL_SID}`;

// ── Webhook signature verification ────────────────────────────────────────
// Exotel signs webhooks with HMAC-SHA1 of the raw body using EXOTEL_TOKEN.
// Header: X-Exotel-Signature
function verifyWebhookSignature(rawBody, signatureHeader) {
  const token = process.env.EXOTEL_TOKEN;
  if (!token) {
    logger.warn('[Exotel] EXOTEL_TOKEN not set — skipping signature check');
    return true;
  }
  try {
    const expected = crypto
      .createHmac('sha1', token)
      .update(Buffer.from(rawBody || '', 'utf8'))
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader || ''),
      Buffer.from(expected)
    );
  } catch (err) {
    logger.error('[Exotel] signature verification error', err.message);
    return false;
  }
}

// ── Send SMS (Exotel v1) ──────────────────────────────────────────────────
async function sendSms(from, to, text) {
  if (!process.env.EXOTEL_SID) { logger.warn('[Exotel] EXOTEL_SID not set'); return; }
  const mobile = _normalise(to);
  try {
    const params = new URLSearchParams({
      From:   process.env.EXOTEL_VIRTUAL_NUMBER || from,
      To:     mobile,
      Body:   text,
    });
    const { data } = await axios.post(
      `${_v1Base()}/Sms/send`,
      params.toString(),
      {
        auth:    _v1Auth(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    logger.info(`[Exotel] SMS sent to ${to}`, { sid: data?.SMSMessage?.Sid });
    return data;
  } catch (err) {
    logger.error(`[Exotel] SMS failed to ${to}`, err.response?.data || err.message);
    throw err;
  }
}

// ── Send WhatsApp (Exotel v2) ─────────────────────────────────────────────
// Session messages (free text) are allowed within 24 h of patient initiating.
async function sendWhatsApp(from, to, text) {
  if (!process.env.EXOTEL_SID) { logger.warn('[Exotel] EXOTEL_SID not set'); return; }
  const waNumber = process.env.EXOTEL_WHATSAPP_NUMBER || from;
  try {
    const { data } = await axios.post(
      `${_v2Base()}/whatsapp/messages`,
      {
        from:    _normalise(waNumber),
        to:      _normalise(to),
        content: { type: 'text', text },
      },
      { headers: _v2Headers() }
    );
    logger.info(`[Exotel] WhatsApp sent to ${to}`, { id: data?.id });
    return data;
  } catch (err) {
    logger.error(`[Exotel] WhatsApp failed to ${to}`, err.response?.data || err.message);
    throw err;
  }
}

// ── Route to correct channel ──────────────────────────────────────────────
async function sendMessage(channel, from, to, text) {
  if (channel === 'whatsapp') return sendWhatsApp(from, to, text);
  return sendSms(from, to, text);
}

// ── ExoML IVR builders ────────────────────────────────────────────────────
// ExoML is XML-based (very similar to TwiML).

function buildGreetingTeXml(clinicName, gatherUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Welcome to ${_x(clinicName)}. For a new appointment press 1. To cancel press 2. To speak with staff press 0.</Say>
  <Gather action="${_x(gatherUrl)}" method="POST" numDigits="1" timeout="8">
    <Say>Please press a key now.</Say>
  </Gather>
  <Say>We did not receive your input. Please call back. Thank you.</Say>
</Response>`;
}

function buildDoctorMenuTeXml(doctors, gatherUrl) {
  const lines = doctors.slice(0, 9)
    .map((d, i) => `For ${_x(d.name)} press ${i + 1}.`)
    .join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${_x(gatherUrl)}" method="POST" numDigits="1" timeout="8">
    <Say>${lines} To go back press 0.</Say>
  </Gather>
  <Say>We did not receive your input. Goodbye.</Say>
</Response>`;
}

function buildCallbackTeXml(doctorName) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you. We have noted your request for ${_x(doctorName)}. You will receive a confirmation SMS shortly. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function buildHandoffTeXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please hold while we connect you to our staff.</Say>
</Response>`;
}

function buildGoodbyeTeXml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${_x(message)}</Say>
  <Hangup/>
</Response>`;
}

// ── Parse inbound Exotel SMS webhook (form-encoded) ───────────────────────
// Fields: SmsSid, From, To, Body, Status
function parseInboundSmsEvent(body) {
  const from = body?.From || body?.from;
  const to   = body?.To   || body?.to;
  const text = (body?.Body || body?.body || body?.message || '').trim();
  if (!from || !text) return null;
  return {
    eventType: 'message.received',
    messageId:  body?.SmsSid || body?.id,
    from:      _normalise(from),
    to:        to ? _normalise(to) : null,
    text,
    channel:   'sms',
    raw:       body,
  };
}

// ── Parse inbound Exotel WhatsApp webhook (JSON) ──────────────────────────
// Exotel v2 payload: { id, channel, from, to, content: { type, text } }
function parseInboundWhatsAppEvent(body) {
  // Support both direct and array-wrapped formats
  const msg = Array.isArray(body) ? body[0] : body;
  if (!msg) return null;
  const text = msg?.content?.text || msg?.content?.body || msg?.message?.text || '';
  const from = msg?.from || msg?.sender;
  if (!from || !text) return null;
  return {
    eventType: 'message.received',
    messageId:  msg?.id,
    from:      _normalise(String(from)),
    to:        msg?.to ? _normalise(String(msg.to)) : null,
    text:      String(text).trim(),
    channel:   'whatsapp',
    raw:       body,
  };
}

// ── Parse inbound Exotel Voice call webhook (form-encoded) ────────────────
// Fields: CallSid, From, To, Direction, Status, CurrentTime
function parseInboundCallEvent(body) {
  if (!body?.CallSid) return null;
  return {
    eventType:     'call.initiated',
    callControlId: body.CallSid,
    callLegId:     body.CallSid,
    from:          _normalise(body.From || ''),
    to:            _normalise(body.To   || ''),
    channel:       'ivr',
    raw:           body,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function _normalise(num) {
  const s = String(num || '').replace(/\D/g, '');
  if (s.startsWith('91') && s.length === 12) return `+${s}`;
  if (s.length === 10) return `+91${s}`;
  return `+${s}`;
}

function _x(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  verifyWebhookSignature,
  sendSms,
  sendWhatsApp,
  sendMessage,
  buildGreetingTeXml,
  buildDoctorMenuTeXml,
  buildCallbackTeXml,
  buildHandoffTeXml,
  buildGoodbyeTeXml,
  parseInboundSmsEvent,
  parseInboundWhatsAppEvent,
  parseInboundCallEvent,
};
