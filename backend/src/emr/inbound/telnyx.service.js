/**
 * Twilio adapter — SMS, WhatsApp, and IVR (TwiML)
 * Replaces Telnyx: same exported API, Twilio implementation underneath.
 *
 * India coverage: Twilio supports SMS, WhatsApp Business API, and Voice in India.
 * WhatsApp numbers must be provisioned via Twilio's WhatsApp sandbox or approved sender.
 */
const crypto = require('crypto');
const axios  = require('axios');
const logger = require('../../utils/logger');

const TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts';

// ── Webhook signature verification (HMAC-SHA1) ────────────────────────────
// Twilio signs webhooks with HMAC-SHA1 over: fullUrl + sorted(key+value pairs)
function verifyWebhookSignature(rawBody, signatureHeader, _unused, fullUrl, formParams) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.warn('[Twilio] TWILIO_AUTH_TOKEN not set — skipping signature check');
    return true;
  }
  try {
    // Build the string Twilio signs
    const sorted = Object.keys(formParams || {}).sort()
      .reduce((s, k) => s + k + (formParams[k] ?? ''), '');
    const toSign  = (fullUrl || '') + sorted;
    const expected = crypto.createHmac('sha1', authToken)
      .update(Buffer.from(toSign, 'utf8'))
      .digest('base64');
    // Timing-safe compare
    const a = Buffer.from(signatureHeader || '');
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    logger.error('[Twilio] signature verification error', err.message);
    return false;
  }
}

// ── Twilio REST helper ────────────────────────────────────────────────────
function _twilioPost(path, data) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set');

  const params = new URLSearchParams(data).toString();
  return axios.post(`${TWILIO_API}/${sid}${path}`, params, {
    auth: { username: sid, password: token },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

// ── Send SMS ──────────────────────────────────────────────────────────────
async function sendSms(from, to, text) {
  try {
    const { data } = await _twilioPost('/Messages.json', { From: from, To: to, Body: text });
    logger.info(`[Twilio] SMS sent to ${to}`, { sid: data.sid });
    return data;
  } catch (err) {
    logger.error(`[Twilio] SMS send failed to ${to}`, err.response?.data || err.message);
    throw err;
  }
}

// ── Send WhatsApp ─────────────────────────────────────────────────────────
// Twilio WhatsApp: prefix numbers with "whatsapp:"
async function sendWhatsApp(from, to, text) {
  const waFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const waTo   = to.startsWith('whatsapp:')   ? to   : `whatsapp:${to}`;
  try {
    const { data } = await _twilioPost('/Messages.json', { From: waFrom, To: waTo, Body: text });
    logger.info(`[Twilio] WhatsApp sent to ${to}`, { sid: data.sid });
    return data;
  } catch (err) {
    logger.error(`[Twilio] WhatsApp send failed to ${to}`, err.response?.data || err.message);
    throw err;
  }
}

// ── Send via appropriate channel ──────────────────────────────────────────
async function sendMessage(channel, from, to, text) {
  if (channel === 'whatsapp') return sendWhatsApp(from, to, text);
  return sendSms(from, to, text);
}

// ── TwiML IVR builder ─────────────────────────────────────────────────────
// TwiML is nearly identical to TeXML — only tag/attribute names differ slightly.

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
  const lines = doctors.slice(0, 9).map((d, i) =>
    `For ${_escapeXml(d.name)}, press ${i + 1}.`
  ).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${_escapeXml(gatherUrl)}" method="POST" numDigits="1" timeout="8">
    <Say voice="Polly.Aditi" language="en-IN">
      ${lines} To go back, press 0.
    </Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">We did not receive your input. Goodbye.</Say>
</Response>`;
}

function buildCallbackTeXml(doctorName) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Thank you. We have noted your request for ${_escapeXml(doctorName)}.
    Our staff will send you a confirmation SMS shortly. Goodbye.
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
  <Enqueue waitUrl="/webhook/twilio/hold-music">staff_queue</Enqueue>
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Parse inbound Twilio SMS/WhatsApp webhook (form-encoded POST) ─────────
function parseInboundSmsEvent(body) {
  // Twilio sends: From, To, Body, MessageSid, SmsStatus, Channel (whatsapp:+xxx prefix)
  if (!body?.From || !body?.Body) return null;
  const rawFrom = String(body.From);
  const rawTo   = String(body.To || '');
  const isWhatsApp = rawFrom.startsWith('whatsapp:');
  return {
    eventType:  'message.received',
    messageId:  body.MessageSid,
    from:       rawFrom.replace('whatsapp:', ''),
    to:         rawTo.replace('whatsapp:', ''),
    text:       (body.Body || '').trim(),
    channel:    isWhatsApp ? 'whatsapp' : 'sms',
    raw:        body,
  };
}

// ── Parse inbound Twilio Voice call webhook (form-encoded POST) ───────────
function parseInboundCallEvent(body) {
  if (!body?.CallSid) return null;
  return {
    eventType:     body.CallStatus || 'call.initiated',
    callControlId: body.CallSid,
    callLegId:     body.CallSid,
    from:          body.From,
    to:            body.To,
    channel:       'ivr',
    raw:           body,
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
