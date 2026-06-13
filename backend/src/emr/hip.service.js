const axios   = require('axios');
const crypto  = require('crypto');
const logger  = require('../utils/logger');
const { weierstrass } = require('@noble/curves/abstract/weierstrass.js');
const { Field, mod } = require('@noble/curves/abstract/modular.js');

// Weierstrass Curve25519 — BouncyCastle's short-Weierstrass form
// ABDM sends AND expects 65-byte uncompressed points (04||x||y)
// Gx/Gy derived from Montgomery base x=9 via u = x + A/3 mod p
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


// Encrypt one FHIR bundle entry for ABDM health data transfer
//
// ABDM uses BouncyCastle Weierstrass Curve25519 throughout:
//   - HIU sends 65-byte uncompressed Weierstrass public key
//   - HIP must also return 65-byte Weierstrass public key
//   - Shared secret = Weierstrass x-coordinate of ECDH point
//
// KDF:  SHA-256( XOR(hiu_nonce, hip_nonce) || sharedX )  (nonces decoded from base64)
// IV:   first 12 bytes of hip_nonce
// AES:  AES-256-GCM → content = ciphertext || auth_tag  (BouncyCastle format, NO embedded IV)
// Extract raw 65-byte uncompressed EC point from SubjectPublicKeyInfo DER.
// HIU sends its key wrapped in SPKI (309 bytes); the point is in the BIT STRING at the end.
// BIT STRING encoding: 03 42 00 04 <32-byte-x> <32-byte-y>
function _extractPointFromSpki(buf) {
  for (let i = 0; i < buf.length - 67; i++) {
    if (buf[i] === 0x03 && buf[i + 1] === 0x42 && buf[i + 2] === 0x00 && buf[i + 3] === 0x04) {
      return buf.slice(i + 3, i + 68); // 65 bytes: 04 || x || y
    }
  }
  return null;
}

function encryptFhir(plaintext, hiuPubKeyBase64, hiuNonceBase64) {
  logger.info('[ENCRYPT] encryptFhir called', {
    hiuPubKeyLen: hiuPubKeyBase64 ? Buffer.from(hiuPubKeyBase64, 'base64').length : 0,
    hiuNonceLen:  hiuNonceBase64  ? Buffer.from(hiuNonceBase64,  'base64').length : 0,
    plaintextLen: plaintext?.length,
  });
  try {
    const hiuPubBytes = Buffer.from(hiuPubKeyBase64, 'base64');
    // If key is SPKI-wrapped (>65 bytes), extract the raw 65-byte EC point
    const rawPoint = hiuPubBytes.length > 65 ? _extractPointFromSpki(hiuPubBytes) : hiuPubBytes;
    if (!rawPoint) throw new Error(`Cannot extract EC point from HIU public key (len=${hiuPubBytes.length})`);
    const hiuPubHex = rawPoint.toString('hex');
    logger.info('[ENCRYPT] HIU public key extracted', { spki: hiuPubBytes.length > 65, pointLen: rawPoint.length });
    const hiuNonce  = Buffer.from(hiuNonceBase64,  'base64'); // 32 bytes

    // Generate HIP ephemeral Weierstrass Curve25519 key pair
    const hipPriv     = crypto.randomBytes(32);
    const hipScalar   = _c25519Scalar(hipPriv);
    const hipPubBytes = Buffer.from(_c25519W.BASE.multiply(hipScalar).toBytes(false)); // 65 bytes

    // Weierstrass ECDH: shared x-coordinate (big-endian 32 bytes)
    const hiuPoint = _c25519W.BASE.constructor.fromHex(hiuPubHex);
    const sharedX  = Buffer.from(
      hiuPoint.multiply(hipScalar).toAffine().x.toString(16).padStart(64, '0'), 'hex'
    );

    // Generate HIP nonce (32 bytes)
    const hipNonce = crypto.randomBytes(32);

    // XOR nonces: sender (HIP) XOR receiver (HIU)
    const xorNonce = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) xorNonce[i] = hipNonce[i] ^ (hiuNonce[i] ?? 0);

    // KDF: HKDF-SHA256(IKM=sharedX, salt=xorNonce[0:20], info='', length=32)
    const salt   = xorNonce.slice(0, 20);
    const aesKey = Buffer.from(crypto.hkdfSync('sha256', sharedX, salt, Buffer.alloc(0), 32));

    // IV = LAST 12 bytes of XOR nonces (xorNonce[20:32])
    const iv     = xorNonce.slice(20, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();

    // Content = ciphertext || auth_tag  (16-byte GCM tag appended, no IV embedded)
    // Fidelius keyValue = ECPublicKey.getQ().getEncoded(false) = raw 04||X||Y, 65 bytes.
    // SPKI (getEncoded()) is stored as x509PublicKey internally but never sent over the wire.
    return {
      encryptedData: Buffer.concat([enc, tag]).toString('base64'),
      hipPublicKey:  hipPubBytes.toString('base64'),         // raw 65-byte uncompressed point
      hipNonce:      hipNonce.toString('base64'),            // 32 bytes
    };
  } catch (err) {
    logger.warn('FHIR encryption failed', {
      error: err.message,
      hiuPubKeyLen: hiuPubKeyBase64 ? Buffer.from(hiuPubKeyBase64, 'base64').length : 0,
    });
    return { encryptedData: Buffer.from(plaintext).toString('base64'), hipPublicKey: null, hipNonce: null };
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

  // Encrypt all entries with one ephemeral key pair (same key for all entries per request)
  let respondingKeyMaterial = null;
  const entries = careContexts.map(ctx => {
    const fhir = typeof ctx.fhir_content === 'string'
      ? ctx.fhir_content
      : JSON.stringify(buildFhirBundle(patient, ctx));

    let content, checksum = crypto.createHash('md5').update(fhir).digest('hex');

    if (hiuPubKey && hiuNonce) {
      const { encryptedData, hipPublicKey, hipNonce } = encryptFhir(fhir, hiuPubKey, hiuNonce);
      content = encryptedData;
      if (hipPublicKey && hipNonce && !respondingKeyMaterial) {
        respondingKeyMaterial = {
          cryptoAlg: 'ECDH',
          curve: 'curve25519',
          dhPublicKey: {
            expiry: new Date(Date.now() + 3600_000).toISOString(),
            parameters: 'Curve25519/32ByteNonce',
            keyValue: hipPublicKey, // raw 65-byte uncompressed point: 04||X||Y
          },
          nonce: hipNonce,
        };
      }
    } else {
      content = Buffer.from(fhir).toString('base64');
    }

    return { content, media: 'application/fhir+json', checksum, careContextReference: ctx.reference_number };
  });

  const pushBody = { pageNumber: 1, pageCount: 1, transactionId, entries };
  if (respondingKeyMaterial) pushBody.keyMaterial = respondingKeyMaterial;

  logger.info('HIP transfer payload', { payload: JSON.stringify(pushBody) });

  // Small delay to ensure ABDM has registered the transaction before we push
  await new Promise(r => setTimeout(r, 3000));

  await axios.post(dataPushUrl, pushBody);
  logger.info('HIP health data pushed', { transactionId, entries: entries.length, encrypted: !!respondingKeyMaterial });
}

module.exports = { uuid, gwGet, gwPost, hiecmPost, sendDiscoverResult, sendLinkInitResult, sendLinkConfirmResult, pushHealthData, buildFhirBundle, sendShareProfileAck };
