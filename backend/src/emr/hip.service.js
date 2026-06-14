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
    // R3-004: 30-second timeout prevents server from hanging on stuck JVM
    execFile('java', ['-cp', FIDELIUS_CP, 'com.mgrm.fidelius.FideliusApplication', ...args],
      { maxBuffer: 10 * 1024 * 1024, timeout: 30_000, killSignal: 'SIGKILL' },
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
// SEC-025: environment-driven CM ID — 'sbx' for sandbox, 'abdm' for production
const CM_ID = process.env.ABDM_CM_ID || (process.env.NODE_ENV === 'production' ? 'abdm' : 'sbx');

// R2-001: SSRF protection — allowed domains for health data push
const _ABDM_KNOWN_PUSH_DOMAINS = [
  'abdm.gov.in', 'ndhm.gov.in', 'dev.abdm.gov.in',
  'sandbox.abdm.gov.in', 'healthlocker.abdm.gov.in',
];
const _EXTRA_PUSH_DOMAINS = (process.env.ABDM_DATAPUSH_ALLOWED_HOSTS || '')
  .split(',').map(h => h.trim()).filter(Boolean);
const _ALLOWED_PUSH_DOMAINS = [..._ABDM_KNOWN_PUSH_DOMAINS, ..._EXTRA_PUSH_DOMAINS];

const _BLOCKED_PREFIXES = [
  '127.', '10.', '192.168.', '169.254.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.',
  '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
];
const _BLOCKED_HOSTS = ['localhost', 'postgres', 'fhir', 'redis', 'whisper', '::1'];

function validateDataPushUrl(urlStr) {
  let parsed;
  try { parsed = new URL(urlStr); } catch {
    throw new Error(`dataPushUrl is not a valid URL`);
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error(`dataPushUrl must use HTTPS in production`);
  }
  const host = parsed.hostname.toLowerCase();
  if (_BLOCKED_HOSTS.includes(host) || _BLOCKED_PREFIXES.some(p => host.startsWith(p))) {
    throw new Error(`dataPushUrl targets a blocked internal host: ${host}`);
  }
  const allowed = _ALLOWED_PUSH_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  if (!allowed) throw new Error(`dataPushUrl host not in allowlist: ${host}`);
}

let _token = null;
let _tokenExpiry = 0;
let _tokenRefreshPromise = null; // R3-016: prevents concurrent token fetches under burst load

// R2-004: cryptographically secure UUID (replaces Math.random version)
const { randomUUID } = require('crypto');
function uuid() { return randomUUID(); }

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  if (_tokenRefreshPromise) return _tokenRefreshPromise;

  _tokenRefreshPromise = (async () => {
    const res = await axios.post(`${HIECM}/gateway/v3/sessions`,
      { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, grantType: 'client_credentials' },
      { headers: { 'Content-Type': 'application/json', 'X-CM-ID': CM_ID, 'REQUEST-ID': uuid(), TIMESTAMP: new Date().toISOString() }, timeout: 10_000 }
    );
    _token = res.data.accessToken;
    _tokenExpiry = Date.now() + ((res.data.expiresIn ?? 300) - 30) * 1000;
    return _token;
  })().finally(() => { _tokenRefreshPromise = null; });

  return _tokenRefreshPromise;
}

