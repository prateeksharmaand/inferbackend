/**
 * Patient Matching Service
 *
 * Implements 5-tier priority matching to resolve existing patients and detect duplicates.
 * Essential for preventing duplicate patient creation and recognizing returning patients.
 *
 * Priority Order:
 *   1. ABHA Number (highest confidence - permanent unique identifier)
 *   2. ABHA Address (fallback when number unavailable)
 *   3. Mobile + DOB (strong demographic match)
 *   4. Mobile + Name (mobile + name match)
 *   5. Name + DOB + Gender (pure demographic fallback)
 *   6. Manual Review (ambiguous matches returned for staff verification)
 */

const logger = require('../utils/logger');

/**
 * Find matching patients by priority-tier logic
 * Returns { patient, matchedBy, confidence, candidates }
 *
 * @param {Pool} pool - Database pool
 * @param {Object} criteria - { abhaNumber, abhaAddress, mobile, name, dob, gender, clinicId }
 * @returns {Promise<Object>}
 */
async function findPatient(pool, {
  abhaNumber,
  abhaAddress,
  mobile,
  name,
  dob,
  gender,
  clinicId, // For clinic-context matching
}) {
  const result = {
    patient: null,
    matchedBy: null,
    confidence: 0,
    candidates: [], // For manual review if multiple matches
  };

  // Priority 1: ABHA Number (highest confidence)
  if (abhaNumber) {
    logger.debug('[Patient Match] Checking Priority 1: ABHA Number', { abhaNumber });
    const { rows } = await pool.query(
      `SELECT p.* FROM emr_patients p
       JOIN abha_mappings m ON m.patient_id = p.id
       WHERE m.abha_number = $1 AND m.status = 'active' AND p.deleted_at IS NULL
       ORDER BY m.linked_at ASC LIMIT 5`,
      [abhaNumber]
    );

    if (rows.length > 0) {
      logger.info('[Patient Match] Found by ABHA Number (Priority 1)', {
        abhaNumber,
        patientId: rows[0].id,
        matches: rows.length,
      });
      result.patient = rows[0];
      result.matchedBy = 'abha_number';
      result.confidence = 99;
      result.candidates = rows;
      return result;
    }

    // Backward compat: check legacy emr_patients.abha_number column
    const { rows: legacy } = await pool.query(
      `SELECT * FROM emr_patients
       WHERE abha_number = $1 AND deleted_at IS NULL
       LIMIT 5`,
      [abhaNumber]
    );
    if (legacy.length > 0) {
      result.patient = legacy[0];
      result.matchedBy = 'abha_number_legacy';
      result.confidence = 95;
      result.candidates = legacy;
      return result;
    }
  }

  // Priority 2: ABHA Address (fallback when number unavailable)
  if (abhaAddress) {
    logger.debug('[Patient Match] Checking Priority 2: ABHA Address', { abhaAddress });
    const { rows } = await pool.query(
      `SELECT p.* FROM emr_patients p
       JOIN abha_mappings m ON m.patient_id = p.id
       WHERE m.abha_address = $1 AND m.status = 'active' AND p.deleted_at IS NULL
       ORDER BY m.linked_at ASC LIMIT 5`,
      [abhaAddress]
    );

    if (rows.length > 0) {
      logger.info('[Patient Match] Found by ABHA Address (Priority 2)', {
        abhaAddress,
        patientId: rows[0].id,
        matches: rows.length,
      });
      result.patient = rows[0];
      result.matchedBy = 'abha_address';
      result.confidence = 85;
      result.candidates = rows;
      return result;
    }

    // Backward compat
    const { rows: legacy } = await pool.query(
      `SELECT * FROM emr_patients
       WHERE abha_address = $1 AND deleted_at IS NULL
       LIMIT 5`,
      [abhaAddress]
    );
    if (legacy.length > 0) {
      result.patient = legacy[0];
      result.matchedBy = 'abha_address_legacy';
      result.confidence = 80;
      result.candidates = legacy;
      return result;
    }
  }

  // Priority 3: Mobile + DOB (strong demographic match)
  if (mobile && dob) {
    logger.debug('[Patient Match] Checking Priority 3: Mobile + DOB', { mobile, dob });
    const { rows } = await pool.query(
      `SELECT * FROM emr_patients
       WHERE mobile = $1 AND dob = $2::date AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 5`,
      [mobile, dob]
    );

    if (rows.length === 1) {
      logger.info('[Patient Match] Found by Mobile + DOB (Priority 3)', {
        mobile,
        dob,
        patientId: rows[0].id,
      });
      result.patient = rows[0];
      result.matchedBy = 'mobile_dob';
      result.confidence = 88;
      result.candidates = rows;
      return result;
    } else if (rows.length > 1 && name) {
      // Multiple matches by Mobile+DOB - use Name as tiebreaker if provided
      const nameLower = name.toLowerCase();
      const nameMatches = rows.filter(r => r.name && r.name.toLowerCase() === nameLower);
      if (nameMatches.length === 1) {
        logger.info('[Patient Match] Found by Mobile + DOB + Name tiebreaker (Priority 3+4)', {
          mobile,
          dob,
          name,
          patientId: nameMatches[0].id,
        });
        result.patient = nameMatches[0];
        result.matchedBy = 'mobile_dob_name_tiebreaker';
        result.confidence = 87;
        result.candidates = rows;
        return result;
      }
      // If tiebreaker didn't help, continue to Priority 4
      logger.debug('[Patient Match] Mobile+DOB found multiple, name tiebreaker inconclusive, continue to Priority 4', {
        mobile,
        dob,
        count: rows.length,
      });
    }
  }

  // Priority 4: Mobile + Name (only if mobile exists)
  if (mobile && name) {
    logger.debug('[Patient Match] Checking Priority 4: Mobile + Name', { mobile, name });
    const nameLower = name.toLowerCase();
    const { rows } = await pool.query(
      `SELECT * FROM emr_patients
       WHERE mobile = $1 AND LOWER(name) = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 5`,
      [mobile, nameLower]
    );

    if (rows.length === 1) {
      logger.info('[Patient Match] Found by Mobile + Name (Priority 4)', {
        mobile,
        name,
        patientId: rows[0].id,
      });
      result.patient = rows[0];
      result.matchedBy = 'mobile_name';
      result.confidence = 82;
      result.candidates = rows;
      return result;
    } else if (rows.length > 1) {
      logger.warn('[Patient Match] Multiple candidates found: Mobile + Name (Priority 4)', {
        mobile,
        name,
        count: rows.length,
      });
      result.candidates = rows;
      result.matchedBy = 'mobile_name_multiple';
      result.confidence = 0;
      return result;
    }
  }

  // Priority 5: Name + DOB + Gender (pure demographic fallback)
  if (name && dob && gender) {
    logger.debug('[Patient Match] Checking Priority 5: Name + DOB + Gender', {
      name,
      dob,
      gender,
    });
    const nameLower = name.toLowerCase();
    const { rows } = await pool.query(
      `SELECT * FROM emr_patients
       WHERE LOWER(name) = $1 AND dob = $2::date AND gender = $3 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 5`,
      [nameLower, dob, gender]
    );

    if (rows.length === 1) {
      logger.info('[Patient Match] Found by Name + DOB + Gender (Priority 5)', {
        name,
        dob,
        gender,
        patientId: rows[0].id,
      });
      result.patient = rows[0];
      result.matchedBy = 'name_dob_gender';
      result.confidence = 70;
      result.candidates = rows;
      return result;
    } else if (rows.length > 1) {
      logger.warn('[Patient Match] Multiple candidates found: Name + DOB + Gender (Priority 5)', {
        name,
        dob,
        gender,
        count: rows.length,
      });
      result.candidates = rows;
      result.matchedBy = 'name_dob_gender_multiple';
      result.confidence = 0;
      return result;
    }
  }

  // Priority 6: No match found - return empty
  logger.debug('[Patient Match] No match found across all priorities', {
    hasAbhaNumber: !!abhaNumber,
    hasAbhaAddress: !!abhaAddress,
    hasMobile: !!mobile,
    hasName: !!name,
  });

  return result;
}

