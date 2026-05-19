const axios = require('axios');
const logger = require('../utils/logger');

const ABDM_GATEWAY = process.env.ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/gateway';
const ABHA_BASE    = process.env.ABHA_BASE_URL     || 'https://abhasbx.abdm.gov.in/abha/api/v3';
const CLIENT_ID     = process.env.ABDM_CLIENT_ID;
const CLIENT_SECRET = process.env.ABDM_CLIENT_SECRET;

let _accessToken = null;
let _tokenExpiry  = 0;

async function getGatewayToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;

  const res = await axios.post(
    `${ABDM_GATEWAY}/v0.5/sessions`,
    { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, grantType: 'client_credentials' },
    { headers: { 'Content-Type': 'application/json' } }
  );

  _accessToken = res.data.accessToken;
  // expiresIn is in seconds; refresh 30 s early
  _tokenExpiry = Date.now() + ((res.data.expiresIn ?? 300) - 30) * 1000;
  return _accessToken;
}

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

// ─── M1: Enrollment via Aadhaar ──────────────────────────────────────────────

async function generateAadhaarOtp(aadhaar) {
  return gwReq('POST', `${ABHA_BASE}/enrollment/request/otp`, {
    scope: ['abha-enrol'],
    loginHint: 'aadhaar',
    loginId: aadhaar,
    otpSystem: 'aadhaar',
  });
}

async function verifyAadhaarOtp(otp, txnId) {
  return gwReq('POST', `${ABHA_BASE}/enrollment/enrol/byAadhaar`, {
    authData: {
      authMethods: ['OTP'],
      otp: { timeStamp: new Date().toISOString(), txnId, otpValue: otp },
    },
    consent: { code: 'abha-enrollment', version: '1.4' },
  });
}

// ─── M1: Enrollment via Mobile ───────────────────────────────────────────────

async function generateMobileOtp(mobile) {
  return gwReq('POST', `${ABHA_BASE}/enrollment/request/otp`, {
    scope: ['abha-enrol', 'mobile-verify'],
    loginHint: 'mobile',
    loginId: mobile,
    otpSystem: 'abdm',
  });
}

async function verifyMobileOtp(otp, txnId) {
  return gwReq('POST', `${ABHA_BASE}/enrollment/auth/byAbdm`, {
    scope: ['abha-enrol', 'mobile-verify'],
    authData: {
      authMethods: ['OTP'],
      otp: { timeStamp: new Date().toISOString(), txnId, otpValue: otp },
    },
  });
}

// ─── M1: ABHA Login ───────────────────────────────────────────────────────────

async function loginRequestOtp(abhaId) {
  return gwReq('POST', `${ABHA_BASE}/profile/login/request/otp`, {
    scope: ['profile'],
    loginHint: 'abha-number',
    loginId: abhaId,
    otpSystem: 'abdm',
  });
}

async function loginVerifyOtp(otp, txnId) {
  return gwReq('POST', `${ABHA_BASE}/profile/login/verify/otp`, {
    scope: ['profile'],
    authData: {
      authMethods: ['OTP'],
      otp: { timeStamp: new Date().toISOString(), txnId, otpValue: otp },
    },
  });
}

// ─── M1: ABHA Profile & Card ──────────────────────────────────────────────────

async function getAbhaProfile(xToken) {
  return gwReq('GET', `${ABHA_BASE}/profile/account`, null, { 'X-Token': `Bearer ${xToken}` });
}

async function getAbhaPngCard(xToken) {
  const token = await getGatewayToken();
  const res = await axios.get(`${ABHA_BASE}/profile/card`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Token': `Bearer ${xToken}`, 'X-CM-ID': 'sbx' },
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
  generateAadhaarOtp, verifyAadhaarOtp,
  generateMobileOtp,  verifyMobileOtp,
  loginRequestOtp,    loginVerifyOtp,
  getAbhaProfile,     getAbhaPngCard,
  discoverCareContexts, linkCareContexts,
  createConsentRequest, fetchHealthInfo,
  uuid,
};
