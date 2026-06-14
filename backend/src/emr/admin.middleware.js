const jwt = require('jsonwebtoken');

const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('FATAL: JWT_SECRET must be set and be at least 32 characters');
  return s;
})();

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    if (payload.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    req.adminUser = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { adminAuth };
