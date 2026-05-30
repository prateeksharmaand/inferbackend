/**
 * EMR Staff API — Inbound Appointment Management
 * All routes protected by emrAuth middleware
 *
 * Covers:
 *  - Conversation monitoring + takeover
 *  - Doctor availability CRUD
 *  - Channel config CRUD
 *  - Analytics dashboard
 *  - Patient portal booking (direct REST — no AI)
 *  - Chat widget session
 */
const { pool }        = require('../../config/database');
const logger          = require('../../utils/logger');
const slot            = require('./slot.service');
const telnyx          = require('./telnyx.service');
const orchestrator    = require('./booking.orchestrator');

// ── Conversations ─────────────────────────────────────────────────────────

const listConversations = async (req, res) => {
  const { state, channel, page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  let sql = `SELECT c.*, a.token_number, a.appointment_date, a.appointment_time,
               d.name AS doctor_name
             FROM inbound_conversations c
             LEFT JOIN emr_appointments a ON a.id = c.appointment_id
             LEFT JOIN emr_doctors d ON d.id = (c.context->>'doctor_id')::int
             WHERE c.clinic_id = $1`;
  const params = [req.emrUser.clinic_id];
  let idx = 2;

  if (state)   { sql += ` AND c.state=$${idx++}`;   params.push(state); }
  if (channel) { sql += ` AND c.channel=$${idx++}`; params.push(channel); }

  sql += ` ORDER BY c.updated_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(parseInt(limit, 10), offset);

  const { rows } = await pool.query(sql, params);

  // Total count
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM inbound_conversations WHERE clinic_id=$1${state ? ` AND state='${state}'` : ''}`,
    [req.emrUser.clinic_id]
  );

  res.json({ conversations: rows, total: parseInt(count, 10), page: parseInt(page, 10) });
};

const getConversation = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, a.token_number, a.appointment_date, a.appointment_time,
              a.patient_name, a.patient_mobile, d.name AS doctor_name
     FROM inbound_conversations c
     LEFT JOIN emr_appointments a ON a.id = c.appointment_id
     LEFT JOIN emr_doctors d ON d.id = a.doctor_id
     WHERE c.id=$1 AND c.clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Conversation not found' });

  const { rows: logs } = await pool.query(
    `SELECT direction, message, metadata, created_at FROM inbound_audit_log
     WHERE conversation_id=$1 ORDER BY created_at ASC`,
    [req.params.id]
  );

  res.json({ ...rows[0], audit_log: logs });
};

const takeoverConversation = async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE inbound_conversations SET is_handoff=TRUE, handoff_reason='staff_takeover', state='handoff', updated_at=NOW()
     WHERE id=$1 AND clinic_id=$2 RETURNING *`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Conversation not found' });
  logger.info(`[API] Staff takeover conv#${req.params.id} by user#${req.emrUser.id}`);
  res.json(rows[0]);
};

const staffReply = async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const { rows: [conv] } = await pool.query(
    `SELECT * FROM inbound_conversations WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  // Append to messages
  const messages = Array.isArray(conv.messages) ? conv.messages : JSON.parse(conv.messages || '[]');
  messages.push({ role: 'staff', content: message, ts: new Date().toISOString(), staff_id: req.emrUser.id });

  await pool.query(
    `UPDATE inbound_conversations SET messages=$1, updated_at=NOW() WHERE id=$2`,
    [JSON.stringify(messages), conv.id]
  );

  // Audit
  await pool.query(
    `INSERT INTO inbound_audit_log (conversation_id, clinic_id, channel, channel_id, direction, message, metadata)
     VALUES ($1,$2,$3,$4,'outbound',$5,$6)`,
    [conv.id, req.emrUser.clinic_id, conv.channel, conv.channel_id, message,
     JSON.stringify({ sent_by_staff: req.emrUser.id })]
  );

  // Send via Telnyx
  if (conv.channel !== 'chat') {
    await telnyx.sendMessage(conv.channel, conv.to_address, conv.channel_id, message).catch(err =>
      logger.error('[API] staffReply send failed', err.message)
    );
  }

  res.json({ ok: true });
};

// ── Doctor Availability CRUD ──────────────────────────────────────────────

const getAvailability = async (req, res) => {
  const { doctor_id } = req.query;
  let sql    = `SELECT da.*, d.name AS doctor_name
                FROM emr_doctor_availability da
                JOIN emr_doctors d ON d.id = da.doctor_id
                WHERE da.clinic_id=$1`;
  const params = [req.emrUser.clinic_id];
  if (doctor_id) { sql += ` AND da.doctor_id=$2`; params.push(doctor_id); }
  sql += ` ORDER BY da.doctor_id, da.day_of_week`;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
};

const upsertAvailability = async (req, res) => {
  const {
    doctor_id, day_of_week, start_time, end_time,
    slot_duration_minutes = 15, max_slots_per_day, is_active = true,
  } = req.body;

  if (!doctor_id || day_of_week == null || !start_time || !end_time)
    return res.status(400).json({ error: 'doctor_id, day_of_week, start_time, end_time required' });

  // Verify doctor belongs to clinic
  const { rows: [doc] } = await pool.query(
    `SELECT id FROM emr_doctors WHERE id=$1 AND clinic_id=$2`,
    [doctor_id, req.emrUser.clinic_id]
  );
  if (!doc) return res.status(403).json({ error: 'Doctor not in clinic' });

  const { rows } = await pool.query(
    `INSERT INTO emr_doctor_availability
       (clinic_id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, max_slots_per_day, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (doctor_id, day_of_week) DO UPDATE SET
       start_time=$4, end_time=$5, slot_duration_minutes=$6,
       max_slots_per_day=$7, is_active=$8
     RETURNING *`,
    [req.emrUser.clinic_id, doctor_id, day_of_week, start_time, end_time,
     slot_duration_minutes, max_slots_per_day || null, is_active]
  );
  res.json(rows[0]);
};

const deleteAvailability = async (req, res) => {
  await pool.query(
    `DELETE FROM emr_doctor_availability WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  res.json({ ok: true });
};

const getSlots = async (req, res) => {
  const { doctor_id, date } = req.query;
  if (!doctor_id || !date) return res.status(400).json({ error: 'doctor_id and date required' });

  const slots = await slot.getAvailableSlots(req.emrUser.clinic_id, parseInt(doctor_id, 10), date);
  res.json({ date, doctor_id: parseInt(doctor_id, 10), slots });
};

// ── Channel Config CRUD ───────────────────────────────────────────────────

const listChannelConfigs = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM clinic_channel_config WHERE clinic_id=$1 ORDER BY channel, channel_address`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

const upsertChannelConfig = async (req, res) => {
  const { channel, channel_address, is_active = true, config = {} } = req.body;
  if (!channel || !channel_address)
    return res.status(400).json({ error: 'channel and channel_address required' });

  const { rows } = await pool.query(
    `INSERT INTO clinic_channel_config (clinic_id, channel, channel_address, is_active, config)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (channel, channel_address) DO UPDATE SET
       is_active=$4, config=$5, clinic_id=$1
     RETURNING *`,
    [req.emrUser.clinic_id, channel, channel_address, is_active, JSON.stringify(config)]
  );
  res.json(rows[0]);
};

const deleteChannelConfig = async (req, res) => {
  await pool.query(
    `DELETE FROM clinic_channel_config WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  res.json({ ok: true });
};

