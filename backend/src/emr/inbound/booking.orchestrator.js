/**
 * Booking Orchestrator
 * - Applies business rules
 * - Drives conversation state
 * - Integrates Gemini AI with slot/patient services
 * - Writes confirmed bookings to EMR
 * - Triggers Telnyx notifications
 * - Handles human fallback on low confidence
 */
const { pool }               = require('../../config/database');
const logger                 = require('../../utils/logger');
const gemini                 = require('./gemini.service');
const slot                   = require('./slot.service');
const telnyx                 = require('./telnyx.service');

const HANDOFF_CONFIDENCE_THRESHOLD = 0.45;
const MAX_TURNS_BEFORE_HANDOFF     = 20;
const CONVERSATION_TTL_HOURS       = 4; // expire inactive sessions after 4h

// ── Main entry point called by all channel adapters ───────────────────────
// extraMeta: optional { phoneNumberId } for WhatsApp Cloud API replies
async function handleInboundMessage(channel, channelId, messageText, toAddress, extraMeta = {}) {
  const text = (messageText || '').trim();
  if (!text) return null;

  // 1. Resolve clinic from the "to" address (phone number or phoneNumberId)
  const clinicRow = await _resolveClinic(channel, toAddress);
  if (!clinicRow) {
    logger.warn(`[Orchestrator] No clinic found for ${channel}:${toAddress}`);
    return { replyText: 'Sorry, this number is not configured. Please contact the clinic directly.', booked: false, handoff: false };
  }
  const clinicId   = clinicRow.clinic_id;
  const clinicName = clinicRow.clinic_name;

  // 2. Load or create conversation
  const conv = await _loadOrCreateConversation(channel, channelId, toAddress, clinicId);

  // Already handed off — route to staff, don't process with AI
  if (conv.is_handoff) {
    await _audit(conv.id, clinicId, channel, channelId, 'inbound', text, { note: 'post-handoff message' });
    return { replyText: null, booked: false, handoff: true, conversationId: conv.id };
  }

  // 3. Audit inbound message
  await _audit(conv.id, clinicId, channel, channelId, 'inbound', text);

  // 4. Build clinic context for Gemini
  const doctors = await slot.getDoctors(clinicId);
  const clinicContext = { clinicId, clinicName, doctors };

  // 5. Append user message to history
  const messages = Array.isArray(conv.messages) ? conv.messages : JSON.parse(conv.messages || '[]');
  messages.push({ role: 'user', content: text, ts: new Date().toISOString() });

  // 6. Max turns guard → handoff
  if (messages.filter(m => m.role === 'user').length > MAX_TURNS_BEFORE_HANDOFF) {
    return _doHandoff(conv, clinicId, channel, channelId, toAddress, messages, 'Exceeded max conversation turns');
  }

  // 7. Run Gemini with tool executor
  const context = typeof conv.context === 'object' ? conv.context : JSON.parse(conv.context || '{}');
  const { text: replyText, confidence } = await gemini.processConversationTurn(
    clinicContext,
    messages.slice(0, -1), // history = all except the latest user message
    text,
    (toolName, args) => _executeTool(toolName, args, clinicId, clinicName, context, channel, channelId, conv)
  );

  // 8. Low confidence → handoff
  if (confidence < HANDOFF_CONFIDENCE_THRESHOLD) {
    return _doHandoff(conv, clinicId, channel, channelId, toAddress, messages, `Low AI confidence: ${confidence}`);
  }

  // 9. Persist updated conversation
  messages.push({ role: 'assistant', content: replyText, ts: new Date().toISOString() });
  await pool.query(
    `UPDATE inbound_conversations
     SET messages=$1, context=$2, ai_confidence=$3, updated_at=NOW()
     WHERE id=$4`,
    [JSON.stringify(messages), JSON.stringify(context), confidence, conv.id]
  );

  // 10. Audit outbound reply
  await _audit(conv.id, clinicId, channel, channelId, 'outbound', replyText, { confidence });

  // 11. Send reply via Telnyx
  if (channel !== 'chat' && toAddress) {
    await telnyx.sendMessage(channel, toAddress, channelId, replyText).catch(err =>
      logger.error('[Orchestrator] Send reply failed', err.message)
    );
  }

  return { replyText, booked: context.appointmentBooked || false, handoff: false, conversationId: conv.id };
}

