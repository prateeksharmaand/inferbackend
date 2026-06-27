/**
 * ABDM-compliant patient identity resolution.
 *
 * Rule: ABHA Number is the permanent identity key. ABHA Address is mutable —
 * the same person can have multiple addresses over time (rahul@abdm,
 * rahul123@abdm, rahul-sharma@sbx all belong to one person).
 *
 * Lookup priority:
 *   1. abha_mappings.abha_number  ← strongest match
 *   2. abha_mappings.abha_address ← fallback
 *   3. emr_patients legacy columns ← backward compat for old records
 */

const logger = require('../utils/logger');

/**
 * Find existing patient by ABHA number (strongest identity).
 * Returns the emr_patients row or null.
 */
async function findByAbhaNumber(pool, abhaNumber) {
  if (!abhaNumber) return null;
  const { rows } = await pool.query(
    `SELECT p.id, p.clinic_id, p.name, p.mobile, p.dob, p.gender, p.abha_number, p.abha_address,
            p.created_at, p.updated_at, p.deleted_at, p.uhid
     FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     WHERE m.abha_number = $1 AND m.status = 'active' AND p.deleted_at IS NULL
     ORDER BY m.linked_at ASC LIMIT 1`,
    [abhaNumber]
  );
  if (rows.length) return rows[0];

  // Backward compat — old records stored directly on emr_patients
  const { rows: legacy } = await pool.query(
    `SELECT id, clinic_id, name, mobile, dob, gender, abha_number, abha_address, created_at, updated_at, deleted_at, uhid
     FROM emr_patients WHERE abha_number = $1 AND deleted_at IS NULL LIMIT 1`,
    [abhaNumber]
  );
  return legacy[0] ?? null;
}

/**
 * Find existing patient by ABHA address.
 * Use only when ABHA number is not available.
 */
async function findByAbhaAddress(pool, abhaAddress) {
  if (!abhaAddress) return null;
  const { rows } = await pool.query(
    `SELECT p.id, p.clinic_id, p.name, p.mobile, p.dob, p.gender, p.abha_number, p.abha_address,
            p.created_at, p.updated_at, p.deleted_at, p.uhid
     FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     WHERE m.abha_address = $1 AND m.status = 'active' AND p.deleted_at IS NULL
     ORDER BY m.linked_at ASC LIMIT 1`,
    [abhaAddress]
  );
  if (rows.length) return rows[0];

  // Backward compat
  const { rows: legacy } = await pool.query(
    `SELECT id, clinic_id, name, mobile, dob, gender, abha_number, abha_address, created_at, updated_at, deleted_at, uhid
     FROM emr_patients WHERE abha_address = $1 AND deleted_at IS NULL LIMIT 1`,
    [abhaAddress]
  );
  return legacy[0] ?? null;
}

/**
 * Find patient by either ABHA number (preferred) or address.
 * Returns { patient, matchedBy } or { patient: null }.
 */
async function findPatient(pool, { abhaNumber, abhaAddress }) {
  if (abhaNumber) {
    const patient = await findByAbhaNumber(pool, abhaNumber);
    if (patient) return { patient, matchedBy: 'abha_number' };
  }
  if (abhaAddress) {
    const patient = await findByAbhaAddress(pool, abhaAddress);
    if (patient) return { patient, matchedBy: 'abha_address' };
  }
  return { patient: null, matchedBy: null };
}

/**
 * Attach a new ABHA number/address to an existing patient.
 * Safe to call repeatedly — uses ON CONFLICT DO UPDATE.
 */
async function attachAbha(pool, patientId, { abhaNumber, abhaAddress, source = 'abdm' }) {
  if (!abhaNumber && !abhaAddress) return;

  // Check if a mapping already exists for this patient + abha_number
  const { rows: existing } = await pool.query(
    `SELECT id FROM abha_mappings WHERE patient_id = $1 AND abha_number IS NOT DISTINCT FROM $2 LIMIT 1`,
    [patientId, abhaNumber ?? null]
  );

  if (existing.length) {
    // Update existing row
    await pool.query(
      `UPDATE abha_mappings
       SET abha_address = COALESCE($1, abha_address), status = 'active', linked_at = NOW()
       WHERE id = $2`,
      [abhaAddress ?? null, existing[0].id]
    );
  } else {
    // Insert new mapping row (ignore if somehow already exists)
    await pool.query(
      `INSERT INTO abha_mappings (patient_id, abha_number, abha_address, status, source)
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT DO NOTHING`,
      [patientId, abhaNumber ?? null, abhaAddress ?? null, source]
    );
  }

  // Keep legacy columns in sync for backward compat
  await pool.query(
    `UPDATE emr_patients
     SET abha_number  = COALESCE($1, abha_number),
         abha_address = COALESCE($2, abha_address)
     WHERE id = $3`,
    [abhaNumber ?? null, abhaAddress ?? null, patientId]
  );

  logger.info('ABHA attached to patient', { patientId, hasNumber: !!abhaNumber, hasAddress: !!abhaAddress, source });
}

