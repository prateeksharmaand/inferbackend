const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error({ message: err.message, stack: err.stack, url: req.url, method: req.method });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
  if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
  if (err.code === '23505') return res.status(409).json({ error: 'Resource already exists' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced resource not found' });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error', ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) });
}

module.exports = errorHandler;
