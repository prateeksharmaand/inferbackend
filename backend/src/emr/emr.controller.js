const crypto   = require('crypto');
const { pool } = require('../config/database');
const hip      = require('./hip.service');
const abdmSvc  = require('../services/abdm.service');
const logger   = require('../utils/logger');
const AbhaIdentity = require('./abha.identity');

// ── Patients ──────────────────────────────────────────────────────────────────

const listPatients = async (req, res) => {
  const { q } = req.query;
  const clinicId = req.emrUser?.clinic_id;
  // SEC-009: no SQL interpolation — uhidSub uses $3 parameter (passed below)
  const uhidSub = clinicId
    ? `(SELECT a.uhid FROM emr_appointments a
        WHERE a.patient_mobile = p.mobile AND a.uhid IS NOT NULL AND a.uhid != ''
          AND a.clinic_id = $3
        ORDER BY a.created_at DESC LIMIT 1) AS uhid`
    : `NULL AS uhid`;

  if (q && q.trim().length >= 2) {
    const term   = `%${q.trim().toLowerCase()}%`;
    const prefix = `${q.trim()}%`;
    const cid    = parseInt(clinicId, 10);

    // 1. Search the patient registry (name, mobile, ABHA, or UHID from appointments)
    // SEC-018: exclude soft-deleted patients
    const { rows: regRows } = await pool.query(
      `SELECT p.id, p.name, p.mobile, p.dob, p.gender, p.abha_number, p.abha_address,
              COUNT(DISTINCT c.id)::int AS context_count, ${uhidSub}
       FROM emr_patients p
       LEFT JOIN emr_care_contexts c ON c.patient_id = p.id
       WHERE p.deleted_at IS NULL
         AND (LOWER(p.name) LIKE $1 OR p.mobile LIKE $2 OR p.abha_number LIKE $2
          OR EXISTS (
            SELECT 1 FROM emr_appointments ax
            WHERE ax.patient_mobile = p.mobile
              AND LOWER(ax.uhid) LIKE $1
              AND ax.clinic_id = $3
          ))
       GROUP BY p.id ORDER BY p.name LIMIT 10`,
      [term, prefix, cid]
    );

    // 2. Search appointments for patients not yet in the registry
    const knownMobiles = new Set(regRows.map(r => r.mobile).filter(Boolean));
    const { rows: apptRows } = await pool.query(
      `SELECT NULL           AS id,
              patient_name   AS name,
              patient_mobile AS mobile,
              patient_dob    AS dob,
              patient_gender AS gender,
              patient_abha   AS abha_number,
              NULL           AS abha_address,
              0              AS context_count,
              MAX(uhid)      AS uhid
       FROM emr_appointments
       WHERE clinic_id = $3
         AND (LOWER(patient_name) LIKE $1
              OR patient_mobile   LIKE $2
              OR LOWER(uhid)      LIKE $1
              OR patient_abha     LIKE $2)
       GROUP BY patient_name, patient_mobile, patient_dob, patient_gender, patient_abha
       ORDER BY patient_name
       LIMIT 10`,
      [term, prefix, cid]
    );

    // Deduplicate in JS — avoids NULL-mobile issues with SQL ANY()
    const unique = apptRows.filter(r => !r.mobile || !knownMobiles.has(r.mobile));
    return res.json([...regRows, ...unique].slice(0, 10));
  }

  // Full-list path: uhidSub uses $1 here (not $3 — that's only in the search path)
  // SEC-018: exclude soft-deleted patients
  const fullUhid = clinicId
    ? `(SELECT a.uhid FROM emr_appointments a
        WHERE a.patient_mobile = p.mobile AND a.uhid IS NOT NULL AND a.uhid != ''
          AND a.clinic_id = $1
        ORDER BY a.created_at DESC LIMIT 1) AS uhid`
    : `NULL AS uhid`;

  const { rows } = await pool.query(
    `SELECT p.*, COUNT(c.id)::int AS context_count, ${fullUhid}
     FROM emr_patients p
     LEFT JOIN emr_care_contexts c ON c.patient_id = p.id
     WHERE p.deleted_at IS NULL
     GROUP BY p.id ORDER BY p.created_at DESC`,
    clinicId ? [parseInt(clinicId, 10)] : []
  );
  res.json(rows);
};

const createPatient = async (req, res) => {
  const { name, mobile, dob, gender, abha_number, abha_address } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  // Use ABHA resolution to prevent duplicate patients with same ABHA number
  if (abha_number || abha_address) {
    const result = await AbhaIdentity.resolveOrCreatePatient(pool, {
      abhaNumber: abha_number, abhaAddress: abha_address,
      name, mobile: mobile ?? null, gender: gender ?? 'M', dob: dob ?? null,
      clinicId: req.emrUser?.clinic_id, source: 'manual',
    });
    return res.status(result.created ? 201 : 200).json(result.patient);
  }

  // Fallback: create patient without ABHA (no dedup possible)
  const { rows } = await pool.query(
    `INSERT INTO emr_patients (name, mobile, dob, gender, deleted_at)
     VALUES ($1,$2,$3,$4,NULL) RETURNING *`,
    [name, mobile ?? null, dob ?? null, gender ?? 'M']
  );
  res.status(201).json(rows[0]);
};

