const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'infer-emr-secret';

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
