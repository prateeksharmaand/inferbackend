const axios   = require('axios');
const crypto  = require('crypto');
const logger  = require('../utils/logger');
const { Field } = require('@noble/curves/abstract/modular.js');

// Weierstrass → Montgomery x-coordinate conversion
// HIU sends 65-byte Weierstrass Curve25519 public key (04||xW||yW, big-endian)
// X25519 ECDH uses Montgomery u-coordinate = xW - A/3 mod p (little-endian 32 bytes)
const _p25519  = BigInt('0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFED');
const _Fp25519 = Field(_p25519);
const _A_div_3 = _Fp25519.mul(BigInt(486662), _Fp25519.inv(3n)); // 486662/3 mod p

function _weierstrassToX25519Raw(pub65) {
  // Extract Weierstrass x (bytes 1–32, big-endian) → Montgomery u → little-endian 32 bytes
  const xW  = BigInt('0x' + pub65.slice(1, 33).toString('hex'));
  const xM  = _Fp25519.sub(xW, _A_div_3);
  const le  = Buffer.alloc(32);
  let val = xM;
  for (let i = 0; i < 32; i++) { le[i] = Number(val & 0xffn); val >>= 8n; }
  return le; // 32-byte little-endian X25519 public key
}

// X25519 SPKI prefix for wrapping raw 32-byte key into Node.js createPublicKey format
const _X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');

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
// Key exchange:
//   HIU sends 65-byte Weierstrass Curve25519 key → convert x to X25519 Montgomery (32 bytes LE)
//   HIP generates X25519 ephemeral key pair (32-byte raw keys)
//   ECDH shared secret = X25519(hip_priv, hiu_x25519_pub)
//
// KDF:  SHA-256( XOR(hiu_nonce, hip_nonce) || shared_secret )
// IV:   first 12 bytes of hip_nonce
// AES:  AES-256-GCM → content = ciphertext || auth_tag (NOT iv||tag||cipher)
//
// Returns: { encryptedData, hipPublicKey (32-byte raw X25519 base64), hipNonce (32-byte base64) }
function encryptFhir(plaintext, hiuPubKeyBase64, hiuNonceBase64) {
  try {
    const hiuPub65  = Buffer.from(hiuPubKeyBase64, 'base64');
    const hiuNonce  = Buffer.from(hiuNonceBase64,  'base64'); // 32 bytes

    // Convert HIU Weierstrass key → X25519 Montgomery key
    const hiuX25519Raw = _weierstrassToX25519Raw(hiuPub65);
    const hiuX25519Key = crypto.createPublicKey({
      key: Buffer.concat([_X25519_SPKI_PREFIX, hiuX25519Raw]),
      format: 'der', type: 'spki',
    });

    // Generate HIP X25519 ephemeral key pair
    const hipKeyPair = crypto.generateKeyPairSync('x25519');
    const hipNonce   = crypto.randomBytes(32);

    // X25519 ECDH → 32-byte shared secret
    const shared = crypto.diffieHellman({ publicKey: hiuX25519Key, privateKey: hipKeyPair.privateKey });

    // KDF: SHA-256( XOR(hiu_nonce, hip_nonce) || shared )
    const xorNonce = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) xorNonce[i] = (hiuNonce[i] ?? 0) ^ hipNonce[i];
    const aesKey = crypto.createHash('sha256').update(Buffer.concat([xorNonce, shared])).digest();

    // AES-256-GCM: IV = first 12 bytes of hip_nonce
    const iv     = hipNonce.slice(0, 12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();

    // Content = ciphertext || auth_tag  (ABDM/BouncyCastle format, no IV embedded)
    const encryptedData = Buffer.concat([enc, tag]).toString('base64');

    // HIP public key: raw 32-byte X25519 (strip DER/SPKI wrapper)
    const hipPubDer = hipKeyPair.publicKey.export({ format: 'der', type: 'spki' });
    const hipPubRaw = hipPubDer.slice(-32);

    return { encryptedData, hipPublicKey: hipPubRaw.toString('base64'), hipNonce: hipNonce.toString('base64') };
  } catch (err) {
    logger.warn('FHIR encryption failed', {
      error: err.message,
      hiuPubKeyLen: hiuPubKeyBase64 ? Buffer.from(hiuPubKeyBase64, 'base64').length : 0,
    });
    return { encryptedData: Buffer.from(plaintext).toString('base64'), hipPublicKey: null, hipNonce: null };
  }
}

async function pushHealthData({ dataPushUrl, transactionId, careContexts, patient, keyMaterial }) {
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
          curve: 'Curve25519',
          dhPublicKey: {
            expiry: new Date(Date.now() + 3600_000).toISOString(),
            parameters: 'Curve25519/X25519',
            keyValue: hipPublicKey, // raw 32-byte X25519 base64
          },
          nonce: hipNonce, // HIP's nonce (not echoing HIU nonce)
        };
      }
    } else {
      content = Buffer.from(fhir).toString('base64');
    }

    return { content, media: 'application/fhir+json', checksum, careContextReference: ctx.reference_number };
  });

  const pushBody = { pageNumber: 1, pageCount: 1, transactionId, entries };
  if (respondingKeyMaterial) pushBody.keyMaterial = respondingKeyMaterial;
  await axios.post(dataPushUrl, pushBody);
  logger.info('HIP health data pushed', { transactionId, entries: entries.length, encrypted: !!respondingKeyMaterial });
}

module.exports = { uuid, gwPost, sendDiscoverResult, sendLinkInitResult, sendLinkConfirmResult, pushHealthData, buildFhirBundle, sendShareProfileAck };