const getPatient = async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM emr_patients WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
  const patient = rows[0];
  const { rows: ctxs } = await pool.query(
    `SELECT * FROM emr_care_contexts WHERE patient_id=$1 ORDER BY created_at DESC`,
    [patient.id]
  );
  const { rows: abhaRows } = await pool.query(
    `SELECT abha_number, abha_address, status, linked_at FROM abha_mappings WHERE patient_id=$1 AND status='active' ORDER BY linked_at ASC`,
    [patient.id]
  );
  res.json({ ...patient, care_contexts: ctxs, abha_mappings: abhaRows });
};

const updatePatient = async (req, res) => {
  const { name, mobile, dob, gender, abha_number, abha_address } = req.body;
  const { rows } = await pool.query(
    `UPDATE emr_patients SET name=COALESCE($1,name), mobile=COALESCE($2,mobile),
       dob=COALESCE($3,dob), gender=COALESCE($4,gender),
       abha_number=COALESCE($5,abha_number), abha_address=COALESCE($6,abha_address)
     WHERE id=$7 AND deleted_at IS NULL RETURNING *`,
    [name, mobile, dob, gender, abha_number, abha_address, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
  res.json(rows[0]);
};

const deletePatient = async (req, res) => {
  // SEC-018: soft delete — retain records per medical data retention requirements
  const { rowCount } = await pool.query(
    `UPDATE emr_patients SET deleted_at=NOW(), deleted_by_id=$1 WHERE id=$2 AND deleted_at IS NULL`,
    [req.emrUser.id, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Patient not found' });
  res.json({ message: 'Patient deactivated' });
};

// ── Care contexts ─────────────────────────────────────────────────────────────

const addCareContext = async (req, res) => {
  let { display, hi_type } = req.body;
  if (!display) return res.status(400).json({ error: 'display required' });

  // ABDM validation: display must be <= 255 chars, no special chars, alphanumeric + spaces/hyphens only
  display = display.trim().substring(0, 255).replace(/[^a-zA-Z0-9\s\-]/g, '');
  if (!display) return res.status(400).json({ error: 'display contains only invalid characters' });

  const refNum = `REF-${hip.uuid().slice(0, 8).toUpperCase()}`;

  // Create sample FHIR Bundle for this care context
  const transactionId = hip.uuid();
  const patientId = req.params.id;
  const now = new Date().toISOString();
  const docId = hip.uuid().slice(0, 8);
  const patData = (await pool.query('SELECT name, gender, dob FROM emr_patients WHERE id=$1 AND deleted_at IS NULL', [patientId])).rows[0];

  const patId = `pat-${docId}`;
  const practId = `doc-${docId}`;
  const encId = `enc-${docId}`;
  const condId = `cond-${docId}`;
  const bpId = `bp-${docId}`;
  const tempId = `temp-${docId}`;
  const wtId = `wt-${docId}`;
  const med1Id = `med-1-${docId}`;
  const med2Id = `med-2-${docId}`;

  const genderMap = { 'M': 'male', 'F': 'female', 'm': 'male', 'f': 'female' };
  const genderValue = genderMap[patData?.gender] || 'unknown';

  const bundleId = hip.uuid().toLowerCase();
  const compId = hip.uuid().slice(0, 8).toLowerCase();

  const fhirBundle = {
    resourceType: 'Bundle',
    id: bundleId,
    identifier: {
      system: `https://${process.env.ABDM_HIP_ID || 'infer'}.hip.abdm.gov.in/bundles`,
      value: bundleId,
    },
    type: 'document',
    timestamp: now,
    entry: [
      {
        fullUrl: `urn:uuid:${compId}`,
        resource: {
          resourceType: 'Composition',
          id: compId,
          status: 'final',
          type: {
            coding: [{
              system: 'http://snomed.info/sct',
              code: '371530004',
              display: 'Clinical consultation report',
            }],
          },
          subject: { reference: `urn:uuid:${patId}` },
          date: now,
          author: [{ reference: `urn:uuid:${practId}` }],
          title: display,
          section: [
            {
              title: 'Encounter',
              entry: [{ reference: `urn:uuid:${encId}` }],
            },
            {
              title: 'Diagnosis',
              entry: [{ reference: `urn:uuid:${condId}` }],
            },
            {
              title: 'Vitals',
              entry: [
                { reference: `urn:uuid:${bpId}` },
                { reference: `urn:uuid:${tempId}` },
                { reference: `urn:uuid:${wtId}` },
              ],
            },
            {
              title: 'Prescription',
              entry: [
                { reference: `urn:uuid:${med1Id}` },
                { reference: `urn:uuid:${med2Id}` },
              ],
            },
          ],
        },
      },
      {
        fullUrl: `urn:uuid:${patId}`,
        resource: {
          resourceType: 'Patient',
          id: patId,
          name: [{ text: patData?.name || 'Patient' }],
          gender: genderValue,
          birthDate: patData?.dob ? patData.dob.toISOString().split('T')[0] : undefined,
        },
      },
      {
        fullUrl: `urn:uuid:${practId}`,
        resource: {
          resourceType: 'Practitioner',
          id: practId,
          name: [{ text: 'Dr. Infer Care' }],
        },
      },
      {
        fullUrl: `urn:uuid:${encId}`,
        resource: {
          resourceType: 'Encounter',
          id: encId,
          status: 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
          type: [{
            coding: [{
              system: 'http://snomed.info/sct',
              code: '11429006',
              display: 'Consultation',
            }],
          }],
          subject: { reference: `urn:uuid:${patId}` },
          period: { start: now, end: new Date(Date.now() + 15 * 60_000).toISOString() },
        },
      },
      {
        fullUrl: `urn:uuid:${condId}`,
        resource: {
          resourceType: 'Condition',
          id: condId,
          clinicalStatus: { coding: [{ code: 'active' }] },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '54150009', display: 'Fever' }] },
          subject: { reference: `urn:uuid:${patId}` },
        },
      },
      {
        fullUrl: `urn:uuid:${bpId}`,
        resource: {
          resourceType: 'Observation',
          id: bpId,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure' }] },
          subject: { reference: `urn:uuid:${patId}` },
          effectiveDateTime: now,
          component: [
            {
              code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic' }] },
              valueQuantity: { value: 120, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
            },
            {
              code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic' }] },
              valueQuantity: { value: 80, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
            },
          ],
        },
      },
      {
        fullUrl: `urn:uuid:${tempId}`,
        resource: {
          resourceType: 'Observation',
          id: tempId,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' }] },
          subject: { reference: `urn:uuid:${patId}` },
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
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] },
          subject: { reference: `urn:uuid:${patId}` },
          effectiveDateTime: now,
          valueQuantity: { value: 72, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
        },
      },
      {
        fullUrl: `urn:uuid:${med1Id}`,
        resource: {
          resourceType: 'MedicationRequest',
          id: med1Id,
          status: 'active',
          intent: 'order',
          medicationCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '15517211000001106', display: 'Paracetamol 500 mg' }] },
          subject: { reference: `urn:uuid:${patId}` },
          authoredOn: now.split('T')[0],
          dosageInstruction: [{ text: '1 tablet three times daily after meals for 5 days' }],
        },
      },
      {
        fullUrl: `urn:uuid:${med2Id}`,
        resource: {
          resourceType: 'MedicationRequest',
          id: med2Id,
          status: 'active',
          intent: 'order',
          medicationCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '10914301000001102', display: 'Cetirizine 10 mg' }] },
          subject: { reference: `urn:uuid:${patId}` },
          authoredOn: now.split('T')[0],
          dosageInstruction: [{ text: '1 tablet at bedtime for 5 days' }],
        },
      },
    ],
  };

  // Insert care context WITH fhir_content so it's used instead of buildFhirBundle
  const { rows } = await pool.query(
    `INSERT INTO emr_care_contexts (patient_id, reference_number, display, hi_type, fhir_content)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [patientId, refNum, display, hi_type ?? 'OPConsultation', JSON.stringify(fhirBundle)]
  );
  const careCtx = rows[0];

  logger.info('Created sample FHIR bundle', { careContextId: careCtx.id, resourceCount: fhirBundle.entry.length });

  res.status(201).json({ ...careCtx, sampleBundleCreated: true, bundleEntries: fhirBundle.entry.length });
};

const deleteCareContext = async (req, res) => {
  await pool.query(`DELETE FROM emr_care_contexts WHERE id=$1 AND patient_id=$2`,
    [req.params.ctxId, req.params.id]);
  res.json({ message: 'Deleted' });
};

// ── Pending OTPs (EMR staff sees these to relay to patient) ──────────────────

const pendingOtps = async (req, res) => {
  // R2-002: explicit columns — otp/otp_hash NEVER returned to client
  const { rows } = await pool.query(
    `SELECT
       s.id, s.link_ref_number, s.transaction_id,
       s.care_contexts, s.otp_expires_at, s.status,
       s.otp_attempt_count, s.created_at,
       p.name AS patient_name, p.mobile AS patient_mobile
     FROM hip_link_sessions s
     LEFT JOIN emr_patients p ON p.id = s.patient_id
     WHERE s.status='pending_otp'
       AND s.otp_expires_at > NOW()
       AND (p.clinic_id = $1 OR p.clinic_id IS NULL)
     ORDER BY s.created_at DESC`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

// ── Health info requests log ──────────────────────────────────────────────────

const healthRequests = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM hip_health_requests ORDER BY created_at DESC LIMIT 50`
  );
  res.json(rows);
};

