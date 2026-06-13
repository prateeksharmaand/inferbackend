const axios        = require('axios');
const crypto       = require('crypto');
const { execFile } = require('child_process');
const fs           = require('fs');
const os           = require('os');
const path         = require('path');
const logger       = require('../utils/logger');
const { weierstrass } = require('@noble/curves/abstract/weierstrass.js');
const { Field, mod } = require('@noble/curves/abstract/modular.js');

const FIDELIUS_DIR = process.env.FIDELIUS_DIR || '/opt/fidelius';
const FIDELIUS_JAR = process.env.FIDELIUS_JAR || `${FIDELIUS_DIR}/fidelius-cli.jar`;
const FIDELIUS_CP  = `${FIDELIUS_JAR}:${FIDELIUS_DIR}/lib/*`;

function _callFidelius(args) {
  return new Promise((resolve, reject) => {
    execFile('java', ['-cp', FIDELIUS_CP, 'com.mgrm.fidelius.FideliusApplication', ...args],
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr?.trim() || err.message));
        resolve(stdout.trim());
      }
    );
  });
}

// BouncyCastle's short-Weierstrass Curve25519 (BC25519).
// Identical to W25519 except Gy is negated mod p (Gy_bc = p - Gy_w25519).
// Source: https://github.com/bcgit/bc-java/blob/main/core/src/main/java/org/bouncycastle/crypto/ec/CustomNamedCurves.java#L99
// ECDH shared secret x-coordinate is identical with either Gy (negation preserves x).
const _c25519n = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');
const _c25519W = weierstrass({
  a:  BigInt('0x2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA984914A144'),
  b:  BigInt('0x7B425ED097B425ED097B425ED097B425ED097B425ED097B4260B5E9C7710C864'),
  p:  BigInt('0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFED'),
  n:  _c25519n,
  Gx: BigInt('0x2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad245a'),
  Gy: BigInt('0x20AE19A1B8A086B4E01EDD2C7748D14C923D4D7E6D7C61B229E9C5A27ECED3D9'),
  h:  BigInt(8),
  randomBytes: (b) => crypto.randomBytes(b),
});
const _c25519Scalar = (b) => mod(BigInt('0x' + b.toString('hex')), _c25519n - 1n) + 1n;

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

