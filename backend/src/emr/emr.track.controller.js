/**
 * Email open tracking pixel.
 * GET /api/track/open?lid=<lead_id_hash>
 * Returns a 1x1 transparent GIF and marks lead as opened in DB.
 */

const { pool } = require('../config/database');
const logger   = require('../utils/logger');

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// POST /api/track/register — registers a lead for tracking
exports.registerLead = async (req, res) => {
  const { email, clinic, lead_hash } = req.body;
  if (!email || !lead_hash) return res.status(400).json({ error: 'email and lead_hash required' });
  try {
    await pool.query(
      `INSERT INTO sales_leads (lead_hash, email, clinic)
       VALUES ($1, $2, $3)
       ON CONFLICT (lead_hash) DO NOTHING`,
      [lead_hash, email.toLowerCase(), clinic || '']
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/track/opened-leads — returns list of emails that opened
exports.getOpenedLeads = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT email FROM sales_leads WHERE email_opened = true`
    );
    res.json({ opened: rows.map(r => r.email.toLowerCase()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.trackOpen = async (req, res) => {
  // Always return pixel immediately — never block on DB
  res.set({
    'Content-Type':  'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma':        'no-cache',
  });
  res.send(PIXEL);

  // Record open asynchronously
  const { lid } = req.query;
  if (!lid) return;

  try {
    await pool.query(
      `UPDATE sales_leads SET email_opened = true, email_opened_at = NOW()
       WHERE lead_hash = $1 AND email_opened = false`,
      [lid]
    );
    logger.info(`[track] email opened lid=${lid}`);
  } catch (err) {
    logger.error('[track] failed:', err.message);
  }
};
