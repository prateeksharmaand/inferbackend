/**
 * Patient Matching Service v2.0 — Redesigned for Safety
 *
 * 4-Tier matching strategy:
 *   Level 1: ABHA Number/Address (100% confidence) — GLOBAL search
 *   Level 2: Mobile + DOB + Name (99% confidence) — CLINIC-SCOPED, all three required
 *   Level 3: Mobile + Name (95% confidence) — CLINIC-SCOPED, single match only
 *   Level 4: Manual Review — Ambiguous matches returned to UI
 *
 * Critical Principle: Patient Safety > Duplicate Prevention
 * - A duplicate patient is acceptable
 * - A wrong patient match is NOT acceptable
 */

const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone-utils');

/**
 * Find or create patient with 4-tier matching strategy
 *
 * @param {Pool} pool - Database connection pool
 * @param {Object} criteria - {
 *   abhaNumber,      // ABDM national identifier (optional)
 *   abhaAddress,     // ABDM address (optional)
 *   mobile,          // Patient phone number (optional)
 *   name,            // Patient name (required for matching)
 *   dob,             // Date of birth (optional)
 *   gender,          // M/F/O (optional)
 *   clinicId,        // For clinic-scoped matching (required for demographic matching)
 *   source           // 'manual', 'abdm', 'appointment', 'qr', 'consent' (for audit)
 * }
 *
 * @returns {Promise<Object>} - {
 *   patient: {id, name, mobile, dob, gender, ...},
 *   created: boolean,
 *   matchedBy: 'abha_number' | 'abha_address' | 'mobile_dob_name' | 'mobile_name' | null,
 *   confidence: 0-100,
 *   requiresManualReview: boolean,
 *   candidates: [],  // If multiple matches
 *   message: string  // Human-readable explanation
 * }
 */
