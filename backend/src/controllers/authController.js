const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const generateToken = (accountId) =>
  jwt.sign({ accountId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

async function register(req, res, next) {
  try {
    const { email, password, phone, fullName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'email, password and fullName are required' });
    }

    const existing = await query('SELECT id FROM accounts WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const accountResult = await query(
      `INSERT INTO accounts (email, password_hash, phone) VALUES ($1, $2, $3) RETURNING id, email`,
      [email.toLowerCase(), passwordHash, phone]
    );

    const account = accountResult.rows[0];

    // Create default self profile
    const profileResult = await query(
      `INSERT INTO profiles (account_id, full_name, relationship, is_primary)
       VALUES ($1, $2, 'self', TRUE) RETURNING *`,
      [account.id, fullName]
    );

    const token = generateToken(account.id);

    res.status(201).json({
      token,
      account: { id: account.id, email: account.email },
      primaryProfile: profileResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await query('SELECT * FROM accounts WHERE email = $1', [email.toLowerCase()]);
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const account = result.rows[0];
    const isValid = await bcrypt.compare(password, account.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const profiles = await query(
      'SELECT * FROM profiles WHERE account_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [account.id]
    );

    const token = generateToken(account.id);

    res.json({
      token,
      account: { id: account.id, email: account.email, phone: account.phone },
      profiles: profiles.rows,
    });
  } catch (err) {
    next(err);
  }
}

async function updateFcmToken(req, res, next) {
  try {
    const { fcmToken } = req.body;
    await query('UPDATE accounts SET fcm_token = $1 WHERE id = $2', [fcmToken, req.accountId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await query('SELECT password_hash FROM accounts WHERE id = $1', [req.accountId]);
    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE accounts SET password_hash = $1 WHERE id = $2', [newHash, req.accountId]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, updateFcmToken, changePassword };
