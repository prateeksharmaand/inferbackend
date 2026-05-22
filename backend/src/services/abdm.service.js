const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

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
    logger.error('[ABDM ERROR]', {
      url:     err.config?.url,
      status:  err.response?.status,
      reqHeaders:  err.config?.headers,
      reqBody:     err.config?.data,
      resHeaders:  err.response?.headers,
      resBody:     err.response?.data,
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

// Gateway requests (HIE-CM / M2-M3 operations)
async function gwReq(method, url, data = null, extra = {}) {
  const token = await getGatewayToken();
  const cfg = {
    method, url,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-CM-ID': 'sbx',
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

// ABHA v3 requests — requires REQUEST-ID + TIMESTAMP on every call
async function abhaReq(method, url, data = null, xToken = null) {
  const token = await getGatewayToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-CM-ID': 'sbx',
    'REQUEST-ID': uuid(),
    TIMESTAMP: new Date().toISOString(),
  };
  if (xToken) headers['X-Token'] = `Bearer ${xToken}`;

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
  const encOtp    = await rsaEncrypt(otp);
  const encMobile = mobile ? await rsaEncrypt(mobile) : null;
  return abhaReq('POST', `${ABHA_BASE}/enrollment/enrol/byAadhaar`, {
    authData: {
      authMethods: ['otp'],
      otp: {
        txnId,
        otpValue: encOtp,
        ...(encMobile && { mobile: encMobile }),
      },
    },
    consent: { code: 'abha-enrollment', version: '1.4' },
  });
}

// ─── M1: Enrollment via Mobile ───────────────────────────────────────────────

async function generateMobileLoginOtp(mobile) {
  const encryptedId = await rsaEncrypt(mobile);
  return abhaReq('POST', `${ABHA_BASE}/profile/login/request/otp`, {
    scope: 'mobile',
    loginHint: 'mobile',
    loginId: encryptedId,
    otpSystem: 'abdm',
  });
}

async function verifyMobileLoginOtp(otp, txnId) {
  const encOtp = await rsaEncrypt(otp);
  return abhaReq('POST', `${ABHA_BASE}/profile/login/verify/otp`, {
    scope: 'mobile',
    authData: {
      authMethods: ['otp'],
      otp: { timeStamp: new Date().toISOString(), txnId, otpValue: encOtp },
    },
  });
}

// ─── M1: ABHA Login ───────────────────────────────────────────────────────────

async function loginRequestOtp(abhaNumber) {
  const normalised = abhaNumber.replace(/-/g, '');
  const encryptedId = await rsaEncrypt(normalised);
  return abhaReq('POST', `${ABHA_BASE}/profile/login/request/otp`, {
    scope: ['abha-login', 'mobile-verify'],
    loginHint: 'abha-number',
    loginId: encryptedId,
    otpSystem: 'abdm',
  });
}

async function loginVerifyOtp(otp, txnId) {
  const encOtp = await rsaEncrypt(otp);
  return abhaReq('POST', `${ABHA_BASE}/profile/login/verify/otp`, {
    scope: ['abha-login', 'mobile-verify'],
    authData: {
      authMethods: ['otp'],
      otp: { txnId, otpValue: encOtp },
    },
  });
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
      'X-Token': `Bearer ${xToken}`,
      'X-CM-ID': 'sbx',
      'REQUEST-ID': uuid(),
      TIMESTAMP: new Date().toISOString(),
    },
    responseType: 'arraybuffer',
  });
  return res.data;
}

// ─── M1: ABHA address suggestions (during enrollment) ────────────────────────

async function getAbhaSuggestions(xToken) {
  return abhaReq('GET', `${ABHA_BASE}/enrollment/enrol/suggestion`, null, xToken);
}

async function setAbhaAddress(xToken, abhaAddress, txnId) {
  return abhaReq('POST', `${ABHA_BASE}/enrollment/enrol/abha-address`, { abhaAddress, txnId }, xToken);
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

async function generateLinkToken(hipId, abhaNumber, abhaAddress, name, gender, yearOfBirth) {
  const cleanAbha = String(abhaNumber).replace(/-/g, '');
  const cacheKey  = `${cleanAbha}:${hipId}`;

  // Reuse a cached token if still valid (ABDM-1092 if we request twice)
  const cached = _linkTokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    logger.info('generateLinkToken: using cached token', { cacheKey });
    return { linkToken: cached.token };
  }

  const token = await getGatewayToken();
  const body = { abhaNumber: cleanAbha, abhaAddress, name: name ?? '', gender: gender ?? 'M', yearOfBirth: Number(yearOfBirth) || 1990 };
  logger.info('generateLinkToken request', { hipId, cleanAbha, abhaAddress, gender, yearOfBirth });
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
    // Cache for 9 minutes (ABDM tokens live ~10 min)
    if (res.data.linkToken) {
      _linkTokenCache.set(cacheKey, { token: res.data.linkToken, expiry: Date.now() + 9 * 60 * 1000 });
    }
    return res.data;
  } catch (err) {
    const errBody = err.response?.data;
    const code    = errBody?.error?.code;
    logger.error('generateLinkToken FAILED', { status: err.response?.status, body: errBody });
    // ABDM-1092 means there's already an active token we don't have cached (e.g. after restart).
    // Clear cache entry so next retry forces a fresh generate once the old token expires.
    if (code === 'ABDM-1092') {
      _linkTokenCache.delete(cacheKey);
      const fwd = new Error('A link token is already active for this patient at this facility. Please wait ~10 minutes and retry.');
      fwd.status = 409;
      throw fwd;
    }
    const fwd = new Error(`ABDM link token failed: ${errBody ? JSON.stringify(errBody) : err.message}`);
    fwd.status = err.response?.status ?? 502;
    throw fwd;
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

async function createConsentRequest(patientId, hiuId, purpose, hiTypes, dateRange) {
  return gwReq('POST', `${ABDM_GATEWAY}/v0.5/consent-requests/init`, {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    consent: {
      purpose: { code: purpose },
      patient: { id: patientId },
      hiu: { id: hiuId },
      requester: {
        name: 'PHR App',
        identifier: { type: 'REGNO', value: 'PHR001', system: 'https://www.mciindia.org' },
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
}

// ─── M3: Fetch health information ─────────────────────────────────────────────

async function fetchHealthInfo(consentId, dataPushUrl, keyMaterial) {
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
      keyMaterial,
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
  getAbhaProfile,         getAbhaPngCard,
  getAbhaSuggestions,     setAbhaAddress,
  discoverCareContexts,   linkInit,             linkConfirm,
  generateLinkToken,      linkCareContexts,
  createConsentRequest,   fetchHealthInfo,
  uuid,
};
