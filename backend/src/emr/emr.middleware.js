const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('FATAL: JWT_SECRET must be set and be at least 32 characters');
  return s;
})();

async function emrAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);

    // Check JWT blacklist (logout/revocation)
    if (decoded.jti) {
      const { rows: bl } = await pool.query(
        `SELECT id FROM jwt_blacklist WHERE jti=$1 AND expires_at > NOW() LIMIT 1`,
        [decoded.jti]
      );
      if (bl.length) return res.status(401).json({ error: 'Token has been revoked. Please login again.' });
    }

    req.emrUser = decoded;

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
