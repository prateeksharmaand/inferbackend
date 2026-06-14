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
    `SELECT p.* FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     WHERE m.abha_number = $1 AND m.status = 'active' AND p.deleted_at IS NULL
     ORDER BY m.linked_at ASC LIMIT 1`,
    [abhaNumber]
  );
  if (rows.length) return rows[0];

  // Backward compat — old records stored directly on emr_patients
  const { rows: legacy } = await pool.query(
    `SELECT * FROM emr_patients WHERE abha_number = $1 AND deleted_at IS NULL LIMIT 1`,
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
    `SELECT p.* FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     WHERE m.abha_address = $1 AND m.status = 'active' AND p.deleted_at IS NULL
     ORDER BY m.linked_at ASC LIMIT 1`,
    [abhaAddress]
  );
  if (rows.length) return rows[0];

  // Backward compat
  const { rows: legacy } = await pool.query(
    `SELECT * FROM emr_patients WHERE abha_address = $1 AND deleted_at IS NULL LIMIT 1`,
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
 * Full resolution:
 *   1. Search by ABHA number → found → attach new address if different → return patient
 *   2. Search by ABHA address → found → attach number → return patient
 *   3. Not found → create new patient + mapping
 *
 * Returns { patient, created, abhaAttached }
 */
async function resolveOrCreatePatient(pool, {
  abhaNumber, abhaAddress,
  name, mobile, gender, dob, clinicId,
  source = 'abdm',
}) {
  const { patient, matchedBy } = await findPatient(pool, { abhaNumber, abhaAddress });

  if (patient) {
    // Attach the new address/number if it differs from what's already stored
    await attachAbha(pool, patient.id, { abhaNumber, abhaAddress, source });
    const { rows } = await pool.query('SELECT * FROM emr_patients WHERE id=$1', [patient.id]);
    return { patient: rows[0], created: false, matchedBy };
  }

  // Create new patient with deleted_at = NULL (ensure not deleted)
  const { rows } = await pool.query(
    `INSERT INTO emr_patients (name, mobile, dob, gender, abha_number, abha_address, clinic_id, deleted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULL) RETURNING *`,
    [name, mobile ?? null, dob ?? null, gender ?? null,
     abhaNumber ?? null, abhaAddress ?? null, clinicId ?? null]
  );
  const newPatient = rows[0];

  await attachAbha(pool, newPatient.id, { abhaNumber, abhaAddress, source });

  return { patient: newPatient, created: true, matchedBy: null };
}

module.exports = { findPatient, findByAbhaNumber, findByAbhaAddress, attachAbha, resolveOrCreatePatient };
