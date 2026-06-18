const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { pool } = require('../config/database');
const { weierstrass } = require('@noble/curves/abstract/weierstrass.js');
const { mod } = require('@noble/curves/abstract/modular.js');

// Weierstrass Curve25519 — same as HIP side; ABDM requires this curve for key exchange
const _c25519n = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');
const _c25519W = weierstrass({
  a:  BigInt('0x2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA984914A144'),
  b:  BigInt('0x7B425ED097B425ED097B425ED097B425ED097B425ED097B4260B5E9C7710C864'),
  p:  BigInt('0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFED'),
  n:  _c25519n,
  Gx: BigInt('0x2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad245a'),
  Gy: BigInt('0x5f51e65e475f794b1fe122d388b72eb36dc2b28192839e4dd6163a5d81312c14'),
  h:  BigInt(8),
  randomBytes: (b) => crypto.randomBytes(b),
});
const _c25519Scalar = (b) => mod(BigInt('0x' + b.toString('hex')), _c25519n - 1n) + 1n;

// DER helpers (duplicate from hip.service.js to keep services independent)
const _derLen = (n) => { if (n < 0x80) return Buffer.from([n]); if (n < 0x100) return Buffer.from([0x81, n]); return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]); };
const _derSeq    = (c) => Buffer.concat([Buffer.from([0x30]), _derLen(c.length), c]);
const _derInt    = (b) => { if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]); return Buffer.concat([Buffer.from([0x02]), _derLen(b.length), b]); };
const _derOctet  = (b) => Buffer.concat([Buffer.from([0x04]), _derLen(b.length), b]);
const _derBitStr = (b) => Buffer.concat([Buffer.from([0x03]), _derLen(b.length + 1), Buffer.from([0x00]), b]);
const _C25519_p  = Buffer.from('7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed','hex');
const _C25519_a  = Buffer.from('2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa984914a144','hex');
const _C25519_b  = Buffer.from('7b425ed097b425ed097b425ed097b425ed097b425ed097b4260b5e9c7710c864','hex');
const _C25519_Gx = Buffer.from('2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad245a','hex');
const _C25519_Gy = Buffer.from('5f51e65e475f794b1fe122d388b72eb36dc2b28192839e4dd6163a5d81312c14','hex');
const _C25519_n  = Buffer.from('1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed','hex');
const _OID_EC_PUB    = Buffer.from('06072a8648ce3d0201','hex');
const _OID_PRIME_FLD = Buffer.from('06072a8648ce3d0101','hex');

function _buildSpki(rawPub65) {
  const G        = Buffer.concat([Buffer.from([0x04]), _C25519_Gx, _C25519_Gy]);
  const fieldID  = _derSeq(Buffer.concat([_OID_PRIME_FLD, _derInt(_C25519_p)]));
  const curve    = _derSeq(Buffer.concat([_derOctet(_C25519_a), _derOctet(_C25519_b)]));
  const ecParams = _derSeq(Buffer.concat([_derInt(Buffer.from([0x01])), fieldID, curve, _derOctet(G), _derInt(_C25519_n), _derInt(Buffer.from([0x08]))]));
  return _derSeq(Buffer.concat([_derSeq(Buffer.concat([_OID_EC_PUB, ecParams])), _derBitStr(rawPub65)]));
}

// In-memory store for HIU key pairs keyed by nonce (used to decrypt HIP response)
const _hiuKeyStore = new Map();

function generateHiuKeyMaterial(consentId) {
  const privBytes = crypto.randomBytes(32);
  const scalar    = _c25519Scalar(privBytes);
  const pubBytes  = Buffer.from(_c25519W.BASE.multiply(scalar).toBytes(false)); // 65 bytes
  const spki      = _buildSpki(pubBytes);
  const nonce     = crypto.randomBytes(32).toString('base64');
  const keyValue  = spki.toString('base64');
  // Store private key by consentId (artefact ID) for decryption when HIP pushes data
  if (consentId) _hiuKeyStore.set(consentId, { privBytes, nonce });
  // Also store by nonce as fallback
  _hiuKeyStore.set(nonce, { privBytes, nonce });
  return { keyValue, nonce };
}

function getHiuKey(id) {
  return _hiuKeyStore.get(id) ?? null;
}

