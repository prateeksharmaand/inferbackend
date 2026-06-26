const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query('SELECT id, email, first_name, last_name, is_active FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0 || !result.rows[0].is_active) return res.status(401).json({ error: 'User not found or inactive' });
    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Role-based access control middleware
 * @param {string} requiredRole - The role required to access this endpoint (e.g., 'admin')
 * @returns {Function} Express middleware function
 */
function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const userRole = req.user.role || 'user';

    if (userRole !== requiredRole) {
      return res.status(403).json({
        error: `Access denied. Required role: ${requiredRole}, Your role: ${userRole}`
      });
    }

    next();
  };
}

module.exports = authMiddleware;
module.exports.requireAuth = authMiddleware;
module.exports.requireRole = requireRole;
