/**
 * Exotel webhook handlers â€” India (single provider)
 *
 * â”€ POST /webhook/exotel/sms        Inbound SMS (form-encoded)
 * â”€ POST /webhook/exotel/whatsapp   Inbound WhatsApp (JSON)
 * â”€ POST /webhook/exotel/voice      Inbound IVR call (form-encoded â†’ ExoML)
 * â”€ POST /webhook/exotel/gather     DTMF digit collected (form-encoded â†’ ExoML)
 * â”€ POST /webhook/exotel/status     Delivery status callbacks
 *
 * Security: Exotel signs webhooks with HMAC-SHA1 of raw body using EXOTEL_TOKEN.
 * Header: X-Exotel-Signature
 */
const exotel       = require('./telnyx.service');   // Exotel adapter
const orchestrator = require('./booking.orchestrator');
const slot         = require('./slot.service');
const { pool }     = require('../../config/database');
const logger       = require('../../utils/logger');

function _verify(req) {
  const sig     = req.headers['x-exotel-signature'] || '';
  const rawBody = req.rawBody || JSON.stringify(req.body);
  return exotel.verifyWebhookSignature(rawBody, sig);
}

// â”€â”€ POST /webhook/exotel/sms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleSmsWebhook = async (req, res) => {
  if (!_verify(req)) {
    logger.warn('[Webhook/SMS] Exotel signature mismatch');
    return res.sendStatus(403);
  }
  res.sendStatus(200);

  const event = exotel.parseInboundSmsEvent(req.body);
  if (!event) return;
  logger.info(`[Webhook/SMS] from ${event.from}: "${event.text}"`);
  try {
    await orchestrator.handleInboundMessage('sms', event.from, event.text, event.to);
  } catch (err) {
    logger.error('[Webhook/SMS]', err.message);
  }
};

// â”€â”€ POST /webhook/exotel/whatsapp â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleWhatsAppWebhook = async (req, res) => {
  if (!_verify(req)) {
    logger.warn('[Webhook/WA] Exotel signature mismatch');
    return res.sendStatus(403);
  }
  res.sendStatus(200);

  const event = exotel.parseInboundWhatsAppEvent(req.body);
  if (!event) return;
  logger.info(`[Webhook/WA] from ${event.from}: "${event.text}"`);
  try {
    await orchestrator.handleInboundMessage('whatsapp', event.from, event.text, event.to);
  } catch (err) {
    logger.error('[Webhook/WA]', err.message);
  }
};

// â”€â”€ POST /webhook/exotel/voice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Exotel POSTs form-encoded: CallSid, From, To, Direction, Status
const handleVoiceWebhook = async (req, res) => {
  const event = exotel.parseInboundCallEvent(req.body);
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

  const gatherUrl = `${process.env.BACKEND_URL}/webhook/exotel/gather?` +
    `from=${encodeURIComponent(event.from)}&to=${encodeURIComponent(event.to)}&clinicId=${clinicId || ''}`;

  if (clinicId) {
    await pool.query(
      `INSERT INTO inbound_conversations (clinic_id, channel, channel_id, to_address, state)
       VALUES ($1,'ivr',$2,$3,'active') ON CONFLICT DO NOTHING`,
      [clinicId, event.from, event.to]
    ).catch(() => {});
  }

  res.type('text/xml').send(exotel.buildGreetingTeXml(clinicName, gatherUrl));
};

// â”€â”€ POST /webhook/exotel/gather â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Exotel POSTs form-encoded: Digits, From, To (+ our query params)
const handleVoiceGather = async (req, res) => {
  const { Digits, digits, from, to, clinicId, step = 'main' } =
    { ...req.query, ...req.body };
  const digit = String(Digits || digits || '').trim();

  logger.info(`[Webhook/IVR] gather from=${from} digit=${digit} step=${step}`);

  const backendUrl = process.env.BACKEND_URL;

  if (step === 'main') {
    if (digit === '0') {
      res.type('text/xml').send(exotel.buildHandoffTeXml()); return;
    }
    if (digit === '2') {
      await exotel.sendSms(to, from,
        'Reply CANCEL + date to cancel your appointment. E.g.: CANCEL 2025-06-20'
      ).catch(() => {});
      res.type('text/xml').send(
        exotel.buildGoodbyeTeXml('We will SMS you with cancellation instructions. Goodbye.')
      );
      return;
    }
    if (digit === '1') {
      let doctors = [];
      if (clinicId) doctors = await slot.getDoctors(parseInt(clinicId, 10));
      if (!doctors.length) {
        res.type('text/xml').send(
          exotel.buildGoodbyeTeXml('No doctors available right now. Please call back later.')
        );
        return;
      }
      const docUrl = `${backendUrl}/webhook/exotel/gather?` +
        `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&clinicId=${clinicId}&step=doctor&` +
        doctors.slice(0, 9).map((d, i) => `d${i + 1}=${d.id}`).join('&');
      res.type('text/xml').send(exotel.buildDoctorMenuTeXml(doctors, docUrl));
      return;
    }
    res.type('text/xml').send(exotel.buildGoodbyeTeXml('Invalid input. Please call again.'));

  } else if (step === 'doctor') {
    const idx      = parseInt(digit, 10);
    const doctorId = req.query[`d${idx}`] ? parseInt(req.query[`d${idx}`], 10) : null;

    if (!doctorId || digit === '0') {
      res.type('text/xml').send(exotel.buildGoodbyeTeXml('Please call again to start over.'));
      return;
    }

    const { rows: [doc] } = await pool.query(
      `SELECT name FROM emr_clinic_staff WHERE id = $1`, [doctorId]
    );
    const doctorName = doc?.name || 'the doctor';

    // Drop into SMS conversation for date/time selection
    await exotel.sendSms(to, from,
      `You called to book with ${doctorName}. Reply with your preferred date (e.g. "tomorrow" or "20 June") to continue via SMS.`
    ).catch(() => {});

    // Seed SMS conversation with doctor context
    if (clinicId) {
      await pool.query(
        `INSERT INTO inbound_conversations
           (clinic_id, channel, channel_id, to_address, state, context)
         VALUES ($1,'sms',$2,$3,'active',$4)
         ON CONFLICT (channel, channel_id)
         DO UPDATE SET context = EXCLUDED.context, updated_at = NOW()`,
        [parseInt(clinicId, 10), from, to,
         JSON.stringify({ doctor_id: doctorId, doctor_name: doctorName, ivr_initiated: true })]
      ).catch(() => {});
    }

    res.type('text/xml').send(exotel.buildCallbackTeXml(doctorName));
  }
};

// â”€â”€ POST /webhook/exotel/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleStatusWebhook = async (req, res) => {
  res.sendStatus(200);
  const { SmsSid, SmsStatus, To } = req.body || {};
  if (SmsSid) logger.info(`[Webhook/Status] ${SmsSid} â†’ ${SmsStatus} for ${To}`);
};

module.exports = {
  handleSmsWebhook,
  handleWhatsAppWebhook,
  handleVoiceWebhook,
  handleVoiceGather,
  handleStatusWebhook,
};