async function findOrCreatePatient(pool, {
  abhaNumber,
  abhaAddress,
  mobile,
  name,
  dob,
  gender,
  clinicId,
  source = 'manual'
}) {
  // Normalize phone for consistent matching
  const normalizedMobile = normalizePhone(mobile);

  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 1: ABHA Number (100% confidence, GLOBAL)
  // ────────────────────────────────────────────────────────────────────────
  if (abhaNumber) {
    logger.debug('[Patient Match L1] Checking ABHA Number', { abhaNumber });
    const abhaMatch = await _findByAbhaNumber(pool, abhaNumber);
    if (abhaMatch) {
      logger.info('[Patient Match] ✓ Level 1 ABHA Number match (100% confidence)', {
        patientId: abhaMatch.id,
        abhaNumber: abhaNumber.slice(0, -5) + '*****' // mask for logging
      });

      // Update demographics with newly provided data
      if (name || mobile || dob || gender) {
        await _updatePatientDemographics(pool, abhaMatch.id, {
          name,
          mobile,
          dob,
          gender
        });
      }

      // Link patient to clinic if provided
      if (clinicId) {
        await _attachToClinic(pool, abhaMatch.id, clinicId);
      }

      return {
        patient: abhaMatch,
        created: false,
        matchedBy: 'abha_number',
        confidence: 100,
        requiresManualReview: false,
        candidates: [],
        message: 'Found via ABHA Number (nationally unique identifier)'
      };
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 1b: ABHA Address (100% confidence, GLOBAL)
  // ────────────────────────────────────────────────────────────────────────
  if (abhaAddress && !abhaNumber) {
    logger.debug('[Patient Match L1b] Checking ABHA Address', { abhaAddress });
    const abhaMatch = await _findByAbhaAddress(pool, abhaAddress);
    if (abhaMatch) {
      logger.info('[Patient Match] ✓ Level 1b ABHA Address match (100% confidence)', {
        patientId: abhaMatch.id,
        abhaAddress
      });

      if (name || mobile || dob || gender) {
        await _updatePatientDemographics(pool, abhaMatch.id, {
          name,
          mobile,
          dob,
          gender
        });
      }

      if (clinicId) {
        await _attachToClinic(pool, abhaMatch.id, clinicId);
      }

      return {
        patient: abhaMatch,
        created: false,
        matchedBy: 'abha_address',
        confidence: 100,
        requiresManualReview: false,
        candidates: [],
        message: 'Found via ABHA Address'
      };
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 2: Mobile + DOB + Name (99% confidence, CLINIC-SCOPED)
  // Requires ALL THREE criteria to match
  // ────────────────────────────────────────────────────────────────────────
  if (normalizedMobile && dob && name && clinicId) {
    logger.debug('[Patient Match L2] Checking Mobile+DOB+Name', {
      mobile: normalizedMobile,
      dob,
      name
    });

    const level2Matches = await _findByMobileDobName(pool, {
      normalizedMobile,
      dob,
      name,
      clinicId
    });

    if (level2Matches.length === 1) {
      const matched = level2Matches[0];
      logger.info('[Patient Match] ✓ Level 2 Mobile+DOB+Name match (99% confidence)', {
        patientId: matched.id,
        clinic_id: clinicId
      });

      await _attachToClinic(pool, matched.id, clinicId);

      return {
        patient: matched,
        created: false,
        matchedBy: 'mobile_dob_name',
        confidence: 99,
        requiresManualReview: false,
        candidates: [],
        message: 'Found via mobile number, date of birth, and name (clinic-scoped)'
      };
    } else if (level2Matches.length > 1) {
      // Multiple matches - ambiguous, needs manual review
      logger.warn('[Patient Match] ⚠ Multiple Level 2 candidates', {
        matchedBy: 'mobile_dob_name_multiple',
        count: level2Matches.length,
        clinicId
      });

      return {
        patient: null,
        created: false,
        matchedBy: 'mobile_dob_name_multiple',
        confidence: 0,
        requiresManualReview: true,
        candidates: _sanitizeCandidates(level2Matches),
        message: `Found ${level2Matches.length} patients with matching mobile, DOB, and name. Please select one.`
      };
    }
    // No Level 2 match - fall through to Level 3
  }

  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 3: Mobile + Name (95% confidence, CLINIC-SCOPED, SINGLE MATCH ONLY)
  // ────────────────────────────────────────────────────────────────────────
  if (normalizedMobile && name && clinicId) {
    logger.debug('[Patient Match L3] Checking Mobile+Name', {
      mobile: normalizedMobile,
      name
    });

    const level3Matches = await _findByMobileName(pool, {
      normalizedMobile,
      name,
      clinicId
    });

    if (level3Matches.length === 1) {
      const matched = level3Matches[0];
      logger.info('[Patient Match] ✓ Level 3 Mobile+Name match (95% confidence)', {
        patientId: matched.id,
        clinic_id: clinicId
      });

      // Update DOB and gender if provided
      if (dob || gender) {
        await _updatePatientDemographics(pool, matched.id, {
          dob,
          gender
        });
      }

      await _attachToClinic(pool, matched.id, clinicId);

      return {
        patient: matched,
        created: false,
        matchedBy: 'mobile_name',
        confidence: 95,
        requiresManualReview: false,
        candidates: [],
        message: 'Found via mobile number and name (clinic-scoped)'
      };
    } else if (level3Matches.length > 1) {
      // Multiple matches at Level 3 - manual review required
      logger.warn('[Patient Match] ⚠ Multiple Level 3 candidates', {
        matchedBy: 'mobile_name_multiple',
        count: level3Matches.length,
        clinicId
      });

      return {
        patient: null,
        created: false,
        matchedBy: 'mobile_name_multiple',
        confidence: 0,
        requiresManualReview: true,
        candidates: _sanitizeCandidates(level3Matches),
        message: `Found ${level3Matches.length} patients with matching mobile and name. Please select one.`
      };
    }
    // No Level 3 match - fall through to creation
  }

  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 4: No match found → Create new patient
  // ────────────────────────────────────────────────────────────────────────
  logger.info('[Patient Match] ✓ No match found - creating new patient', {
    source,
    hasAbha: !!(abhaNumber || abhaAddress),
    hasMobile: !!normalizedMobile,
    hasName: !!name
  });

  const newPatient = await _createPatient(pool, {
    name,
    mobile,
    dob,
    gender,
    clinicId
  });

  // Attach ABHA mappings if provided
  if (abhaNumber || abhaAddress) {
    await _attachAbha(pool, newPatient.id, {
      abhaNumber,
      abhaAddress,
      source
    });
  }

  return {
    patient: newPatient,
    created: true,
    matchedBy: null,
    confidence: 0,
    requiresManualReview: false,
    candidates: [],
    message: 'Created new patient record'
  };
}

/**
 * Search for patients (for UI search/autocomplete)
 * Returns paginated results
 */
async function searchPatients(pool, {
  searchTerm,
  clinicId,
  limit = 10
}) {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return [];
  }

  const term = `%${searchTerm.trim().toLowerCase()}%`;
  const prefix = `${searchTerm.trim()}%`;

  const { rows } = await pool.query(
    `SELECT DISTINCT
       p.id, p.name, p.mobile, p.dob, p.gender, p.abha_number,
       pc.uhid, pc.clinic_id,
       COUNT(DISTINCT c.id)::int AS context_count
     FROM emr_patients p
     LEFT JOIN emr_care_contexts c ON c.patient_id = p.id
     INNER JOIN patient_clinics pc ON p.id = pc.patient_id
     WHERE pc.clinic_id = $1
       AND p.deleted_at IS NULL
       AND (LOWER(p.name) LIKE $2
            OR p.mobile LIKE $3
            OR p.abha_number LIKE $3
            OR LOWER(pc.uhid) LIKE $2)
     GROUP BY p.id, pc.uhid, pc.clinic_id
     ORDER BY p.name
     LIMIT $4`,
    [clinicId, term, prefix, limit]
  );

  return rows;
}

// ────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Find patient by ABHA Number (GLOBAL, via abha_mappings)
 */
async function _findByAbhaNumber(pool, abhaNumber) {
  if (!abhaNumber) return null;

  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     WHERE m.abha_number = $1
       AND m.status = 'active'
       AND p.deleted_at IS NULL
     ORDER BY m.linked_at ASC
     LIMIT 1`,
    [abhaNumber]
  );

  if (rows.length) return rows[0];

  // Backward compatibility: check legacy column
  const { rows: legacy } = await pool.query(
    `SELECT * FROM emr_patients
     WHERE abha_number = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [abhaNumber]
  );

  return legacy[0] ?? null;
}

/**
 * Find patient by ABHA Address (GLOBAL, via abha_mappings)
 */
async function _findByAbhaAddress(pool, abhaAddress) {
  if (!abhaAddress) return null;

  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     WHERE m.abha_address = $1
       AND m.status = 'active'
       AND p.deleted_at IS NULL
     ORDER BY m.linked_at ASC
     LIMIT 1`,
    [abhaAddress]
  );

  if (rows.length) return rows[0];

  // Backward compatibility
  const { rows: legacy } = await pool.query(
    `SELECT * FROM emr_patients
     WHERE abha_address = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [abhaAddress]
  );

  return legacy[0] ?? null;
}

/**
 * Find patients by Mobile + DOB + Name (CLINIC-SCOPED)
 * All three criteria must match
 */
async function _findByMobileDobName(pool, { normalizedMobile, dob, name, clinicId }) {
  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     INNER JOIN patient_clinics pc ON p.id = pc.patient_id
     WHERE pc.clinic_id = $1
       AND p.mobile_normalized = $2
       AND p.dob = $3::date
       AND LOWER(p.name) = LOWER($4)
       AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT 10`,
    [clinicId, normalizedMobile, dob, name]
  );

  return rows;
}

/**
 * Find patients by Mobile + Name (CLINIC-SCOPED)
 * Both criteria must match
 */
async function _findByMobileName(pool, { normalizedMobile, name, clinicId }) {
  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     INNER JOIN patient_clinics pc ON p.id = pc.patient_id
     WHERE pc.clinic_id = $1
       AND p.mobile_normalized = $2
       AND LOWER(p.name) = LOWER($3)
       AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT 10`,
    [clinicId, normalizedMobile, name]
  );

  return rows;
}

