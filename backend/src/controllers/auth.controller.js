const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { addTimelineEvent } = require('../services/timeline.service');

async function register(req, res) {
  const { email, password, first_name, last_name, phone, date_of_birth, gender, blood_type } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, date_of_birth, gender, blood_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, phone, date_of_birth, gender, blood_type, created_at`,
    [email.toLowerCase(), passwordHash, first_name, last_name, phone, date_of_birth, gender, blood_type]
  );
  const user = result.rows[0];
  const { token, refreshToken } = await _generateTokens(user.id);
  await addTimelineEvent(user.id, 'account', 'Account Created', 'Welcome to PHR Health!');
  res.status(201).json({ user: _sanitizeUser(user), token, refresh_token: refreshToken });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase()]);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
  const { token, refreshToken } = await _generateTokens(user.id);
  res.json({ user: _sanitizeUser(user), token, refresh_token: refreshToken });
}

async function refresh(req, res) {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });
  const result = await query('SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()', [refresh_token]);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid or expired refresh token' });
  const { user_id } = result.rows[0];
  const { token, refreshToken } = await _generateTokens(user_id);
  await query('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]);
  res.json({ token, refresh_token: refreshToken });
}

async function logout(req, res) {
  if (req.user?.id) await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
  res.json({ message: 'Logged out successfully' });
}

async function getMe(req, res) {
  const result = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ user: _sanitizeUser(result.rows[0]) });
}

async function updateProfile(req, res) {
  const { first_name, last_name, phone, date_of_birth, gender, blood_type, height, weight, conditions, allergies, emergency_contact_name, emergency_contact_phone } = req.body;
  const result = await query(
    `UPDATE users SET first_name=$1, last_name=$2, phone=$3, date_of_birth=$4, gender=$5, blood_type=$6,
     height=$7, weight=$8, conditions=$9, allergies=$10, emergency_contact_name=$11, emergency_contact_phone=$12
     WHERE id=$13 RETURNING *`,
    [first_name, last_name, phone, date_of_birth, gender, blood_type, height, weight,
     conditions || [], allergies || [], emergency_contact_name, emergency_contact_phone, req.user.id]
  );
  res.json({ user: _sanitizeUser(result.rows[0]) });
}

async function forgotPassword(req, res) {
  res.json({ message: 'If the email exists, a reset link has been sent' });
}

async function _generateTokens(userId) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const refreshToken = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [userId, refreshToken, expiresAt]);
  return { token, refreshToken };
}

function _sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

module.exports = { register, login, refresh, logout, getMe, updateProfile, forgotPassword };