// Decrypt a health record entry pushed by the HIP.
// hiuKeyEntry = { privBytes, nonce } from getHiuKey(consentId)
function decryptHipEntry(encryptedBase64, hipPubKeyBase64, hipNonceBase64, hiuKeyEntry) {
  try {
    if (!hiuKeyEntry) return null;
    const { privBytes, nonce: hiuNonceB64 } = hiuKeyEntry;
    const scalar    = _c25519Scalar(privBytes);
    // HIP public key is also SPKI-wrapped — extract raw 65-byte point
    const hipPubRaw = Buffer.from(hipPubKeyBase64, 'base64');
    let   hipPubHex = hipPubRaw.toString('hex');
    if (hipPubRaw.length > 65) {
      for (let i = 0; i < hipPubRaw.length - 67; i++) {
        if (hipPubRaw[i] === 0x03 && hipPubRaw[i+1] === 0x42 && hipPubRaw[i+2] === 0x00 && hipPubRaw[i+3] === 0x04) {
          hipPubHex = hipPubRaw.slice(i + 3, i + 68).toString('hex'); break;
        }
      }
    }
    const hipPub    = _c25519W.BASE.constructor.fromHex(hipPubHex);
    const sharedX   = Buffer.from(hipPub.multiply(scalar).toAffine().x.toString(16).padStart(64,'0'), 'hex');
    const hipNonce  = Buffer.from(hipNonceBase64, 'base64');
    const hiuNonceB = Buffer.from(hiuNonceB64,   'base64');
    const xorNonce = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) xorNonce[i] = hipNonce[i] ^ (hiuNonceB[i] ?? 0);
    const salt   = xorNonce.slice(0, 20);
    const aesKey = Buffer.from(crypto.hkdfSync('sha256', sharedX, salt, Buffer.alloc(0), 32));
    const iv     = xorNonce.slice(20, 32);
    const raw    = Buffer.from(encryptedBase64, 'base64');
    const tag    = raw.slice(-16);
    const ct     = raw.slice(0, -16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (err) {
    logger.warn('HIU decryptHipEntry failed', { error: err.message });
    return null;
  }
}

// ── ABDM axios interceptor — logs every outbound request + response ───────────
const abdmAxios = axios.create();

abdmAxios.interceptors.request.use(cfg => {
  logger.info('[ABDM REQUEST]', {
    url:     cfg.url,
    method:  (cfg.method || 'GET').toUpperCase(),
    headers: cfg.headers,
    body:    cfg.data,
  });
  return cfg;
});

abdmAxios.interceptors.response.use(
  res => {
    logger.info('[ABDM RESPONSE]', {
      url:     res.config.url,
      status:  res.status,
      headers: res.headers,
      body:    res.data,
    });
    return res;
  },
  err => {
    let reqBody = err.config?.data;
    try { if (typeof reqBody === 'string') reqBody = JSON.parse(reqBody); } catch (_) {}
    logger.error('[ABDM ERROR]', {
      url:        err.config?.url,
      status:     err.response?.status,
      reqHeaders: err.config?.headers,
      reqBody,
      resHeaders: err.response?.headers,
      resBody:    err.response?.data,
    });
    return Promise.reject(err);
  }
);

const ABDM_GATEWAY   = process.env.ABDM_GATEWAY_URL  || 'https://dev.abdm.gov.in/gateway';
const ABHA_BASE      = process.env.ABHA_BASE_URL      || 'https://abhasbx.abdm.gov.in/abha/api/v3';
const ABDM_HIECM     = process.env.ABDM_HIECM_URL     || 'https://dev.abdm.gov.in/api/hiecm';
const ABDM_SESSION_URL = `${ABDM_HIECM}/gateway/v3/sessions`;
const CLIENT_ID      = process.env.ABDM_CLIENT_ID;
const CLIENT_SECRET  = process.env.ABDM_CLIENT_SECRET;

let _accessToken = null;
let _tokenExpiry  = 0;

// Cache link tokens by `${abhaNumber}:${hipId}` — ABDM returns ABDM-1092 if you generate twice
const _linkTokenCache = new Map(); // key → { token, expiry }

let _abhaPubKey       = null;
let _abhaPubKeyExpiry = 0;

async function getGatewayToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;

  logger.info('ABDM gateway token request', { clientId: CLIENT_ID, hasSecret: !!CLIENT_SECRET });
  try {
    const res = await abdmAxios.post(
      ABDM_SESSION_URL,
      { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, grantType: 'client_credentials' },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-CM-ID': 'sbx',
          'REQUEST-ID': uuid(),
          TIMESTAMP: new Date().toISOString(),
        },
      }
    );
    _accessToken = res.data.accessToken;
    _tokenExpiry = Date.now() + ((res.data.expiresIn ?? 300) - 30) * 1000;
    logger.info('ABDM gateway token obtained', { expiresIn: res.data.expiresIn });
    return _accessToken;
  } catch (err) {
    const body = err.response?.data;
    logger.error('ABDM gateway token FAILED', { status: err.response?.status, body });
    const fwd = new Error(`ABDM gateway auth failed: ${body ? JSON.stringify(body) : err.message}`);
    fwd.status = err.response?.status ?? 502;
    throw fwd;
  }
}

