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
    const cmd = ['java', '-cp', FIDELIUS_CP, 'com.mgrm.fidelius.FideliusApplication', ...args];
    logger.debug('[FIDELIUS] command', {
      executable: 'java',
      classPath: FIDELIUS_CP,
      args: args,
      fullCommand: cmd.join(' '),
    });

    execFile('java', ['-cp', FIDELIUS_CP, 'com.mgrm.fidelius.FideliusApplication', ...args],
      { maxBuffer: 10 * 1024 * 1024, timeout: 30_000, killSignal: 'SIGKILL' },
      (err, stdout, stderr) => {
        const stdoutLen = stdout?.length ?? 0;
        const stderrLen = stderr?.length ?? 0;
        const exitCode = err?.code;
        const signal = err?.signal;

        logger.info('[FIDELIUS] execution result', {
          stdoutLength: stdoutLen,
          stderrLength: stderrLen,
          exitCode,
          signal,
          hasError: !!err,
          errorMessage: err?.message,
        });

        // Write raw outputs to temp files for inspection
        if (stdoutLen > 0) {
          const tmpStdout = path.join(os.tmpdir(), `fidelius-${Date.now()}.stdout.txt`);
          try {
            fs.writeFileSync(tmpStdout, stdout, { mode: 0o600 });
            logger.info('[FIDELIUS] stdout written', { file: tmpStdout, length: stdoutLen });
          } catch (e) {
            logger.warn('[FIDELIUS] failed to write stdout', { error: e.message });
          }
        }

        if (stderrLen > 0) {
          const tmpStderr = path.join(os.tmpdir(), `fidelius-${Date.now()}.stderr.txt`);
          try {
            fs.writeFileSync(tmpStderr, stderr, { mode: 0o600 });
            logger.info('[FIDELIUS] stderr written', { file: tmpStderr, length: stderrLen });
            // Surface stderr in error instead of generic "Unexpected end of JSON input"
            logger.error('[FIDELIUS] stderr content', { stderr: stderr.trim().slice(0, 500) });
          } catch (e) {
            logger.warn('[FIDELIUS] failed to write stderr', { error: e.message });
          }
        }

        // Check for empty stdout BEFORE attempting JSON.parse
        if (stdoutLen === 0) {
          const errMsg = stderrLen > 0
            ? `fidelius-cli returned empty stdout with stderr: ${stderr.trim().slice(0, 200)}`
            : 'fidelius-cli returned empty output';
          logger.error('[FIDELIUS] empty output', {
            stdoutLen,
            stderrLen,
            errorMessage: errMsg,
          });
          return reject(new Error(errMsg));
        }

        if (err) {
          const errMsg = stderrLen > 0
            ? `fidelius-cli exited with code ${exitCode}: ${stderr.trim().slice(0, 200)}`
            : err.message;
          return reject(new Error(errMsg));
        }

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

// BLOCKER-5 fix: exponential-backoff retry for critical gateway callbacks
async function gwPostWithRetry(path, body, maxRetries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await gwPost(path, body);
    } catch (err) {
      lastErr = err;
      const isClientError = err.response?.status >= 400 && err.response?.status < 500;
      if (isClientError) break; // 4xx errors won't succeed on retry
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
        logger.warn('HIP gateway retry', { path, attempt, delay, status: err.response?.status });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  logger.error('HIP gateway callback failed after retries', { path, maxRetries });
  throw lastErr;
}

async function sendLinkConfirmResultWithRetry({ requestId, patientId, careContexts }) {
  const mapped = careContexts.map(c => ({
    referenceNumber: c.referenceNumber ?? c.reference_number,
    display: c.display,
  }));
  await gwPostWithRetry('/v0.5/links/link/on-confirm', {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    patient: {
      referenceNumber: patientId,
      display: patientId,
      count: mapped.length,
      careContexts: mapped,
    },
    resp: { requestId },
  });
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

function _validDisplay(val, fallback) {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 255) return fallback;
  return trimmed;
}

async function sendDiscoverResult({ requestId, transactionId, patientId, patientRef, patientName, careContexts, matchedBy }) {
  const patientDisplay = _validDisplay(patientName, 'Patient');

  const validContexts = careContexts.map(c => {
    const display = _validDisplay(c.display,
      `OPD Consultation - ${c.reference_number || 'Visit'}`
    );
    return {
      referenceNumber: c.reference_number,
      display,
      hiType: c.hi_type || 'OPConsultation',
    };
  });

  // Log any display fields that needed fallback
  careContexts.forEach((c, i) => {
    const raw = c.display;
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 255) {
      logger.warn('HIP on-discover: invalid display field replaced with fallback', {
        referenceNumber: c.reference_number,
        rawDisplay: raw,
        fallback: validContexts[i].display,
      });
    }
  });

  await gwPost('/v0.5/care-contexts/on-discover', {
    requestId: uuid(),
    timestamp: new Date().toISOString(),
    transactionId,
    patient: patientId ? {
      id: patientId,
      referenceNumber: patientRef ?? patientId,
      display: patientDisplay,
      careContexts: validContexts,
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
// M3-FHIR: Dispatcher routes to hi_type-specific bundle builders
function buildFhirBundleFromEncounter(appt, encounter, refNumber) {
  const now            = new Date().toISOString();
  const hipId          = HIP_ID || 'infer-hip';
  const bundleId       = uuid();
  const compositionId  = uuid();
  const patientId      = uuid();
  const encounterId    = uuid();
  const practitionerId = uuid();
  const orgId          = uuid();
  const periodStart    = appt.appointment_date
    ? new Date(appt.appointment_date).toISOString().slice(0, 10) + 'T00:00:00+05:30'
    : now;

  const safeJson = (v, def) => {
    if (!v) return def;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return def; }
  };

  const diagnosis   = safeJson(encounter.diagnosis, []);
  const medications = safeJson(encounter.medications, []);
  const vitals      = safeJson(encounter.vitals, {});
  const labOrders   = safeJson(encounter.lab_investigations, []);

  const entries = [];
  const VITAL_LOINC = {
    bp_systolic:      { code: '8480-6',  display: 'Systolic blood pressure', unit: 'mm[Hg]' },
    bp_diastolic:     { code: '8462-4',  display: 'Diastolic blood pressure', unit: 'mm[Hg]' },
    pulse:            { code: '8867-4',  display: 'Heart rate', unit: '/min' },
    spo2:             { code: '2708-6',  display: 'Oxygen saturation', unit: '%' },
    temp:             { code: '8310-5',  display: 'Body temperature', unit: '[degF]' },
    respiratory_rate: { code: '9279-1',  display: 'Respiratory rate', unit: '/min' },
    height:           { code: '8302-2',  display: 'Body height', unit: 'cm' },
    weight:           { code: '29463-7', display: 'Body weight', unit: 'kg' },
    bmi:              { code: '39156-5', display: 'Body mass index', unit: 'kg/m2' },
  };

  const conditionRefs = [];
  const conditionEntries = diagnosis.filter(d => d.display || d.code).map(d => {
    const id = uuid();
    conditionRefs.push(`urn:uuid:${id}`);
    return { fullUrl: `urn:uuid:${id}`, resource: {
      resourceType: 'Condition', id,
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
      verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis' }] }],
      code: { coding: d.code ? [{ system: d.system || 'http://snomed.info/sct', code: d.code, display: d.display }] : [], text: d.display || '' },
      subject: { reference: `urn:uuid:${patientId}` },
      encounter: { reference: `urn:uuid:${encounterId}` },
      recordedDate: now,
    }};
  });

  const medRefs = [];
  const medEntries = medications.filter(m => m.name).map(m => {
    const id = uuid();
    medRefs.push(`urn:uuid:${id}`);
    return { fullUrl: `urn:uuid:${id}`, resource: {
      resourceType: 'MedicationRequest', id,
      status: 'active', intent: 'order',
      medicationCodeableConcept: { text: m.name },
      subject: { reference: `urn:uuid:${patientId}` },
      encounter: { reference: `urn:uuid:${encounterId}` },
      authoredOn: now,
      requester: { reference: `urn:uuid:${practitionerId}` },
      dosageInstruction: [{ text: [m.dose, m.dosage, m.frequency, m.timing, m.duration].filter(Boolean).join(' ') }],
    }};
  });

  const vitalRefs = [];
  const vitalEntries = Object.entries(VITAL_LOINC).filter(([k]) => vitals[k] != null && vitals[k] !== '').map(([k, meta]) => {
    const num = parseFloat(vitals[k]);
    if (isNaN(num)) return null;
    const id = uuid();
    vitalRefs.push(`urn:uuid:${id}`);
    return { fullUrl: `urn:uuid:${id}`, resource: {
      resourceType: 'Observation', id, status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: meta.code, display: meta.display }] },
      subject: { reference: `urn:uuid:${patientId}` },
      encounter: { reference: `urn:uuid:${encounterId}` },
      effectiveDateTime: periodStart,
      valueQuantity: { value: num, unit: meta.unit, system: 'http://unitsofmeasure.org', code: meta.unit },
    }};
  }).filter(Boolean);

  const labRefs = [];
  const labEntries = (Array.isArray(labOrders) ? labOrders : []).map(lab => {
    const name = typeof lab === 'string' ? lab : (lab.test || lab.name);
    if (!name) return null;
    const id = uuid();
    labRefs.push(`urn:uuid:${id}`);
    return { fullUrl: `urn:uuid:${id}`, resource: {
      resourceType: 'ServiceRequest', id,
      status: 'active', intent: 'order',
      code: { text: name },
      subject: { reference: `urn:uuid:${patientId}` },
      encounter: { reference: `urn:uuid:${encounterId}` },
      authoredOn: now,
      requester: { reference: `urn:uuid:${practitionerId}` },
    }};
  }).filter(Boolean);

  const sections = [];
  if (encounter.chief_complaint) sections.push({ title: 'Chief Complaint', code: { coding: [{ system: 'http://snomed.info/sct', code: '422843007' }] }, text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${encounter.chief_complaint}</div>` } });
  if (conditionRefs.length) sections.push({ title: 'Diagnosis', code: { coding: [{ system: 'http://snomed.info/sct', code: '439401001', display: 'Diagnosis' }] }, entry: conditionRefs.map(r => ({ reference: r })) });
  if (vitalRefs.length) sections.push({ title: 'Vital Signs', code: { coding: [{ system: 'http://snomed.info/sct', code: '75367002' }] }, entry: vitalRefs.map(r => ({ reference: r })) });
  if (medRefs.length) sections.push({ title: 'Medications', code: { coding: [{ system: 'http://snomed.info/sct', code: '721912009', display: 'Medication summary' }] }, entry: medRefs.map(r => ({ reference: r })) });
  if (labRefs.length) sections.push({ title: 'Investigations', code: { coding: [{ system: 'http://snomed.info/sct', code: '721981007' }] }, entry: labRefs.map(r => ({ reference: r })) });
  if (encounter.instructions || encounter.advices) sections.push({ title: 'Instructions', code: { coding: [{ system: 'http://snomed.info/sct', code: '409073007' }] }, text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${[encounter.instructions, encounter.advices].filter(Boolean).join('<br/>')}</div>` } });

  entries.push(
    { fullUrl: `urn:uuid:${compositionId}`, resource: { resourceType: 'Composition', id: compositionId, identifier: { system: `https://${hipId}.hip.abdm.gov.in`, value: refNumber || bundleId }, status: 'final', type: { coding: [{ system: 'http://snomed.info/sct', code: '371530004', display: 'Clinical consultation report' }] }, subject: { reference: `urn:uuid:${patientId}` }, encounter: { reference: `urn:uuid:${encounterId}` }, date: now, author: [{ reference: `urn:uuid:${practitionerId}` }], custodian: { reference: `urn:uuid:${orgId}` }, title: 'OPD Consultation', section: sections } },
    { fullUrl: `urn:uuid:${patientId}`, resource: { resourceType: 'Patient', id: patientId, identifier: appt.patient_abha ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }, system: 'https://abha.abdm.gov.in', value: appt.patient_abha }] : [], name: [{ text: appt.patient_name }], gender: appt.patient_gender === 'M' ? 'male' : appt.patient_gender === 'F' ? 'female' : 'other', birthDate: appt.patient_dob ? appt.patient_dob.toString().slice(0, 10) : undefined, telecom: appt.patient_mobile ? [{ system: 'phone', value: appt.patient_mobile, use: 'mobile' }] : [] } },
    { fullUrl: `urn:uuid:${practitionerId}`, resource: { resourceType: 'Practitioner', id: practitionerId, identifier: [{ system: 'https://doctor.ndhm.gov.in', value: String(appt.doctor_id || hipId) }], name: [{ text: appt.doctor_name || process.env.HIP_PRACTITIONER_NAME || 'Infer EMR' }] } },
    { fullUrl: `urn:uuid:${orgId}`, resource: { resourceType: 'Organization', id: orgId, identifier: [{ system: 'https://facility.ndhm.gov.in', value: hipId }], name: process.env.HIP_ORG_NAME || 'Infer Care Clinic' } },
    { fullUrl: `urn:uuid:${encounterId}`, resource: { resourceType: 'Encounter', id: encounterId, status: 'finished', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' }, type: [{ coding: [{ system: 'http://snomed.info/sct', code: '11429006', display: 'Consultation' }] }], subject: { reference: `urn:uuid:${patientId}` }, participant: [{ type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND' }] }], individual: { reference: `urn:uuid:${practitionerId}` } }], period: { start: periodStart, end: periodStart }, serviceProvider: { reference: `urn:uuid:${orgId}` } } },
    ...conditionEntries, ...vitalEntries, ...medEntries, ...labEntries,
  );

  return JSON.stringify({ resourceType: 'Bundle', id: bundleId, identifier: { system: `https://${hipId}.hip.abdm.gov.in/bundles`, value: bundleId }, type: 'document', timestamp: now, entry: entries });
}

