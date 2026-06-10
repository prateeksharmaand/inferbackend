const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const nodemailer = require('nodemailer');
const { pool } = require('../config/database');

const JWT_SECRET  = process.env.JWT_SECRET || 'infer-emr-secret';
const JWT_EXPIRES = '12h';

function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// POST /api/emr/auth/login  { email, password, role: 'doctor'|'staff' }
const login = async (req, res) => {
  const { email, password, role = 'staff' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const table = role === 'doctor' ? 'emr_doctors' : 'emr_clinic_staff';
  const { rows } = await pool.query(
    `SELECT d.*, c.name AS clinic_name, c.address AS clinic_address, c.phone AS clinic_phone, c.plan, c.max_patients
     FROM ${table} d
     JOIN emr_clinics c ON c.id = d.clinic_id
     WHERE d.email = $1 AND d.is_active = true`,
    [email]
  );
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

  const user = rows[0];
  const ok   = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Your clinic account has been suspended. Please contact support.' });
  }

  const token = sign({ id: user.id, clinic_id: user.clinic_id, role, email });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      clinic_id:      user.clinic_id,
      clinic_name:    user.clinic_name,
      clinic_address: user.clinic_address || '',
      clinic_phone:   user.clinic_phone   || '',
      plan:           user.plan,
      max_patients:   user.max_patients,
      ...(role === 'doctor' ? { specialization: user.specialization, qualification: user.qualification, google_review_link: user.google_review_link || '' } : {}),
    },
  });
};

// POST /api/emr/auth/register-clinic  (initial clinic + admin setup)
const registerClinic = async (req, res) => {
  const { clinic_name, address, phone, email, admin_name, admin_email, admin_password } = req.body;
  if (!clinic_name || !admin_email || !admin_password)
    return res.status(400).json({ error: 'clinic_name, admin_email, admin_password required' });

  const hash = await bcrypt.hash(admin_password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [clinic] } = await client.query(
      `INSERT INTO emr_clinics (name, address, phone, email)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [clinic_name, address || null, phone || null, email || null]
    );
    await client.query(
      `INSERT INTO emr_clinic_staff (clinic_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,'admin')`,
      [clinic.id, admin_name || admin_email, admin_email, hash]
    );
    await client.query('COMMIT');
    res.status(201).json({ message: 'Clinic registered', clinic_id: clinic.id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  } finally {
    client.release();
  }
};

// POST /api/emr/auth/add-doctor  (staff only)
const addDoctor = async (req, res) => {
  const { name, email, password, specialization, qualification, registration_no, google_review_link } = req.body;
  const clinic_id = req.emrUser.clinic_id;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });

  // ── Seat limit check ────────────────────────────────────────────────────────
  const { rows: [sub] } = await pool.query(
    `SELECT cs.status, sp.key AS plan_key, sp.max_users
     FROM clinic_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.clinic_id = $1`, [clinic_id]
  );

  const planKey  = sub?.plan_key || 'base';
  let   maxSeats = 1; // base plan default

  if (planKey === 'pro') {
    // Check purchased seats from clinic_subscription_items (premium + basic seats)
    const { rows: [seatRow] } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total
       FROM clinic_subscription_items
       WHERE clinic_id = $1 AND item_type = 'seat' AND item_key IN ('premium','basic')`,
      [clinic_id]
    );
    const purchasedSeats = seatRow?.total || 0;
    // Fall back to plan's max_users if no items configured (-1 = unlimited)
    maxSeats = purchasedSeats > 0 ? purchasedSeats : (sub?.max_users ?? -1);
  }

  if (maxSeats !== -1) {
    const { rows: [countRow] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM emr_doctors WHERE clinic_id = $1 AND is_active = true`,
      [clinic_id]
    );
    if (countRow.n >= maxSeats) {
      return res.status(402).json({
        error: 'seat_limit',
        plan:  planKey,
        used:  countRow.n,
        limit: maxSeats,
        message: planKey === 'base'
          ? `Base plan allows only ${maxSeats} doctor. Upgrade to Infer Pro to add more.`
          : `You have used all ${maxSeats} purchased seats. Contact support or upgrade your plan.`,
      });
    }
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO emr_doctors (clinic_id, name, email, password_hash, specialization, qualification, registration_no, google_review_link)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name, email, specialization, google_review_link`,
    [clinic_id, name, email, hash, specialization || null, qualification || null, registration_no || null, google_review_link || null]
  );
  res.status(201).json(rows[0]);
};

// GET /api/emr/auth/seat-info
const getSeatInfo = async (req, res) => {
  const clinic_id = req.emrUser.clinic_id;

  const { rows: [sub] } = await pool.query(
    `SELECT cs.status, sp.key AS plan_key, sp.display_name, sp.max_users
     FROM clinic_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.clinic_id = $1`, [clinic_id]
  );

  const planKey = sub?.plan_key || 'base';
  let   limit   = 1;
  let   unlimited = false;

  if (planKey === 'pro') {
    const { rows: [seatRow] } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total
       FROM clinic_subscription_items
       WHERE clinic_id = $1 AND item_type = 'seat' AND item_key IN ('premium','basic')`,
      [clinic_id]
    );
    const purchased = seatRow?.total || 0;
    if (purchased > 0) {
      limit = purchased;
    } else if (sub?.max_users === -1) {
      unlimited = true;
    } else {
      limit = sub?.max_users ?? 1;
    }
  }

  const { rows: [countRow] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM emr_doctors WHERE clinic_id = $1 AND is_active = true`,
    [clinic_id]
  );

  res.json({
    plan:      planKey,
    plan_name: sub?.display_name || 'Base Plan',
    used:      countRow.n,
    limit:     unlimited ? null : limit,
    unlimited,
    available: unlimited ? null : Math.max(0, limit - countRow.n),
  });
};