// Fetch ABHA v3 public certificate and cache for 24 h
async function getAbhaCert() {
  if (_abhaPubKey && Date.now() < _abhaPubKeyExpiry) return _abhaPubKey;

  const token = await getGatewayToken();
  const res = await abdmAxios.get(`${ABHA_BASE}/profile/public/certificate`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-CM-ID': 'sbx',
      'REQUEST-ID': uuid(),
      TIMESTAMP: new Date().toISOString(),
    },
  });

  _abhaPubKey       = res.data.publicKey;
  _abhaPubKeyExpiry = Date.now() + 24 * 3600_000;
  logger.info('ABHA public certificate refreshed');
  return _abhaPubKey;
}

// RSA/ECB/OAEPWithSHA-1AndMGF1Padding — required by ABHA v3 for all loginId fields
async function rsaEncrypt(plaintext) {
  const pubKeyBase64 = await getAbhaCert();
  const pubKey = crypto.createPublicKey({
    key: Buffer.from(pubKeyBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  return crypto.publicEncrypt(
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
    Buffer.from(plaintext, 'utf8')
  ).toString('base64');
}

// ─── Bridge / callback-URL management ────────────────────────────────────────

async function getBridgeInfo() {
  const token = await getGatewayToken();
  const ABDM_DEVSERVICE = process.env.ABDM_DEVSERVICE_URL || 'https://dev.abdm.gov.in/devservice';
  const res = await abdmAxios.get(
    `${ABDM_DEVSERVICE}/v1/bridges/getServices?id=${encodeURIComponent(CLIENT_ID)}`,
    { headers: { Authorization: `Bearer ${token}`, 'X-CM-ID': 'sbx', 'REQUEST-ID': uuid(), TIMESTAMP: new Date().toISOString() } }
  );
  return res.data;
}

async function updateBridgeUrl(callbackUrl) {
  const token = await getGatewayToken();
  const res = await abdmAxios.put(
    `${ABDM_GATEWAY}/v0.5/bridges`,
    { url: callbackUrl },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CM-ID': 'sbx', 'REQUEST-ID': uuid(), TIMESTAMP: new Date().toISOString() } }
  );
  return res.data ?? { ok: true };
}

async function updateHipServices() {
  const ABDM_DEVSERVICE = process.env.ABDM_DEVSERVICE_URL || 'https://dev.abdm.gov.in/devservice';
  const token = await getGatewayToken();
  const body = {
    id: CLIENT_ID,
    name: process.env.ABDM_HIP_NAME || 'Infer EMR',
    type: 'HIP',
    active: true,
    alias: [CLIENT_ID],
    endpoints: [
      { use: 'hip-url', connectionType: 'direct', address: process.env.BACKEND_URL || 'https://api.inferapp.online' }
    ],
    servicesOffered: [
      {
        type: 'HIP',
        hiTypes: [
          'OPConsultation',
          'Prescription',
          'DiagnosticReport',
          'ImmunizationRecord',
          'HealthDocumentRecord',
          'DischargeSummary',
          'WellnessRecord',
        ],
      },
    ],
  };
  const res = await abdmAxios.patch(
    `${ABDM_DEVSERVICE}/v1/bridges/addUpdateServices`,
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CM-ID': 'sbx', 'REQUEST-ID': uuid(), TIMESTAMP: new Date().toISOString() } }
  );
  return res.data ?? { ok: true };
}

// Gateway requests (HIE-CM / M2-M3 operations)
async function gwReq(method, url, data = null, extra = {}) {
  const token = await getGatewayToken();
  const cfg = {
    method, url,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-CM-ID': 'sbx',
      'REQUEST-ID': uuid(),
      TIMESTAMP: new Date().toISOString(),
      ...extra,
    },
  };
  if (data) cfg.data = data;
  try {
    const res = await abdmAxios(cfg);
    return res.data;
  } catch (err) {
    logger.error('ABDM API error', { url, status: err.response?.status, body: err.response?.data });
    throw err;
  }
}

// Silent gateway request — logs warning but does not throw (for non-critical callbacks)
async function gwReqSilent(method, url, data = null) {
  try { await gwReq(method, url, data); } catch (err) { logger.warn('gwReqSilent failed', { url, error: err.message }); }
}

// ABHA v3 requests — requires REQUEST-ID + TIMESTAMP on every call
async function abhaReq(method, url, data = null, xToken = null) {
  const token = await getGatewayToken();
  const isGet = method.toUpperCase() === 'GET';
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(!isGet && { 'Content-Type': 'application/json' }),
    'X-CM-ID': 'sbx',
    'REQUEST-ID': uuid(),
    TIMESTAMP: new Date().toISOString(),
  };
  // ABDM v3 profile endpoints require "Bearer" prefix on X-Token
  if (xToken) headers['X-Token'] = xToken.startsWith('Bearer ') ? xToken : `Bearer ${xToken}`;

  const cfg = { method, url, headers };
  if (data) cfg.data = data;
  try {
    const res = await abdmAxios(cfg);
    return res.data;
  } catch (err) {
    const abdmBody = err.response?.data;
    const abdmStatus = err.response?.status ?? 500;
    logger.error('ABHA API error', { url, status: abdmStatus, body: abdmBody });
    // Forward the actual ABHA error body so clients see the real reason
    const fwd = new Error(abdmBody ? JSON.stringify(abdmBody) : err.message);
    fwd.status = abdmStatus;
    throw fwd;
  }
}

// ─── M1: Enrollment via Aadhaar ──────────────────────────────────────────────

async function generateAadhaarOtp(aadhaar) {
  const encryptedId = await rsaEncrypt(aadhaar);
  return abhaReq('POST', `${ABHA_BASE}/enrollment/request/otp`, {
    scope: ['abha-enrol'],
    loginHint: 'aadhaar',
    loginId: encryptedId,
    otpSystem: 'aadhaar',
  });
}

async function verifyAadhaarOtp(otp, txnId, mobile) {
  const encOtp = await rsaEncrypt(otp);
  return abhaReq('POST', `${ABHA_BASE}/enrollment/enrol/byAadhaar`, {
    authData: {
      authMethods: ['otp'],
      otp: {
        txnId,
        otpValue: encOtp,
        ...(mobile && { mobile }),  // plaintext — only otpValue is encrypted
      },
    },
    consent: { code: 'abha-enrollment', version: '1.4' },
  });
}

// ─── M1: Enrollment via Mobile ───────────────────────────────────────────────

async function generateMobileLoginOtp(mobile) {
  const encryptedId = await rsaEncrypt(mobile);
  return abhaReq('POST', `${ABHA_BASE}/profile/login/request/otp`, {
    scope: ['abha-login', 'mobile-verify'],
    loginHint: 'mobile',
    loginId: encryptedId,
    otpSystem: 'abdm',
  });
}

async function verifyMobileLoginOtp(otp, txnId) {
  const encOtp = await rsaEncrypt(otp);
  // ABDM v3: endpoint is /profile/login/verify (NOT /profile/login/verify/otp)
  return abhaReq('POST', `${ABHA_BASE}/profile/login/verify`, {
    scope: ['abha-login', 'mobile-verify'],
    authData: {
      authMethods: ['otp'],
      otp: { txnId, otpValue: encOtp },
    },
  });
}

// ─── Login with ABHA (Aadhaar OTP or Mobile OTP, via ABHA Number or Address) ──

async function loginRequestAbhaOtp(loginId) {
  if (!loginId || !loginId.trim()) {
    const err = new Error('loginId is required');
    err.status = 400;
    throw err;
  }
  if (loginId.includes('@')) {
    const err = new Error('ABHA address login not supported. Please use your 14-digit ABHA number.');
    err.status = 400;
    throw err;
  }

  // Validate ABHA number format: 14 digits, with or without dashes (XX-XXXX-XXXX-XXXX)
  const clean = loginId.trim();
  const digitsOnly = clean.replace(/-/g, '');
  if (!/^\d{14}$/.test(digitsOnly)) {
    const err = new Error('Invalid ABHA number format. Use 14 digits, e.g. 91-1000-4008-7627');
    err.status = 400;
    throw err;
  }

  // /profile/login/request/otp: plain ABHA number, NOT RSA-encrypted
  // CRITICAL: scope must be 'mobile-verify' + otpSystem 'abdm' for ABHA number login.
  // 'aadhaar-verify' + 'aadhaar' is only for Aadhaar enrollment, NOT for ABHA login.
  logger.info('ABHA login OTP request', {
    loginHint: 'abha-number',
    scope: 'abha-login,mobile-verify',
    otpSystem: 'abdm',
    last4: digitsOnly.slice(-4),
  });

  return abhaReq('POST', `${ABHA_BASE}/profile/login/request/otp`, {
    scope: ['abha-login', 'mobile-verify'],
    loginHint: 'abha-number',
    loginId: clean,   // plain, with or without dashes — ABDM accepts both formats
    otpSystem: 'abdm',
  });
}

async function updateAbhaProfileMobile(xToken, mobile) {
  return abhaReq('POST', `${ABHA_BASE}/profile/account/update`, { mobile }, xToken);
}

// ─── M1: ABHA Login ───────────────────────────────────────────────────────────

async function loginRequestOtp(abhaNumber) {
  return loginRequestAbhaOtp(abhaNumber);
}

async function loginVerifyOtp(otp, txnId) {
  const encOtp = await rsaEncrypt(otp);
  // ABDM v3: endpoint is /profile/login/verify (NOT /profile/login/verify/otp)
  const result = await abhaReq('POST', `${ABHA_BASE}/profile/login/verify`, {
    scope: ['abha-login', 'mobile-verify'],
    authData: {
      authMethods: ['otp'],
      otp: { txnId, otpValue: encOtp },
    },
  });
  // Debug: log response structure so we can verify token field names
  logger.info('ABHA login verify response keys', {
    keys: Object.keys(result || {}),
    hasToken: !!result?.token,
    hasTokens: !!result?.tokens,
    tokenType: typeof result?.token,
    tokensTokenType: typeof result?.tokens?.token,
    tokenPrefix: result?.token?.slice(0, 20),
  });
  return result;
}

// ─── M1: ABHA Profile & Card ──────────────────────────────────────────────────

async function getAbhaProfile(xToken) {
  return abhaReq('GET', `${ABHA_BASE}/profile/account`, null, xToken);
}

async function getAbhaPngCard(xToken) {
  const token = await getGatewayToken();
  const res = await abdmAxios.get(`${ABHA_BASE}/profile/account/abha-card`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Token': xToken.startsWith('Bearer ') ? xToken : `Bearer ${xToken}`,
      'X-CM-ID': 'sbx',
      'REQUEST-ID': uuid(),
      TIMESTAMP: new Date().toISOString(),
    },
    responseType: 'arraybuffer',
  });
  return res.data;
}

