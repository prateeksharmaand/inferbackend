/**
 * Meta WhatsApp Cloud API webhook controller
 *
 * GET  /webhook/whatsapp  — Meta hub challenge verification
 * POST /webhook/whatsapp  — Inbound messages + delivery status
 */
const wa           = require('./whatsapp.service');
const orchestrator = require('./booking.orchestrator');
const { pool }     = require('../../config/database');
const logger       = require('../../utils/logger');

// ── GET /webhook/whatsapp — hub challenge ────────────────────────────────
const verify = (req, res) => {
  const result = wa.verifyChallenge(req.query);
  if (result.ok) return res.status(200).send(result.challenge);
  res.sendStatus(403);
};

// ── POST /webhook/whatsapp — inbound messages & status ───────────────────
const handle = async (req, res) => {
  // Always respond 200 immediately — Meta retries if it doesn't get one fast.
  res.sendStatus(200);

  // Verify payload signature
  const sig     = req.headers['x-hub-signature-256'] || '';
  const rawBody = req.rawBody || JSON.stringify(req.body);
  if (!wa.verifySignature(rawBody, sig)) {
    logger.warn('[WhatsApp] payload signature mismatch — ignoring');
    return;
  }

  // Handle status updates (delivered / read / failed)
  const statuses = wa.parseStatusUpdates(req.body);
  for (const s of statuses) {
    logger.info(`[WhatsApp] status: ${s.status} for ${s.recipientId} msg=${s.messageId}`);
    // Update audit log if we have a matching record
    await pool.query(
      `UPDATE inbound_audit_log
       SET metadata = metadata || $1::jsonb
       WHERE metadata->>'wamid' = $2`,
      [JSON.stringify({ delivery_status: s.status, delivered_at: new Date().toISOString() }), s.messageId]
    ).catch(() => {});
  }

  // Handle inbound text messages
  const messages = wa.parseInboundMessages(req.body);
  for (const msg of messages) {
    logger.info(`[WhatsApp] inbound from ${msg.from}: "${msg.text}"`);

    // Mark as read (shows double blue tick to patient)
    await wa.markRead(msg.phoneNumberId, msg.messageId).catch(() => {});

    // Resolve clinic from the WhatsApp number that received the message
    const toNumber = msg.to || msg.phoneNumberId;

    try {
      const result = await orchestrator.handleInboundMessage(
        'whatsapp',
        msg.from,
        msg.text,
        toNumber,
        // Pass phoneNumberId so we can send replies via correct number
        { phoneNumberId: msg.phoneNumberId, senderName: msg.senderName }
      );

      // Send the AI reply back via WhatsApp Cloud API
      if (result?.replyText && msg.phoneNumberId) {
        await wa.sendText(msg.phoneNumberId, msg.from, result.replyText);
      }
    } catch (err) {
      logger.error('[WhatsApp] orchestrator error', err.message);
      // Best-effort fallback reply
      if (msg.phoneNumberId) {
        await wa.sendText(
          msg.phoneNumberId, msg.from,
          'Sorry, something went wrong. Please try again or call us directly.'
        ).catch(() => {});
      }
    }
  }
};

module.exports = { verify, handle };
