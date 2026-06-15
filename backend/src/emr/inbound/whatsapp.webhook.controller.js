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
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE whatsapp_messages
       SET delivery_status = $1,
           delivered_at    = CASE WHEN $1 = 'delivered' THEN $2::timestamptz ELSE delivered_at END,
           read_at         = CASE WHEN $1 = 'read'      THEN $2::timestamptz ELSE read_at END
       WHERE wamid = $3`,
      [s.status, now, s.messageId]
    ).catch(() => {});
  }

  // Handle inbound text messages
  const messages = wa.parseInboundMessages(req.body);
  for (const msg of messages) {
    logger.info(`[WhatsApp] inbound from ${msg.from}: "${msg.text}"`);

    // Persist inbound message
    await pool.query(
      `INSERT INTO whatsapp_messages
         (direction, wamid, phone_number_id, from_number, to_number,
          message_type, body, sender_name, delivery_status, wa_timestamp, raw_payload)
       VALUES ('inbound', $1, $2, $3, $4, 'text', $5, $6, 'delivered', to_timestamp($7::bigint), $8::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        msg.messageId, msg.phoneNumberId, msg.from, msg.to,
        msg.text, msg.senderName || null,
        msg.timestamp || null,
        JSON.stringify({ from: msg.from, text: msg.text, messageId: msg.messageId }),
      ]
    ).catch(e => logger.warn('[WhatsApp] log insert failed', e.message));

    // Mark as read (shows double blue tick to patient)
    await wa.markRead(msg.phoneNumberId, msg.messageId).catch(() => {});

    // Resolve clinic from the WhatsApp number that received the message
    const toNumber = msg.to || msg.phoneNumberId;

    let replyText = null;
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
        const sent = await wa.sendText(msg.phoneNumberId, msg.from, result.replyText);
        replyText = result.replyText;

        // Persist outbound reply
        await pool.query(
          `INSERT INTO whatsapp_messages
             (direction, wamid, phone_number_id, from_number, to_number,
              message_type, body, reply_to_wamid, delivery_status, raw_payload)
           VALUES ('outbound', $1, $2, $3, $4, 'text', $5, $6, 'sent', $7::jsonb)`,
          [
            sent?.messages?.[0]?.id || null,
            msg.phoneNumberId,
            msg.to || null, msg.from,
            replyText, msg.messageId,
            JSON.stringify({ replyTo: msg.messageId, text: replyText }),
          ]
        ).catch(e => logger.warn('[WhatsApp] outbound log failed', e.message));
      }
    } catch (err) {
      logger.error('[WhatsApp] orchestrator error', err.message);
      // Best-effort fallback reply
      if (msg.phoneNumberId) {
        const fallback = 'Sorry, something went wrong. Please try again or call us directly.';
        const sent = await wa.sendText(msg.phoneNumberId, msg.from, fallback).catch(() => null);
        await pool.query(
          `INSERT INTO whatsapp_messages
             (direction, wamid, phone_number_id, from_number, to_number,
              message_type, body, reply_to_wamid, delivery_status, raw_payload)
           VALUES ('outbound', $1, $2, $3, $4, 'text', $5, $6, 'sent', $7::jsonb)`,
          [
            sent?.messages?.[0]?.id || null,
            msg.phoneNumberId, msg.to || null, msg.from,
            fallback, msg.messageId,
            JSON.stringify({ error: err.message, fallback: true }),
          ]
        ).catch(() => {});
      }
    }
  }
};

module.exports = { verify, handle };