/**
 * Update patient demographics
 */
async function _updatePatientDemographics(pool, patientId, { name, mobile, dob, gender }) {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (name !== undefined && name !== null) {
    updates.push(`name = $${paramIndex++}`);
    values.push(name);
  }
  if (mobile !== undefined && mobile !== null) {
    updates.push(`mobile = $${paramIndex++}`);
    values.push(mobile);
  }
  if (dob !== undefined && dob !== null) {
    updates.push(`dob = $${paramIndex++}::date`);
    values.push(dob);
  }
  if (gender !== undefined && gender !== null) {
    updates.push(`gender = $${paramIndex++}`);
    values.push(gender);
  }

  if (updates.length === 0) return; // Nothing to update

  values.push(patientId);
  const sql = `UPDATE emr_patients SET ${updates.join(', ')} WHERE id = $${paramIndex}`;

  await pool.query(sql, values);
}

/**
 * Link patient to clinic (patient_clinics many-to-many)
 */
async function _attachToClinic(pool, patientId, clinicId) {
  if (!clinicId) return;

  await pool.query(
    `INSERT INTO patient_clinics (patient_id, clinic_id, first_visit_at, last_visit_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (patient_id, clinic_id) DO UPDATE
       SET last_visit_at = NOW()`,
    [patientId, clinicId]
  );
}

