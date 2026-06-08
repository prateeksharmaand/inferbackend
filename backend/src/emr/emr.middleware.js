const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'infer-emr-secret';

async function emrAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    req.emrUser = jwt.verify(header.slice(7), JWT_SECRET);

    // Block suspended clinics on every request
    const { rows } = await pool.query(
      `SELECT status FROM emr_clinics WHERE id = $1`,
      [req.emrUser.clinic_id]
    );
    if (rows[0]?.status === 'suspended') {
      return res.status(403).json({ error: 'clinic_suspended' });
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { emrAuth };
