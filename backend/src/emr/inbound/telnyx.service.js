/**
 * Telnyx adapter — SMS, WhatsApp, and IVR (TeXML)
 * Uses Telnyx v2 REST API via axios (no SDK required)
 * Webhook signature: Ed25519 via Node built-in crypto
 */
const crypto = require('crypto');
const axios  = require('axios');
const logger = require('../../utils/logger');

const TELNYX_API = 'https://api.telnyx.com/v2';

// ── Webhook signature verification (Ed25519) ──────────────────────────────
function verifyWebhookSignature(rawBody, signatureHeader, timestampHeader) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) {
    logger.warn('[Telnyx] TELNYX_PUBLIC_KEY not set — skipping signature check');
    return true;
  }
  try {
    // Tolerance: reject messages older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestampHeader, 10)) > 300) return false;

    const payload      = Buffer.from(`${timestampHeader}|${rawBody}`);
    const sigBytes     = Buffer.from(signatureHeader, 'base64');
    const pubKeyObject = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, payload, pubKeyObject, sigBytes);
  } catch (err) {
    logger.error('[Telnyx] signature verification error', err.message);
    return false;
  }
}

// ── Send SMS ──────────────────────────────────────────────────────────────
async function sendSms(from, to, text) {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) { logger.warn('[Telnyx] TELNYX_API_KEY not set — SMS not sent'); return; }
  try {
    const { data } = await axios.post(
      `${TELNYX_API}/messages`,
      { from, to, text, type: 'SMS' },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    logger.info(`[Telnyx] SMS sent to ${to}`, { id: data.data?.id });
    return data.data;
  } catch (err) {
    logger.error(`[Telnyx] SMS send failed to ${to}`, err.response?.data || err.message);
    throw err;
  }
}

// ── Send WhatsApp ─────────────────────────────────────────────────────────
async function sendWhatsApp(from, to, text) {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) { logger.warn('[Telnyx] TELNYX_API_KEY not set — WhatsApp not sent'); return; }
  try {
    const { data } = await axios.post(
      `${TELNYX_API}/messages`,
      { from, to, text, type: 'WhatsApp' },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    logger.info(`[Telnyx] WhatsApp sent to ${to}`, { id: data.data?.id });
    return data.data;
  } catch (err) {
    logger.error(`[Telnyx] WhatsApp send failed to ${to}`, err.response?.data || err.message);
    throw err;
  }
}

// ── Send via appropriate channel ──────────────────────────────────────────
async function sendMessage(channel, from, to, text) {
  if (channel === 'whatsapp') return sendWhatsApp(from, to, text);
  return sendSms(from, to, text); // default: sms
}

// ── TeXML IVR builder ─────────────────────────────────────────────────────
// Returns XML string to send as response to Telnyx IVR webhook

function buildGreetingTeXml(clinicName, gatherUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Welcome to ${_escapeXml(clinicName)}.
    For a new appointment, press 1.
    To cancel an appointment, press 2.
    To speak with our staff, press 0.
  </Say>
  <Gather action="${_escapeXml(gatherUrl)}" method="POST" numDigits="1" timeout="8">
    <Say voice="Polly.Aditi" language="en-IN">Please press a key now.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">We did not receive your input. Please call back.</Say>
</Response>`;
}

function buildDoctorMenuTeXml(doctors, gatherUrl) {
  const doctorLines = doctors.slice(0, 9).map((d, i) =>
    `For ${_escapeXml(d.name)}, press ${i + 1}.`
  ).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    ${doctorLines} To go back, press 0.
  </Say>
  <Gather action="${_escapeXml(gatherUrl)}" method="POST" numDigits="1" timeout="8">
    <Say voice="Polly.Aditi" language="en-IN">Please press your choice.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">We did not receive your input. Goodbye.</Say>
</Response>`;
}

function buildCallbackTeXml(doctorName) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Thank you. We have noted your request for ${_escapeXml(doctorName)}.
    Our staff will send you a confirmation SMS shortly.
    Goodbye.
  </Say>
  <Hangup/>
</Response>`;
}

function buildHandoffTeXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Please hold while we connect you to our staff.
  </Say>
  <Enqueue waitUrl="/webhook/telnyx/hold-music">staff_queue</Enqueue>
</Response>`;
}

function buildGoodbyeTeXml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">${_escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

function _escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Format inbound webhook event ──────────────────────────────────────────
function parseInboundSmsEvent(body) {
  const payload = body?.data?.payload;
  if (!payload) return null;
  return {
    eventType:  body.data.event_type,  // message.received
    messageId:  payload.id,
    from:       payload.from?.phone_number,
    to:         payload.to?.[0]?.phone_number,
    text:       (payload.text || '').trim(),
    channel:    (payload.type || 'SMS').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'sms',
    raw:        body,
  };
}

function parseInboundCallEvent(body) {
  const payload = body?.data?.payload;
  if (!payload) return null;
  return {
    eventType:      body.data.event_type,
    callControlId:  payload.call_control_id,
    callLegId:      payload.call_leg_id,
    from:           payload.from,
    to:             payload.to,
    channel:        'ivr',
    raw:            body,
  };
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
  parseInboundCallEvent,
};
