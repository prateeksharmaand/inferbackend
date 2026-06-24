const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * ABDM Registration Safety Validation Service
 *
 * Implements 4-level matching strategy prioritizing patient safety:
 * Level 1 (100%): ABHA Number/Address → Auto-link
 * Level 2 (99%):  Mobile + DOB + Name → Auto-link
 * Level 3 (95%):  Name + DOB + Gender → Manual review
 * Level 4 (0%):   No match → Create new
 *
 * Principle: Patient Safety > Duplicate Prevention
 * - A duplicate patient is acceptable
 * - A wrong patient match is NOT acceptable
 */

// ====================================================================
// MATCHING QUERIES
// ====================================================================

/**
 * Level 1: ABHA Number/Address Match (100% Confidence)
 * ABHA is a nationally unique identifier issued by ABDM
 */
const findByAbhaExact = async (abhaNumber, abhaAddress) => {
  try {
    const query = `
      SELECT
        id, clinic_id, name, mobile, dob, gender, uhid,
        abha_number, abha_address, is_abdm_linked,
        last_visit_date, clinic_name
      FROM emr_patients
      WHERE deleted_at IS NULL
        AND (abha_number = $1 OR abha_address = $2)
      LIMIT 1
    `;

    const result = await db.query(query, [abhaNumber, abhaAddress]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Error finding patient by ABHA', { error });
    return null;
  }
};

/**
 * Level 2: Mobile + DOB + Name Match (99% Confidence)
 * Clinic-scoped, all three fields required
 * Phone normalization via PostgreSQL function
 */
const findByMobileDobName = async (clinicId, name, dob, mobile) => {
  if (!mobile || !dob || !name) return [];

  try {
    const query = `
      SELECT
        id, clinic_id, name, mobile, dob, gender, uhid,
        last_visit_date, clinic_name
      FROM emr_patients
      WHERE deleted_at IS NULL
        AND clinic_id = $1
        AND LOWER(name) = LOWER($2)
        AND dob = $3::date
        AND REGEXP_REPLACE(mobile, '\\D', '') = normalize_phone($4)
      LIMIT 1
    `;

    const result = await db.query(query, [clinicId, name, dob, mobile]);
    return result.rows;
  } catch (error) {
    logger.error('Error finding patient by Mobile+DOB+Name', {
      clinicId,
      name,
      dob,
      error
    });
    return [];
  }
};

/**
 * Level 3: Name + DOB + Gender Match (70-95% Confidence)
 * Clinic-scoped, returns multiple candidates for manual review
 * Confidence score is higher if mobile is present on existing patient
 */
const findByNameDobGender = async (clinicId, name, dob, gender, mobile = null) => {
  if (!name || !dob) return [];

  try {
    const query = `
      SELECT
        id, clinic_id, name, mobile, dob, gender, uhid,
        last_visit_date, clinic_name,
        CASE
          WHEN mobile IS NOT NULL AND mobile != '' THEN 95
          ELSE 70
        END as confidence_score
      FROM emr_patients
      WHERE deleted_at IS NULL
        AND clinic_id = $1
        AND LOWER(name) = LOWER($2)
        AND dob = $3::date
        AND gender = $4
      ORDER BY confidence_score DESC, updated_at DESC
      LIMIT 5
    `;

    const result = await db.query(query, [clinicId, name, dob, gender]);
    return result.rows;
  } catch (error) {
    logger.error('Error finding patient by Name+DOB+Gender', {
      clinicId,
      name,
      dob,
      gender,
      error
    });
    return [];
  }
};

// ====================================================================
// MAIN VALIDATION FLOW
// ====================================================================

/**
 * Main ABDM Registration Validation
 *
 * Returns one of:
 * 1. { status: 'found', confidence: 100, action: 'auto_link', patient, matchedOn: 'abha_exact' }
 * 2. { status: 'found', confidence: 99, action: 'auto_link', patient, matchedOn: 'mobile_dob_name' }
 * 3. { status: 'requires_manual_review', confidence: 70-95, action: 'show_dialog', candidates, matchedOn: 'name_dob_gender', reason: '...' }
 * 4. { status: 'no_match', confidence: 0, action: 'create_new', candidates: [], reason: 'No demographic match found' }
 */
const validateAbdmRegistration = async (abdmData, clinicId) => {
  const { abhaNumber, abhaAddress, name, dob, gender, mobile } = abdmData;

  logger.info('ABDM Registration Validation Started', {
    clinic_id: clinicId,
    abha_number: abhaNumber,
    name,
    dob
  });

  // ====================================================================
  // LEVEL 1: ABHA Match (100% Confidence)
  // ====================================================================
  if (abhaNumber || abhaAddress) {
    const abhaMatch = await findByAbhaExact(abhaNumber, abhaAddress);

    if (abhaMatch) {
      logger.info('ABDM Validation: ABHA Match Found (100%)', {
        clinic_id: clinicId,
        patient_id: abhaMatch.id,
        matched_on: 'abha_exact'
      });

      return {
        status: 'found',
        confidence: 100,
        action: 'auto_link',
        patient: abhaMatch,
        matchedOn: 'abha_exact',
        reason: 'ABHA Number/Address is nationally unique (100% confidence)'
      };
    }
  }

  // ====================================================================
  // LEVEL 2: Mobile + DOB + Name Match (99% Confidence)
  // ====================================================================
  if (mobile && dob && name) {
    const mobileDobNameMatches = await findByMobileDobName(
      clinicId,
      name,
      dob,
      mobile
    );

    if (mobileDobNameMatches.length === 1) {
      const match = mobileDobNameMatches[0];

      logger.info('ABDM Validation: Mobile+DOB+Name Match Found (99%)', {
        clinic_id: clinicId,
        patient_id: match.id,
        matched_on: 'mobile_dob_name'
      });

      return {
        status: 'found',
        confidence: 99,
        action: 'auto_link',
        patient: match,
        matchedOn: 'mobile_dob_name',
        reason: 'Mobile + DOB + Name is unique combination (99% confidence)'
      };
    }

    if (mobileDobNameMatches.length > 1) {
      logger.warn('ABDM Validation: Multiple Mobile+DOB+Name Matches (ambiguous)', {
        clinic_id: clinicId,
        match_count: mobileDobNameMatches.length
      });

      // Fall through to Level 3
    }
  }

  // ====================================================================
  // LEVEL 3: Name + DOB + Gender Match (70-95% Confidence)
  // ====================================================================
  if (name && dob && gender) {
    const nameDobGenderMatches = await findByNameDobGender(
      clinicId,
      name,
      dob,
      gender,
      mobile
    );

    if (nameDobGenderMatches.length > 0) {
      const confidenceScore = nameDobGenderMatches[0].confidence_score;

      logger.info('ABDM Validation: Name+DOB+Gender Candidates Found (Manual Review)', {
        clinic_id: clinicId,
        match_count: nameDobGenderMatches.length,
        confidence: confidenceScore,
        requires_manual_review: true
      });

      return {
        status: 'requires_manual_review',
        confidence: confidenceScore,
        action: 'show_dialog',
        candidates: nameDobGenderMatches.map(c => ({
          id: c.id,
          clinic_id: c.clinic_id,
          name: c.name,
          mobile: c.mobile,
          dob: c.dob,
          gender: c.gender,
          uhid: c.uhid,
          last_visit_date: c.last_visit_date,
          clinic_name: c.clinic_name
        })),
        matchedOn: 'name_dob_gender',
        reason: `Matched on Name, DOB, Gender${mobile ? ', Mobile' : ''} (${confidenceScore}% confidence)`
      };
    }
  }

  // ====================================================================
  // LEVEL 4: No Match (0% Confidence)
  // ====================================================================
  logger.info('ABDM Validation: No Match Found - Create New Patient', {
    clinic_id: clinicId,
    name
  });

  return {
    status: 'no_match',
    confidence: 0,
    action: 'create_new',
    candidates: [],
    matchedOn: 'none',
    reason: 'No demographic match found - will create new patient'
  };
};

// ====================================================================
// LINK ABHA TO EXISTING PATIENT
// ====================================================================

/**
 * Link ABHA to Existing Patient with Audit Trail
 */
const linkAbhaToExistingPatient = async (
  abhaNumber,
  abhaAddress,
  patientId,
  clinicId,
  userId,
  confidenceScore = 95
) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Update patient with ABHA
    const updateQuery = `
      UPDATE emr_patients SET
        abha_number = COALESCE($1, abha_number),
        abha_address = COALESCE($2, abha_address),
        is_abdm_linked = true,
        abdm_linked_at = NOW()
      WHERE id = $3 AND clinic_id = $4
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, [
      abhaNumber,
      abhaAddress,
      patientId,
      clinicId
    ]);

    if (updateResult.rows.length === 0) {
      throw new Error(`Patient ${patientId} not found in clinic ${clinicId}`);
    }

    const patient = updateResult.rows[0];

    // Audit log
    const auditQuery = `
      INSERT INTO abdm_registration_audit
        (clinic_id, user_id, patient_id, abha_number, abha_address, action, confidence_score, matched_on, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const auditResult = await client.query(auditQuery, [
      clinicId,
      userId,
      patientId,
      abhaNumber,
      abhaAddress,
      'LINK_EXISTING_PATIENT',
      confidenceScore,
      confidenceScore === 95 ? 'name_dob_gender' : 'manual_review',
      `Linked ABHA to existing patient (${confidenceScore}% confidence)`
    ]);

    await client.query('COMMIT');

    logger.info('ABDM Patient Linked', {
      patient_id: patientId,
      clinic_id: clinicId,
      user_id: userId,
      audit_id: auditResult.rows[0].id,
      confidence: confidenceScore
    });

    return {
      success: true,
      patient_id: patientId,
      abha_linked: true,
      audit_id: auditResult.rows[0].id,
      patient
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error linking ABHA to patient', {
      patient_id: patientId,
      error
    });
    throw error;
  } finally {
    client.release();
  }
};

