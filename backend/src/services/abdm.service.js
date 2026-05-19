const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

const ABDM_GATEWAY = process.env.ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/gateway';
const ABHA_BASE    = process.env.ABHA_BASE_URL     || 'https://abhasbx.abdm.gov.in/abha/api/v3';
const CLIENT_ID     = process.env.ABDM_CLIENT_ID;
const CLIENT_SECRET = process.env.ABDM_CLIENT_SECRET;

let _accessToken = null;
let _tokenExpiry  = 0;

let _abhaPubKey       = null;
let _abhaPubKeyExpiry = 0;

async function getGatewayToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;

  logger.info('ABDM gateway token request', { clientId: CLIENT_ID, hasSecret: !!CLIENT_SECRET });
  try {
    const res = await axios.post(
      `${ABDM_GATEWAY}/v0.5/sessions`,
      { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, grantType: 'client_credentials' },
      { headers: { 'Content-Type': 'application/json' } }
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
  const res = await axios.get(`${ABHA_BASE}/profile/public/certificate`, {
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
    const res = await axios(cfg);
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
    const res = await axios(cfg);
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
  const [encOtp, encMobile] = await Promise.all([
    rsaEncrypt(otp),
    mobile ? rsaEncrypt(mobile) : Promise.resolve(null),
  ]);
  return abhaReq('POST', `${ABHA_BASE}/enrollment/enrol/byAadhaar`, {
    txnId,
    scope: ['abha-enrol'],
    authData: {
      authMethods: ['otp'],
      otp: {
        timeStamp: new Date().toISOString(),
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
    scope: ['profile'],
    loginHint: 'mobile',
    loginId: encryptedId,
    otpSystem: 'abdm',
  });
}

async function verifyMobileLoginOtp(otp, txnId) {
  const encOtp = await rsaEncrypt(otp);
  return abhaReq('POST', `${ABHA_BASE}/profile/login/verify/otp`, {
    scope: ['profile'],
    authData: {
      authMethods: ['otp'],
      otp: { timeStamp: new Date().toISOString(), txnId, otpValue: encOtp },
    },
  });
}

// ─── M1: ABHA Login ───────────────────────────────────────────────────────────

async function loginRequestOtp(abhaId) {
  const encryptedId = await rsaEncrypt(abhaId);
  return abhaReq('POST', `${ABHA_BASE}/profile/login/request/otp`, {
    scope: ['abha-enrol'],
    loginHint: 'abha-number',
    loginId: encryptedId,
    otpSystem: 'abdm',
  });
}

async function loginVerifyOtp(otp, txnId) {
  const encOtp = await rsaEncrypt(otp);
  return abhaReq('POST', `${ABHA_BASE}/profile/login/verify/otp`, {
    scope: ['abha-enrol'],
    authData: {
      authMethods: ['otp'],
      otp: { timeStamp: new Date().toISOString(), txnId, otpValue: encOtp },
    },
  });
}

// ─── M1: ABHA Profile & Card ──────────────────────────────────────────────────

async function getAbhaProfile(xToken) {
  return abhaReq('GET', `${ABHA_BASE}/profile/account`, null, xToken);
}

async function getAbhaPngCard(xToken) {
  const token = await getGatewayToken();
  const res = await axios.get(`${ABHA_BASE}/profile/card`, {
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

// ─── M2: Care-context discovery ───────────────────────────────────────────────

async function discoverCareContexts(patient, hipId) {
  return gwReq('POST', `${ABDM_GATEWAY}/v0.5/care-contexts/discover`, {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    patient,
    hip: { id: hipId },
  });
}

// ─── M2: Link care contexts ───────────────────────────────────────────────────

async function linkCareContexts(accessToken, patientId, careContexts) {
  return gwReq('POST', `${ABDM_GATEWAY}/v0.5/links/link/add-contexts`, {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    link: {
      accessToken,
      patient: {
        id: patientId,
        referenceNumber: patientId,
        careContexts,
        display: patientId,
      },
    },
  });
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
  getAbhaProfile,     getAbhaPngCard,
  discoverCareContexts, linkCareContexts,
  createConsentRequest, fetchHealthInfo,
  uuid,
};