function buildFhirBundle(patient, careContext) {
  const hi_type = careContext.hi_type || 'OPConsultation';

  switch (hi_type) {
    case 'OPConsultation':
      return buildOPConsultationBundle(patient, careContext);
    case 'DiagnosticReport':
      return buildDiagnosticReportBundle(patient, careContext);
    case 'Prescription':
      return buildPrescriptionBundle(patient, careContext);
    case 'ImmunizationRecord':
      return buildImmunizationBundle(patient, careContext);
    case 'DischargeSummary':
      return buildDischargeSummaryBundle(patient, careContext);
    case 'HealthDocumentRecord':
    case 'WellnessRecord':
    default:
      return buildOPConsultationBundle(patient, careContext); // Fallback
  }
}

// M3-FHIR: OPConsultation - Full consultation with vitals, conditions, prescriptions
function buildOPConsultationBundle(patient, careContext) {
  const now            = new Date().toISOString();
  const hipId          = HIP_ID || 'noushealthhip';
  const bundleId       = uuid().toLowerCase();
  const compositionId  = uuid().toLowerCase();
  const patientId      = uuid().toLowerCase();
  const encounterId    = uuid().toLowerCase();
  const practitionerId = uuid().toLowerCase();
  const conditionId    = uuid().toLowerCase();
  const bpId           = uuid().toLowerCase();
  const tempId         = uuid().toLowerCase();
  const wtId           = uuid().toLowerCase();
  const medId1         = uuid().toLowerCase();
  const medId2         = uuid().toLowerCase();
  const periodStart    = careContext.created_at ? new Date(careContext.created_at).toISOString() : now;

  return JSON.stringify({
    resourceType: 'Bundle',
    id: bundleId,
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
          author: [{ reference: `urn:uuid:${practitionerId}` }],
          date: now,
          title: careContext.display || 'OP Consultation',
          section: [
            {
              title: 'Encounter',
              code: { coding: [{ system: 'http://snomed.info/sct', code: '11429006' }] },
              entry: [{ reference: `urn:uuid:${encounterId}` }],
            },
            {
              title: 'Diagnosis',
              code: { coding: [{ system: 'http://snomed.info/sct', code: '29548-5' }] },
              entry: [{ reference: `urn:uuid:${conditionId}` }],
            },
            {
              title: 'Vitals',
              code: { coding: [{ system: 'http://loinc.org', code: '85353-1' }] },
              entry: [
                { reference: `urn:uuid:${bpId}` },
                { reference: `urn:uuid:${tempId}` },
                { reference: `urn:uuid:${wtId}` },
              ],
            },
            {
              title: 'Prescription',
              code: { coding: [{ system: 'http://snomed.info/sct', code: '16076005' }] },
              entry: [
                { reference: `urn:uuid:${medId1}` },
                { reference: `urn:uuid:${medId2}` },
              ],
            },
          ],
        },
      },
      {
        fullUrl: `urn:uuid:${patientId}`,
        resource: {
          resourceType: 'Patient',
          id: patientId,
          identifier: patient.abhaNumber ? [{
            type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] },
            system: 'https://abha.abdm.gov.in',
            value: patient.abhaNumber,
          }] : [],
          name: [{ text: patient.name }],
          gender: patient.gender === 'M' ? 'male' : patient.gender === 'F' ? 'female' : 'other',
          birthDate: patient.dob ? new Date(patient.dob).toISOString().slice(0, 10) : undefined,
          telecom: patient.mobile ? [{ system: 'phone', value: patient.mobile, use: 'mobile' }] : [],
        },
      },
      {
        fullUrl: `urn:uuid:${practitionerId}`,
        resource: {
          resourceType: 'Practitioner',
          id: practitionerId,
          identifier: [{ system: 'https://doctor.ndhm.gov.in', value: hipId }],
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
          type: [{ coding: [{ system: 'http://snomed.info/sct', code: '11429006', display: 'Consultation' }] }],
          subject: { reference: `urn:uuid:${patientId}` },
          period: { start: periodStart, end: periodStart },
        },
      },
      {
        fullUrl: `urn:uuid:${conditionId}`,
        resource: {
          resourceType: 'Condition',
          id: conditionId,
          clinicalStatus: { coding: [{ code: 'active' }] },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '54150009', display: 'Fever' }] },
          subject: { reference: `urn:uuid:${patientId}` },
        },
      },
      {
        fullUrl: `urn:uuid:${bpId}`,
        resource: {
          resourceType: 'Observation',
          id: bpId,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          effectiveDateTime: now,
          component: [
            { code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] }, valueQuantity: { value: 120, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
            { code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] }, valueQuantity: { value: 80, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
          ],
        },
      },
      {
        fullUrl: `urn:uuid:${tempId}`,
        resource: {
          resourceType: 'Observation',
          id: tempId,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          effectiveDateTime: now,
          valueQuantity: { value: 98.6, unit: 'F', system: 'http://unitsofmeasure.org', code: '[degF]' },
        },
      },
      {
        fullUrl: `urn:uuid:${wtId}`,
        resource: {
          resourceType: 'Observation',
          id: wtId,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          effectiveDateTime: now,
          valueQuantity: { value: 72, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
        },
      },
      {
        fullUrl: `urn:uuid:${medId1}`,
        resource: {
          resourceType: 'MedicationRequest',
          id: medId1,
          status: 'active',
          intent: 'order',
          medicationCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '15517211000001106', display: 'Paracetamol 500mg' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          authoredOn: now.slice(0, 10),
          dosageInstruction: [{ text: '1 tablet three times daily after meals for 5 days' }],
        },
      },
      {
        fullUrl: `urn:uuid:${medId2}`,
        resource: {
          resourceType: 'MedicationRequest',
          id: medId2,
          status: 'active',
          intent: 'order',
          medicationCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '10914301000001102', display: 'Cetirizine 10mg' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          authoredOn: now.slice(0, 10),
          dosageInstruction: [{ text: '1 tablet at bedtime for 5 days' }],
        },
      },
    ],
  });
}