// ─── M1: ABHA address suggestions (during enrollment) ────────────────────────

async function getAbhaSuggestions(xToken, txnId) {
  logger.info('getAbhaSuggestions request', { xToken: xToken?.slice(0, 20) + '...', txnId });
  const token = await getGatewayToken();
  try {
    const res = await abdmAxios.get(`${ABHA_BASE}/enrollment/enrol/suggestion`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Token': xToken.startsWith('Bearer ') ? xToken : `Bearer ${xToken}`,
        'TRANSACTION_ID': txnId,
        'X-CM-ID': 'sbx',
        'REQUEST-ID': uuid(),
        TIMESTAMP: new Date().toISOString(),
      },
    });
    logger.info('getAbhaSuggestions response', res.data);
    return res.data;
  } catch (err) {
    const abdmBody = err.response?.data;
    logger.error('getAbhaSuggestions failed', { status: err.response?.status, body: abdmBody });
    const fwd = new Error(abdmBody ? JSON.stringify(abdmBody) : err.message);
    fwd.status = err.response?.status ?? 502;
    throw fwd;
  }
}

async function setAbhaAddress(xToken, abhaAddress, txnId) {
  const cleanAddress = abhaAddress.replace(/@sbx$/, '').toLowerCase();
  logger.info('setAbhaAddress', { original: abhaAddress, cleaned: cleanAddress });
  return abhaReq('POST', `${ABHA_BASE}/enrollment/enrol/abha-address`, { abhaAddress: cleanAddress, txnId, preferred: 1 }, xToken);
}