// ====================================================================
// CREATE NEW PATIENT FROM ABDM DATA
// ====================================================================

/**
 * Create New Patient from ABDM Data with Audit Trail
 */
const createNewPatientFromAbdm = async (
  abdmData,
  clinicId,
  userId,
  reason = 'No confident match found'
) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Create new patient
    const createQuery = `
      INSERT INTO emr_patients
        (clinic_id, name, dob, gender, mobile, address, abha_number, abha_address, is_abdm_linked, abdm_linked_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
      RETURNING *
    `;

    const createResult = await client.query(createQuery, [
      clinicId,
      abdmData.name,
      abdmData.dob,
      abdmData.gender,
      abdmData.mobile,
      abdmData.address,
      abdmData.abhaNumber,
      abdmData.abhaAddress
    ]);

    const patient = createResult.rows[0];

    // Audit log
    const auditQuery = `
      INSERT INTO abdm_registration_audit
        (clinic_id, user_id, patient_id, abha_number, abha_address, action, confidence_score, matched_on, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const auditResult = await client.query(auditQuery, [
      clinicId,
      userId,
      patient.id,
      abdmData.abhaNumber,
      abdmData.abhaAddress,
      'CREATE_NEW_PATIENT',
      0,
      'none',
      reason
    ]);

    await client.query('COMMIT');

    logger.info('ABDM New Patient Created', {
      patient_id: patient.id,
      clinic_id: clinicId,
      user_id: userId,
      audit_id: auditResult.rows[0].id
    });

    return {
      success: true,
      patient_id: patient.id,
      is_new: true,
      audit_id: auditResult.rows[0].id,
      patient
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating new patient from ABDM', {
      clinic_id: clinicId,
      error
    });
    throw error;
  } finally {
    client.release();
  }
};

// ====================================================================
// CANCEL ABDM REGISTRATION
// ====================================================================

/**
 * Cancel ABDM Registration (log cancellation)
 */
const cancelAbdmRegistration = async (
  abhaNumber,
  abhaAddress,
  clinicId,
  userId,
  cancelReason = 'User cancelled'
) => {
  try {
    const query = `
      INSERT INTO abdm_registration_audit
        (clinic_id, user_id, abha_number, abha_address, action, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const result = await db.query(query, [
      clinicId,
      userId,
      abhaNumber,
      abhaAddress,
      'CANCELLED',
      cancelReason
    ]);

    logger.info('ABDM Registration Cancelled', {
      clinic_id: clinicId,
      user_id: userId,
      abha_number: abhaNumber,
      audit_id: result.rows[0].id
    });

    return {
      success: true,
      audit_id: result.rows[0].id
    };
  } catch (error) {
    logger.error('Error cancelling ABDM registration', { error });
    throw error;
  }
};

