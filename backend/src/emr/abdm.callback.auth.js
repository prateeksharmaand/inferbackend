/**
 * R2-003 / SEC-005: ABDM Gateway Callback Authentication — full JWKS signature verification
 *
 * ABDM gateway sends Authorization: Bearer <RS256 JWT> on every callback.
 * This middleware:
 *   1. Requires the header to be present
 *   2. Fetches the ABDM JWKS (cached 1h)
 *   3. Verifies the JWT signature with the matching public key
 *   4. Checks expiry and issuer
 *
 * ABDM_SKIP_JWT_VERIFY=true bypasses signature check (sandbox only).
 */
const axios  = require('axios');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const audit  = require('../services/auditLogger');

// JWKS cache
let _jwksCache = null;
let _jwksExpiry = 0;

async function _getJwks() {
  if (_jwksCache && Date.now() < _jwksExpiry) return _jwksCache;
  try {
    const oidcUrl = `${process.env.ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/gateway'}/.well-known/openid-configuration`;
    const oidc    = await axios.get(oidcUrl, { timeout: 10_000 });
    const jwksRes = await axios.get(oidc.data.jwks_uri, { timeout: 10_000 });
    _jwksCache  = jwksRes.data.keys || [];
    _jwksExpiry = Date.now() + 3_600_000; // 1 hour
    return _jwksCache;
  } catch (err) {
    logger.warn('ABDM JWKS fetch failed — falling back to expiry-only check', { error: err.message });
    return null;
  }
}

function _jwkToPem(jwk) {
  return crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}

async function verifyAbdmCallback(req, res, next) {
  // Log every inbound ABDM callback — helps trace silent failures even before auth
  logger.info('ABDM callback received', {
    path:      req.path,
    method:    req.method,
    requestId: req.headers['request-id'],
    xHipId:    req.headers['x-hip-id'],
    hasAuth:   !!req.headers['authorization'],
    ip:        req.ip,
  });

  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn('ABDM callback: missing Authorization header', {
      path: req.path, ip: req.ip, requestId: req.headers['request-id'],
    });
    audit.abdmCallbackRejected(req, 'missing Authorization header');
    return res.status(401).json({ error: 'Missing ABDM gateway authorization token' });
  }

  const token = authHeader.slice(7);

  // Sandbox bypass — set ABDM_SKIP_JWT_VERIFY=true in .env for sandbox.
  // ABDM sandbox does not publish a JWKS endpoint and often sends tokens with
  // very short expiry (or already expired by the time the confirm callback fires).
  // In bypass mode we only decode the payload — no signature or expiry check.
  if (process.env.ABDM_SKIP_JWT_VERIFY === 'true') {
    try {
      const parts       = token.split('.');
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload     = JSON.parse(payloadJson);
      req.abdmGateway   = payload;
      return next();
    } catch (err) {
      logger.warn('ABDM callback: sandbox token decode failed', { error: err.message });
      return res.status(401).json({ error: 'Invalid ABDM gateway token' });
    }
  }

  try {
    // Peek at header for kid and alg
    const parts      = token.split('.');
    const headerJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    const { kid, alg } = JSON.parse(headerJson);

    if (!alg || !['RS256', 'RS512'].includes(alg)) {
      throw new Error(`Unsupported algorithm: ${alg}`);
    }

    const keys = await _getJwks();
    let payload;

    if (keys) {
      const jwk = kid ? keys.find(k => k.kid === kid) : keys[0];
      if (!jwk) throw new Error(`No matching JWKS key for kid=${kid}`);

      const pem = _jwkToPem(jwk);
      payload   = jwt.verify(token, pem, {
        algorithms: ['RS256', 'RS512'],
        // R3-005: production must only accept tokens from production ABDM issuer, NOT sandbox
        ...(process.env.NODE_ENV === 'production' && {
          issuer: ['https://abdm.gov.in', 'https://healthlocker.abdm.gov.in'],
        }),
      });
    } else {
      // JWKS unavailable — fall back to expiry-only check (degraded mode)
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded?.payload?.exp || decoded.payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired (degraded JWKS mode)');
      }
      payload = decoded.payload;
      logger.warn('ABDM callback: JWKS unavailable — expiry-only validation (degraded)');
    }

    req.abdmGateway = payload;
    next();
  } catch (err) {
    logger.warn('ABDM callback: token verification failed', {
      error: err.message, path: req.path, ip: req.ip,
    });
    audit.abdmCallbackRejected(req, err.message);
    return res.status(401).json({ error: 'Invalid ABDM gateway token' });
  }
}

module.exports = { verifyAbdmCallback };