async function gwGet(path) {
  const token = await getToken();
  try {
    const res = await axios.get(`${GATEWAY}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-CM-ID': 'sbx',
        'REQUEST-ID': uuid(),
        TIMESTAMP: new Date().toISOString(),
      },
    });
    return res.data;
  } catch (err) {
    logger.warn('HIP gateway GET failed', { path, status: err.response?.status });
    return null;
  }
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

async function sendShareProfileAck({ requestId, abhaAddress, tokenNumber }) {
  const body = {
    acknowledgement: {
      abhaAddress,
      status: 'SUCCESS',
      profile: {
        context:     HIP_ID,
        tokenNumber: String(tokenNumber),
        expiry:      '1800',
      },
    },
    response: { requestId },
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
  const mapped = careContexts.map(c => ({
    referenceNumber: c.referenceNumber ?? c.reference_number,
    display: c.display,
  }));
  await gwPost('/v0.5/links/link/on-confirm', {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    patient: {
      referenceNumber: patientId,
      display: patientId,
      count: mapped.length,          // required by ABDM — must be 1–20
      careContexts: mapped,
    },
    resp: { requestId },
  });
}

// ── FHIR bundle generation ────────────────────────────────────────────────────

async function sendHealthInfoOnRequest({ requestId, transactionId, sessionStatus = 'ACKNOWLEDGED' }) {
  await gwPost('/v0.5/health-information/hip/on-request', {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    hiRequest: { transactionId, sessionStatus },
    resp: { requestId },
  });
}

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


// Build SubjectPublicKeyInfo DER for Weierstrass Curve25519 with explicit ECParameters.
// ABDM gateway calls X509EncodedKeySpec(keyValue) — SPKI DER is required.
function _buildSpki(rawPub65) {
  const dl = (n) => n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
  const seq = (c) => Buffer.concat([Buffer.from([0x30]), dl(c.length), c]);
  const int = (b) => { if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]); return Buffer.concat([Buffer.from([0x02]), dl(b.length), b]); };
  const oct = (b) => Buffer.concat([Buffer.from([0x04]), dl(b.length), b]);
  const bit = (b) => Buffer.concat([Buffer.from([0x03]), dl(b.length + 1), Buffer.from([0x00]), b]);

  const p  = Buffer.from('7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed', 'hex');
  const a  = Buffer.from('2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa984914a144', 'hex');
  const b_ = Buffer.from('7b425ed097b425ed097b425ed097b425ed097b425ed097b4260b5e9c7710c864', 'hex');
  const G  = Buffer.from('042aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad245a20ae19a1b8a086b4e01edd2c7748d14c923d4d7e6d7c61b229e9c5a27eced3d9', 'hex');
  const n  = Buffer.from('1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed', 'hex');
  const OID_EC  = Buffer.from('06072a8648ce3d0201', 'hex');
  const OID_PF  = Buffer.from('06072a8648ce3d0101', 'hex');

  const fieldID  = seq(Buffer.concat([OID_PF, int(p)]));
  const curve    = seq(Buffer.concat([oct(a), oct(b_)]));
  const ecParams = seq(Buffer.concat([int(Buffer.from([0x01])), fieldID, curve, oct(G), int(n), int(Buffer.from([0x08]))]));
  const algId    = seq(Buffer.concat([OID_EC, ecParams]));
  return seq(Buffer.concat([algId, bit(rawPub65)]));
}

// Encrypt one FHIR bundle entry using fidelius-cli (reference BouncyCastle implementation).
// Delegates to the JAR via subprocess so crypto is byte-for-byte compatible with ABDM.
async function encryptFhir(plaintext, hiuPubKeyBase64, hiuNonceBase64) {
  // Generate HIP ephemeral BC25519 key pair in Node (curve definition matches BouncyCastle)
  const hipPriv     = crypto.randomBytes(32);
  const hipScalar   = _c25519Scalar(hipPriv);
  const hipPubBytes = Buffer.from(_c25519W.BASE.multiply(hipScalar).toBytes(false)); // 65 bytes
  const hipNonce    = crypto.randomBytes(32);

  // Encode private key as big-endian 32-byte base64 (matches Fidelius ECPrivateKey.getD())
  const hipPrivBase64 = Buffer.from(hipScalar.toString(16).padStart(64, '0'), 'hex').toString('base64');

  // Write params one-per-line; --filepath avoids shell arg-length limits on large FHIR bundles
  const tmpFile = path.join(os.tmpdir(), `fidelius-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`);
  fs.writeFileSync(tmpFile, [
    'e',                           // command must be first line when using -f
    plaintext,
    hipNonce.toString('base64'),   // sender nonce  (HIP)
    hiuNonceBase64,                // requester nonce (HIU)
    hipPrivBase64,                 // sender private key (HIP)
    hiuPubKeyBase64,               // requester public key (HIU) — raw 65-byte 04||X||Y
  ].join('\n'));

  try {
    const raw = await _callFidelius(['-f', tmpFile]);
    // fidelius-cli returns {"encryptedData":"<base64>"} — extract the value
    const encryptedData = (JSON.parse(raw)).encryptedData ?? raw;
    logger.info('[ENCRYPT] fidelius-cli encrypt ok', { plaintextLen: plaintext.length, encLen: encryptedData.length });
    return {
      encryptedData,
      hipPublicKey: _buildSpki(hipPubBytes).toString('base64'), // SPKI DER with correct BC25519 Gy
      hipNonce:     hipNonce.toString('base64'),
    };
  } catch (err) {
    logger.warn('[ENCRYPT] fidelius-cli encrypt failed', { error: err.message });
    return { encryptedData: Buffer.from(plaintext).toString('base64'), hipPublicKey: null, hipNonce: null };
  } finally {
    fs.unlink(tmpFile, () => {});
  }
}

async function pushHealthData({ dataPushUrl, transactionId, careContexts, patient, keyMaterial }) {
  console.log('[PUSH] pushHealthData called', {
    dataPushUrl,
    transactionId,
    careContextCount: careContexts?.length,
    cryptoAlg: keyMaterial?.cryptoAlg,
    curve: keyMaterial?.curve,
    keyValueLen: keyMaterial?.dhPublicKey?.keyValue ? Buffer.from(keyMaterial.dhPublicKey.keyValue, 'base64').length : 0,
    hasNonce: !!keyMaterial?.nonce,
  });
  const hiuNonce  = keyMaterial?.nonce ?? '';
  const hiuPubKey = keyMaterial?.dhPublicKey?.keyValue;

  let respondingKeyMaterial = null;
  const entries = await Promise.all(careContexts.map(async ctx => {
    const fhir = typeof ctx.fhir_content === 'string'
      ? ctx.fhir_content
      : buildFhirBundle(patient, ctx); // already returns JSON.stringify'd string

    const checksum = crypto.createHash('md5').update(fhir).digest('hex');
    let content;

    if (hiuPubKey && hiuNonce) {
      const { encryptedData, hipPublicKey, hipNonce } = await encryptFhir(fhir, hiuPubKey, hiuNonce);
      content = encryptedData;
      if (hipPublicKey && hipNonce && !respondingKeyMaterial) {
        respondingKeyMaterial = {
          cryptoAlg: 'ECDH',
          curve: 'curve25519',
          dhPublicKey: {
            expiry: new Date(Date.now() + 3600_000).toISOString(),
            parameters: 'Curve25519/32ByteNonce',
            keyValue: hipPublicKey, // SPKI DER with explicit BC25519 params
          },
          nonce: hipNonce,
        };
      }
    } else {
      content = Buffer.from(fhir).toString('base64');
    }

    return { content, media: 'application/fhir+json', checksum, careContextReference: ctx.reference_number };
  }));

  const pushBody = { pageNumber: 1, pageCount: 1, transactionId, entries };
  if (respondingKeyMaterial) pushBody.keyMaterial = respondingKeyMaterial;

  logger.info('HIP transfer payload', { payload: JSON.stringify(pushBody) });

  // Small delay to ensure ABDM has registered the transaction before we push
  await new Promise(r => setTimeout(r, 3000));

  await axios.post(dataPushUrl, pushBody);
  logger.info('HIP health data pushed', { transactionId, entries: entries.length, encrypted: !!respondingKeyMaterial });
}

module.exports = { uuid, gwGet, gwPost, hiecmPost, sendDiscoverResult, sendLinkInitResult, sendLinkConfirmResult, sendHealthInfoOnRequest, pushHealthData, buildFhirBundle, sendShareProfileAck };