/**
 * Detect potential duplicate patients (for manual review)
 * Returns list of similar patients that might be duplicates
 *
 * @param {Pool} pool - Database pool
 * @param {Object} criteria - { mobile, name, dob }
 * @param {Integer} patientId - Current patient to exclude from results
 * @returns {Promise<Array>}
 */
async function detectDuplicateCandidates(pool, { mobile, name, dob }, excludePatientId) {
  const candidates = [];

  // Detect by mobile (exact match, excluding self)
  if (mobile) {
    const { rows } = await pool.query(
      `SELECT id, name, mobile, dob, created_at FROM emr_patients
       WHERE mobile = $1 AND id != $2 AND deleted_at IS NULL
       LIMIT 5`,
      [mobile, excludePatientId]
    );
    candidates.push(
      ...rows.map(r => ({ ...r, duplicate_reason: 'same_mobile' }))
    );
  }

  // Detect by name + dob (within 2 week created_at window to catch duplicate registration)
  if (name && dob) {
    const nameLower = name.toLowerCase();
    const { rows } = await pool.query(
      `SELECT id, name, mobile, dob, created_at FROM emr_patients
       WHERE LOWER(name) = $1 AND dob = $2::date
       AND id != $3 AND deleted_at IS NULL
       AND created_at > NOW() - INTERVAL '2 weeks'
       LIMIT 5`,
      [nameLower, dob, excludePatientId]
    );
    candidates.push(
      ...rows.map(r => ({ ...r, duplicate_reason: 'same_name_dob_recent' }))
    );
  }

  // Deduplicate candidates
  const seen = new Set();
  return candidates.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

/**
 * Get search results (for patient search UI)
 * Returns paginated list of patients matching search term
 *
 * @param {Pool} pool - Database pool
 * @param {String} searchTerm - Search by name, mobile, ABHA, UHID
 * @param {Integer} clinicId - Filter by clinic (optional)
 * @param {Integer} limit - Max results (default 10)
 * @returns {Promise<Array>}
 */
async function search(pool, searchTerm, clinicId, limit = 10) {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return [];
  }

  const term = searchTerm.trim().toLowerCase();
  const prefix = searchTerm.trim();

  // Search across multiple fields
  const { rows } = await pool.query(
    `SELECT DISTINCT
       p.id, p.name, p.mobile, p.dob, p.gender,
       p.abha_number, p.abha_address,
       (SELECT pc.uhid FROM patient_clinics pc
        WHERE pc.patient_id = p.id AND pc.clinic_id = $2 LIMIT 1) AS uhid,
       COUNT(DISTINCT c.id)::int AS context_count
     FROM emr_patients p
     LEFT JOIN emr_care_contexts c ON c.patient_id = p.id
     WHERE p.deleted_at IS NULL
       AND (
         LOWER(p.name) LIKE $1 ||
         p.mobile LIKE $3 ||
         p.abha_number LIKE $3 ||
         p.abha_address LIKE $1 ||
         EXISTS (
           SELECT 1 FROM patient_clinics pc
           WHERE pc.patient_id = p.id AND LOWER(pc.uhid) LIKE $1
         )
       )
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT $4`,
    [
      `%${term}%`,
      clinicId || null,
      `${prefix}%`,
      limit,
    ]
  );

  return rows;
}

module.exports = {
  findPatient,
  detectDuplicateCandidates,
  search,
};