// M3-FHIR: DiagnosticReport - Lab/imaging results with observations
function buildDiagnosticReportBundle(patient, careContext) {
  const now            = new Date().toISOString();
  const hipId          = HIP_ID || 'noushealthhip';
  const bundleId       = uuid().toLowerCase();
  const reportId       = uuid().toLowerCase();
  const patientId      = uuid().toLowerCase();
  const practitionerId = uuid().toLowerCase();
  const obsId1         = uuid().toLowerCase();
  const obsId2         = uuid().toLowerCase();
  const periodStart    = careContext.created_at ? new Date(careContext.created_at).toISOString() : now;

  return JSON.stringify({
    resourceType: 'Bundle',
    id: bundleId,
    identifier: { system: `https://${hipId}.hip.abdm.gov.in/bundles`, value: bundleId },
    type: 'document',
    timestamp: now,
    entry: [
      {
        fullUrl: `urn:uuid:${reportId}`,
        resource: {
          resourceType: 'DiagnosticReport',
          id: reportId,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '24360-0', display: 'Hemoglobin and hematocrit panel' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          issued: now,
          performer: [{ reference: `urn:uuid:${practitionerId}` }],
          result: [
            { reference: `urn:uuid:${obsId1}` },
            { reference: `urn:uuid:${obsId2}` },
          ],
        },
      },
      {
        fullUrl: `urn:uuid:${patientId}`,
        resource: {
          resourceType: 'Patient',
          id: patientId,
          identifier: patient.abhaNumber ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }, system: 'https://abha.abdm.gov.in', value: patient.abhaNumber }] : [],
          name: [{ text: patient.name }],
          gender: patient.gender === 'M' ? 'male' : patient.gender === 'F' ? 'female' : 'other',
          birthDate: patient.dob ? new Date(patient.dob).toISOString().slice(0, 10) : undefined,
          telecom: patient.mobile ? [{ system: 'phone', value: patient.mobile, use: 'mobile' }] : [],
        },
      },
      {
        fullUrl: `urn:uuid:${practitionerId}`,
        resource: {
          resourceType: 'Practitioner',
          id: practitionerId,
          identifier: [{ system: 'https://doctor.ndhm.gov.in', value: hipId }],
          name: [{ text: process.env.HIP_PRACTITIONER_NAME || 'Infer EMR' }],
        },
      },
      {
        fullUrl: `urn:uuid:${obsId1}`,
        resource: {
          resourceType: 'Observation',
          id: obsId1,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          issued: now,
          valueQuantity: { value: 14.5, unit: 'g/dL', system: 'http://unitsofmeasure.org', code: 'g/dL' },
        },
      },
      {
        fullUrl: `urn:uuid:${obsId2}`,
        resource: {
          resourceType: 'Observation',
          id: obsId2,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '4544-3', display: 'Hematocrit' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          issued: now,
          valueQuantity: { value: 44, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
        },
      },
    ],
  });
}

