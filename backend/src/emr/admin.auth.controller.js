const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../config/database');

const JWT_SECRET  = process.env.JWT_SECRET || 'infer-emr-secret';
const JWT_EXPIRES = '24h';

// Called once at startup to ensure a superadmin exists
async function seedSuperadmin() {
  const email    = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) return;

  const { rows } = await pool.query('SELECT id FROM superadmins WHERE email = $1', [email]);
  if (rows.length) return;

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO superadmins (name, email, password_hash) VALUES ($1, $2, $3)`,
    ['Super Admin', email, hash]
  );
  console.log(`[admin] Seeded superadmin: ${email}`);
}

// POST /api/admin/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const { rows } = await pool.query(
    'SELECT * FROM superadmins WHERE email = $1 AND is_active = true',
    [email]
  );
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

  const admin = rows[0];
  const ok    = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: 'superadmin' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
};

// POST /api/admin/auth/change-password
const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });

  const { rows } = await pool.query('SELECT * FROM superadmins WHERE id = $1', [req.adminUser.id]);
  const admin = rows[0];
  const ok = await bcrypt.compare(current_password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password incorrect' });

  const hash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE superadmins SET password_hash = $1 WHERE id = $2', [hash, admin.id]);
  res.json({ message: 'Password updated' });
};

module.exports = { login, changePassword, seedSuperadmin };