// ─── M2: Care-context discovery ───────────────────────────────────────────────
// NOTE: gateway/v0.5/care-contexts/discover is removed from ABDM sandbox.
// In ABDM v3, discovery is HIP-initiated: use generateLinkToken + linkCareContexts instead.
// ABDM still calls our HIP at /v3/hip/patient/care-context/discover when the patient
// initiates from the ABHA app — that callback is handled by hip.controller.js.

async function discoverCareContexts(_patient, _hipId) {
  const err = new Error('ABDM gateway v0.5 care-context discovery is no longer available. Use HIP-initiated linking (generateLinkToken + linkCareContexts) instead.');
  err.status = 410;
  throw err;
}

// ─── M2: Patient-initiated link (gateway v0.5) ────────────────────────────────

async function linkInit(transactionId, patientId, hipId, careContexts) {
  const requestId = uuid();
  await gwReq('POST', `${ABDM_GATEWAY}/v0.5/links/link/init`, {
    requestId,
    timestamp: new Date().toISOString(),
    transactionId,
    patient: {
      id: patientId,
      referenceNumber: hipId,
      display: patientId,
      careContexts: careContexts.map(c => ({
        referenceNumber: c.referenceNumber,
        display: c.display,
      })),
    },
  });
  return requestId;
}

async function linkConfirm(linkRefNumber, token) {
  const requestId = uuid();
  await gwReq('POST', `${ABDM_GATEWAY}/v0.5/links/link/confirm`, {
    requestId,
    timestamp: new Date().toISOString(),
    confirmation: { linkRefNumber, token },
  });
  return requestId;
}

// ─── M2: HIP-initiated link (HIECM v3) ───────────────────────────────────────

// In-process lock: prevents two concurrent generateLinkToken calls for the same patient.
// Without this, two simultaneous requests both pass the cache check, both hit ABDM,
// and the second gets ABDM-1092; the second then waits 15s and times out.
const _inFlight = new Map(); // cacheKey → Promise<{linkToken}>