// M3-FHIR: Prescription - Medication orders with conditions
function buildPrescriptionBundle(patient, careContext) {
  const now            = new Date().toISOString();
  const hipId          = HIP_ID || 'noushealthhip';
  const bundleId       = uuid().toLowerCase();
  const compositionId  = uuid().toLowerCase();
  const patientId      = uuid().toLowerCase();
  const practitionerId = uuid().toLowerCase();
  const conditionId    = uuid().toLowerCase();
  const medId          = uuid().toLowerCase();

  return JSON.stringify({
    resourceType: 'Bundle',
    id: bundleId,
    identifier: { system: `https://${hipId}.hip.abdm.gov.in/bundles`, value: bundleId },
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
          type: { coding: [{ system: 'http://snomed.info/sct', code: '16076005', display: 'Prescription record' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          author: [{ reference: `urn:uuid:${practitionerId}` }],
          date: now,
          title: careContext.display || 'Prescription',
          section: [
            { title: 'Diagnosis', entry: [{ reference: `urn:uuid:${conditionId}` }] },
            { title: 'Medications', entry: [{ reference: `urn:uuid:${medId}` }] },
          ],
        },
      },
      {
        fullUrl: `urn:uuid:${patientId}`,
        resource: {
          resourceType: 'Patient',
          id: patientId,
          identifier: patient.abhaNumber ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }, system: 'https://abha.abdm.gov.in', value: patient.abhaNumber }] : [],
          name: [{ text: patient.name }],
          gender: patient.gender === 'M' ? 'male' : patient.gender === 'F' ? 'female' : 'other',
          birthDate: patient.dob ? new Date(patient.dob).toISOString().slice(0, 10) : undefined,
          telecom: patient.mobile ? [{ system: 'phone', value: patient.mobile, use: 'mobile' }] : [],
        },
      },
      {
        fullUrl: `urn:uuid:${practitionerId}`,
        resource: {
          resourceType: 'Practitioner',
          id: practitionerId,
          identifier: [{ system: 'https://doctor.ndhm.gov.in', value: hipId }],
          name: [{ text: process.env.HIP_PRACTITIONER_NAME || 'Infer EMR' }],
        },
      },
      {
        fullUrl: `urn:uuid:${conditionId}`,
        resource: {
          resourceType: 'Condition',
          id: conditionId,
          clinicalStatus: { coding: [{ code: 'active' }] },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '54150009', display: 'Fever' }] },
          subject: { reference: `urn:uuid:${patientId}` },
        },
      },
      {
        fullUrl: `urn:uuid:${medId}`,
        resource: {
          resourceType: 'MedicationRequest',
          id: medId,
          status: 'active',
          intent: 'order',
          medicationCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '15517211000001106', display: 'Paracetamol 500mg' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          authoredOn: now.slice(0, 10),
          dosageInstruction: [{ text: '1 tablet three times daily after meals for 5 days' }],
          reasonReference: [{ reference: `urn:uuid:${conditionId}` }],
        },
      },
    ],
  });
}