// ── Activity log (recent HIP events) ─────────────────────────────────────────

const activityLog = async (req, res) => {
  const [sessions, healthReqs] = await Promise.all([
    pool.query(`SELECT 'link' AS type, status, created_at, patient_id,
                  jsonb_array_length(care_contexts) AS ctx_count
                FROM hip_link_sessions ORDER BY created_at DESC LIMIT 20`),
    pool.query(`SELECT 'health_info' AS type, status, created_at, transaction_id
                FROM hip_health_requests ORDER BY created_at DESC LIMIT 20`),
  ]);
  const merged = [...sessions.rows, ...healthReqs.rows]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 30);
  res.json(merged);
};

// ── Consent management (EMR acting as HIU) ────────────────────────────────────

// All HI types supported by ABDM — must always send the full list per ABDM M3 guidance.
// Sending only one type (e.g. OPConsultation) causes "no facility available" error in PHR app
// because ABDM checks whether any linked care context's hiType is included in this list.
const ALL_HI_TYPES = [
  'OPConsultation', 'DiagnosticReport', 'DischargeSummary', 'Prescription',
  'ImmunizationRecord', 'HealthDocumentRecord', 'WellnessRecord',
];

const createConsentRequest = async (req, res) => {
  const { patientAbha, hipId, purpose, hiTypes, dateFrom, dateTo, requesterName, requesterReg } = req.body;
  if (!patientAbha || !hipId || !purpose)
    return res.status(400).json({ error: 'patientAbha, hipId, purpose required' });

  const clinicId = req.emrUser.clinic_id;
  const hiuId    = process.env.ABDM_HIP_ID || process.env.ABDM_CLIENT_ID;

  // Always send all HI types — ABDM disables grant button if the requested hiTypes
  // don't include the hiType of the patient's linked care context.
  const resolvedHiTypes = ALL_HI_TYPES;
  const dateRange = {
    from: dateFrom ?? new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
    to:   dateTo   ?? new Date().toISOString(),
  };

  logger.info('EMR consent request', { patientAbha, hipId, hiuId, purpose, hiTypes: resolvedHiTypes, dateRange });

  let result = {};
  try {
    result = await abdmSvc.createConsentRequest(
      patientAbha, hiuId, purpose, resolvedHiTypes,
      dateRange,
      { name: requesterName, identifierValue: requesterReg }
    );
    logger.info('EMR consent-requests/init accepted', { reqId: result.reqId });
  } catch (e) {
    logger.error('ABDM consent-requests/init failed', { message: e.message, response: e.response?.data });
  }

  // Use the reqId we sent to ABDM — this is what on-init's resp.requestId references.
  // ABDM's 202 response body is empty so result.consentRequest?.id is always undefined.
  const requestId = result.reqId ?? abdmSvc.uuid();

  await pool.query(
    `INSERT INTO emr_consent_requests
       (clinic_id, request_id, patient_abha, hip_id, hiu_id, purpose, hi_types)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (request_id) DO NOTHING`,
    [clinicId, requestId, patientAbha, hipId, hiuId, purpose, hiTypes]
  );

  res.json({ requestId, patientLinked: true, ...result });
};

