/**
 * Meta WhatsApp Business Cloud API — Sales Agent Inbound Webhook
 *
 * GET  /webhook/meta/whatsapp  — Meta verification challenge
 * POST /webhook/meta/whatsapp  — Inbound messages from leads
 *
 * GET  /api/sales/wa-inbox     — Poll endpoint for Python agent to fetch unsynced replies
 * POST /api/sales/wa-inbox/ack — Python agent marks messages as synced after updating Sheet
 */

const crypto = require('crypto');
const { pool } = require('../config/database');
const logger   = require('../utils/logger');

// Fall back to WA_ACCESS_TOKEN so no extra env var is needed for the verify step
const VERIFY_TOKEN = process.env.META_WA_VERIFY_TOKEN || process.env.WA_ACCESS_TOKEN || '';
const APP_SECRET   = process.env.META_WA_APP_SECRET   || '';

// ── Signature verification ────────────────────────────────────────────────────
function _verifySignature(rawBody, sigHeader) {
  if (!APP_SECRET) return true; // skip in dev if not configured
  if (!sigHeader) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── GET /webhook/meta/whatsapp — Meta hub verification ────────────────────────
exports.verifyWebhook = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('[SalesWA] Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  logger.warn('[SalesWA] Webhook verification failed');
  res.sendStatus(403);
};

// ── POST /webhook/meta/whatsapp — Receive inbound messages ───────────────────
exports.receiveWebhook = async (req, res) => {
  // Verify signature using raw body (captured by express.json verify callback)
  const sig = req.headers['x-hub-signature-256'] || '';
  const rawBody = req.rawBody || JSON.stringify(req.body);
  if (!_verifySignature(rawBody, sig)) {
    logger.warn('[SalesWA] Signature mismatch — rejected');
    return res.sendStatus(403);
  }

  // Always 200 immediately — Meta retries on timeout
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return;

    // Handle delivery status updates — just log, no DB write needed
    const statuses = value.statuses || [];
    for (const s of statuses) {
      logger.info(`[SalesWA] Delivery status wamid=${s.id} status=${s.status}`);
    }

    const messages = value.messages || [];
    for (const msg of messages) {
      if (msg.type !== 'text' && msg.type !== 'button' && msg.type !== 'interactive') continue;

      const fromNumber  = msg.from;                         // e.g. "919876543210"
      const wamid       = msg.id;
      const senderName  = value.contacts?.[0]?.profile?.name || null;
      const body        = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || '';
      const waTimestamp = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date();

      logger.info(`[SalesWA] Inbound from=${fromNumber} body="${body}"`);

      await pool.query(
        `INSERT INTO sales_wa_inbox
           (from_number, sender_name, wamid, message_type, body, raw_payload, wa_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (wamid) DO NOTHING`,
        [fromNumber, senderName, wamid, msg.type, body, JSON.stringify(req.body), waTimestamp]
      );
    }
  } catch (err) {
    logger.error('[SalesWA] Webhook processing error:', err.message);
  }
};

// ── GET /api/sales/wa-inbox — Python agent polls this for unsynced replies ───
exports.getInbox = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, from_number, sender_name, body, message_type, wa_timestamp, created_at
       FROM sales_wa_inbox
       WHERE replied_status_synced = FALSE
       ORDER BY wa_timestamp ASC
       LIMIT 100`
    );
    res.json({ messages: rows });
  } catch (err) {
    logger.error('[SalesWA] getInbox error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/sales/wa-inbox/ack — Python agent confirms sync ────────────────
exports.ackMessages = async (req, res) => {
  const { ids, lead_email, lead_clinic } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids[] required' });
  }
  try {
    await pool.query(
      `UPDATE sales_wa_inbox
       SET replied_status_synced = TRUE,
           synced_at    = NOW(),
           lead_email   = COALESCE($2, lead_email),
           lead_clinic  = COALESCE($3, lead_clinic)
       WHERE id = ANY($1::int[])`,
      [ids, lead_email || null, lead_clinic || null]
    );
    res.json({ ok: true, acked: ids.length });
  } catch (err) {
    logger.error('[SalesWA] ack error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