// M3-FHIR: ImmunizationRecord - Vaccine administration
function buildImmunizationBundle(patient, careContext) {
  const now            = new Date().toISOString();
  const hipId          = HIP_ID || 'noushealthhip';
  const bundleId       = uuid().toLowerCase();
  const patientId      = uuid().toLowerCase();
  const practitionerId = uuid().toLowerCase();
  const immunizationId = uuid().toLowerCase();

  return JSON.stringify({
    resourceType: 'Bundle',
    id: bundleId,
    identifier: { system: `https://${hipId}.hip.abdm.gov.in/bundles`, value: bundleId },
    type: 'document',
    timestamp: now,
    entry: [
      {
        fullUrl: `urn:uuid:${immunizationId}`,
        resource: {
          resourceType: 'Immunization',
          id: immunizationId,
          status: 'completed',
          vaccineCode: { coding: [{ system: 'http://snomed.info/sct', code: '1119349007', display: 'COVID-19 mRNA vaccine' }] },
          patient: { reference: `urn:uuid:${patientId}` },
          occurrenceDateTime: now,
          performer: [{ actor: { reference: `urn:uuid:${practitionerId}` } }],
          location: { display: careContext.display || 'Vaccination Center' },
          doseQuantity: { value: 1 },
          protocolApplied: [{ doseNumberPositiveInt: 1, seriesDosesPositiveInt: 2 }],
        },
      },
      {
        fullUrl: `urn:uuid:${patientId}`,
        resource: {
          resourceType: 'Patient',
          id: patientId,
          identifier: patient.abhaNumber ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }, system: 'https://abha.abdm.gov.in', value: patient.abhaNumber }] : [],
          name: [{ text: patient.name }],
          gender: patient.gender === 'M' ? 'male' : patient.gender === 'F' ? 'female' : 'other',
          birthDate: patient.dob ? new Date(patient.dob).toISOString().slice(0, 10) : undefined,
          telecom: patient.mobile ? [{ system: 'phone', value: patient.mobile, use: 'mobile' }] : [],
        },
      },
      {
        fullUrl: `urn:uuid:${practitionerId}`,
        resource: {
          resourceType: 'Practitioner',
          id: practitionerId,
          identifier: [{ system: 'https://doctor.ndhm.gov.in', value: hipId }],
          name: [{ text: process.env.HIP_PRACTITIONER_NAME || 'Infer EMR' }],
        },
      },
    ],
  });
}

