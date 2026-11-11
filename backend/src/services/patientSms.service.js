/**
 * Patient messages: WhatsApp (Meta-approved templates, WhatsApp Cloud API — same account settings
 * as the sales agent) first, 2Factor transactional SMS (DLT templates) as the fallback. A patient
 * gets one message per event: WhatsApp if its template is configured and the send succeeds,
 * otherwise SMS if its template is configured.
 *
 * WhatsApp (.env):
 *   WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN   WhatsApp Cloud API number + permanent token
 *   WA_TEMPLATE_BOOKED / _REMINDER / _CHECKIN / _VISIT / _RECEIPT   approved template names
 *   WA_TEMPLATE_LANG                       template language code (default en)
 *   Template body variables {{1}}, {{2}}… are filled in the same order as the SMS variables below.
 *
 * SMS:
 * India's DLT rules allow only pre-approved templates from an approved sender ID, so each message
 * type is switched on by setting its approved template name in the server .env:
 *
 *   TSMS_SENDER_ID          6-letter DLT header approved for the account (e.g. INFRCR)
 *   TSMS_TEMPLATE_BOOKED    appointment confirmation   vars: name, clinic, date, time, token
 *   TSMS_TEMPLATE_REMINDER  appointment reminder        vars: name, clinic, date, time
 *   TSMS_TEMPLATE_CHECKIN   checked in, token number    vars: name, clinic, token
 *   TSMS_TEMPLATE_VISIT     visit complete + follow-up  vars: name, clinic, follow-up date
 *   TSMS_TEMPLATE_RECEIPT   payment received            vars: name, amount, clinic
 *
 * A message type without a template is skipped (logged as "skipped"), so nothing breaks before the
 * templates are approved. Sends never block or fail the clinic workflow. Each event is sent at most
 * once (sms_log.dedupe_key). Demo patients (mobiles 900000xxxx) never receive SMS.
 */
const axios = require('axios');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

const API_KEY = process.env.SMS_API_KEY || '';   // set in the server .env only — never in code
const SENDER = process.env.TSMS_SENDER_ID || '';
const TEMPLATES = {
  booked:       process.env.TSMS_TEMPLATE_BOOKED || '',
  reminder:     process.env.TSMS_TEMPLATE_REMINDER || '',
  check_in:     process.env.TSMS_TEMPLATE_CHECKIN || '',
  prescription: process.env.TSMS_TEMPLATE_VISIT || '',
  receipt:      process.env.TSMS_TEMPLATE_RECEIPT || '',
};

const smsEnabled = kind => !!(API_KEY && SENDER && TEMPLATES[kind]);

const WA_PHONE_ID = process.env.WA_PHONE_NUMBER_ID || '';
const WA_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const WA_LANG = process.env.WA_TEMPLATE_LANG || 'en';
const WA_API = `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v23.0'}`;
const WA_TEMPLATES = {
  booked:       process.env.WA_TEMPLATE_BOOKED || '',
  reminder:     process.env.WA_TEMPLATE_REMINDER || '',
  check_in:     process.env.WA_TEMPLATE_CHECKIN || '',
  prescription: process.env.WA_TEMPLATE_VISIT || '',
  receipt:      process.env.WA_TEMPLATE_RECEIPT || '',
};
const waEnabled = kind => !!(WA_PHONE_ID && WA_TOKEN && WA_TEMPLATES[kind]);
const enabled = kind => waEnabled(kind) || smsEnabled(kind);
// DLT variables are limited to 30 characters each.
const v = x => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
const firstName = n => String(n || 'Patient').trim().split(/\s+/)[0];
const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const fmtTime = t => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return '';
  let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
};