/**
 * Attach ABHA mappings to patient
 */
async function _attachAbha(pool, patientId, { abhaNumber, abhaAddress, source }) {
  if (!abhaNumber && !abhaAddress) return;

  // Insert or update abha_mappings
  if (abhaNumber) {
    await pool.query(
      `INSERT INTO abha_mappings (patient_id, abha_number, abha_address, status, source)
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (patient_id, abha_number) WHERE abha_number IS NOT NULL
       DO UPDATE SET status = 'active', linked_at = NOW()`,
      [patientId, abhaNumber, abhaAddress ?? null, source]
    );
  } else if (abhaAddress) {
    await pool.query(
      `INSERT INTO abha_mappings (patient_id, abha_number, abha_address, status, source)
       VALUES ($1, NULL, $2, 'active', $3)`,
      [patientId, abhaAddress, source]
    );
  }

  // Keep legacy columns in sync
  if (abhaNumber) {
    await pool.query('UPDATE emr_patients SET abha_number = $1 WHERE id = $2', [abhaNumber, patientId]);
  }
  if (abhaAddress) {
    await pool.query('UPDATE emr_patients SET abha_address = $1 WHERE id = $2', [abhaAddress, patientId]);
  }
}

/**
 * Create new patient
 */
async function _createPatient(pool, { name, mobile, dob, gender, clinicId }) {
  if (!name) {
    throw new Error('Patient name is required');
  }

  const { rows } = await pool.query(
    `INSERT INTO emr_patients (name, mobile, dob, gender, clinic_id, deleted_at)
     VALUES ($1, $2, $3::date, $4, $5, NULL)
     RETURNING *`,
    [name, mobile ?? null, dob ?? null, gender ?? null, clinicId ?? null]
  );

  const patient = rows[0];

  // Add to patient_clinics
  if (clinicId) {
    await _attachToClinic(pool, patient.id, clinicId);
  }

  return patient;
}

/**
 * Sanitize candidate list for UI display
 */
function _sanitizeCandidates(rows) {
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    dob: r.dob,
    gender: r.gender,
    created_at: r.created_at
  }));
}

module.exports = {
  findOrCreatePatient,
  searchPatients
};