const listConsentRequests = async (req, res) => {
  // Single source of truth: emr_consent_requests only
  const { rows } = await pool.query(
    `SELECT request_id, patient_abha, hip_id, hiu_id, purpose, hi_types, status, transaction_id, artefacts, created_at, updated_at
     FROM emr_consent_requests
     WHERE clinic_id=$1
     ORDER BY updated_at DESC
     LIMIT 100`,
    [req.emrUser.clinic_id]
  );
  // Force fresh data on every request — no caching for consent status
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.json(rows);
};

const respondConsent = async (req, res) => {
  const { requestId } = req.params;
  const { action } = req.body;  // 'GRANT' | 'DENY'
  if (!['GRANT', 'DENY'].includes(action))
    return res.status(400).json({ error: 'action must be GRANT or DENY' });

  const status = action === 'GRANT' ? 'GRANTED' : 'DENIED';

  const { rowCount } = await pool.query(
    `UPDATE emr_consent_requests SET status=$1, updated_at=NOW() WHERE request_id=$2 AND clinic_id=$3`,
    [status, requestId, req.emrUser.clinic_id]
  );
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Consent request not found' });
  }

  if (action === 'GRANT') {
    // Directly pull health data from EMR (sandbox shortcut — no ABDM gateway needed)
    await _pullHealthData(requestId, req.emrUser.clinic_id).catch(() => {});
  }

  res.json({ status });
};

// ── Direct health data pull (sandbox bypass — reads from EMR's own care contexts) ──
async function _pullHealthData(requestId, clinicId) {
  const { rows: [consent] } = await pool.query(
    'SELECT * FROM emr_consent_requests WHERE request_id=$1 AND clinic_id=$2',
    [requestId, clinicId]
  );
  if (!consent || consent.status !== 'GRANTED') return { count: 0, txnId: null };

  const patientAbha = consent.patient_abha;
  if (!patientAbha) return { count: 0, txnId: null };

  const { rows: ctxRows } = await pool.query(
    `SELECT ecc.*, ep.name AS patient_name, ep.gender, ep.dob, ep.mobile
     FROM emr_care_contexts ecc
     JOIN emr_patients ep ON ep.id = ecc.patient_id
     WHERE ep.abha_address=$1 OR ep.abha_number=$1
     ORDER BY ecc.created_at DESC`,
    [patientAbha]
  );
  if (!ctxRows.length) return { count: 0, txnId: null };

  const txnId = consent.transaction_id ?? abdmSvc.uuid();

  for (const ctx of ctxRows) {
    const patient     = { name: ctx.patient_name, gender: ctx.gender, dob: ctx.dob, mobile: ctx.mobile };
    const careContext = { display: ctx.display, hi_type: ctx.hi_type, created_at: ctx.created_at, reference_number: ctx.reference_number };
    const fhir = ctx.fhir_content
      ? (typeof ctx.fhir_content === 'string' ? ctx.fhir_content : JSON.stringify(ctx.fhir_content))
      : hip.buildFhirBundle(patient, careContext);
    const content  = Buffer.from(fhir).toString('base64');
    const checksum = crypto.createHash('sha256').update(fhir).digest('hex');

    await pool.query(
      `INSERT INTO health_records (transaction_id, care_context_reference, content, media, checksum)
       VALUES ($1,$2,$3,'application/fhir+json',$4)
       ON CONFLICT (transaction_id, care_context_reference)
       DO UPDATE SET content=$3, checksum=$4`,
      [txnId, ctx.reference_number, content, checksum]
    );
  }

  await pool.query(
    'UPDATE emr_consent_requests SET transaction_id=$1, updated_at=NOW() WHERE request_id=$2',
    [txnId, requestId]
  );
  return { count: ctxRows.length, txnId };
}