async function gwGet(path) {
  const token = await getToken();
  try {
    const res = await axios.get(`${GATEWAY}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-CM-ID': CM_ID,
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
        'X-CM-ID': CM_ID,
        'REQUEST-ID': uuid(),
        TIMESTAMP: new Date().toISOString(),
      },
    });
  } catch (err) {
    // R2-015: log only error metadata, not full response body
    logger.error('HIP gateway callback failed', {
      path,
      status: err.response?.status,
      errorCode: err.response?.data?.error?.code,
      errorMsg:  err.response?.data?.error?.message,
    });
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
        'X-CM-ID': CM_ID,
        'X-HIP-ID': HIP_ID,
        'REQUEST-ID': uuid(),
        TIMESTAMP: new Date().toISOString(),
      },
    });
    return res.data;
  } catch (err) {
    // R3-001: never log full response body — may contain PHI or credentials
    logger.error('HIP HIECM callback failed', {
      path,
      status:    err.response?.status,
      errorCode: err.response?.data?.error?.code,
      errorMsg:  err.response?.data?.error?.message,
    });
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
  // R2-008: never log tokenNumber
  logger.info('on-share ack sending', { requestId, hasAbhaAddress: !!abhaAddress });
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

// SEC-015 + R2-012: stable UUIDs + ABDM IG required fields (identifier, Practitioner, Patient.identifier)
function buildFhirBundle(patient, careContext) {
  const now            = new Date().toISOString();
  const hipId          = HIP_ID || 'infer-hip';
  const bundleId       = uuid();
  const compositionId  = uuid();
  const patientId      = uuid();
  const encounterId    = uuid();
  const practitionerId = uuid();
  const periodStart    = careContext.created_at ? new Date(careContext.created_at).toISOString() : now;

  return JSON.stringify({
    resourceType: 'Bundle',
    id: bundleId,
    // R2-012: Bundle.identifier required by ABDM FHIR IG
    identifier: {
      system: `https://${hipId}.hip.abdm.gov.in/bundles`,
      value:   bundleId,
    },
    type: 'document',
    timestamp: now,
    entry: [
      {
        fullUrl: `urn:uuid:${compositionId}`,
        resource: {
          resourceType: 'Composition',
          id: compositionId,
          identifier: { system: 'https://ndhm.in/phr', value: compositionId },
          status: 'final',
          type: { coding: [{ system: 'http://snomed.info/sct', code: '371530004', display: 'Clinical consultation report' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          // R2-012: author must reference a Practitioner, not just display
          author: [{ reference: `urn:uuid:${practitionerId}` }],
          date: now,
          title: careContext.display || 'Clinical Document',
          section: [{
            title: careContext.display || 'Clinical Document',
            code: { coding: [{ system: 'http://snomed.info/sct', code: '371530004' }] },
            entry: [{ reference: `urn:uuid:${encounterId}` }],
          }],
        },
      },
      {
        fullUrl: `urn:uuid:${patientId}`,
        resource: {
          resourceType: 'Patient',
          id: patientId,
          // R2-012: Patient.identifier with ABHA number (required by ABDM IG)
          identifier: patient.abhaNumber ? [{
            type:   { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] },
            system: 'https://abha.abdm.gov.in',
            value:   patient.abhaNumber,
          }] : [],
          name: [{ text: patient.name }],
          gender: patient.gender === 'M' ? 'male' : patient.gender === 'F' ? 'female' : 'other',
          birthDate: patient.dob ? patient.dob.toString().slice(0, 10) : undefined,
          telecom: patient.mobile ? [{ system: 'phone', value: patient.mobile, use: 'mobile' }] : [],
        },
      },
      {
        // R2-012: Practitioner resource — required as author reference
        fullUrl: `urn:uuid:${practitionerId}`,
        resource: {
          resourceType: 'Practitioner',
          id: practitionerId,
          identifier: [{
            system: 'https://doctor.ndhm.gov.in',
            value:   hipId,
          }],
          name: [{ text: process.env.HIP_PRACTITIONER_NAME || 'Infer EMR' }],
        },
      },
      {
        fullUrl: `urn:uuid:${encounterId}`,
        resource: {
          resourceType: 'Encounter',
          id: encounterId,
          status: 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
          type: [{ coding: [{ system: 'http://snomed.info/sct', code: '11429006', display: careContext.hi_type || 'Consultation' }] }],
          subject: { reference: `urn:uuid:${patientId}` },
          period: { start: periodStart, end: periodStart },
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

  // SEC-012: write PHI to a restricted subdirectory, delete synchronously after use
  const tmpDir = path.join(os.tmpdir(), 'fidelius-hip');
  fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  const tmpFile = path.join(tmpDir, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.txt`);
  fs.writeFileSync(tmpFile, [
    'e',                           // command must be first line when using -f
    plaintext,
    hipNonce.toString('base64'),   // sender nonce  (HIP)
    hiuNonceBase64,                // requester nonce (HIU)
    hipPrivBase64,                 // sender private key (HIP)
    hiuPubKeyBase64,               // requester public key (HIU) — raw 65-byte 04||X||Y
  ].join('\n'), { mode: 0o600 }); // owner-only read

  try {
    const raw = await _callFidelius(['-f', tmpFile]);
    const encryptedData = (JSON.parse(raw)).encryptedData ?? raw;
    logger.info('[ENCRYPT] fidelius-cli encrypt ok', { plaintextLen: plaintext.length, encLen: encryptedData.length });
    return {
      encryptedData,
      hipPublicKey: _buildSpki(hipPubBytes).toString('base64'),
      hipNonce:     hipNonce.toString('base64'),
    };
  } catch (err) {
    // R2-005: NEVER fall back to base64 — that is unencrypted PHI.
    logger.error('[ENCRYPT] fidelius-cli encrypt FAILED — aborting health data push', { error: err.message });
    throw new Error(`Fidelius encryption failed: ${err.message}`);
  } finally {
    // SEC-012: synchronous delete — guaranteed cleanup even on thrown errors
    try { fs.unlinkSync(tmpFile); } catch (e) {
      logger.error('CRITICAL: failed to delete fidelius PHI tmpfile', { tmpFile, error: e.message });
    }
  }
}

async function pushHealthData({ dataPushUrl, transactionId, careContexts, patient, keyMaterial }) {
  // SEC-010: no PHI, key material values, or dataPushUrl in logs
  logger.info('[PUSH] pushHealthData called', {
    transactionId,
    careContextCount: careContexts?.length,
    cryptoAlg: keyMaterial?.cryptoAlg,
    curve: keyMaterial?.curve,
    hasKeyValue: !!keyMaterial?.dhPublicKey?.keyValue,
    hasNonce: !!keyMaterial?.nonce,
  });
  const hiuNonce  = keyMaterial?.nonce ?? '';
  const hiuPubKey = keyMaterial?.dhPublicKey?.keyValue;

  let respondingKeyMaterial = null;
  const entries = await Promise.all(careContexts.map(async ctx => {
    const fhir = typeof ctx.fhir_content === 'string'
      ? ctx.fhir_content
      : buildFhirBundle(patient, ctx); // already returns JSON.stringify'd string

    // ABDM wire format requires MD5 checksum (spec §4.3.2)
    const checksum = crypto.createHash('md5').update(fhir).digest('hex');
    let content;

    if (hiuPubKey && hiuNonce) {
      const { encryptedData, hipPublicKey, hipNonce } = await encryptFhir(fhir, hiuPubKey, hiuNonce);
      content = encryptedData;
      if (hipPublicKey && hipNonce && !respondingKeyMaterial) {
        respondingKeyMaterial = {
          cryptoAlg: 'ECDH',
          curve: 'Curve25519',           // capital C — matches ABDM spec exactly
          dhPublicKey: {
            expiry: new Date(Date.now() + 3600_000).toISOString(),
            parameters: 'Curve25519/32ByteNonce',
            keyValue: hipPublicKey,       // SPKI DER with explicit BC25519 params
          },
          nonce: hipNonce,
        };
      }
    } else {
      // R3-003: ABDM M3 mandates encryption. No keyMaterial = reject, not base64.
      throw new Error('HIU keyMaterial missing — cannot push unencrypted health data per ABDM M3 spec');
    }

    return { content, media: 'application/fhir+json', checksum, careContextReference: ctx.reference_number };
  }));

  const pushBody = { pageNumber: 1, pageCount: 1, transactionId, entries };
  if (respondingKeyMaterial) pushBody.keyMaterial = respondingKeyMaterial;

  // SEC-010: never log encrypted health payload
  logger.info('HIP transfer payload ready', { transactionId, entryCount: entries.length, encrypted: !!respondingKeyMaterial });

  // R2-001: validate URL before calling (SSRF protection)
  validateDataPushUrl(dataPushUrl);

  // Small delay to ensure ABDM has registered the transaction before we push
  await new Promise(r => setTimeout(r, 3000));

  // Add gateway auth headers — ABDM dataPushUrl requires Bearer token + CM-ID
  const pushToken = await getToken();
  await axios.post(dataPushUrl, pushBody, {
    timeout: 30_000,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${pushToken}`,
      'X-CM-ID':       CM_ID,
      'X-HIP-ID':      HIP_ID,
      'REQUEST-ID':    uuid(),
      'TIMESTAMP':     new Date().toISOString(),
    },
  });
  logger.info('HIP health data pushed', { transactionId, entries: entries.length, encrypted: !!respondingKeyMaterial });
}

module.exports = { uuid, gwGet, gwPost, hiecmPost, sendDiscoverResult, sendLinkInitResult, sendLinkConfirmResult, sendHealthInfoOnRequest, pushHealthData, buildFhirBundle, sendShareProfileAck };