// Called by hip.controller's handleOnGenerateToken to store async token in both cache + DB
async function _storeLinkToken(cacheKey, linkToken) {
  const expiresAt = new Date(Date.now() + 9 * 60 * 1000);
  _linkTokenCache.set(cacheKey, { token: linkToken, expiry: expiresAt.getTime() });
  // Persist to DB — token survives server restarts
  const [patientRef, hipId] = cacheKey.split(':');
  await pool.query(
    `INSERT INTO link_tokens (patient_ref, hip_id, token, status, expires_at)
     VALUES ($1, $2, $3, 'active', $4)
     ON CONFLICT (patient_ref, hip_id) DO UPDATE
       SET token=$3, status='active', expires_at=$4, updated_at=NOW()`,
    [patientRef, hipId, linkToken, expiresAt]
  ).catch(err => logger.warn('_storeLinkToken DB persist failed', { error: err.message }));
  logger.info('generateLinkToken: token stored (cache+DB)', { cacheKey: cacheKey.slice(-12) });
}

async function _getStoredLinkToken(patientRef, hipId) {
  // 1. Check in-memory cache first (fastest)
  const cacheKey = `${patientRef}:${hipId}`;
  const cached = _linkTokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    logger.info('generateLinkToken: reusing in-memory token', { cacheKey: cacheKey.slice(-12) });
    return cached.token;
  }
  // 2. Check DB (handles restarts)
  const { rows } = await pool.query(
    `SELECT token, expires_at, status FROM link_tokens
     WHERE patient_ref=$1 AND hip_id=$2
       AND status IN ('pending','active')
       AND expires_at > NOW()
     LIMIT 1`,
    [patientRef, hipId]
  ).catch(() => ({ rows: [] }));
  if (rows[0]?.token) {
    // Warm the in-memory cache from DB
    _linkTokenCache.set(cacheKey, { token: rows[0].token, expiry: new Date(rows[0].expires_at).getTime() });
    logger.info('generateLinkToken: reusing DB-persisted token', { cacheKey: cacheKey.slice(-12), status: rows[0].status });
    return rows[0].token;
  }
  return null;
}

async function generateLinkToken(hipId, abhaNumber, abhaAddress, name, gender, yearOfBirth) {
  if (!abhaNumber || abhaNumber === 'undefined' || abhaNumber === 'null') {
    throw Object.assign(new Error('generateLinkToken: abhaNumber is required'), { status: 400 });
  }
  if (!abhaAddress || !abhaAddress.includes('@')) {
    throw Object.assign(new Error('generateLinkToken: abhaAddress must be a valid ABHA address (e.g. name@sbx)'), { status: 400 });
  }
  const cleanAbha = String(abhaNumber).replace(/-/g, '');
  const cacheKey  = `${cleanAbha}:${hipId}`;

  // 1. Reuse active token — prevents ABDM-1092
  const existing = await _getStoredLinkToken(cleanAbha, hipId);
  if (existing) return { linkToken: existing };

  // 2. Coalesce concurrent requests for the same patient.
  //    Deferred promise is registered SYNCHRONOUSLY (no await before _inFlight.set)
  //    so a second caller that arrives between any of the awaits below still coalesces.
  if (_inFlight.has(cacheKey)) {
    logger.info('generateLinkToken: coalescing duplicate in-flight request', { cacheKey: cacheKey.slice(-12) });
    return _inFlight.get(cacheKey);
  }
  let _deferResolve, _deferReject;
  const inFlightPromise = new Promise((res, rej) => { _deferResolve = res; _deferReject = rej; });
  _inFlight.set(cacheKey, inFlightPromise); // synchronous — before any await

  // Run the actual ABDM call, resolve/reject the deferred, always clean up _inFlight
  _runGenerateLinkToken(hipId, cleanAbha, cacheKey, abhaAddress, name, gender, yearOfBirth)
    .then(_deferResolve, _deferReject)
    .finally(() => _inFlight.delete(cacheKey));

  return inFlightPromise;
}