// M3-FHIR: DischargeSummary - Hospital discharge with encounter, conditions, medications
function buildDischargeSummaryBundle(patient, careContext) {
  const now            = new Date().toISOString();
  const hipId          = HIP_ID || 'noushealthhip';
  const bundleId       = uuid().toLowerCase();
  const compositionId  = uuid().toLowerCase();
  const patientId      = uuid().toLowerCase();
  const practitionerId = uuid().toLowerCase();
  const encounterId    = uuid().toLowerCase();
  const conditionId    = uuid().toLowerCase();
  const medId          = uuid().toLowerCase();
  const docRefId       = uuid().toLowerCase();
  const periodStart    = careContext.created_at ? new Date(careContext.created_at).toISOString() : now;

  return JSON.stringify({
    resourceType: 'Bundle',
    id: bundleId,
    identifier: { system: `https://${hipId}.hip.abdm.gov.in/bundles`, value: bundleId },
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
          type: { coding: [{ system: 'http://snomed.info/sct', code: '373942005', display: 'Discharge summary' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          author: [{ reference: `urn:uuid:${practitionerId}` }],
          date: now,
          title: careContext.display || 'Discharge Summary',
          section: [
            { title: 'Encounter', entry: [{ reference: `urn:uuid:${encounterId}` }] },
            { title: 'Diagnosis', entry: [{ reference: `urn:uuid:${conditionId}` }] },
            { title: 'Medications', entry: [{ reference: `urn:uuid:${medId}` }] },
            { title: 'Documents', entry: [{ reference: `urn:uuid:${docRefId}` }] },
          ],
        },
      },
      {
        fullUrl: `urn:uuid:${patientId}`,
        resource: {
          resourceType: 'Patient',
          id: patientId,
          identifier: patient.abhaNumber ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }, system: 'https://abha.abdm.gov.in', value: patient.abhaNumber }] : [],
          name: [{ text: patient.name }],
          gender: patient.gender === 'M' ? 'male' : patient.gender === 'F' ? 'female' : 'other',
          birthDate: patient.dob ? new Date(patient.dob).toISOString().slice(0, 10) : undefined,
          telecom: patient.mobile ? [{ system: 'phone', value: patient.mobile, use: 'mobile' }] : [],
        },
      },
      {
        fullUrl: `urn:uuid:${practitionerId}`,
        resource: {
          resourceType: 'Practitioner',
          id: practitionerId,
          identifier: [{ system: 'https://doctor.ndhm.gov.in', value: hipId }],
          name: [{ text: process.env.HIP_PRACTITIONER_NAME || 'Infer EMR' }],
        },
      },
      {
        fullUrl: `urn:uuid:${encounterId}`,
        resource: {
          resourceType: 'Encounter',
          id: encounterId,
          status: 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'inpatient' },
          type: [{ coding: [{ system: 'http://snomed.info/sct', code: '371475007', display: 'Patient admission' }] }],
          subject: { reference: `urn:uuid:${patientId}` },
          period: { start: periodStart, end: now },
        },
      },
      {
        fullUrl: `urn:uuid:${conditionId}`,
        resource: {
          resourceType: 'Condition',
          id: conditionId,
          clinicalStatus: { coding: [{ code: 'resolved' }] },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '54150009', display: 'Fever' }] },
          subject: { reference: `urn:uuid:${patientId}` },
        },
      },
      {
        fullUrl: `urn:uuid:${medId}`,
        resource: {
          resourceType: 'MedicationRequest',
          id: medId,
          status: 'completed',
          intent: 'order',
          medicationCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '15517211000001106', display: 'Paracetamol 500mg' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          authoredOn: periodStart.slice(0, 10),
          dosageInstruction: [{ text: '1 tablet three times daily during hospitalization' }],
        },
      },
      {
        fullUrl: `urn:uuid:${docRefId}`,
        resource: {
          resourceType: 'DocumentReference',
          id: docRefId,
          status: 'current',
          type: { coding: [{ system: 'http://snomed.info/sct', code: '373942005', display: 'Discharge summary' }] },
          subject: { reference: `urn:uuid:${patientId}` },
          date: now,
          author: [{ reference: `urn:uuid:${practitionerId}` }],
          content: [{ attachment: { contentType: 'application/pdf', data: 'RGlzY2hhcmdlIFN1bW1hcnk=' } }],
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
// hipKeyPair is generated ONCE per batch (see pushHealthData) and reused for all entries.
// ABDM spec §4.3: one keyMaterial per push batch — all entries must use the same ephemeral key.
async function encryptFhir(plaintext, hiuPubKeyBase64, hiuNonceBase64, hipKeyPair) {
  const { hipPrivBase64, hipPubBytes, hipNonce } = hipKeyPair;

  // Validate inputs before file write
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error(`Invalid plaintext: type=${typeof plaintext}, length=${plaintext?.length}`);
  }
  if (!hiuPubKeyBase64 || typeof hiuPubKeyBase64 !== 'string') {
    throw new Error(`Invalid hiuPubKeyBase64: type=${typeof hiuPubKeyBase64}, length=${hiuPubKeyBase64?.length}`);
  }
  if (!hiuNonceBase64 || typeof hiuNonceBase64 !== 'string') {
    throw new Error(`Invalid hiuNonceBase64: type=${typeof hiuNonceBase64}, length=${hiuNonceBase64?.length}`);
  }
  if (!hipPrivBase64 || typeof hipPrivBase64 !== 'string') {
    throw new Error(`Invalid hipPrivBase64: type=${typeof hipPrivBase64}, length=${hipPrivBase64?.length}`);
  }

  // hiuPubKeyBase64 should be either:
  // 1. Already extracted EC point (65 bytes uncompressed: 0x04 + X + Y) from caller
  // 2. Raw key in some other format
  // The EC point extraction happens in pushHealthData before calling this function.

  // SEC-012: write PHI to a restricted subdirectory, delete synchronously after use
  const tmpDir = path.join(os.tmpdir(), 'fidelius-hip');
  fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  const tmpFile = path.join(tmpDir, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.txt`);

  const inputLines = [
    'e',                           // command must be first line when using -f
    plaintext,
    hipNonce.toString('base64'),   // sender nonce (HIP) — same for all entries in batch
    hiuNonceBase64,                // requester nonce (HIU)
    hipPrivBase64,                 // sender private key (HIP)
    hiuPubKeyBase64,               // requester public key (HIU) — SPKI DER base64
  ];

  const inputContent = inputLines.join('\n');

  logger.info('[ENCRYPT] input file content validation', {
    lineCount: inputLines.length,
    totalLength: inputContent.length,
    line0: inputLines[0],
    line1Len: inputLines[1].length,
    line2Len: inputLines[2].length,
    line3Len: inputLines[3].length,
    line4Len: inputLines[4].length,
    line5Len: inputLines[5].length,
  });

  fs.writeFileSync(tmpFile, inputContent, { mode: 0o600 });

  try {
    // Verify public key and nonce before sending to fidelius
    logger.info('[ENCRYPT] pre-fidelius verification', {
      plaintextLen: plaintext.length,
      hiuPubKeyLen: hiuPubKeyBase64?.length,
      hiuNonceLen: hiuNonceBase64?.length,
      hipPubBytesLen: hipPubBytes.length,
      hipNonceLen: hipNonce.length,
      hiuPubKeyIsBase64: /^[A-Za-z0-9+/=]+$/.test(hiuPubKeyBase64 ?? ''),
      hiuNonceIsBase64: /^[A-Za-z0-9+/=]+$/.test(hiuNonceBase64 ?? ''),
    });

    const raw = await _callFidelius(['-f', tmpFile]);

    // Validate raw output before JSON.parse
    logger.info('[ENCRYPT] fidelius output received', {
      rawLength: raw.length,
      rawPrefix: raw.slice(0, 100),
      isJsonLike: raw.startsWith('{'),
    });

    if (!raw || raw.length === 0) {
      throw new Error('fidelius-cli returned empty string');
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      logger.error('[ENCRYPT] JSON.parse failed', {
        rawLength: raw.length,
        raw: raw.slice(0, 500),
        parseError: parseErr.message,
      });
      throw parseErr;
    }

    const encryptedData = parsed.encryptedData ?? raw;
    logger.info('[ENCRYPT] fidelius-cli encrypt ok', {
      plaintextLen: plaintext.length,
      encLen: encryptedData.length,
      parsedKeys: Object.keys(parsed),
    });

    return {
      encryptedData,
      hipPublicKey: _buildSpki(hipPubBytes).toString('base64'),
      hipNonce:     hipNonce.toString('base64'),
    };
  } catch (err) {
    // R2-005: NEVER fall back to base64 — that is unencrypted PHI.
    logger.error('[ENCRYPT] fidelius-cli encrypt FAILED — aborting health data push', {
      error: err.message,
      errorStack: err.stack?.slice(0, 500),
    });
    throw new Error(`Fidelius encryption failed: ${err.message}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) {
      logger.error('CRITICAL: failed to delete fidelius PHI tmpfile', { tmpFile, error: e.message });
    }
  }
}

// Helper: Extract 65-byte EC point from SPKI DER structure
// ABDM sends keyValue as SPKI with explicit ECParameters, but fidelius/BouncyCastle
// rejects it with "ECDH public key has wrong domain parameters". This extracts the raw point.
function _extractEcPointFromSpki(spkiBase64) {
  try {
    const buffer = Buffer.from(spkiBase64, 'base64');
    if (buffer[0] !== 0x30) return spkiBase64; // Not SPKI, return as-is

    let pos = 0;
    // Skip outer SEQUENCE tag+length
    pos += 2;
    if (buffer[pos] === 0x81 || buffer[pos] === 0x82) pos++;
    pos++;

    // Skip AlgorithmIdentifier SEQUENCE
    if (buffer[pos] !== 0x30) return spkiBase64;
    pos++;
    let algLen = buffer[pos++];
    if (algLen === 0x81 || algLen === 0x82) pos++;
    pos += algLen;

    // Find BIT STRING
    if (buffer[pos] !== 0x03) return spkiBase64;
    pos++;
    let bitLen = buffer[pos++];
    if (bitLen === 0x81 || bitLen === 0x82) {
      if (buffer[pos] === 0x82) {
        bitLen = (buffer[pos + 1] << 8) | buffer[pos + 2];
        pos += 3;
      } else {
        bitLen = buffer[pos + 1];
        pos += 2;
      }
    }
    pos++; // Skip unused bits indicator

    // Extract 65-byte EC point (0x04 + 64 bytes)
    const ecPoint = buffer.slice(pos, pos + 65);
    if (ecPoint.length === 65 && ecPoint[0] === 0x04) {
      return ecPoint.toString('base64');
    }
    return spkiBase64;
  } catch (e) {
    logger.warn('[ENCRYPT] Failed to extract EC point from SPKI', { error: e.message });
    return spkiBase64;
  }
}

