/**
 * Meta WhatsApp Business Cloud API
 * - Webhook verification (GET hub challenge)
 * - Parse inbound text / interactive messages
 * - Send text replies via Graph API
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
const crypto = require('crypto');
const axios  = require('axios');
const logger = require('../../utils/logger');

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

// ── Verify webhook (GET) ──────────────────────────────────────────────────
// Meta sends: ?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=YYY
// Respond with hub.challenge if token matches.
function verifyChallenge(query) {
  const mode      = query['hub.mode'];
  const token     = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('[WhatsApp] Webhook verified by Meta');
    return { ok: true, challenge };
  }
  logger.warn('[WhatsApp] Webhook verification failed — token mismatch');
  return { ok: false };
}

// ── Verify payload signature (POST) ──────────────────────────────────────
// Meta signs the body with HMAC-SHA256 using the App Secret.
// Header: x-hub-signature-256 = "sha256=<hex>"
function verifySignature(rawBody, signatureHeader) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.warn('[WhatsApp] WHATSAPP_APP_SECRET not set — skipping signature check');
    return true;
  }
  try {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(Buffer.from(rawBody, 'utf8'))
      .digest('hex');
    const a = Buffer.from(signatureHeader || '');
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    logger.error('[WhatsApp] signature error', err.message);
    return false;
  }
}

// ── Parse inbound webhook (POST) ─────────────────────────────────────────
// Returns array of { from, to, text, messageId, name } for each text message.
function parseInboundMessages(body) {
  const results = [];
  try {
    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;
        const value    = change.value || {};
        const toNumber = value.metadata?.display_phone_number;
        const contacts = value.contacts || [];

        for (const msg of (value.messages || [])) {
          let text = '';
          if (msg.type === 'text') {
            text = msg.text?.body || '';
          } else if (msg.type === 'interactive') {
            text = msg.interactive?.button_reply?.title
              || msg.interactive?.list_reply?.title
              || '';
          } else if (msg.type === 'button') {
            text = msg.button?.text || '';
          }
          // Non-text types (image, audio, document, sticker, reaction, etc.)
          // are captured with empty text so they still get logged to the DB.

          const contact = contacts.find(c => c.wa_id === msg.from);
          results.push({
            messageId:    msg.id,
            from:         `+${msg.from}`,
            to:           toNumber ? `+${toNumber.replace(/^\+/, '')}` : null,
            phoneNumberId: value.metadata?.phone_number_id,
            text:         text.trim(),
            messageType:  msg.type || 'text',
            mediaId:      msg.image?.id || msg.audio?.id || msg.document?.id || msg.video?.id || null,
            senderName:   contact?.profile?.name || null,
            timestamp:    msg.timestamp,
            raw:          msg,
          });
        }
      }
    }
  } catch (err) {
    logger.error('[WhatsApp] parse error', err.message);
  }
  return results;
}

// ── Parse status updates ──────────────────────────────────────────────────
function parseStatusUpdates(body) {
  const updates = [];
  try {
    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;
        for (const st of (change.value?.statuses || [])) {
          updates.push({
            messageId:   st.id,
            status:      st.status,       // sent | delivered | read | failed
            recipientId: st.recipient_id,
            timestamp:   st.timestamp,
          });
        }
      }
    }
  } catch (_) {}
  return updates;
}

// ── Send text reply ───────────────────────────────────────────────────────
async function sendText(phoneNumberId, to, text) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    logger.warn('[WhatsApp] WHATSAPP_ACCESS_TOKEN not set — message not sent');
    return;
  }
  const toNum = String(to).replace(/^\+/, '');
  try {
    const { data } = await axios.post(
      `${GRAPH_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                toNum,
        type:              'text',
        text:              { body: text, preview_url: false },
      },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    logger.info(`[WhatsApp] sent to +${toNum}`, { wamid: data?.messages?.[0]?.id });
    return data;
  } catch (err) {
    logger.error(`[WhatsApp] send failed to +${toNum}`, err.response?.data || err.message);
    throw err;
  }
}

// ── Mark message as read ─────────────────────────────────────────────────
async function markRead(phoneNumberId, messageId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return;
  await axios.post(
    `${GRAPH_URL}/${phoneNumberId}/messages`,
    { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  ).catch(() => {});
}

module.exports = { verifyChallenge, verifySignature, parseInboundMessages, parseStatusUpdates, sendText, markRead };
