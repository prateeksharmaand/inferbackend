const axios   = require('axios');
const crypto  = require('crypto');
const logger  = require('../utils/logger');

const GATEWAY = process.env.ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/gateway';
const HIECM   = process.env.ABDM_HIECM_URL   || 'https://dev.abdm.gov.in/api/hiecm';
const CLIENT_ID     = process.env.ABDM_CLIENT_ID;
const CLIENT_SECRET = process.env.ABDM_CLIENT_SECRET;
const HIP_ID        = process.env.ABDM_HIP_ID || CLIENT_ID;

let _token = null;
let _tokenExpiry = 0;

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const res = await axios.post(`${HIECM}/gateway/v3/sessions`,
    { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, grantType: 'client_credentials' },
    { headers: { 'Content-Type': 'application/json', 'X-CM-ID': 'sbx', 'REQUEST-ID': uuid(), TIMESTAMP: new Date().toISOString() } }
  );
  _token = res.data.accessToken;
  _tokenExpiry = Date.now() + ((res.data.expiresIn ?? 300) - 30) * 1000;
  return _token;
}

async function gwPost(path, body) {
  const token = await getToken();
  try {
    await axios.post(`${GATEWAY}${path}`, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-CM-ID': 'sbx',
        'REQUEST-ID': uuid(),
        TIMESTAMP: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('HIP gateway callback failed', { path, status: err.response?.status, body: err.response?.data });
    throw err;
  }
}

async function hiecmPost(path, body) {
  const token = await getToken();
  try {
    const res = await axios.post(`${HIECM}${path}`, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-CM-ID': 'sbx',
        'X-HIP-ID': HIP_ID,
        'REQUEST-ID': uuid(),
        TIMESTAMP: new Date().toISOString(),
      },
    });
    return res.data;
  } catch (err) {
    logger.error('HIP HIECM callback failed', { path, status: err.response?.status, body: err.response?.data });
    throw err;
  }
}

async function sendShareProfileAck({ requestId, abhaAddress, tokenNumber, name, gender, yearOfBirth }) {
  // ABDM v3 ProfileV3Acknowledgement format (from NHA-ABDM/ABDM-wrapper)
  const body = {
    status: 'SUCCESS',
    abhaAddress,
    profile: {
      context: HIP_ID,
      tokenNumber: String(tokenNumber),
      expiry: '1800',
    },
  };
  logger.info('on-share request body', body);
  await hiecmPost('/patient-share/v3/on-share', body);
}

// ── Gateway callbacks ─────────────────────────────────────────────────────────

async function sendDiscoverResult({ requestId, transactionId, patientId, patientRef, careContexts, matchedBy }) {
  await gwPost('/v0.5/care-contexts/on-discover', {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    transactionId,
    patient: patientId ? {
      id: patientId,
      referenceNumber: patientRef ?? patientId,   // patient's HIP record reference — required by ABDM
      display: patientId,
      careContexts: careContexts.map(c => ({
        referenceNumber: c.reference_number,
        display: c.display,
        hiType: c.hi_type,
      })),
      matchedBy: matchedBy ?? ['MOBILE'],
    } : null,
    resp: { requestId },
  });
}