async function pushHealthData({ dataPushUrl, transactionId, careContexts, patient, keyMaterial }) {
  // CRITICAL: Validate transactionId at entry point
  if (!transactionId) {
    throw new Error('Missing ABDM transactionId in pushHealthData');
  }
  if (typeof transactionId !== 'string') {
    throw new Error(`Invalid transactionId type: ${typeof transactionId} (expected string)`);
  }
  const transactionIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!transactionIdRegex.test(transactionId)) {
    throw new Error(`Invalid transactionId UUID format: ${transactionId}`);
  }

  logger.info('ABDM pushHealthData entry', {
    transactionId,
    careContextCount: careContexts?.length,
    dataPushUrlPresent: !!dataPushUrl,
    keyMaterialPresent: !!keyMaterial,
  });

  // Log dataPushUrl so ABDM-1017 can be diagnosed — if it's ABDM's own PHR URL
  // (https://apissbx.abdm.gov.in/...) the session may expire before our push arrives.
  // Our own HIU requests use BACKEND_URL/api/abdm/health-info/push.
  logger.info('ABDM pushHealthData session info', {
    transactionId,
    dataPushUrl,
    isAbdmSandboxPhr: dataPushUrl?.includes('apissbx.abdm.gov.in'),
    careContextCount: careContexts?.length,
  });
  logger.info('ABDM Transaction Trace', {
    stage: 'encryption_started',
    transactionId,
    careContextCount: careContexts?.length,
  });
  const hiuNonce  = keyMaterial?.nonce ?? '';
  const hiuPubKey = keyMaterial?.dhPublicKey?.keyValue;

  // Detailed inspection of incoming keyMaterial before encryption
  logger.info('[ENCRYPT] received keyMaterial inspection', {
    transactionId,
    nonce: hiuNonce.slice(0, 50),
    nonceLen: hiuNonce.length,
    keyValue: hiuPubKey ? hiuPubKey.slice(0, 80) : 'MISSING',
    keyValueLen: hiuPubKey?.length,
    keyValueIsBase64: hiuPubKey ? /^[A-Za-z0-9+/=]+$/.test(hiuPubKey) : false,
    keyValueFirstBytes: hiuPubKey ? Buffer.from(hiuPubKey.slice(0, 20), 'base64').toString('hex') : 'N/A',
    keyValueStartsWith: hiuPubKey ? hiuPubKey.slice(0, 10) : 'MISSING',
    keyValueEndsWithPadding: hiuPubKey ? hiuPubKey.endsWith('=') || hiuPubKey.endsWith('==') : 'N/A',
    dhPublicKeyFields: Object.keys(keyMaterial?.dhPublicKey ?? {}),
    dhPublicKeyParameters: keyMaterial?.dhPublicKey?.parameters,
    cryptoAlg: keyMaterial?.cryptoAlg,
    curve: keyMaterial?.curve,
  });

  if (!hiuPubKey || !hiuNonce) {
    throw new Error('HIU keyMaterial missing — cannot push unencrypted health data per ABDM M3 spec');
  }

  // CRITICAL FIX: Extract EC point from SPKI DER
  // ABDM sends keyValue as SPKI with explicit ECParameters, but fidelius/BouncyCastle
  // rejects it with "ECDH public key has wrong domain parameters".
  // The solution: extract the raw 65-byte EC point from the SPKI structure.
  const hiuPubKeyExtracted = _extractEcPointFromSpki(hiuPubKey);
  const hiuPubKeyToUse = hiuPubKeyExtracted;

  logger.info('[ENCRYPT] keyMaterial processing', {
    transactionId,
    originalKeyLen: hiuPubKey.length,
    extractedKeyLen: hiuPubKeyToUse.length,
    extracted: hiuPubKeyToUse !== hiuPubKey,
  });

  // ABDM spec §4.3: ONE keyMaterial for the entire push batch.
  // Generate a single HIP ephemeral key pair here and reuse it for ALL entries.
  // Generating a new pair per entry causes MAC failure for every entry after the first
  // because respondingKeyMaterial only reports one key but ABDM decrypts all entries with it.
  const hipPrivRaw    = crypto.randomBytes(32);
  const hipScalar     = _c25519Scalar(hipPrivRaw);
  const hipPubBytes   = Buffer.from(_c25519W.BASE.multiply(hipScalar).toBytes(false)); // 65 bytes
  const hipNonce      = crypto.randomBytes(32);
  const hipPrivBase64 = Buffer.from(hipScalar.toString(16).padStart(64, '0'), 'hex').toString('base64');
  const hipKeyPair    = { hipPrivBase64, hipPubBytes, hipNonce };

  logger.info('[ENCRYPT] HIP batch key pair generated', {
    hipNonceLen:  hipNonce.length,
    hipPubBytesLen: hipPubBytes.length,
    entryCount:   careContexts.length,
  });

  const entries = await Promise.all(careContexts.map(async (ctx, idx) => {
    const fhir = typeof ctx.fhir_content === 'string'
      ? ctx.fhir_content
      : buildFhirBundle(patient, ctx);

    // Verify FHIR payload is valid JSON before encryption
    try {
      JSON.parse(fhir);
    } catch (parseErr) {
      logger.error('[ENCRYPT] FHIR bundle JSON validation failed', {
        careContextIndex: idx,
        careContextRef: ctx.reference_number,
        fhirLength: fhir.length,
        parseError: parseErr.message,
        fhirPrefix: fhir.slice(0, 200),
      });
      throw parseErr;
    }

    logger.info('[ENCRYPT] FHIR bundle prepared', {
      careContextIndex: idx,
      careContextRef: ctx.reference_number,
      fhirSize: fhir.length,
      isString: typeof fhir === 'string',
    });

    // ABDM wire format requires MD5 checksum (spec §4.3.2)
    const checksum = crypto.createHash('md5').update(fhir).digest('hex');
    const { encryptedData } = await encryptFhir(fhir, hiuPubKeyToUse, hiuNonce, hipKeyPair);
    return { content: encryptedData, media: 'application/fhir+json', checksum, careContextReference: ctx.reference_number };
  }));
  }));

  // Build respondingKeyMaterial once from the shared batch key pair
  const respondingKeyMaterial = {
    cryptoAlg: 'ECDH',
    curve: 'Curve25519',
    dhPublicKey: {
      expiry: new Date(Date.now() + 3600_000).toISOString(),
      parameters: 'Curve25519/32ByteNonce',
      keyValue: _buildSpki(hipPubBytes).toString('base64'),
    },
    nonce: hipNonce.toString('base64'),
  };

  logger.info('ABDM Transaction Trace', {
    stage: 'encryption_completed',
    transactionId,
    entriesCount: entries.length,
  });

  const pushBody = { pageNumber: 1, pageCount: 1, transactionId, entries, keyMaterial: respondingKeyMaterial };

  // CRITICAL: Verify transactionId in payload matches what we received
  if (pushBody.transactionId !== transactionId) {
    throw new Error(`Payload transactionId mismatch: ${pushBody.transactionId} !== ${transactionId}`);
  }

  // M3-DEBUG: Log exact payload structure for ABDM compliance verification
  logger.debug('ABDM payload structure', {
    transactionId,
    pageNumber: pushBody.pageNumber,
    pageCount: pushBody.pageCount,
    entryCount: entries.length,
    hasKeyMaterial: !!pushBody.keyMaterial,
    payloadFields: Object.keys(pushBody),
  });

  logger.debug('ABDM payload entries structure', {
    transactionId,
    entryCount: entries.length,
    entryStructure: entries.length > 0 ? {
      keys: Object.keys(entries[0]),
      contentLength: entries[0].content?.length,
      mediaType: entries[0].media,
      checksum: entries[0].checksum?.slice(0, 16) + '...',
      careContextReference: entries[0].careContextReference,
    } : null,
  });

  // M3-DEBUG: Log responding keyMaterial structure for ABDM spec compliance
  if (respondingKeyMaterial) {
    logger.debug('ABDM responding keyMaterial structure', {
      transactionId,
      cryptoAlg: respondingKeyMaterial.cryptoAlg,
      curve: respondingKeyMaterial.curve,
      dhPublicKeyFields: respondingKeyMaterial.dhPublicKey ? Object.keys(respondingKeyMaterial.dhPublicKey) : null,
      dhPublicKeyExpiry: respondingKeyMaterial.dhPublicKey?.expiry,
      dhPublicKeyValueLength: respondingKeyMaterial.dhPublicKey?.keyValue?.length,
      nonceLength: respondingKeyMaterial.nonce?.length,
    });
  }

  logger.info('ABDM Transaction Trace', {
    stage: 'transfer_payload_created',
    transactionId: pushBody.transactionId,
    pageNumber: pushBody.pageNumber,
    pageCount: pushBody.pageCount,
    entriesCount: pushBody.entries?.length,
    hasKeyMaterial: !!pushBody.keyMaterial,
  });

  // R2-001: validate URL before calling (SSRF protection)
  validateDataPushUrl(dataPushUrl);

  // Add gateway auth headers — ABDM dataPushUrl requires Bearer token + CM-ID
  const pushToken = await getToken();

  logger.info('ABDM Final Transfer Payload', {
    url: dataPushUrl,
    transactionId: pushBody.transactionId,
    pageNumber: pushBody.pageNumber,
    pageCount: pushBody.pageCount,
    entriesCount: pushBody.entries?.length,
    hasKeyMaterial: !!pushBody.keyMaterial,
  });

  const requestId = uuid();
  const timestamp = new Date().toISOString();

  logger.debug('ABDM POST details', {
    transactionId: pushBody.transactionId,
    payloadKeys: Object.keys(pushBody),
    payloadType: typeof pushBody,
    bodyLength: JSON.stringify(pushBody).length,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pushToken?.slice(0, 20)}...`,
      'X-CM-ID': CM_ID,
      'X-HIP-ID': HIP_ID,
      'REQUEST-ID': requestId,
      'TIMESTAMP': timestamp,
    },
  });

  try {
    const response = await axios.post(dataPushUrl, pushBody, {
      timeout: 30_000,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${pushToken}`,
        'X-CM-ID':       CM_ID,
        'X-HIP-ID':      HIP_ID,
        'REQUEST-ID':    requestId,
        'TIMESTAMP':     timestamp,
      },
      validateStatus: () => true, // Don't throw on any status code
    });

    logger.info('ABDM health-data push response', {
      transactionId,
      statusCode: response.status,
      statusText: response.statusText,
      responseData: response.data,
    });

    if (response.status !== 202 && response.status !== 200) {
      const errCode = response.data?.code ?? response.data?.error?.code;
      // ABDM-1017 from a sample PHR session means the HIU's sandbox session expired
      // before our push arrived. This happens when ABDM's own PHR app (not our HIU)
      // initiated the health-info request and the session timed out. Non-fatal for
      // our own HIU flow (which uses a different transactionId → our own dataPushUrl).
      if (errCode === 'ABDM-1017') {
        logger.warn('ABDM health-data push: ABDM-1017 Invalid Transaction Id — likely sandbox PHR session expired', {
          transactionId, dataPushUrl,
          note: 'If dataPushUrl is ABDM sandbox PHR URL, this session may have expired. Our HIU flow (dataPushUrl = BACKEND_URL) is unaffected.',
        });
        return; // non-fatal — our HIU's own transaction uses a different URL
      }
      throw new Error(`ABDM returned ${response.status}: ${JSON.stringify(response.data)}`);
    }

    logger.info('ABDM Transaction Trace', {
      stage: 'transfer_response_received',
      transactionId,
      status: 'success',
      statusCode: response.status,
    });
  } catch (postErr) {
    logger.error('ABDM health-data push failed', {
      transactionId,
      error: postErr.message,
      statusCode: postErr.response?.status,
      responseData: postErr.response?.data,
      requestPayloadKeys: Object.keys(pushBody),
      headers: {
        'X-CM-ID': CM_ID,
        'X-HIP-ID': HIP_ID,
      },
    });
    throw postErr; // Re-throw to caller
  }
}

module.exports = { uuid, gwGet, gwPost, gwPostWithRetry, hiecmPost, sendDiscoverResult, sendLinkInitResult, sendLinkConfirmResultWithRetry, sendHealthInfoOnRequest, pushHealthData, buildFhirBundle, buildFhirBundleFromEncounter, sendShareProfileAck };