// ====================================================================
// AUDIT QUERIES
// ====================================================================

/**
 * Get audit trail for specific ABHA
 */
const getAuditTrailByAbha = async (abhaNumber) => {
  try {
    const query = `
      SELECT *
      FROM abdm_registration_audit
      WHERE abha_number = $1
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [abhaNumber]);
    return result.rows;
  } catch (error) {
    logger.error('Error getting audit trail by ABHA', { error });
    return [];
  }
};

/**
 * Get audit trail for specific patient
 */
const getAuditTrailByPatient = async (patientId) => {
  try {
    const query = `
      SELECT *
      FROM abdm_registration_audit
      WHERE patient_id = $1
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [patientId]);
    return result.rows;
  } catch (error) {
    logger.error('Error getting audit trail by patient', { error });
    return [];
  }
};

/**
 * Get manual review rate statistics
 */
const getValidationStatistics = async (clinicId, days = 30) => {
  try {
    const query = `
      SELECT
        COUNT(*) as total_registrations,
        COUNTIF(action = 'LINK_EXISTING_PATIENT') as auto_linked,
        COUNTIF(action = 'CREATE_NEW_PATIENT') as new_created,
        COUNTIF(action = 'CANCELLED') as cancelled,
        ROUND(100 * COUNTIF(action = 'LINK_EXISTING_PATIENT') / COUNT(*), 2) as auto_link_pct
      FROM abdm_registration_audit
      WHERE clinic_id = $1
        AND created_at > NOW() - INTERVAL '${days} days'
    `;

    const result = await db.query(query, [clinicId]);
    return result.rows[0] || {};
  } catch (error) {
    logger.error('Error getting validation statistics', { error });
    return {};
  }
};

module.exports = {
  // Matching
  findByAbhaExact,
  findByMobileDobName,
  findByNameDobGender,

  // Main validation
  validateAbdmRegistration,

  // Actions
  linkAbhaToExistingPatient,
  createNewPatientFromAbdm,
  cancelAbdmRegistration,

  // Audit
  getAuditTrailByAbha,
  getAuditTrailByPatient,
  getValidationStatistics
};