function normalisePhone(mobile) {
  const d = String(mobile || '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
  if (ten.length !== 10 || !/^[6-9]/.test(ten)) return null;   // valid Indian mobile only
  if (ten.startsWith('900000')) return null;                    // demo patients
  return ten;
}

async function log(entry) {
  try {
    await pool.query(
      `INSERT INTO sms_log (clinic_id, appointment_id, kind, channel, dedupe_key, phone_last4, status, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.clinicId || null, entry.appointmentId || null, entry.kind, entry.channel || 'sms', entry.dedupeKey || null,
        entry.phone ? entry.phone.slice(-4) : null, entry.status, entry.detail ? String(entry.detail).slice(0, 500) : null]);
  } catch (e) {
    if (e.code !== '23505') logger.warn('[sms] log failed', { error: e.message });
  }
}

/** WhatsApp template message via the Cloud API. */
async function sendWhatsApp(kind, { phone, vars, clinicId, appointmentId, dedupeKey }) {
  const body = {
    messaging_product: 'whatsapp', to: `91${phone}`, type: 'template',
    template: {
      name: WA_TEMPLATES[kind], language: { code: WA_LANG },
      components: vars.length ? [{ type: 'body', parameters: vars.map(x => ({ type: 'text', text: String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || '-' })) }] : [],
    },
  };
  try {
    const { data } = await axios.post(`${WA_API}/${WA_PHONE_ID}/messages`, body, {
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 20000,
    });
    const ok = Array.isArray(data?.messages) && data.messages.length > 0;
    const out = { status: ok ? 'sent' : 'failed', channel: 'whatsapp', detail: JSON.stringify(data).slice(0, 300) };
    await log({ clinicId, appointmentId, kind, channel: 'whatsapp', dedupeKey, phone, ...out });
    return out;
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : e.message;
    await log({ clinicId, appointmentId, kind, channel: 'whatsapp', dedupeKey, phone, status: 'failed', detail });
    logger.warn('[whatsapp] send failed', { kind, detail });
    return { status: 'failed', channel: 'whatsapp', detail };
  }
}

/**
 * Send one patient message: WhatsApp first, SMS if WhatsApp is not configured or fails.
 * Returns { status: 'sent'|'skipped'|'failed', channel, detail }. Never throws.
 */
async function send(kind, { mobile, vars, clinicId, appointmentId, dedupeKey }) {
  const phone = normalisePhone(mobile);
  if (!enabled(kind)) return { status: 'skipped', detail: 'template not configured' };
  if (!phone) return { status: 'skipped', detail: 'no valid mobile number' };
  if (dedupeKey) {
    const { rows } = await pool.query(`SELECT 1 FROM sms_log WHERE dedupe_key = $1 AND status = 'sent' LIMIT 1`, [dedupeKey]).catch(() => ({ rows: [] }));
    if (rows.length) return { status: 'skipped', detail: 'already sent' };
  }
  if (waEnabled(kind)) {
    const wa = await sendWhatsApp(kind, { phone, vars, clinicId, appointmentId, dedupeKey });
    if (wa.status === 'sent' || !smsEnabled(kind)) return wa;
  }
  return sendSms(kind, { phone, vars, clinicId, appointmentId, dedupeKey });
}

/** 2Factor transactional SMS with a DLT template. */
async function sendSms(kind, { phone, vars, clinicId, appointmentId, dedupeKey }) {
  const form = new URLSearchParams({ module: 'TRANS_SMS', apikey: API_KEY, to: `91${phone}`, from: SENDER, templatename: TEMPLATES[kind] });
  vars.forEach((val, i) => form.append(`var${i + 1}`, v(val)));
  try {
    const { data } = await axios.post('https://2factor.in/API/R1/', form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000,
    });
    const ok = String(data?.Status || data?.status || '').toLowerCase() === 'success';
    const out = { status: ok ? 'sent' : 'failed', channel: 'sms', detail: JSON.stringify(data).slice(0, 300) };
    await log({ clinicId, appointmentId, kind, channel: 'sms', dedupeKey, phone, ...out });
    if (!ok) logger.warn('[sms] provider rejected message', { kind, detail: out.detail });
    return out;
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : e.message;
    await log({ clinicId, appointmentId, kind, channel: 'sms', dedupeKey, phone, status: 'failed', detail });
    logger.warn('[sms] send failed', { kind, detail });
    return { status: 'failed', channel: 'sms', detail };
  }
}

async function appointmentContext(appointmentId) {
  const { rows: [a] } = await pool.query(
    `SELECT a.id, a.clinic_id, a.patient_name, a.patient_mobile, a.appointment_date, a.appointment_time,
            a.token_number, a.status, c.name AS clinic_name
       FROM emr_appointments a JOIN emr_clinics c ON c.id = a.clinic_id WHERE a.id = $1`, [appointmentId]);
  return a || null;
}

// ── Events ──────────────────────────────────────────────────────────────────
async function appointmentBooked(appointmentId) {
  const a = await appointmentContext(appointmentId);
  if (!a || a.status !== 'booked') return null;
  return send('booked', {
    mobile: a.patient_mobile, clinicId: a.clinic_id, appointmentId: a.id, dedupeKey: `booked:${a.id}`,
    vars: [firstName(a.patient_name), a.clinic_name, fmtDate(a.appointment_date), fmtTime(a.appointment_time) || 'your slot', a.token_number || '-'],
  });
}

async function appointmentReminder(appointmentId, { manual = false } = {}) {
  const a = await appointmentContext(appointmentId);
  if (!a) return null;
  return send('reminder', {
    mobile: a.patient_mobile, clinicId: a.clinic_id, appointmentId: a.id,
    dedupeKey: manual ? null : `reminder:${a.id}`,
    vars: [firstName(a.patient_name), a.clinic_name, fmtDate(a.appointment_date), fmtTime(a.appointment_time) || 'your slot'],
  });
}

async function checkedIn(appointmentId) {
  const a = await appointmentContext(appointmentId);
  if (!a) return null;
  return send('check_in', {
    mobile: a.patient_mobile, clinicId: a.clinic_id, appointmentId: a.id, dedupeKey: `check_in:${a.id}`,
    vars: [firstName(a.patient_name), a.clinic_name, a.token_number || '-'],
  });
}

async function visitCompleted(appointmentId, nextVisitDate) {
  const a = await appointmentContext(appointmentId);
  if (!a) return null;
  return send('prescription', {
    mobile: a.patient_mobile, clinicId: a.clinic_id, appointmentId: a.id, dedupeKey: `visit:${a.id}`,
    vars: [firstName(a.patient_name), a.clinic_name, nextVisitDate ? fmtDate(nextVisitDate) : 'as advised'],
  });
}

async function paymentReceived(receipt) {
  if (!receipt || receipt.payment_status !== 'paid') return null;
  const { rows: [c] } = await pool.query(`SELECT name FROM emr_clinics WHERE id = $1`, [receipt.clinic_id]);
  return send('receipt', {
    mobile: receipt.phone, clinicId: receipt.clinic_id, appointmentId: receipt.appointment_id, dedupeKey: `receipt:${receipt.id}`,
    vars: [firstName(receipt.patient_name), `Rs ${Math.round(Number(receipt.grand_total || 0))}`, c?.name || 'the clinic'],
  });
}

/** Daily: remind patients booked for tomorrow (runs from server cron at 6 PM IST). */
async function sendTomorrowReminders() {
  if (!enabled('reminder')) return { skipped: true };
  const { rows } = await pool.query(
    `SELECT id FROM emr_appointments
      WHERE status = 'booked' AND appointment_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date + 1`);
  let sent = 0;
  for (const { id } of rows) if ((await appointmentReminder(id))?.status === 'sent') sent += 1;
  logger.info(`[sms] tomorrow reminders: ${sent}/${rows.length} sent`);
  return { sent, total: rows.length };
}

/** Fire-and-forget wrapper for request handlers. */
const fire = p => { Promise.resolve(p).catch(e => logger.warn('[sms] event failed', { error: e.message })); };

module.exports = {
  enabled, waEnabled, smsEnabled, send, appointmentBooked, appointmentReminder, checkedIn, visitCompleted, paymentReceived,
  sendTomorrowReminders, fire, TEMPLATES, normalisePhone,
};
