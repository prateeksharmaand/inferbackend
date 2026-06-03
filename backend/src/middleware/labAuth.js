/**
 * Laboratory Authentication & Authorization Middleware
 */

const jwt = require('jsonwebtoken');
const db = require('../db');
const crypto = require('crypto');

/**
 * Verify Lab API Key (for programmatic uploads)
 * Headers: Authorization: Bearer {lab_api_key}
 */
async function verifyLabApiKey(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const apiKey = authHeader.replace('Bearer ', '');

    // Find lab by API key
    const result = await db.query(
      'SELECT id, facility_name, lab_type FROM laboratories WHERE api_key = $1 AND status = $2',
      [apiKey, 'ACTIVE']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or inactive API key' });
    }

    const lab = result.rows[0];

    // Get lab admin user
    const userResult = await db.query(
      'SELECT * FROM users WHERE lab_id = $1 AND lab_role = $2 LIMIT 1',
      [lab.id, 'LAB_ADMIN']
    );

    req.user = {
      id: userResult.rows[0]?.id || lab.id,
      lab_id: lab.id,
      lab_type: lab.lab_type,
      role: 'LAB_ADMIN',
      isApiKey: true
    };

    next();
  } catch (error) {
    console.error('Lab API key verification error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Verify Lab JWT Token (for lab portal login)
 */
function verifyLabToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.lab_id) {
      return res.status(401).json({ error: 'Invalid token: missing lab_id' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Check Lab Permission
 */
function checkLabPermission(permission) {
  return (req, res, next) => {
    const permissions = {
      LAB_TECHNICIAN: ['result:upload', 'result:view_own'],
      LAB_ADMIN: ['result:upload', 'result:view_all', 'lab:config', 'user:manage'],
      LAB_DIRECTOR: [
        'result:upload',
        'result:view_all',
        'lab:config',
        'user:manage',
        'audit:view'
      ]
    };

    const userPermissions = permissions[req.user.lab_role] || [];

    if (!userPermissions.includes(permission)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    next();
  };
}

/**
 * Verify Lab Access (user can only access their lab)
 */
async function verifyLabAccess(req, res, next) {
  try {
    const { lab_id } = req.params;

    if (req.user.lab_id !== lab_id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  verifyLabApiKey,
  verifyLabToken,
  checkLabPermission,
  verifyLabAccess
};
