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

  // Handle inbound messages (all types)
  const messages = wa.parseInboundMessages(req.body);
  for (const msg of messages) {
    logger.info(`[WhatsApp] inbound ${msg.messageType} from ${msg.from}: "${msg.text || '(no text)'}"`);

    // Persist inbound message — safe timestamp cast, ON CONFLICT on wamid unique constraint
    const waTs = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : null;
    await pool.query(
      `INSERT INTO whatsapp_messages
         (direction, wamid, phone_number_id, from_number, to_number,
          message_type, body, media_id, sender_name, delivery_status, wa_timestamp, raw_payload)
       VALUES ('inbound', $1, $2, $3, $4, $5, $6, $7, $8, 'delivered', $9::timestamptz, $10::jsonb)
       ON CONFLICT (wamid) DO NOTHING`,
      [
        msg.messageId, msg.phoneNumberId, msg.from, msg.to,
        msg.messageType || 'text',
        msg.text || null,
        msg.mediaId || null,
        msg.senderName || null,
        waTs,
        JSON.stringify(msg.raw || { from: msg.from, text: msg.text, messageId: msg.messageId }),
      ]
    ).catch(e => logger.error('[WhatsApp] inbound log INSERT failed:', e.message));

    // Mark as read (shows double blue tick to patient)
    await wa.markRead(msg.phoneNumberId, msg.messageId).catch(() => {});

    // Only run AI orchestrator for text-based messages
    if (!msg.text) continue;

    const toNumber = msg.to || msg.phoneNumberId;

    try {
      const result = await orchestrator.handleInboundMessage(
        'whatsapp',
        msg.from,
        msg.text,
        toNumber,
        { phoneNumberId: msg.phoneNumberId, senderName: msg.senderName }
      );

      if (result?.replyText && msg.phoneNumberId) {
        const sent = await wa.sendText(msg.phoneNumberId, msg.from, result.replyText);

        await pool.query(
          `INSERT INTO whatsapp_messages
             (direction, wamid, phone_number_id, from_number, to_number,
              message_type, body, reply_to_wamid, delivery_status, raw_payload)
           VALUES ('outbound', $1, $2, $3, $4, 'text', $5, $6, 'sent', $7::jsonb)`,
          [
            sent?.messages?.[0]?.id || null,
            msg.phoneNumberId,
            msg.to || null, msg.from,
            result.replyText, msg.messageId,
            JSON.stringify({ replyTo: msg.messageId, text: result.replyText }),
          ]
        ).catch(e => logger.error('[WhatsApp] outbound log INSERT failed:', e.message));
      }
    } catch (err) {
      logger.error('[WhatsApp] orchestrator error:', err.message);
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
