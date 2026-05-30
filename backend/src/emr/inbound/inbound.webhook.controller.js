/**
 * Twilio webhook handlers (India-compatible)
 * ─ POST /webhook/twilio         → SMS + WhatsApp inbound (form-encoded)
 * ─ POST /webhook/twilio/voice   → IVR call initiated (form-encoded)
 * ─ POST /webhook/twilio/gather  → DTMF digit collected (form-encoded)
 * ─ POST /webhook/twilio/status  → Delivery status callbacks
 *
 * All endpoints are PUBLIC (no EMR JWT) but HMAC-SHA1 verified.
 *
 * India note: Twilio requires DLT registration for A2P transactional SMS in India.
 * Register at https://www.trai.gov.in/dlt before sending bulk appointment messages.
 */
const twilio       = require('./telnyx.service');   // Twilio adapter (same exported API)
const orchestrator = require('./booking.orchestrator');
const slot         = require('./slot.service');
const { pool }     = require('../../config/database');
const logger       = require('../../utils/logger');

// ── POST /webhook/twilio ─────────────────────────────────────────────────
// Twilio sends application/x-www-form-urlencoded
const handleSmsWebhook = async (req, res) => {
  // Twilio expects a 200 with empty TwiML or plain 200 to stop retry attempts
  res.type('text/xml').status(200).send('<Response></Response>');

  // Verify Twilio signature
  const sig     = req.headers['x-twilio-signature'] || '';
  const fullUrl = `${process.env.BACKEND_URL}/webhook/twilio`;
  if (!twilio.verifyWebhookSignature(null, sig, null, fullUrl, req.body)) {
    logger.warn('[Webhook/SMS] Twilio signature verification failed');
    return;
  }

  const event = twilio.parseInboundSmsEvent(req.body);
  if (!event) return;

  logger.info(`[Webhook/SMS] ${event.channel} from ${event.from} to ${event.to}: "${event.text}"`);

  try {
    await orchestrator.handleInboundMessage(event.channel, event.from, event.text, event.to);
  } catch (err) {
    logger.error('[Webhook/SMS] orchestrator error', err.message);
  }
};

// ── POST /webhook/twilio/voice — call arrives ────────────────────────────
const handleVoiceWebhook = async (req, res) => {
  const event = twilio.parseInboundCallEvent(req.body);
  if (!event) return res.status(400).end();

  logger.info(`[Webhook/IVR] call from ${event.from} to ${event.to}`);

  const { rows: [clinic] } = await pool.query(
    `SELECT ccc.clinic_id, ec.name AS clinic_name
     FROM clinic_channel_config ccc
     JOIN emr_clinics ec ON ec.id = ccc.clinic_id
     WHERE ccc.channel = 'ivr' AND ccc.channel_address = $1 AND ccc.is_active = TRUE LIMIT 1`,
    [event.to]
  );

  const clinicName = clinic?.clinic_name || 'the clinic';
  const clinicId   = clinic?.clinic_id;

  let doctors = [];
  if (clinicId) doctors = await slot.getDoctors(parseInt(clinicId, 10));

  const gatherUrl = `${process.env.BACKEND_URL}/webhook/twilio/gather?` +
    `from=${encodeURIComponent(event.from)}&to=${encodeURIComponent(event.to)}&clinicId=${clinicId || ''}`;

  if (clinicId) {
    await pool.query(
      `INSERT INTO inbound_conversations (clinic_id, channel, channel_id, to_address, state)
       VALUES ($1,'ivr',$2,$3,'active') ON CONFLICT DO NOTHING`,
      [clinicId, event.from, event.to]
    ).catch(() => {});
  }

  res.type('text/xml').send(twilio.buildGreetingTeXml(clinicName, gatherUrl));
};

// ── POST /webhook/twilio/gather — DTMF digit collected ───────────────────
// Twilio sends Digits in form body (same as Telnyx Gather action)
const handleVoiceGather = async (req, res) => {
  const { Digits, from, to, clinicId, step = 'main' } = { ...req.query, ...req.body };
  const digit = String(Digits || '').trim();

  logger.info(`[Webhook/IVR] gather from=${from} digit=${digit} step=${step}`);

  const backendUrl = process.env.BACKEND_URL;

  if (step === 'main') {
    if (digit === '0') {
      res.type('text/xml').send(twilio.buildHandoffTeXml()); return;
    }

    if (digit === '2') {
      await twilio.sendSms(to, from,
        'Reply CANCEL + your appointment date to cancel. E.g.: CANCEL 2025-06-10'
      ).catch(() => {});
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    We will send you an SMS with instructions to cancel. Goodbye.
  </Say>
  <Hangup/>
</Response>`);
      return;
    }

    if (digit === '1') {
      let doctors = [];
      if (clinicId) doctors = await slot.getDoctors(parseInt(clinicId, 10));
      if (!doctors.length) {
        res.type('text/xml').send(twilio.buildGoodbyeTeXml('No doctors available right now. Please call back later.'));
        return;
      }
      const docGatherUrl = `${backendUrl}/webhook/twilio/gather?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&clinicId=${clinicId}&step=doctor&` +
        doctors.slice(0, 9).map((d, i) => `d${i + 1}=${d.id}`).join('&');
      res.type('text/xml').send(twilio.buildDoctorMenuTeXml(doctors, docGatherUrl));
      return;
    }

    res.type('text/xml').send(twilio.buildGoodbyeTeXml('Invalid selection. Please call again.'));

  } else if (step === 'doctor') {
    const idx      = parseInt(digit, 10);
    const doctorId = req.query[`d${idx}`] ? parseInt(req.query[`d${idx}`], 10) : null;

    if (!doctorId || digit === '0') {
      res.type('text/xml').send(twilio.buildGoodbyeTeXml('Please call again to start over.'));
      return;
    }

    const { rows: [doc] } = await pool.query(`SELECT name FROM emr_doctors WHERE id=$1`, [doctorId]);
    const doctorName = doc?.name || 'the doctor';

    await twilio.sendSms(to, from,
      `You called to book with ${doctorName}. Reply with your preferred date (e.g. "tomorrow" or "15 June") to continue via SMS.`
    ).catch(() => {});

    if (clinicId) {
      await pool.query(
        `INSERT INTO inbound_conversations (clinic_id, channel, channel_id, to_address, state, context)
         VALUES ($1,'sms',$2,$3,'active',$4)
         ON CONFLICT (channel, channel_id) DO UPDATE SET context=EXCLUDED.context, updated_at=NOW()`,
        [parseInt(clinicId, 10), from, to,
         JSON.stringify({ doctor_id: doctorId, doctor_name: doctorName, ivr_initiated: true })]
      ).catch(() => {});
    }

    res.type('text/xml').send(twilio.buildCallbackTeXml(doctorName));
  }
};

// ── POST /webhook/twilio/status — delivery status ────────────────────────
const handleStatusWebhook = async (req, res) => {
  res.status(200).end();
  const { MessageSid, MessageStatus, To } = req.body || {};
  if (MessageSid) logger.info(`[Webhook/Status] ${MessageSid} → ${MessageStatus} for ${To}`);
};

module.exports = { handleSmsWebhook, handleVoiceWebhook, handleVoiceGather, handleStatusWebhook };