async function _runGenerateLinkToken(hipId, cleanAbha, cacheKey, abhaAddress, name, gender, yearOfBirth) {
  if (!yearOfBirth || yearOfBirth < 1900 || yearOfBirth > 2200) {
    throw Object.assign(new Error('generateLinkToken: valid yearOfBirth required (from ABHA enrollment)'), { status: 400 });
  }
  const VALID_GENDERS = ['M', 'F', 'O', 'D', 'T', 'U'];
  const normGender = gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : gender === 'Other' ? 'O' : gender;
  if (!normGender || !VALID_GENDERS.includes(normGender)) {
    throw Object.assign(new Error(`generateLinkToken: gender must be one of ${VALID_GENDERS.join('/')}`), { status: 400 });
  }

  const token     = await getGatewayToken();
  const requestId = uuid();
  const body = { abhaNumber: cleanAbha, abhaAddress, name: name ?? '', yearOfBirth: Number(yearOfBirth), gender: normGender };

  logger.info('ABDM demographic verification', {
    abhaNumber: cleanAbha.slice(-4) + ' (last 4)', abhaAddress,
    name: name ?? '(empty)', gender: normGender, yearOfBirth: Number(yearOfBirth),
    requestId, note: 'values must match Aadhaar exactly — mismatch causes ABDM-1207',
  });
  logger.info('generateLinkToken request', { hipId, cleanAbha: cleanAbha.slice(-4), abhaAddress, name, gender: normGender, yearOfBirth, requestId });

  await pool.query(
    `INSERT INTO link_tokens (patient_ref, hip_id, abdm_request_id, status, expires_at)
     VALUES ($1, $2, $3, 'pending', $4)
     ON CONFLICT (patient_ref, hip_id) DO UPDATE
       SET status='pending', abdm_request_id=$3, expires_at=$4, token=NULL, updated_at=NOW()`,
    [cleanAbha, hipId, requestId, new Date(Date.now() + 20_000)]
  ).catch(() => {});

  try {
    const res = await abdmAxios.post(
      `${ABDM_HIECM}/v3/token/generate-token`,
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-CM-ID': 'sbx',
          'X-HIP-ID': hipId,
          'REQUEST-ID': uuid(),
          TIMESTAMP: new Date().toISOString(),
        },
      }
    );

    if (res.data?.linkToken) {
      await _storeLinkToken(cacheKey, res.data.linkToken);
      return { linkToken: res.data.linkToken };
    }

    // Async flow — ABDM returns 202, sends token via on-generate-token callback
    logger.info('generateLinkToken: async flow — waiting up to 15s for callback', { cleanAbha: cleanAbha.slice(-4), requestId });
    return await new Promise((resolve, reject) => {
      const { _linkTokenEmitter } = require('../emr/hip.controller');
      const byReqId = `req:${requestId}`;
      const byAbha  = `token:${cleanAbha}`;
      let settled   = false;

      const onToken = async (linkToken, err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        _linkTokenEmitter.removeListener(byReqId, onToken);
        _linkTokenEmitter.removeListener(byAbha,  onToken);
        if (err || !linkToken) {
          pool.query(`UPDATE link_tokens SET status='failed', updated_at=NOW() WHERE patient_ref=$1 AND hip_id=$2`, [cleanAbha, hipId]).catch(() => {});
          return reject(Object.assign(err || new Error('ABDM token generation failed'), { status: 400 }));
        }
        await _storeLinkToken(cacheKey, linkToken);
        resolve({ linkToken });
      };

      const timer = setTimeout(async () => {
        if (settled) return;
        settled = true;
        _linkTokenEmitter.removeListener(byReqId, onToken);
        _linkTokenEmitter.removeListener(byAbha,  onToken);
        const late = await _getStoredLinkToken(cleanAbha, hipId);
        if (late) return resolve({ linkToken: late });
        pool.query(`UPDATE link_tokens SET status='failed', updated_at=NOW() WHERE patient_ref=$1 AND hip_id=$2`, [cleanAbha, hipId]).catch(() => {});
        reject(Object.assign(new Error('Timeout waiting for ABDM link token callback (on-generate-token)'), { status: 504 }));
      }, 15_000);

      _linkTokenEmitter.once(byReqId, onToken);
      _linkTokenEmitter.once(byAbha,  onToken);
    });

  } catch (err) {
    const errBody = err.response?.data;
    const code    = errBody?.error?.code;
    logger.error('generateLinkToken FAILED', { status: err.response?.status, body: errBody });
    await pool.query(`UPDATE link_tokens SET status='failed', updated_at=NOW() WHERE patient_ref=$1 AND hip_id=$2`, [cleanAbha, hipId]).catch(() => {});
    if (code === 'ABDM-1092') {
      _linkTokenCache.delete(cacheKey);
      throw Object.assign(new Error('A link token is already active for this patient. Wait ~10 minutes and retry.'), { status: 409 });
    }
    throw err.status ? err : Object.assign(new Error(`ABDM link token failed: ${errBody ? JSON.stringify(errBody) : err.message}`), { status: err.response?.status ?? 502 });
  }
}