// ── Patient portal: direct booking API (no AI, for web/app portals) ───────

const portalBook = async (req, res) => {
  const { patient_name, patient_mobile, patient_dob, patient_gender,
          doctor_id, date, time, visit_reason } = req.body;

  if (!patient_name || !doctor_id || !date || !time)
    return res.status(400).json({ error: 'patient_name, doctor_id, date, time required' });

  const free = await slot.isSlotAvailable(req.emrUser.clinic_id, doctor_id, date, time);
  if (!free) return res.status(409).json({ error: 'Slot not available. Please choose another time.' });

  const appt = await slot.bookSlot(req.emrUser.clinic_id, doctor_id, date, time,
    { patient_name, patient_mobile, patient_dob, patient_gender, visit_reason }, 'online'
  );
  res.status(201).json(appt);
};

// ── Chat widget: handle a chat message (synchronous, returns AI reply) ────

const chatMessage = async (req, res) => {
  const { session_id, message } = req.body;
  if (!session_id || !message)
    return res.status(400).json({ error: 'session_id and message required' });

  // For chat, toAddress = session_id; channel = 'chat'; channelId = session_id
  // Lookup clinic from session (stored in context) or use emrUser clinic
  const result = await orchestrator.handleInboundMessage(
    'chat', session_id, message,
    `chat:${req.emrUser.clinic_id}` // virtual "to" address for chat
  );

  res.json({ reply: result?.replyText || '', booked: result?.booked, handoff: result?.handoff });
};

// ── Analytics dashboard ───────────────────────────────────────────────────

const getAnalytics = async (req, res) => {
  const { days = 30 } = req.query;
  const since = new Date(Date.now() - parseInt(days, 10) * 86400000).toISOString();
  const cid   = req.emrUser.clinic_id;

  const [totals, byChannel, byState, topHours, handoffRate] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total_conversations,
              COUNT(*) FILTER (WHERE state='booked') AS booked,
              COUNT(*) FILTER (WHERE is_handoff=TRUE) AS handed_off,
              COUNT(*) FILTER (WHERE state='cancelled') AS cancelled,
              ROUND(AVG(ai_confidence)::numeric, 3) AS avg_confidence
       FROM inbound_conversations WHERE clinic_id=$1 AND created_at >= $2`,
      [cid, since]
    ),
    pool.query(
      `SELECT channel, COUNT(*) AS count FROM inbound_conversations
       WHERE clinic_id=$1 AND created_at>=$2 GROUP BY channel`,
      [cid, since]
    ),
    pool.query(
      `SELECT state, COUNT(*) AS count FROM inbound_conversations
       WHERE clinic_id=$1 AND created_at>=$2 GROUP BY state`,
      [cid, since]
    ),
    pool.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS msgs
       FROM inbound_audit_log WHERE clinic_id=$1 AND direction='inbound' AND created_at>=$2
       GROUP BY hour ORDER BY msgs DESC LIMIT 5`,
      [cid, since]
    ),
    pool.query(
      `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE is_handoff=TRUE) / NULLIF(COUNT(*),0), 1) AS handoff_pct
       FROM inbound_conversations WHERE clinic_id=$1 AND created_at>=$2`,
      [cid, since]
    ),
  ]);

  res.json({
    period_days:    parseInt(days, 10),
    totals:         totals.rows[0],
    by_channel:     byChannel.rows,
    by_state:       byState.rows,
    peak_hours:     topHours.rows,
    handoff_rate:   handoffRate.rows[0],
  });
};

module.exports = {
  listConversations, getConversation, takeoverConversation, staffReply,
  getAvailability, upsertAvailability, deleteAvailability, getSlots,
  listChannelConfigs, upsertChannelConfig, deleteChannelConfig,
  portalBook, chatMessage, getAnalytics,
};