const pullConsentData = async (req, res) => {
  const { requestId } = req.params;
  const clinicId = req.emrUser.clinic_id;
  const result = await _pullHealthData(requestId, clinicId);
  if (!result.txnId) return res.status(400).json({ error: 'Consent not found, not GRANTED, or patient has no care contexts' });
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({ message: `Fetched ${result.count} health record(s) from EMR`, ...result });
};

const getConsentHealthRecords = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT hr.*
     FROM health_records hr
     WHERE hr.transaction_id IN (
       SELECT transaction_id FROM emr_consent_requests WHERE clinic_id=$1 AND transaction_id IS NOT NULL
     )
     ORDER BY hr.received_at DESC LIMIT 100`,
    [req.emrUser.clinic_id]
  );
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json(rows);
};

// ── ABHA QR Registration ──────────────────────────────────────────────────────

const registerAbhaPatient = async (req, res) => {
  const { abhaNumber, abhaAddress, name, gender, dob, phoneNumber, address, department, doctor, visitType } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  // 1. Resolve patient via abha_mappings — ABHA Number is the primary identity key
  const { patient: found, matchedBy } = await AbhaIdentity.findPatient(pool, { abhaNumber, abhaAddress });

  let patient;
  let isNew = false;

  if (found) {
    // Update demographics if richer data came in via QR
    const { rows: updated } = await pool.query(
      `UPDATE emr_patients
         SET abha_number=$1, abha_address=$2,
             name=COALESCE(NULLIF($3,''), name),
             gender=COALESCE(NULLIF($4,''), gender),
             dob=COALESCE($5::date, dob),
             mobile=COALESCE(NULLIF($6,''), mobile),
             address=COALESCE($7::jsonb, address),
             is_abdm_linked=true, abdm_linked_at=NOW()
       WHERE id=$8 RETURNING *`,
      [abhaNumber||null, abhaAddress||null, name, gender||null,
       dob||null, phoneNumber||null, address ? JSON.stringify(address) : null, found.id]
    );
    patient = updated[0];
    // Attach the new ABHA address to the existing patient's mappings
    await AbhaIdentity.attachAbha(pool, found.id, { abhaNumber, abhaAddress, source: 'qr' });
  } else {
    // Truly new patient — create with proper mapping
    const { rows: created } = await pool.query(
      `INSERT INTO emr_patients
         (name, mobile, dob, gender, abha_number, abha_address, address, is_abdm_linked, abdm_linked_at, clinic_id)
       VALUES ($1,$2,$3::date,$4,$5,$6,$7::jsonb,true,NOW(),$8) RETURNING *`,
      [name, phoneNumber||null, dob||null, gender||'M', abhaNumber||null, abhaAddress||null,
       address ? JSON.stringify(address) : null, req.emrUser?.clinic_id || null]
    );
    patient = created[0];
    isNew = true;
    await AbhaIdentity.attachAbha(pool, patient.id, { abhaNumber, abhaAddress, source: 'qr' });
  }

  // 2. Create care context if encounter details provided
  let careContext = null;
  if (department || doctor || visitType) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const refNum = `OPD-${today}-${String(patient.id).padStart(4,'0')}`;
    const display = `${visitType || 'OPD'} Visit – ${department || 'General'} – ${new Date().toLocaleDateString('en-IN')}`;
    try {
      const { rows: ctx } = await pool.query(
        `INSERT INTO emr_care_contexts (patient_id, reference_number, display, hi_type)
         VALUES ($1,$2,$3,'OPConsultation')
         ON CONFLICT (reference_number) DO UPDATE
           SET display=EXCLUDED.display
         RETURNING *`,
        [patient.id, refNum, display]
      );
      careContext = ctx[0];
    } catch (_) {}
  }

  // 3. Audit log
  logger.info('ABHA QR patient registered', {
    patientId: patient.id, abhaNumber, abhaAddress, isNew,
    careContextId: careContext?.id,
  });

  res.status(isNew ? 201 : 200).json({
    success: true,
    patientId: patient.id,
    patient,
    careContextId: careContext?.id ?? null,
    careContext,
    isNew,
  });
};

// ── M1: Patient profile shares (QR walk-in — SHARE_PATIENT_PROFILE_701) ──────

const listProfileShares = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM hip_profile_shares ORDER BY created_at DESC LIMIT 50`
  );
  res.json(rows);
};

