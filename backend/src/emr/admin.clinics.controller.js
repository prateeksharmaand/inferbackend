const bcrypt       = require('bcryptjs');
const nodemailer   = require('nodemailer');
const { pool }     = require('../config/database');

// ── Email helper ──────────────────────────────────────────────────────────────

function buildMailer() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendCredentials({ to, clinicName, email, password, loginUrl }) {
  const mailer = buildMailer();
  if (!mailer) return; // SMTP not configured — credentials shown in API response only

  await mailer.sendMail({
    from: process.env.SMTP_FROM || 'noreply@infer.health',
    to,
    subject: `Welcome to Infer EMR — Your clinic credentials`,
    html: `
      <h2>Welcome to Infer EMR</h2>
      <p>Your clinic <strong>${clinicName}</strong> has been set up. Here are your login credentials:</p>
      <table>
        <tr><td><strong>Login URL</strong></td><td>${loginUrl}</td></tr>
        <tr><td><strong>Email</strong></td><td>${email}</td></tr>
        <tr><td><strong>Password</strong></td><td>${password}</td></tr>
      </table>
      <p>Please change your password after first login.</p>
    `,
  });
}

// ── GET /api/admin/clinics ────────────────────────────────────────────────────

exports.listClinics = async (req, res) => {
  const { search, status } = req.query;
  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (c.name ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
  }
  if (status) {
    params.push(status);
    where += ` AND c.status = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT c.*,
            sp.key AS plan_key, sp.display_name AS plan_name,
            cs.status AS sub_status, cs.expires_at, cs.billing_cycle,
            (SELECT COUNT(*)::int FROM emr_patients   WHERE clinic_id = c.id) AS patient_count,
            (SELECT COUNT(*)::int FROM emr_appointments WHERE clinic_id = c.id) AS appointment_count,
            (SELECT COUNT(*)::int FROM emr_doctors     WHERE clinic_id = c.id AND is_active = true) AS doctor_count
     FROM emr_clinics c
     LEFT JOIN clinic_subscriptions cs ON cs.clinic_id = c.id
     LEFT JOIN subscription_plans   sp ON sp.id = cs.plan_id
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );
  res.json(rows);
};

// ── GET /api/admin/clinics/:id ────────────────────────────────────────────────

exports.getClinic = async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT c.*,
            sp.key AS plan_key, sp.display_name AS plan_name,
            cs.status AS sub_status, cs.expires_at, cs.billing_cycle, cs.seat_count,
            cs.razorpay_payment_id
     FROM emr_clinics c
     LEFT JOIN clinic_subscriptions cs ON cs.clinic_id = c.id
     LEFT JOIN subscription_plans   sp ON sp.id = cs.plan_id
     WHERE c.id = $1`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Clinic not found' });

  const [doctors, staff, patients, appts] = await Promise.all([
    pool.query(`SELECT id, name, email, specialization, is_active FROM emr_doctors WHERE clinic_id = $1 ORDER BY name`, [id]),
    pool.query(`SELECT id, name, email, role, is_active FROM emr_clinic_staff WHERE clinic_id = $1 ORDER BY name`, [id]),
    pool.query(`SELECT COUNT(*)::int AS n FROM emr_patients WHERE clinic_id = $1`, [id]),
    pool.query(`SELECT COUNT(*)::int AS n FROM emr_appointments WHERE clinic_id = $1`, [id]),
  ]);

  res.json({
    ...rows[0],
    doctors:       doctors.rows,
    staff:         staff.rows,
    patient_count: patients.rows[0].n,
    appt_count:    appts.rows[0].n,
  });
};

// ── POST /api/admin/clinics ───────────────────────────────────────────────────

exports.createClinic = async (req, res) => {
  const {
    clinic_name, address, phone, email,
    owner_name, owner_email, owner_password,
    plan_key = 'base', trial_days,
  } = req.body;

  if (!clinic_name || !owner_email || !owner_password)
    return res.status(400).json({ error: 'clinic_name, owner_email, owner_password required' });

  const hash   = await bcrypt.hash(owner_password, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: [clinic] } = await client.query(
      `INSERT INTO emr_clinics (name, address, phone, email)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [clinic_name, address || null, phone || null, email || null]
    );

    // Owner account (admin staff)
    await client.query(
      `INSERT INTO emr_clinic_staff (clinic_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,'admin')`,
      [clinic.id, owner_name || owner_email, owner_email, hash]
    );

    // Subscription
    const { rows: [plan] } = await client.query(
      `SELECT * FROM subscription_plans WHERE key = $1`, [plan_key]
    );
    if (!plan) throw new Error(`Unknown plan key: ${plan_key}`);

    const trialEnd = trial_days
      ? new Date(Date.now() + trial_days * 86400000)
      : null;

    await client.query(
      `INSERT INTO clinic_subscriptions (clinic_id, plan_id, billing_cycle, status, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [clinic.id, plan.id, 'free', trial_days ? 'trial' : 'active', trialEnd]
    );

    // Audit log
    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details)
       VALUES ($1,'create_clinic','clinic',$2,$3)`,
      [req.adminUser.id, clinic.id, JSON.stringify({ clinic_name, owner_email, plan_key })]
    );

    await client.query('COMMIT');

    // Send credentials email (fire-and-forget)
    sendCredentials({
      to: owner_email,
      clinicName: clinic_name,
      email: owner_email,
      password: owner_password,
      loginUrl: process.env.APP_URL ? `${process.env.APP_URL}/opd/login` : 'https://your-emr-domain.com/opd/login',
    }).catch(() => {});

    res.status(201).json({
      message: 'Clinic created',
      clinic_id:    clinic.id,
      owner_email,
      owner_password, // returned so you can copy it from admin UI; emailed too
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  } finally {
    client.release();
  }
};

// ── PATCH /api/admin/clinics/:id ──────────────────────────────────────────────

exports.updateClinic = async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, email, status, notes } = req.body;

  const { rows } = await pool.query(
    `UPDATE emr_clinics
     SET name    = COALESCE($1, name),
         address = COALESCE($2, address),
         phone   = COALESCE($3, phone),
         email   = COALESCE($4, email),
         status  = COALESCE($5, status),
         notes   = COALESCE($6, notes)
     WHERE id = $7 RETURNING *`,
    [name, address, phone, email, status, notes, id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Clinic not found' });

  await pool.query(
    `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details)
     VALUES ($1,'update_clinic','clinic',$2,$3)`,
    [req.adminUser.id, id, JSON.stringify(req.body)]
  );

  res.json(rows[0]);
};

// ── PATCH /api/admin/clinics/:id/suspend ─────────────────────────────────────

exports.suspendClinic = async (req, res) => {
  const { id } = req.params;
  await pool.query(`UPDATE emr_clinics SET status = 'suspended' WHERE id = $1`, [id]);
  await pool.query(
    `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id)
     VALUES ($1,'suspend_clinic','clinic',$2)`,
    [req.adminUser.id, id]
  );
  res.json({ message: 'Clinic suspended' });
};

// ── PATCH /api/admin/clinics/:id/activate ────────────────────────────────────

exports.activateClinic = async (req, res) => {
  const { id } = req.params;
  await pool.query(`UPDATE emr_clinics SET status = 'active' WHERE id = $1`, [id]);
  await pool.query(
    `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id)
     VALUES ($1,'activate_clinic','clinic',$2)`,
    [req.adminUser.id, id]
  );
  res.json({ message: 'Clinic activated' });
};

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

exports.getStats = async (req, res) => {
  const [clinics, patients, subscriptions] = await Promise.all([
    pool.query(`SELECT
      COUNT(*)::int                                                         AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int                       AS active,
      COUNT(*) FILTER (WHERE status = 'suspended')::int                    AS suspended,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_this_month
    FROM emr_clinics`),

    pool.query(`SELECT COUNT(*)::int AS total FROM emr_patients`),

    pool.query(`SELECT
      sp.key AS plan_key, sp.display_name, COUNT(cs.id)::int AS count
    FROM clinic_subscriptions cs
    JOIN subscription_plans sp ON sp.id = cs.plan_id
    GROUP BY sp.key, sp.display_name`),
  ]);

  res.json({
    clinics:       clinics.rows[0],
    total_patients: patients.rows[0].total,
    subscriptions:  subscriptions.rows,
  });
};
