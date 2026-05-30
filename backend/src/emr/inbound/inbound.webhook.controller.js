/**
 * Telnyx webhook handlers
 * ─ POST /webhook/telnyx         → SMS + WhatsApp inbound
 * ─ POST /webhook/telnyx/voice   → IVR call initiated
 * ─ POST /webhook/telnyx/gather  → IVR digit/speech collected
 *
 * All endpoints are PUBLIC (no EMR JWT) but signature-verified.
 */
const telnyx      = require('./telnyx.service');
const orchestrator = require('./booking.orchestrator');
const slot        = require('./slot.service');
const { pool }    = require('../../config/database');
const logger      = require('../../utils/logger');

// ── POST /webhook/telnyx ─────────────────────────────────────────────────
const handleSmsWebhook = async (req, res) => {
  // Telnyx expects 200 fast; process async
  res.sendStatus(200);

  // Verify signature
  const sig  = req.headers['telnyx-signature-ed25519-signature']  || '';
  const ts   = req.headers['telnyx-signature-ed25519-timestamp']  || '';
  const body = req.rawBody || JSON.stringify(req.body);

  if (!telnyx.verifyWebhookSignature(body, sig, ts)) {
    logger.warn('[Webhook/SMS] Signature verification failed');
    return;
  }

  const event = telnyx.parseInboundSmsEvent(req.body);
  if (!event || event.eventType !== 'message.received') return;

  logger.info(`[Webhook/SMS] ${event.channel} from ${event.from} to ${event.to}: "${event.text}"`);

  try {
    await orchestrator.handleInboundMessage(event.channel, event.from, event.text, event.to);
  } catch (err) {
    logger.error('[Webhook/SMS] orchestrator error', err.message);
  }
};

// ── POST /webhook/telnyx/voice — call arrives ────────────────────────────
const handleVoiceWebhook = async (req, res) => {
  const event = telnyx.parseInboundCallEvent(req.body);
  if (!event) return res.sendStatus(400);

  logger.info(`[Webhook/IVR] call from ${event.from} to ${event.to}`);

  // Lookup clinic for IVR channel
  const { rows: [clinic] } = await pool.query(
    `SELECT ccc.clinic_id, ec.name AS clinic_name
     FROM clinic_channel_config ccc
     JOIN emr_clinics ec ON ec.id = ccc.clinic_id
     WHERE ccc.channel = 'ivr' AND ccc.channel_address = $1 AND ccc.is_active=TRUE LIMIT 1`,
    [event.to]
  );

  const clinicName = clinic?.clinic_name || 'the clinic';
  const clinicId   = clinic?.clinic_id;

  // Fetch doctors for menu
  let doctors = [];
  if (clinicId) doctors = await slot.getDoctors(clinicId);

  const gatherUrl = `${process.env.BACKEND_URL}/webhook/telnyx/gather?` +
    `from=${encodeURIComponent(event.from)}&to=${encodeURIComponent(event.to)}&clinicId=${clinicId || ''}`;

  // Log IVR session
  if (clinicId) {
    await pool.query(
      `INSERT INTO inbound_conversations (clinic_id, channel, channel_id, to_address, state)
       VALUES ($1,'ivr',$2,$3,'active')
       ON CONFLICT DO NOTHING`,
      [clinicId, event.from, event.to]
    ).catch(() => {});
  }

  res.type('text/xml').send(telnyx.buildGreetingTeXml(clinicName, gatherUrl));
};

// ── POST /webhook/telnyx/gather — DTMF digit collected ───────────────────
const handleVoiceGather = async (req, res) => {
  const { Digits, from, to, clinicId, step = 'main' } = { ...req.query, ...req.body };
  const digit = String(Digits || '').trim();

  logger.info(`[Webhook/IVR] gather from=${from} digit=${digit} step=${step}`);

  const backendUrl = process.env.BACKEND_URL;

  if (step === 'main') {
    if (digit === '0') {
      res.type('text/xml').send(telnyx.buildHandoffTeXml());
      return;
    }
    if (digit === '2') {
      // Cancel flow — ask for SMS confirmation
      const smsUrl = `${backendUrl}/webhook/telnyx/gather?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&clinicId=${clinicId}&step=cancel`;
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    We will send you an SMS to confirm your cancellation. Goodbye.
  </Say>
  <Hangup/>
</Response>`);
      // Send SMS with cancel instructions
      await telnyx.sendSms(to, from, 'Reply CANCEL + your appointment date to cancel. E.g.: CANCEL 2025-06-10').catch(() => {});
      return;
    }
    if (digit === '1') {
      // Appointment booking — show doctor menu
      let doctors = [];
      if (clinicId) doctors = await slot.getDoctors(parseInt(clinicId, 10));
      if (!doctors.length) {
        res.type('text/xml').send(telnyx.buildGoodbyeTeXml('No doctors available right now. We will call you back.'));
        return;
      }
      const docGatherUrl = `${backendUrl}/webhook/telnyx/gather?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&clinicId=${clinicId}&step=doctor&` +
        doctors.slice(0, 9).map((d, i) => `d${i + 1}=${d.id}`).join('&');
      res.type('text/xml').send(telnyx.buildDoctorMenuTeXml(doctors, docGatherUrl));
      return;
    }
    res.type('text/xml').send(telnyx.buildGoodbyeTeXml('Invalid selection. Please call again.'));

  } else if (step === 'doctor') {
    const idx = parseInt(digit, 10);
    const doctorId = req.query[`d${idx}`] ? parseInt(req.query[`d${idx}`], 10) : null;

    if (!doctorId || digit === '0') {
      res.type('text/xml').send(telnyx.buildGoodbyeTeXml('Going back. Please call again to start over.'));
      return;
    }

    const { rows: [doc] } = await pool.query(`SELECT name FROM emr_doctors WHERE id=$1`, [doctorId]);
    const doctorName = doc?.name || 'the doctor';

    // Send SMS to continue booking over text
    const smsText = `You called to book with ${doctorName}. Please reply with your preferred date (e.g. "tomorrow" or "June 15") to continue booking via SMS.`;
    await telnyx.sendSms(to, from, smsText).catch(() => {});

    // Seed the conversation context
    if (clinicId) {
      await pool.query(
        `INSERT INTO inbound_conversations (clinic_id, channel, channel_id, to_address, state, context)
         VALUES ($1,'sms',$2,$3,'active',$4)
         ON CONFLICT (channel, channel_id) DO UPDATE SET context=EXCLUDED.context, updated_at=NOW()`,
        [parseInt(clinicId, 10), from, to, JSON.stringify({ doctor_id: doctorId, doctor_name: doctorName, ivr_initiated: true })]
      ).catch(() => {});
    }

    res.type('text/xml').send(telnyx.buildCallbackTeXml(doctorName));
  }
};

// ── POST /webhook/telnyx/status — delivery status updates ────────────────
const handleStatusWebhook = async (req, res) => {
  res.sendStatus(200);
  const event = req.body?.data;
  if (event?.event_type === 'message.finalized') {
    const status = event.payload?.to?.[0]?.status;
    logger.info(`[Webhook/Status] msg delivery: ${status}`, { id: event.payload?.id });
  }
};

module.exports = { handleSmsWebhook, handleVoiceWebhook, handleVoiceGather, handleStatusWebhook };