async function sendLinkInitResult({ requestId, transactionId, linkRefNumber }) {
  await gwPost('/v0.5/links/link/on-init', {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    transactionId,
    link: {
      referenceNumber: linkRefNumber,
      authenticationType: 'MEDIATE',
      meta: {
        communicationMedium: 'MOBILE',
        communicationHint: 'OTP sent to patient mobile',
        communicationExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
      hip: { id: HIP_ID },
    },
    resp: { requestId },
  });
}

async function sendLinkConfirmResult({ requestId, patientId, careContexts }) {
  await gwPost('/v0.5/links/link/on-confirm', {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    patient: {
      referenceNumber: patientId,
      display: patientId,
      careContexts: careContexts.map(c => ({
        referenceNumber: c.referenceNumber ?? c.reference_number,
        display: c.display,
        hiType: c.hiType ?? c.hi_type,
      })),
    },
    resp: { requestId },
  });
}

// ── FHIR bundle generation ────────────────────────────────────────────────────

function buildFhirBundle(patient, careContext) {
  const now = new Date().toISOString();
  return JSON.stringify({
    resourceType: 'Bundle',
    id: uuid(),
    type: 'document',
    timestamp: now,
    entry: [
      {
        fullUrl: `urn:uuid:${uuid()}`,
        resource: {
          resourceType: 'Composition',
          status: 'final',
          type: { coding: [{ system: 'http://snomed.info/sct', code: '371530004', display: careContext.display }] },
          subject: { reference: `Patient/${uuid()}`, display: patient.name },
          date: now,
          author: [{ display: 'EMR Test HIP' }],
          title: careContext.display,
          section: [{
            title: careContext.display,
            code: { coding: [{ system: 'http://snomed.info/sct', code: '371530004' }] },
            entry: [{ reference: `Encounter/${uuid()}` }],
          }],
        },
      },
      {
        fullUrl: `urn:uuid:${uuid()}`,
        resource: {
          resourceType: 'Patient',
          name: [{ text: patient.name }],
          gender: patient.gender === 'M' ? 'male' : patient.gender === 'F' ? 'female' : 'other',
          birthDate: patient.dob ?? undefined,
          telecom: patient.mobile ? [{ system: 'phone', value: patient.mobile }] : [],
        },
      },
      {
        fullUrl: `urn:uuid:${uuid()}`,
        resource: {
          resourceType: 'Encounter',
          status: 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
          type: [{ coding: [{ system: 'http://snomed.info/sct', code: '11429006', display: careContext.hi_type }] }],
          subject: { display: patient.name },
          period: { start: careContext.created_at ?? now, end: careContext.created_at ?? now },
        },
      },
    ],
  });
}

// Encrypt FHIR bundle with HIU's public key (X25519 + AES-256-GCM)
function encryptFhir(plaintext, hiuPubKeyBase64, nonce) {
  try {
    const hipKeys = crypto.generateKeyPairSync('x25519');
    const hiuPubKey = crypto.createPublicKey({
      key: Buffer.from(hiuPubKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const shared = crypto.diffieHellman({ publicKey: hiuPubKey, privateKey: hipKeys.privateKey });
    const key = crypto.createHash('sha256').update(Buffer.concat([shared, Buffer.from(nonce)])).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      encryptedData: Buffer.concat([iv, tag, enc]).toString('base64'),
      hipPublicKey: hipKeys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    };
  } catch (err) {
    logger.warn('FHIR encryption failed, sending plaintext (sandbox only)', err.message);
    return { encryptedData: Buffer.from(plaintext).toString('base64'), hipPublicKey: '' };
  }
}

async function pushHealthData({ dataPushUrl, transactionId, careContexts, patient, keyMaterial }) {
  const nonce = keyMaterial?.nonce ?? uuid();
  const hiuPubKey = keyMaterial?.dhPublicKey?.keyValue;

  let hipPublicKeyForResponse = '';
  const entries = careContexts.map(ctx => {
    const fhir = ctx.fhir_content ?? buildFhirBundle(patient, ctx);
    const { encryptedData, hipPublicKey } = hiuPubKey
      ? encryptFhir(fhir, hiuPubKey, nonce)
      : { encryptedData: Buffer.from(fhir).toString('base64'), hipPublicKey: '' };
    if (hipPublicKey) hipPublicKeyForResponse = hipPublicKey;
    return {
      content: encryptedData,
      media: 'application/fhir+json',
      checksum: crypto.createHash('md5').update(fhir).digest('hex'),
      careContextReference: ctx.reference_number,
    };
  });

  const respondingKeyMaterial = {
    cryptoAlg: 'ECDH',
    curve: 'Curve25519',
    dhPublicKey: {
      expiry: new Date(Date.now() + 3600_000).toISOString(),
      parameters: 'Curve25519',
      keyValue: hipPublicKeyForResponse,
    },
    nonce,
  };

  await axios.post(dataPushUrl, {
    pageNumber: 1,
    pageCount: 1,
    transactionId,
    entries,
    keyMaterial: respondingKeyMaterial,
  });
  logger.info('HIP health data pushed', { transactionId, entries: entries.length });
}

module.exports = { uuid, sendDiscoverResult, sendLinkInitResult, sendLinkConfirmResult, pushHealthData, buildFhirBundle, sendShareProfileAck };