// ── Tool executor (called by Gemini when it makes function calls) ──────────
async function _executeTool(toolName, args, clinicId, clinicName, context, channel, channelId, conv) {
  logger.info(`[Orchestrator] executing tool: ${toolName}`, args);

  switch (toolName) {

    case 'get_doctors': {
      const doctors = await slot.getDoctors(clinicId);
      return { doctors: doctors.map(d => ({ id: d.id, name: d.name, specialization: d.specialization || 'General' })) };
    }

    case 'check_availability': {
      const { doctor_id, date } = args;
      const slots = await slot.getAvailableSlots(clinicId, doctor_id, date);
      // Save doctor preference to context
      context.doctor_id = doctor_id;
      context.preferred_date = date;
      if (!slots.length) return { available: false, message: 'No slots available on this date.' };
      return {
        available: true,
        date,
        slots: slots.slice(0, 10),
        message: `${slots.length} slots available`,
      };
    }

    case 'find_patient': {
      const patient = await slot.findPatient(args.mobile);
      if (patient) {
        context.patient_name   = context.patient_name   || patient.name;
        context.patient_mobile = context.patient_mobile || patient.mobile;
      }
      return patient
        ? { found: true,  name: patient.name,  visit_count: Number(patient.visit_count), last_visit: patient.last_visit }
        : { found: false, message: 'Patient not found in records (new patient).' };
    }

    case 'book_appointment': {
      const { patient_name, patient_mobile, doctor_id, date, time, visit_reason } = args;

      // Business rule: don't double-book same patient same day
      const { rows: existing } = await pool.query(
        `SELECT id FROM emr_appointments
         WHERE clinic_id=$1 AND patient_mobile=$2 AND appointment_date=$3
           AND doctor_id=$4 AND status IN ('booked','checked_in')`,
        [clinicId, patient_mobile, date, doctor_id]
      );
      if (existing.length) {
        return { booked: false, error: 'Patient already has an appointment with this doctor on that date.' };
      }

      const appt = await slot.bookSlot(clinicId, doctor_id, date, time,
        { patient_name, patient_mobile, visit_reason }, channel
      );

      // Update context
      context.appointmentBooked = true;
      context.appointmentId     = appt.id;
      context.patient_name      = patient_name;
      context.patient_mobile    = patient_mobile;

      // Mark conversation as booked
      await pool.query(
        `UPDATE inbound_conversations SET state='booked', appointment_id=$1 WHERE id=$2`,
        [appt.id, conv.id]
      );

      // Schedule reminder (24h before)
      _scheduleReminder(appt, clinicId, channel, conv).catch(() => {});

      return {
        booked:       true,
        appointment_id: appt.id,
        token_number:   appt.token_number,
        date,
        time,
        patient_name,
        doctor_id,
        message: 'Appointment successfully created in the EMR.',
      };
    }

    case 'cancel_appointment': {
      try {
        const cancelled = await slot.cancelAppointment(clinicId, {
          appointmentId: args.appointment_id,
          patientMobile: args.patient_mobile,
          date:          args.date,
        });
        await pool.query(`UPDATE inbound_conversations SET state='cancelled' WHERE id=$1`, [conv.id]);
        return { cancelled: true, appointment_id: cancelled.id, date: cancelled.appointment_date };
      } catch (err) {
        return { cancelled: false, error: err.message };
      }
    }

    case 'request_handoff': {
      // Will be caught by orchestrator after tool returns
      context._handoffRequested = true;
      context._handoffReason    = args.reason;
      return { acknowledged: true, message: 'Connecting to staff.' };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ── Human handoff ─────────────────────────────────────────────────────────
async function _doHandoff(conv, clinicId, channel, channelId, toAddress, messages, reason) {
  await pool.query(
    `UPDATE inbound_conversations
     SET is_handoff=TRUE, handoff_reason=$1, state='handoff', messages=$2, updated_at=NOW()
     WHERE id=$3`,
    [reason, JSON.stringify(messages), conv.id]
  );

  const reply = 'I\'m connecting you to our staff who will assist you shortly. Please hold. 🙏';
  await _audit(conv.id, clinicId, channel, channelId, 'outbound', reply, { handoff: true, reason });

  if (channel !== 'chat' && toAddress) {
    await telnyx.sendMessage(channel, toAddress, channelId, reply).catch(() => {});
  }

  logger.info(`[Orchestrator] Handoff: conv#${conv.id} reason="${reason}"`);
  return { replyText: reply, booked: false, handoff: true, conversationId: conv.id };
}

// ── Reminder scheduler (fire-and-forget) ─────────────────────────────────
async function _scheduleReminder(appt, clinicId, channel, conv) {
  if (!appt.patient_mobile) return;

  // Get doctor name
  const { rows: [doc] } = await pool.query(`SELECT name FROM emr_doctors WHERE id=$1`, [appt.doctor_id]);
  const doctorName = doc?.name || 'your doctor';
  const dateStr    = new Date(appt.appointment_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr    = appt.appointment_time?.slice(0, 5) || '';

  const reminderText = `Reminder: Your appointment with ${doctorName} is on ${dateStr} at ${timeStr}. Token: ${appt.token_number}. Reply CANCEL to cancel.`;

  // Get clinic's Telnyx number for this channel
  const { rows: [cfg] } = await pool.query(
    `SELECT channel_address FROM clinic_channel_config
     WHERE clinic_id=$1 AND channel=$2 AND is_active=TRUE LIMIT 1`,
    [clinicId, channel === 'whatsapp' ? 'whatsapp' : 'sms']
  );
  if (!cfg) return;

  // Store for cron to pick up — 24h before appointment
  const apptDateTime = new Date(`${appt.appointment_date}T${appt.appointment_time || '09:00'}`);
  const reminderAt   = new Date(apptDateTime.getTime() - 24 * 60 * 60 * 1000);
  if (reminderAt <= new Date()) return; // past already

  await pool.query(
    `INSERT INTO inbound_audit_log (conversation_id, clinic_id, channel, channel_id, direction, message, metadata)
     VALUES ($1,$2,$3,$4,'system',$5,$6)`,
    [conv.id, clinicId, channel, appt.patient_mobile, reminderText,
     JSON.stringify({ type: 'scheduled_reminder', send_at: reminderAt.toISOString(), from: cfg.channel_address })]
  );
}

// ── Resolve clinic from inbound Telnyx number ─────────────────────────────
async function _resolveClinic(channel, toAddress) {
  const { rows } = await pool.query(
    `SELECT ccc.clinic_id, ec.name AS clinic_name
     FROM clinic_channel_config ccc
     JOIN emr_clinics ec ON ec.id = ccc.clinic_id
     WHERE ccc.channel = $1 AND ccc.channel_address = $2 AND ccc.is_active = TRUE
     LIMIT 1`,
    [channel, toAddress]
  );
  return rows[0] || null;
}

// ── Load or create conversation ────────────────────────────────────────────
async function _loadOrCreateConversation(channel, channelId, toAddress, clinicId) {
  // Find active (non-terminal) conversation from past TTL hours
  const cutoff = new Date(Date.now() - CONVERSATION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { rows } = await pool.query(
    `SELECT * FROM inbound_conversations
     WHERE channel=$1 AND channel_id=$2 AND to_address=$3
       AND state IN ('active','booked') AND updated_at > $4
     ORDER BY updated_at DESC LIMIT 1`,
    [channel, channelId, toAddress, cutoff]
  );

  if (rows.length) return rows[0];

  // Create new conversation
  const { rows: [created] } = await pool.query(
    `INSERT INTO inbound_conversations (clinic_id, channel, channel_id, to_address, state, context, messages)
     VALUES ($1,$2,$3,$4,'active','{}','[]') RETURNING *`,
    [clinicId, channel, channelId, toAddress]
  );
  return created;
}

// ── Audit helper ──────────────────────────────────────────────────────────
async function _audit(convId, clinicId, channel, channelId, direction, message, metadata = {}) {
  await pool.query(
    `INSERT INTO inbound_audit_log (conversation_id, clinic_id, channel, channel_id, direction, message, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [convId, clinicId, channel, channelId, direction, message, JSON.stringify(metadata)]
  ).catch(err => logger.error('[Audit] log failed', err.message));
}

// ── Cron: send scheduled reminders ───────────────────────────────────────
async function sendPendingReminders() {
  const now = new Date().toISOString();
  const { rows } = await pool.query(
    `SELECT * FROM inbound_audit_log
     WHERE direction='system'
       AND metadata->>'type' = 'scheduled_reminder'
       AND metadata->>'sent' IS NULL
       AND metadata->>'send_at' <= $1`,
    [now]
  );

  for (const row of rows) {
    const meta = row.metadata;
    try {
      await telnyx.sendMessage(row.channel, meta.from, row.channel_id, row.message);
      await pool.query(
        `UPDATE inbound_audit_log SET metadata = metadata || '{"sent":true}'::jsonb WHERE id=$1`,
        [row.id]
      );
      logger.info(`[Reminder] sent to ${row.channel_id}`);
    } catch (err) {
      logger.error(`[Reminder] failed for ${row.channel_id}`, err.message);
    }
  }
}

module.exports = { handleInboundMessage, sendPendingReminders };
