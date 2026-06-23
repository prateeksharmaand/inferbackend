const { pool } = require('../config/database');
const logger = require('../utils/logger');

// GET /admin/sales/crm — Dashboard with all CRM data
exports.getCrmDashboard = async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        id, lead_hash, email, clinic, phone, notes, status, step,
        next_send_date, last_sent_date, email_opened, email_opened_at, created_at,
        (SELECT COUNT(*) FROM sales_crm_activity WHERE lead_id = sales_leads.id) as activity_count,
        (SELECT MAX(activity_date) FROM sales_crm_activity WHERE lead_id = sales_leads.id) as last_activity_date,
        (SELECT COUNT(*) FROM sales_crm_activity WHERE lead_id = sales_leads.id AND activity_type = 'whatsapp_reply') as whatsapp_replies,
        (SELECT COUNT(*) FROM sales_crm_activity WHERE lead_id = sales_leads.id AND activity_type = 'email_opened') as email_open_count
      FROM sales_leads
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    // Only filter by status if it's a valid value (not 'all', 'undefined', or empty)
    if (status && status !== 'all' && status !== 'undefined') {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    // Only search if search term is provided and not empty
    if (search && search.trim()) {
      query += ` AND (email ILIKE $${paramCount} OR phone ILIKE $${paramCount} OR clinic ILIKE $${paramCount} OR notes ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);

    // Get stats
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as replied_count,
        SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) as booked_count,
        SUM(CASE WHEN email_opened = true THEN 1 ELSE 0 END) as email_opened_count
      FROM sales_leads
    `;
    const statsRes = await pool.query(statsQuery);
    const stats = statsRes.rows[0];

    // Get today's activity stats
    const todayStatsQuery = `
      SELECT
        SUM(CASE WHEN activity_type = 'email_sent' AND DATE(activity_date) = CURRENT_DATE THEN 1 ELSE 0 END) as today_email_sent,
        SUM(CASE WHEN activity_type = 'whatsapp_sent' AND DATE(activity_date) = CURRENT_DATE THEN 1 ELSE 0 END) as today_whatsapp_sent,
        (SELECT COUNT(*) FROM sales_wa_inbox WHERE DATE(created_at) = CURRENT_DATE) as today_whatsapp_received
      FROM sales_crm_activity
    `;
    const todayStatsRes = await pool.query(todayStatsQuery);
    const todayStats = todayStatsRes.rows[0];

    stats.today_email_sent = parseInt(todayStats.today_email_sent) || 0;
    stats.today_whatsapp_sent = parseInt(todayStats.today_whatsapp_sent) || 0;
    stats.today_whatsapp_received = parseInt(todayStats.today_whatsapp_received) || 0;

    res.json({
      leads: rows,
      stats,
      pagination: { limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    logger.error('[AdminSales] getCrmDashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /admin/sales/leads/:id — Get lead detail with activity history
exports.getLeadDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const leadRes = await pool.query(`
      SELECT
        id, lead_hash, email, clinic, phone, notes, status, step,
        next_send_date, last_sent_date, email_opened, email_opened_at, created_at
      FROM sales_leads
      WHERE id = $1
    `, [id]);

    if (!leadRes.rows.length) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadRes.rows[0];

    // Get activity history
    const activityRes = await pool.query(`
      SELECT
        id, activity_type, activity_date, message_body, wa_inbox_id, details
      FROM sales_crm_activity
      WHERE lead_id = $1
      ORDER BY activity_date DESC
      LIMIT 100
    `, [id]);

    // Get WhatsApp inbox messages if any
    let waMessages = [];
    if (lead.phone) {
      const waRes = await pool.query(`
        SELECT
          id, from_number, sender_name, body, message_type, wa_timestamp, created_at
        FROM sales_wa_inbox
        WHERE from_number LIKE $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [`%${lead.phone}%`]);
      waMessages = waRes.rows;
    }

    res.json({
      lead,
      activities: activityRes.rows,
      waMessages
    });
  } catch (err) {
    logger.error('[AdminSales] getLeadDetail error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// PATCH /admin/sales/leads/:id — Update lead
exports.updateLead = async (req, res) => {
  const { id } = req.params;
  const { status, notes, phone, next_send_date } = req.body;

  try {
    const updates = [];
    const params = [id];
    let paramCount = 2;

    if (status !== undefined) {
      updates.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount}`);
      params.push(notes);
      paramCount++;
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount}`);
      params.push(phone);
      paramCount++;
    }
    if (next_send_date !== undefined) {
      updates.push(`next_send_date = $${paramCount}`);
      params.push(next_send_date);
      paramCount++;
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const query = `
      UPDATE sales_leads
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await pool.query(query, params);
    if (!rows.length) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    logger.error('[AdminSales] updateLead error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /admin/sales/wa-inbox — WhatsApp received messages
exports.getWhatsAppInbox = async (req, res) => {
  try {
    const { synced = false, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        id, from_number, sender_name, body, message_type, lead_email, lead_clinic,
        replied_status_synced, synced_at, wa_timestamp, created_at
      FROM sales_wa_inbox
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (synced !== 'all') {
      query += ` AND replied_status_synced = $${paramCount}`;
      params.push(synced === 'true');
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get stats
    const statsRes = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN replied_status_synced = false THEN 1 ELSE 0 END) as unsynced_count
      FROM sales_wa_inbox
    `);

    res.json({
      messages: rows,
      stats: statsRes.rows[0],
      pagination: { limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    logger.error('[AdminSales] getWhatsAppInbox error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// POST /admin/sales/wa-inbox/:id/link — Link WhatsApp message to lead
exports.linkWhatsAppToLead = async (req, res) => {
  const { id } = req.params;
  const { lead_id, note } = req.body;

  try {
    // Get WA message details
    const waRes = await pool.query(`
      SELECT from_number, body, wa_timestamp FROM sales_wa_inbox WHERE id = $1
    `, [id]);

    if (!waRes.rows.length) {
      return res.status(404).json({ error: 'WhatsApp message not found' });
    }

    const waMsg = waRes.rows[0];

    // Mark as synced
    await pool.query(`
      UPDATE sales_wa_inbox
      SET replied_status_synced = true, synced_at = NOW()
      WHERE id = $1
    `, [id]);

    // Mark lead as replied
    await pool.query(`
      UPDATE sales_leads
      SET status = 'replied'
      WHERE id = $1
    `, [lead_id]);

    // Log activity
    await pool.query(`
      INSERT INTO sales_crm_activity (lead_id, activity_type, message_body, wa_inbox_id, details)
      VALUES ($1, 'whatsapp_reply', $2, $3, $4)
    `, [
      lead_id,
      waMsg.body,
      id,
      JSON.stringify({ from_number: waMsg.from_number, note: note || null })
    ]);

    res.json({ ok: true, message: 'WhatsApp message linked to lead' });
  } catch (err) {
    logger.error('[AdminSales] linkWhatsAppToLead error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /admin/sales/activity/:lead_id — Get activity history for lead
exports.getLeadActivity = async (req, res) => {
  const { lead_id } = req.params;

  try {
    const { rows } = await pool.query(`
      SELECT
        id, activity_type, activity_date, message_body, wa_inbox_id, details
      FROM sales_crm_activity
      WHERE lead_id = $1
      ORDER BY activity_date DESC
    `, [lead_id]);

    res.json({ activities: rows });
  } catch (err) {
    logger.error('[AdminSales] getLeadActivity error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// PATCH /admin/sales/wa-inbox/:id/call-attempt — Mark WhatsApp message as call attempted
exports.markCallAttempted = async (req, res) => {
  const { id } = req.params;
  const { call_attempted, call_notes } = req.body;

  try {
    const { rows } = await pool.query(`
      UPDATE sales_wa_inbox
      SET call_attempted = $2,
          call_attempted_at = CASE WHEN $2 = true THEN NOW() ELSE NULL END,
          call_notes = $3
      WHERE id = $1
      RETURNING *
    `, [id, call_attempted !== undefined ? call_attempted : false, call_notes || null]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    logger.error('[AdminSales] markCallAttempted error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