/**
 * Full resolution with 5-tier priority matching:
 *   1. ABHA Number (highest confidence)
 *   2. ABHA Address
 *   3. Mobile + DOB
 *   4. Mobile + Name
 *   5. Name + DOB + Gender (lowest confidence)
 *   6. Not found → create new patient + mapping
 *
 * Returns { patient, created, matchedBy, confidence, duplicateCandidates }
 */
async function resolveOrCreatePatient(pool, {
  abhaNumber, abhaAddress,
  name, mobile, gender, dob, clinicId,
  source = 'abdm',
}) {
  // Use comprehensive patient matching service
  const PatientMatchService = require('../services/patient-match.service');
  const matchResult = await PatientMatchService.findPatient(pool, {
    abhaNumber,
    abhaAddress,
    mobile,
    name,
    dob,
    gender,
    clinicId,
  });

  // If found with confidence, use existing patient
  if (matchResult.patient && matchResult.confidence > 0) {
    await attachAbha(pool, matchResult.patient.id, { abhaNumber, abhaAddress, source });
    // Overwrite demographic fields with Aadhaar-authoritative values when provided.
    // This ensures generateLinkToken always gets the exact gender/dob ABDM expects.
    await pool.query(
      `UPDATE emr_patients
       SET name   = COALESCE($1, name),
           mobile = COALESCE($2, mobile),
           gender = COALESCE($3, gender),
           dob    = COALESCE($4::date, dob)
       WHERE id = $5`,
      [name ?? null, mobile ?? null, gender ?? null, dob ?? null, matchResult.patient.id]
    );
    const { rows } = await pool.query('SELECT * FROM emr_patients WHERE id=$1', [matchResult.patient.id]);
    return {
      patient: rows[0],
      created: false,
      matchedBy: matchResult.matchedBy,
      confidence: matchResult.confidence,
      duplicateCandidates: [],
    };
  }

  // If multiple candidates (ambiguous match), flag for manual review
  if (matchResult.candidates && matchResult.candidates.length > 1) {
    logger.warn('Ambiguous patient match - multiple candidates found', {
      matchedBy: matchResult.matchedBy,
      candidateCount: matchResult.candidates.length,
      criteria: { mobile, name, dob, gender },
    });
    return {
      patient: null,
      created: false,
      matchedBy: matchResult.matchedBy,
      confidence: 0,
      duplicateCandidates: matchResult.candidates,
      message: `Found ${matchResult.candidates.length} similar patients. Please select or create new.`,
    };
  }

  // No match found - create new patient
  const { rows } = await pool.query(
    `INSERT INTO emr_patients (name, mobile, dob, gender, abha_number, abha_address, clinic_id, deleted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULL) RETURNING *`,
    [name, mobile ?? null, dob ?? null, gender ?? null,
     abhaNumber ?? null, abhaAddress ?? null, clinicId ?? null]
  );
  const newPatient = rows[0];

  await attachAbha(pool, newPatient.id, { abhaNumber, abhaAddress, source });

  // Check for potential duplicates within 2 weeks (catch recent duplicate registration)
  const duplicates = await PatientMatchService.detectDuplicateCandidates(
    pool,
    { mobile, name, dob },
    newPatient.id
  );

  if (duplicates.length > 0) {
    logger.warn('Potential duplicate patients detected after creation', {
      newPatientId: newPatient.id,
      duplicateCount: duplicates.length,
      reasons: duplicates.map(d => d.duplicate_reason),
    });
  }

  return {
    patient: newPatient,
    created: true,
    matchedBy: null,
    confidence: 0,
    duplicateCandidates: duplicates,
  };
}

module.exports = { findPatient, findByAbhaNumber, findByAbhaAddress, attachAbha, resolveOrCreatePatient };
