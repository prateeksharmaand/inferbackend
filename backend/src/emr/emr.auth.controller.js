const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
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
      ...(role === 'doctor' ? { specialization: user.specialization, qualification: user.qualification } : {}),
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
  const { name, email, password, specialization, qualification, registration_no } = req.body;
  const clinic_id = req.emrUser.clinic_id;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO emr_doctors (clinic_id, name, email, password_hash, specialization, qualification, registration_no)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, email, specialization`,
    [clinic_id, name, email, hash, specialization || null, qualification || null, registration_no || null]
  );
  res.status(201).json(rows[0]);
};

// GET /api/emr/auth/doctors
const listDoctors = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, email, specialization, qualification, registration_no, is_active
     FROM emr_doctors WHERE clinic_id=$1 ORDER BY name`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

module.exports = { login, registerClinic, addDoctor, listDoctors };