// GET /api/emr/auth/doctors
const listDoctors = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, email, specialization, qualification, registration_no, is_active, google_review_link
     FROM emr_doctors WHERE clinic_id=$1 ORDER BY name`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

// PATCH /api/emr/auth/doctors/:id
const updateDoctor = async (req, res) => {
  const { name, email, password, specialization, qualification, registration_no, is_active, google_review_link } = req.body;
  const sets = []; const params = [];
  let i = 1;
  if (name               !== undefined) { sets.push(`name=$${i++}`);               params.push(name); }
  if (email              !== undefined) { sets.push(`email=$${i++}`);              params.push(email); }
  if (specialization     !== undefined) { sets.push(`specialization=$${i++}`);     params.push(specialization); }
  if (qualification      !== undefined) { sets.push(`qualification=$${i++}`);      params.push(qualification); }
  if (registration_no    !== undefined) { sets.push(`registration_no=$${i++}`);    params.push(registration_no); }
  if (is_active          !== undefined) { sets.push(`is_active=$${i++}`);          params.push(is_active); }
  if (google_review_link !== undefined) { sets.push(`google_review_link=$${i++}`); params.push(google_review_link || null); }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    sets.push(`password_hash=$${i++}`); params.push(hash);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id, req.emrUser.clinic_id);
  const { rows } = await pool.query(
    `UPDATE emr_doctors SET ${sets.join(', ')}
     WHERE id=$${i++} AND clinic_id=$${i++}
     RETURNING id, name, email, specialization, qualification, registration_no, is_active, google_review_link`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Doctor not found' });
  res.json(rows[0]);
};

// DELETE /api/emr/auth/doctors/:id
const deleteDoctor = async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM emr_doctors WHERE id=$1 AND clinic_id=$2',
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Doctor not found' });
  res.json({ ok: true });
};

// POST /api/emr/auth/forgot-password  { email, role: 'doctor'|'staff' }
const forgotPassword = async (req, res) => {
  const { email, role = 'staff' } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const table = role === 'doctor' ? 'emr_doctors' : 'emr_clinic_staff';
  const { rows } = await pool.query(`SELECT id, name FROM ${table} WHERE email=$1 AND is_active=true`, [email]);

  // Always respond OK to avoid email enumeration
  if (!rows.length) return res.json({ message: 'If that email exists, a reset link has been sent.' });

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool.query(
    `INSERT INTO emr_password_resets (email, role, token, expires_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (email, role) DO UPDATE SET token=$3, expires_at=$4`,
    [email, role, token, expires]
  );

  const resetUrl = `${process.env.APP_URL || 'https://emr.inferapp.online'}/reset-password?token=${token}&role=${role}`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: `"Infer Care" <${process.env.SMTP_FROM}>`,
    to: email,
    subject: 'Reset your Infer Care password',
    html: `<p>Hi ${rows[0].name},</p>
           <p>Click the link below to reset your password. This link expires in 1 hour.</p>
           <p><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p>
           <p>If you did not request this, ignore this email.</p>`,
  });

  res.json({ message: 'If that email exists, a reset link has been sent.' });
};

// POST /api/emr/auth/reset-password  { token, role, new_password }
const resetPassword = async (req, res) => {
  const { token, role = 'staff', new_password } = req.body;
  if (!token || !new_password) return res.status(400).json({ error: 'token and new_password required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const { rows } = await pool.query(
    `SELECT email FROM emr_password_resets WHERE token=$1 AND role=$2 AND expires_at > NOW()`,
    [token, role]
  );
  if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset link.' });

  const { email } = rows[0];
  const table = role === 'doctor' ? 'emr_doctors' : 'emr_clinic_staff';
  const hash  = await bcrypt.hash(new_password, 10);

  await pool.query(`UPDATE ${table} SET password_hash=$1 WHERE email=$2`, [hash, email]);
  await pool.query(`DELETE FROM emr_password_resets WHERE email=$1 AND role=$2`, [email, role]);

  res.json({ message: 'Password reset successfully. You can now log in.' });
};

// POST /api/emr/auth/change-password  { current_password, new_password }  (authenticated)
const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'current_password and new_password required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const { id, role } = req.emrUser;
  const table = role === 'doctor' ? 'emr_doctors' : 'emr_clinic_staff';

  const { rows } = await pool.query(`SELECT password_hash FROM ${table} WHERE id=$1`, [id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });

  const ok = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(new_password, 10);
  await pool.query(`UPDATE ${table} SET password_hash=$1 WHERE id=$2`, [hash, id]);

  res.json({ message: 'Password changed successfully.' });
};

module.exports = { login, registerClinic, addDoctor, getSeatInfo, listDoctors, updateDoctor, deleteDoctor, forgotPassword, resetPassword, changePassword };