async function linkCareContexts(hipId, linkToken, abhaNumber, abhaAddress, name, careContexts) {
  const token = await getGatewayToken();
  const cleanAbha = String(abhaNumber).replace(/-/g, '');
  const body = {
    abhaNumber: cleanAbha,
    abhaAddress,
    patient: {
      referenceNumber: cleanAbha,
      display: name ?? abhaAddress ?? cleanAbha,
      careContexts: careContexts.map(ctx => ({
        referenceNumber: ctx.referenceNumber,
        display: ctx.display,
      })),
    },
  };
  logger.info('linkCareContexts request', { hipId, cleanAbha, contextCount: careContexts.length });
  try {
    const res = await abdmAxios.post(
      `${ABDM_HIECM}/hip/v3/link/carecontext`,
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-CM-ID': 'sbx',
          'X-HIP-ID': hipId,
          'X-LINK-TOKEN': linkToken,
          'REQUEST-ID': uuid(),
          TIMESTAMP: new Date().toISOString(),
        },
      }
    );
    return res.data;
  } catch (err) {
    const errBody = err.response?.data;
    logger.error('linkCareContexts FAILED', { status: err.response?.status, body: errBody });
    const fwd = new Error(`ABDM link carecontext failed: ${errBody ? JSON.stringify(errBody) : err.message}`);
    fwd.status = err.response?.status ?? 502;
    throw fwd;
  }
}

// ─── M2: Consent request ──────────────────────────────────────────────────────

const PURPOSE_TEXT = {
  CAREMGT: 'Care Management',
  BTG:     'Break the Glass',
  PUBHLTH: 'Public Health',
  HPAYMT:  'Healthcare Payment',
  DSRCH:   'Disease Specific Healthcare Research',
  PATRQT:  'Patient Requested',
  COVAUTH: 'Coverage Authorization',
};
const PURPOSE_REF_URI = 'http://terminology.hl7.org/CodeSystem/v3-ActReason';

async function createConsentRequest(patientId, hiuId, purpose, hiTypes, dateRange, requester = {}) {
  const reqId = uuid();
  logger.info('consent-requests/init outbound', { reqId, hiuId, patientId, purpose, hiTypes });
  const response = await gwReq('POST', `${ABDM_GATEWAY}/v0.5/consent-requests/init`, {
    requestId: reqId,
    timestamp: new Date().toISOString(),
    consent: {
      purpose: {
        text:   PURPOSE_TEXT[purpose] ?? purpose,
        code:   purpose,
        refUri: PURPOSE_REF_URI,
      },
      patient: { id: patientId },
      hiu: { id: hiuId },
      requester: {
        name: requester.name || process.env.ABDM_REQUESTER_NAME || 'Clinic HIU',
        identifier: {
          type:   requester.identifierType   || 'REGNO',
          value:  requester.identifierValue  || (process.env.ABDM_REQUESTER_REG || hiuId),
          system: requester.identifierSystem || 'https://www.mciindia.org',
        },
      },
      hiTypes,
      permission: {
        accessMode: 'VIEW',
        dateRange,
        dataEraseAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
        frequency: { unit: 'HOUR', value: 1, repeats: 0 },
      },
    },
  });
  // Return reqId alongside response so caller can store it as the consent request_id.
  // ABDM's 202 response body is empty — the reqId we sent IS the consent request ID
  // until on-init arrives and updates it to ABDM's assigned ID.
  return { reqId, ...response };
}

// ─── M3: Fetch health information ─────────────────────────────────────────────

async function fetchHealthInfo(consentId, dataPushUrl) {
  const { keyValue, nonce } = generateHiuKeyMaterial(consentId);
  const km = {
    cryptoAlg: 'ECDH',
    curve: 'Curve25519',
    dhPublicKey: {
      expiry: new Date(Date.now() + 3600_000).toISOString(),
      parameters: 'Curve25519/X25519',
      keyValue,
    },
    nonce,
  };
  logger.info('HIU health-info request key generated', { noncePrefix: nonce.slice(0, 8), keyValueLen: Buffer.from(keyValue, 'base64').length });
  return gwReq('POST', `${ABDM_GATEWAY}/v0.5/health-information/cm/request`, {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    hiRequest: {
      consent: { id: consentId },
      dateRange: {
        from: new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
        to: new Date().toISOString(),
      },
      dataPushUrl,
      keyMaterial: km,
    },
  });
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

module.exports = {
  getGatewayToken,
  generateAadhaarOtp,     verifyAadhaarOtp,
  generateMobileLoginOtp, verifyMobileLoginOtp,
  loginRequestOtp,        loginVerifyOtp,
  loginRequestAbhaOtp,    updateAbhaProfileMobile,
  getAbhaProfile,         getAbhaPngCard,
  getAbhaSuggestions,     setAbhaAddress,
  discoverCareContexts,   linkInit,             linkConfirm,
  generateLinkToken,      linkCareContexts,     _storeLinkToken,    _getStoredLinkToken,   _storeLinkTokenByRequestId: (reqId, token) => _linkTokenCache.set(`req:${reqId}`, { token, expiry: Date.now() + 9*60*1000 }),
  createConsentRequest,   fetchHealthInfo,      gwReqSilent,
  generateHiuKeyMaterial, decryptHipEntry, getHiuKey,
  getBridgeInfo,          updateBridgeUrl,      updateHipServices,
  uuid,
};