const dismissProfileShare = async (req, res) => {
  await pool.query(
    `UPDATE hip_profile_shares SET status='dismissed' WHERE id=$1`,
    [req.params.id]
  );
  res.json({ ok: true });
};

const linkProfileShareToPatient = async (req, res) => {
  const { patientId } = req.body;
  const { rows } = await pool.query(
    `UPDATE hip_profile_shares SET status='linked', patient_id=$1 WHERE id=$2 RETURNING *`,
    [patientId, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Share not found' });
  // Also update the patient's ABHA fields from the share
  const s = rows[0];
  if (s.abha_number || s.abha_address) {
    await pool.query(
      `UPDATE emr_patients SET abha_number=COALESCE($1,abha_number), abha_address=COALESCE($2,abha_address) WHERE id=$3`,
      [s.abha_number, s.abha_address, patientId]
    );
  }
  res.json(rows[0]);
};

// ── M1: ABHA Creation & Verification (EMR patient workflow) ───────────────────

// Step 1 – send Aadhaar OTP (creates new ABHA)
const abhaCreateOtp = async (req, res) => {
  const { aadhaar } = req.body;
  const clean = (aadhaar || '').replace(/\D/g, '');
  if (clean.length !== 12) return res.status(400).json({ error: 'Valid 12-digit Aadhaar number required' });
  try {
    const result = await abdmSvc.generateAadhaarOtp(clean);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 2 – verify Aadhaar OTP → receive xToken + profile
const abhaCreateVerify = async (req, res) => {
  const { otp, txnId, mobile } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const result = await abdmSvc.verifyAadhaarOtp(otp, txnId, mobile || null);
    // result.tokens.token is the enrollment X-Token
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 3a – mobile OTP (if Aadhaar-linked mobile differs from patient mobile)
const abhaCreateMobileOtp = async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: 'mobile required' });
  try {
    const result = await abdmSvc.generateMobileLoginOtp(mobile);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 3b – verify mobile OTP
const abhaCreateMobileVerify = async (req, res) => {
  const { otp, txnId } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const result = await abdmSvc.verifyMobileLoginOtp(otp, txnId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 4 – ABHA address suggestions
const abhaGetSuggestions = async (req, res) => {
  const { xToken, txnId } = req.body;
  if (!xToken) return res.status(400).json({ error: 'xToken required' });
  if (!txnId) return res.status(400).json({ error: 'txnId required' });
  try {
    const result = await abdmSvc.getAbhaSuggestions(xToken, txnId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Step 5 – set ABHA address and save to patient record
const abhaSetAddress = async (req, res) => {
  const { xToken, abhaAddress, txnId } = req.body;
  if (!xToken || !abhaAddress) return res.status(400).json({ error: 'xToken and abhaAddress required' });
  try {
    const result = await abdmSvc.setAbhaAddress(xToken, abhaAddress, txnId);
    // Fetch full profile to get ABHA number
    const profile = await abdmSvc.getAbhaProfile(xToken);
    const abhaNum = profile.ABHANumber || profile.abhaNumber || null;
    if (abhaNum) {
      await pool.query(
        'UPDATE emr_patients SET abha_number=$1, abha_address=$2 WHERE id=$3',
        [abhaNum, abhaAddress, req.params.id]
      );
    }
    res.json({ ...result, profile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// ABHA card PNG → base64 JSON response
const abhaGetCard = async (req, res) => {
  const xToken = req.query.xToken || req.body?.xToken;
  if (!xToken) return res.status(400).json({ error: 'xToken required' });
  try {
    const imgBuf = await abdmSvc.getAbhaPngCard(xToken);
    res.json({ image: Buffer.from(imgBuf).toString('base64'), mimeType: 'image/png' });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Verify/link ABHA – Step 1: request login OTP by ABHA number or mobile
const abhaVerifyOtp = async (req, res) => {
  const { abhaId, mobile } = req.body;
  try {
    let result;
    if (abhaId) {
      result = await abdmSvc.loginRequestOtp(abhaId);
    } else if (mobile) {
      result = await abdmSvc.generateMobileLoginOtp(mobile);
    } else {
      return res.status(400).json({ error: 'abhaId or mobile required' });
    }
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Verify/link ABHA – Step 2: confirm OTP, fetch profile, link to patient
const abhaVerifyConfirm = async (req, res) => {
  const { otp, txnId, byMobile } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const verifyResult = byMobile
      ? await abdmSvc.verifyMobileLoginOtp(otp, txnId)
      : await abdmSvc.loginVerifyOtp(otp, txnId);

    // ABDM v3: Transfer token from verify cannot be used for /profile/account (ABDM-1094).
    // Profile is embedded in accounts[0] of the verify response.
    const profile = verifyResult.accounts?.[0] ?? null;
    if (!profile) return res.status(502).json({ error: 'No profile returned from ABDM verify' });

    const abhaNum  = profile.ABHANumber  || profile.abhaNumber  || null;
    const abhaAddr = profile.preferredAbhaAddress || profile.abhaAddress || null;

    if (abhaNum || abhaAddr) {
      await pool.query(
        'UPDATE emr_patients SET abha_number=COALESCE($1,abha_number), abha_address=COALESCE($2,abha_address) WHERE id=$3',
        [abhaNum, abhaAddr, req.params.id]
      );
    }
    // SEC-013: xToken is a session credential — never expose to client
    // Store in DB and return opaque session key if multi-step flow needs it
    res.json({ profile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Add Patient via Aadhaar – set ABHA address with ABDM before finalize
const abhaAadhaarSetAddress = async (req, res) => {
  const { xToken, abhaAddress, txnId } = req.body;
  if (!xToken || !abhaAddress) return res.status(400).json({ error: 'xToken and abhaAddress required' });
  const local = abhaAddress.includes('@') ? abhaAddress.split('@')[0] : abhaAddress;
  if (local.length < 8 || local.length > 18)
    return res.status(400).json({ error: 'ABHA address must be 8–18 characters' });
  if (!/^[a-zA-Z0-9]/.test(local) || !/[a-zA-Z0-9]$/.test(local))
    return res.status(400).json({ error: 'ABHA address must start and end with a letter or number' });
  if (!/^[a-zA-Z0-9._]+$/.test(local))
    return res.status(400).json({ error: 'Only letters, numbers, dot and underscore are allowed' });
  if ((local.match(/\./g) || []).length > 1) return res.status(400).json({ error: 'Only one dot (.) allowed' });
  if ((local.match(/_/g) || []).length > 1)  return res.status(400).json({ error: 'Only one underscore (_) allowed' });
  try {
    const result = await abdmSvc.setAbhaAddress(xToken, abhaAddress, txnId);
    res.json(result);
  } catch (err) {
    console.error('setAbhaAddress error', err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Add Patient via Aadhaar – finalize: use profile from byAadhaar response, create patient
const abhaAadhaarCreate = async (req, res) => {
  const { abdmProfile, abhaAddress } = req.body;
  if (!abdmProfile) return res.status(400).json({ error: 'abdmProfile required' });
  try {
    const p = abdmProfile;
    const abhaNum  = p.ABHANumber  || p.abhaNumber  || null;
    const abhaAddr = abhaAddress   || p.preferredAbhaAddress || p.abhaAddress || null;
    const name     = p.name || [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || null;
    const dob      = p.dateOfBirth || (p.yearOfBirth ? `${p.yearOfBirth}-${String(p.monthOfBirth||1).padStart(2,'0')}-${String(p.dayOfBirth||1).padStart(2,'0')}` : null);

    const result = await AbhaIdentity.resolveOrCreatePatient(pool, {
      abhaNumber: abhaNum, abhaAddress: abhaAddr,
      name, mobile: p.mobile || null, gender: p.gender || null, dob,
      clinicId: req.emrUser?.clinic_id, source: 'aadhaar',
    });
    res.status(result.created ? 201 : 200).json({ ...result, profile: abdmProfile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Add Patient via ABHA – Step 1: request OTP (no existing patient needed)
const abhaAddOtp = async (req, res) => {
  const { abhaNumber, mobile } = req.body;
  try {
    let result;
    if (abhaNumber)   result = await abdmSvc.loginRequestOtp(abhaNumber);
    else if (mobile)  result = await abdmSvc.generateMobileLoginOtp(mobile);
    else return res.status(400).json({ error: 'abhaNumber or mobile required' });
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// Add Patient via ABHA – Step 2: verify OTP, fetch profile, resolve/create patient
const abhaAddCreate = async (req, res) => {
  const { otp, txnId, byMobile } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const verifyResult = byMobile
      ? await abdmSvc.verifyMobileLoginOtp(otp, txnId)
      : await abdmSvc.loginVerifyOtp(otp, txnId);

    // ABDM v3 /login/verify returns full profile in accounts[0].
    // The Transfer token in the response cannot be used for /profile/account (ABDM-1094).
    const profile = verifyResult.accounts?.[0] ?? null;
    if (!profile) return res.status(502).json({ error: 'No profile returned from ABDM' });

    const abhaNum  = profile.ABHANumber  || profile.abhaNumber  || null;
    const abhaAddr = profile.preferredAbhaAddress || profile.abhaAddress || null;
    const name     = profile.name || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || null;
    // ABDM returns dob as DD-MM-YYYY; convert to YYYY-MM-DD for PostgreSQL
    const rawDob = profile.dob || profile.dateOfBirth || null;
    const dob = rawDob
      ? (rawDob.match(/^\d{2}-\d{2}-\d{4}$/)
          ? rawDob.split('-').reverse().join('-')   // DD-MM-YYYY → YYYY-MM-DD
          : rawDob)
      : (profile.yearOfBirth
          ? `${profile.yearOfBirth}-${String(profile.monthOfBirth||1).padStart(2,'0')}-${String(profile.dayOfBirth||1).padStart(2,'0')}`
          : null);

    const result = await AbhaIdentity.resolveOrCreatePatient(pool, {
      abhaNumber: abhaNum, abhaAddress: abhaAddr,
      name, mobile: profile.mobile || null, gender: profile.gender || null, dob,
      clinicId: req.emrUser?.clinic_id, source: 'abdm',
    });
    res.status(result.created ? 201 : 200).json({ ...result, profile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

// ── ABDM Bridge / callback-URL diagnostics ────────────────────────────────────

const abdmGetBridge = async (req, res) => {
  try {
    const info = await abdmSvc.getBridgeInfo();
    res.json({ clientId: process.env.ABDM_CLIENT_ID, backendUrl: process.env.BACKEND_URL, bridge: info });
  } catch (err) {
    res.status(err.response?.status || 502).json({ error: err.message, detail: err.response?.data });
  }
};

const abdmUpdateBridge = async (req, res) => {
  const callbackUrl = req.body.callbackUrl || process.env.BACKEND_URL;
  if (!callbackUrl) return res.status(400).json({ error: 'callbackUrl required (or set BACKEND_URL env)' });
  try {
    const result = await abdmSvc.updateBridgeUrl(callbackUrl);
    res.json({ updated: true, callbackUrl, result });
  } catch (err) {
    res.status(err.response?.status || 502).json({ error: err.message, detail: err.response?.data });
  }
};

// ── Login with ABHA ───────────────────────────────────────────────────────────

const abhaLoginRequestOtp = async (req, res) => {
  const { loginId } = req.body;
  if (!loginId) return res.status(400).json({ error: 'loginId required' });
  try {
    // loginRequestAbhaOtp handles all validation, scope, and otpSystem internally
    const result = await abdmSvc.loginRequestAbhaOtp(loginId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

const abhaLoginVerifyOtp = async (req, res) => {
  const { otp, txnId } = req.body;
  if (!otp || !txnId) return res.status(400).json({ error: 'otp and txnId required' });
  try {
    const verifyResult = await abdmSvc.loginVerifyOtp(otp, txnId);

    // ABDM v3 /login/verify already returns full profile in accounts[].
    // The token in the response is a short-lived Transfer token NOT suitable
    // for /profile/account — using it causes ABDM-1094 "X-token expired".
    // Extract profile directly from the verify response instead.
    const account = verifyResult.accounts?.[0] ?? null;
    let profile = null;
    if (account) {
      profile = {
        name:                 account.name,
        ABHANumber:           account.ABHANumber,
        preferredAbhaAddress: account.preferredAbhaAddress,
        mobile:               account.mobile,
        dob:                  account.dob,
        gender:               account.gender,
        profilePhoto:         account.profilePhoto,
        kycVerified:          account.kycVerified,
        status:               account.status,
      };
      logger.info('ABHA login verified', {
        abhaNumber: account.ABHANumber,
        kycVerified: account.kycVerified,
        status: account.status,
      });
    } else {
      logger.warn('ABHA login verify: no accounts in response', {
        keys: Object.keys(verifyResult || {}),
      });
    }

    // SEC-013: xToken never returned to client
    res.json({ profile });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

const abhaLoginUpdateMobile = async (req, res) => {
  const { xToken, mobile } = req.body;
  if (!xToken || !mobile) return res.status(400).json({ error: 'xToken and mobile required' });
  try {
    const result = await abdmSvc.updateAbhaProfileMobile(xToken, mobile);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

const abhaLoginLinkPatient = async (req, res) => {
  const { profile } = req.body;
  if (!profile) return res.status(400).json({ error: 'profile required' });
  try {
    const abhaNum  = profile.ABHANumber || profile.abhaNumber || null;
    const abhaAddr = profile.preferredAbhaAddress || profile.abhaAddress || null;
    const name     = profile.name || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || null;
    const mobile   = profile.mobile || null;
    const rawDob2  = profile.dateOfBirth || profile.dob || null;
    const dob      = rawDob2
      ? (rawDob2.match(/^\d{2}-\d{2}-\d{4}$/) ? rawDob2.split('-').reverse().join('-') : rawDob2)
      : (profile.yearOfBirth ? `${profile.yearOfBirth}-${String(profile.monthOfBirth||1).padStart(2,'0')}-${String(profile.dayOfBirth||1).padStart(2,'0')}` : null);

    const result = await AbhaIdentity.resolveOrCreatePatient(pool, {
      abhaNumber: abhaNum, abhaAddress: abhaAddr,
      name, mobile, gender: profile.gender || null, dob,
      clinicId: req.emrUser?.clinic_id, source: 'login',
    });

    const mobileMismatch = !!(mobile && result.patient.mobile && mobile !== result.patient.mobile);
    res.status(result.created ? 201 : 200).json({ ...result, mobileMismatch });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
};

module.exports = {
  listPatients, createPatient, getPatient, updatePatient, deletePatient, registerAbhaPatient,
  addCareContext, deleteCareContext,
  pendingOtps, healthRequests, activityLog,
  createConsentRequest, listConsentRequests, respondConsent, pullConsentData, getConsentHealthRecords,
  abhaCreateOtp, abhaCreateVerify, abhaCreateMobileOtp, abhaCreateMobileVerify,
  abhaGetSuggestions, abhaSetAddress, abhaGetCard,
  abhaVerifyOtp, abhaVerifyConfirm,
  abhaAadhaarSetAddress, abhaAadhaarCreate,
  abhaAddOtp, abhaAddCreate,
  abdmGetBridge, abdmUpdateBridge,
  abhaLoginRequestOtp, abhaLoginVerifyOtp, abhaLoginUpdateMobile, abhaLoginLinkPatient,
  listProfileShares, dismissProfileShare, linkProfileShareToPatient,
};
