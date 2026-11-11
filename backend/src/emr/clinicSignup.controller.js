/**
 * Self-service clinic registration with email verification.
 *
 *   POST /api/emr/auth/signup/start   { clinic_name, admin_name, email, phone, city, password }
 *        → emails a 6-digit code, returns { signup_id }
 *   POST /api/emr/auth/signup/resend  { signup_id }                 (max once a minute, 5 per sign-up)
 *   POST /api/emr/auth/signup/verify  { signup_id, code }
 *        → creates the clinic, its admin login, default setup, a 10-day Base trial
 *          (after which it simply continues on the Base plan) and its public page.
 *
 * The client then signs in with the email + password it already has.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const logger = require('../utils/logger');
const mailer = require('./emr.mailer');

const TRIAL_DAYS = 10;
const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const hashCode = (id, code) => crypto.createHash('sha256').update(`${id}:${code}`).digest('hex');
const newCode = () => String(crypto.randomInt(100000, 1000000));
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

function validate(b) {
  const errors = [];
  const out = {
    clinic_name: clean(b.clinic_name, 120), admin_name: clean(b.admin_name, 100),
    email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 20).replace(/[^\d+ ]/g, ''),
    city: clean(b.city, 80), password: String(b.password || ''),
  };
  if (out.clinic_name.length < 3) errors.push('Enter your clinic name');
  if (out.admin_name.length < 2) errors.push('Enter your name');
  if (!EMAIL_RE.test(out.email)) errors.push('Enter a valid email address');
  if (out.phone.replace(/\D/g, '').length < 10) errors.push('Enter a valid mobile number');
  if (out.password.length < 8 || !/[A-Za-z]/.test(out.password) || !/\d/.test(out.password)) {
    errors.push('Password must be at least 8 characters and include a letter and a number');
  }
  if (!b.accept_terms) errors.push('Please accept the Terms and Privacy Policy');
  return { out, errors };
}

async function emailTaken(db, email) {
  const { rows } = await db.query(`SELECT 1 FROM emr_clinic_staff WHERE lower(email) = $1 LIMIT 1`, [email]);
  return rows.length > 0;
}

exports.start = async (req, res) => {
  const { out, errors } = validate(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  if (await emailTaken(pool, out.email)) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
  }
  const { rows: [recent] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM clinic_signups WHERE lower(email) = $1 AND created_at > NOW() - interval '1 hour'`, [out.email]);
  if (recent.n >= 5) return res.status(429).json({ error: 'Too many sign-up attempts for this email. Please try again in an hour.' });

  const payload = {
    clinic_name: out.clinic_name, admin_name: out.admin_name, phone: out.phone, city: out.city,
    password_hash: await bcrypt.hash(out.password, 12),
  };
  const id = crypto.randomUUID();
  const code = newCode();
  await pool.query(
    `INSERT INTO clinic_signups (id, email, payload, code_hash, expires_at, ip)
     VALUES ($1,$2,$3,$4, NOW() + ($5 || ' minutes')::interval, $6)`,
    [id, out.email, JSON.stringify(payload), hashCode(id, code), String(CODE_TTL_MIN), req.ip || null]);
  try {
    await mailer.sendSignupCode({ to: out.email, name: out.admin_name, clinicName: out.clinic_name, code, minutes: CODE_TTL_MIN });
  } catch (e) {
    logger.error('[signup] code email failed', { error: e.message });
    return res.status(502).json({ error: 'We could not send the verification email. Please check the address and try again.' });
  }
  res.json({ signup_id: id, email: out.email, expires_in: CODE_TTL_MIN * 60 });
};

exports.resend = async (req, res) => {
  const { signup_id } = req.body || {};
  const { rows: [s] } = await pool.query(`SELECT * FROM clinic_signups WHERE id = $1`, [signup_id]).catch(() => ({ rows: [] }));
  if (!s || s.consumed_at) return res.status(404).json({ error: 'Sign-up not found. Please start again.' });
  if (s.sends >= MAX_SENDS) return res.status(429).json({ error: 'Too many codes sent. Please start again later.' });
  if (Date.now() - new Date(s.last_sent_at).getTime() < 60000) return res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
  const code = newCode();
  await pool.query(
    `UPDATE clinic_signups SET code_hash = $2, attempts = 0, sends = sends + 1, last_sent_at = NOW(),
            expires_at = NOW() + ($3 || ' minutes')::interval WHERE id = $1`,
    [s.id, hashCode(s.id, code), String(CODE_TTL_MIN)]);
  try {
    await mailer.sendSignupCode({ to: s.email, name: s.payload.admin_name, clinicName: s.payload.clinic_name, code, minutes: CODE_TTL_MIN });
  } catch (e) {
    return res.status(502).json({ error: 'We could not send the email. Please try again.' });
  }
  res.json({ ok: true });
};

exports.verify = async (req, res) => {
  const { signup_id } = req.body || {};
  const code = String(req.body?.code || '').replace(/\D/g, '');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [s] } = await client.query(`SELECT * FROM clinic_signups WHERE id = $1 FOR UPDATE`, [signup_id]).catch(() => ({ rows: [] }));
    if (!s || s.consumed_at) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Sign-up not found. Please start again.' }); }
    if (new Date(s.expires_at) < new Date()) { await client.query('ROLLBACK'); return res.status(410).json({ error: 'This code has expired. Request a new code.' }); }
    if (s.attempts >= MAX_ATTEMPTS) { await client.query('ROLLBACK'); return res.status(429).json({ error: 'Too many wrong codes. Request a new code.' }); }
    const ok = code.length === 6 && crypto.timingSafeEqual(Buffer.from(hashCode(s.id, code)), Buffer.from(s.code_hash));
    if (!ok) {
      await client.query(`UPDATE clinic_signups SET attempts = attempts + 1 WHERE id = $1`, [s.id]);
      await client.query('COMMIT');
      const left = MAX_ATTEMPTS - s.attempts - 1;
      return res.status(400).json({ error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong codes. Request a new code.' });
    }
    if (await emailTaken(client, s.email)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }
    const p = s.payload;
    const { rows: [clinic] } = await client.query(
      `INSERT INTO emr_clinics (name, address, phone, email, plan) VALUES ($1,$2,$3,$4,'base') RETURNING id, name`,
      [p.clinic_name, p.city || null, p.phone || null, s.email]);
    await client.query(
      `INSERT INTO emr_clinic_staff (clinic_id, name, email, password_hash, role, seat_type, mobile)
       VALUES ($1,$2,$3,$4,'admin','premium',$5)`,
      [clinic.id, p.admin_name, s.email, p.password_hash, p.phone || null]);
    // Roles, services, queues, custom attributes, UHID numbering
    await require('./clinicDefaults').ensureClinicDefaults(client, clinic.id);
    // 10-day Base trial; afterwards it simply continues on the Base plan (see convertEndedTrials)
    await client.query(
      `INSERT INTO clinic_subscriptions (clinic_id, plan_id, billing_cycle, status, expires_at)
       SELECT $1, id, 'free', 'trial', NOW() + ($2 || ' days')::interval FROM subscription_plans WHERE key = 'base'
       ON CONFLICT (clinic_id) DO NOTHING`, [clinic.id, String(TRIAL_DAYS)]);
    await client.query(`UPDATE clinic_signups SET consumed_at = NOW(), clinic_id = $2 WHERE id = $1`, [s.id, clinic.id]);
    await client.query('COMMIT');

    require('./clinicPage/service').publishClinicPage(pool, clinic.id).catch(() => {});
    mailer.sendClinicWelcome?.({ to: s.email, name: p.admin_name, clinicName: clinic.name, trialDays: TRIAL_DAYS })
      .catch(e => logger.warn('[signup] welcome email failed', { error: e.message }));
    logger.info(`[signup] clinic ${clinic.id} "${clinic.name}" registered`);
    res.status(201).json({ ok: true, email: s.email, clinic_id: clinic.id, trial_days: TRIAL_DAYS });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('[signup] verify failed', { error: e.message });
    res.status(500).json({ error: 'Could not create the account. Please try again.' });
  } finally {
    client.release();
  }
};

/** Hourly: a finished Base trial becomes a normal (unlimited-time) Base plan. */
exports.convertEndedTrials = async () => {
  const r = await pool.query(
    `UPDATE clinic_subscriptions cs SET status = 'active', expires_at = NULL
       FROM subscription_plans p
      WHERE p.id = cs.plan_id AND p.key = 'base' AND cs.status = 'trial' AND cs.expires_at < NOW()`);
  if (r.rowCount) logger.info(`[signup] ${r.rowCount} Base trial(s) ended → Base plan`);
  return r.rowCount;
};
