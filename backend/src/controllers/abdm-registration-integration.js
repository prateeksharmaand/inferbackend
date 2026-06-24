/**
 * ABDM Registration Integration Layer
 *
 * Bridges the appointment creation flow with ABDM registration safety validation.
 * When a patient is registered via ABDM (ABHA QR, etc.), it must go through
 * the 4-level matching with manual review for ambiguous cases.
 */

const abdmValidation = require('../services/abdm-registration-validation.service');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Validate and Register Patient for ABDM
 *
 * Called when:
 * - ABHA QR is scanned
 * - Facility QR + profile share
 * - ABDM patient share
 * - ABHA number entered manually
 *
 * Returns:
 * - { status: 'auto_linked', patient_id } → Use existing patient
 * - { status: 'requires_manual_review', candidates } → Show dialog to user
 * - { status: 'no_match', action: 'create_new' } → Create new patient
 */
async function validateAndRegisterAbdmPatient(abdmData, clinicId, userId) {
  try {
    logger.info('ABDM Patient Registration Starting', {
      clinic_id: clinicId,
      name: abdmData.name,
      abha_number: abdmData.abhaNumber
    });

    // Run 4-level matching engine
    const validationResult = await abdmValidation.validateAbdmRegistration(
      abdmData,
      clinicId
    );

    // If auto-link (Level 1 or Level 2), link immediately
    if (validationResult.action === 'auto_link') {
      try {
        const linkResult = await abdmValidation.linkAbhaToExistingPatient(
          abdmData.abhaNumber,
          abdmData.abhaAddress,
          validationResult.patient.id,
          clinicId,
          userId,
          validationResult.confidence
        );

        logger.info('ABDM Patient Auto-Linked', {
          patient_id: linkResult.patient_id,
          confidence: validationResult.confidence,
          matched_on: validationResult.matchedOn
        });

        return {
          status: 'success',
          action: 'auto_linked',
          patient_id: linkResult.patient_id,
          patient: linkResult.patient,
          confidence: validationResult.confidence,
          audit_id: linkResult.audit_id
        };
      } catch (error) {
        logger.error('ABDM Auto-Link Failed', {
          patient_id: validationResult.patient.id,
          error: error.message
        });
        throw error;
      }
    }

    // If manual review needed (Level 3), return candidates for dialog
    if (validationResult.action === 'show_dialog') {
      logger.info('ABDM Manual Review Required', {
        clinic_id: clinicId,
        candidate_count: validationResult.candidates.length,
        confidence: validationResult.confidence
      });

      return {
        status: 'requires_manual_review',
        action: 'show_dialog',
        candidates: validationResult.candidates,
        confidence: validationResult.confidence,
        matched_on: validationResult.matchedOn,
        reason: validationResult.reason,
        abdm_data: {
          name: abdmData.name,
          dob: abdmData.dob,
          gender: abdmData.gender,
          abha_number: abdmData.abhaNumber,
          abha_address: abdmData.abhaAddress,
          mobile: abdmData.mobile
        }
      };
    }

    // If no match (Level 4), prepare to create new patient
    if (validationResult.action === 'create_new') {
      logger.info('ABDM No Match Found - New Patient Will Be Created', {
        clinic_id: clinicId,
        name: abdmData.name
      });

      return {
        status: 'no_match',
        action: 'create_new',
        message: 'No existing patient found - will create new patient'
      };
    }
  } catch (error) {
    logger.error('ABDM Patient Validation Error', {
      clinic_id: clinicId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get or Create Patient for ABDM Registration
 *
 * After validation:
 * 1. If auto-linked → return patient ID
 * 2. If manual review → user confirms → link or create
 * 3. If no match → create new
 */
async function getOrCreateAbdmPatient(abdmData, clinicId, userId, manualChoice = null) {
  try {
    // Run validation
    const validation = await validateAndRegisterAbdmPatient(
      abdmData,
      clinicId,
      userId
    );

    // If auto-linked, patient is ready
    if (validation.action === 'auto_linked') {
      return {
        patient_id: validation.patient_id,
        is_new: false,
        abha_linked: true,
        audit_id: validation.audit_id
      };
    }

    // If manual review, user must choose
    if (validation.action === 'show_dialog') {
      if (!manualChoice) {
        // Return candidates, caller must show dialog and provide choice
        throw new Error('MANUAL_REVIEW_REQUIRED');
      }

      // User provided a choice: link to existing or create new
      if (manualChoice.action === 'link' && manualChoice.patient_id) {
        const linkResult = await abdmValidation.linkAbhaToExistingPatient(
          abdmData.abhaNumber,
          abdmData.abhaAddress,
          manualChoice.patient_id,
          clinicId,
          userId,
          validation.confidence
        );

        return {
          patient_id: linkResult.patient_id,
          is_new: false,
          abha_linked: true,
          audit_id: linkResult.audit_id
        };
      }

      if (manualChoice.action === 'create_new') {
        const createResult = await abdmValidation.createNewPatientFromAbdm(
          abdmData,
          clinicId,
          userId,
          'User chose to create new patient'
        );

        return {
          patient_id: createResult.patient_id,
          is_new: true,
          abha_linked: true,
          audit_id: createResult.audit_id
        };
      }
    }

    // If no match, create new patient
    if (validation.action === 'create_new') {
      const createResult = await abdmValidation.createNewPatientFromAbdm(
        abdmData,
        clinicId,
        userId,
        'No demographic match found'
      );

      return {
        patient_id: createResult.patient_id,
        is_new: true,
        abha_linked: true,
        audit_id: createResult.audit_id
      };
    }
  } catch (error) {
    if (error.message === 'MANUAL_REVIEW_REQUIRED') {
      throw error; // Re-throw to caller - they need to show dialog
    }
    logger.error('ABDM Get or Create Patient Error', {
      clinic_id: clinicId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Resolve Patient ID from Multiple Sources (with ABDM validation)
 *
 * Priority:
 * 1. Explicit emr_patient_id
 * 2. ABHA (with validation)
 * 3. Name + Mobile + DOB (with validation)
 * 4. Create new
 */
async function resolvePatientId(data, clinicId, userId = null) {
  const {
    emr_patient_id,
    patient_name,
    patient_mobile,
    patient_dob,
    patient_gender,
    patient_abha,
    patient_email,
    is_abdm_source = false // Flag if this came from ABDM
  } = data;

  try {
    // If emr_patient_id explicitly provided, use it
    if (emr_patient_id) {
      return emr_patient_id;
    }

    // If ABDM source and we have ABHA or sufficient demographics, run validation
    if (is_abdm_source && (patient_abha || (patient_name && patient_dob))) {
      const validation = await validateAndRegisterAbdmPatient(
        {
          abhaNumber: patient_abha,
          abhaAddress: patient_abha, // Simplified
          name: patient_name,
          dob: patient_dob,
          gender: patient_gender,
          mobile: patient_mobile
        },
        clinicId,
        userId
      );

      // If auto-linked, return patient ID
      if (validation.action === 'auto_linked') {
        return validation.patient_id;
      }

      // If manual review needed, throw error with candidates
      if (validation.action === 'requires_manual_review') {
        const error = new Error('MANUAL_REVIEW_REQUIRED');
        error.candidates = validation.candidates;
        error.validation = validation;
        throw error;
      }

      // If no match, create new (will happen after this)
    }

    // Fallback: Try old matching logic (for backward compatibility)
    if (!emr_patient_id && patient_abha) {
      const { rows: ptRows } = await pool.query(
        `SELECT p.id FROM emr_patients p
         WHERE (p.abha_number = $1 OR p.abha_address = $1) AND p.deleted_at IS NULL
         LIMIT 1`,
        [patient_abha]
      );
      if (ptRows.length) {
        return ptRows[0].id;
      }
    }

    if (!emr_patient_id && patient_name && patient_mobile) {
      const { rows: ptRows } = await pool.query(
        `SELECT p.id FROM emr_patients p
         WHERE p.name = $1 AND p.mobile = $2 AND p.deleted_at IS NULL
         LIMIT 1`,
        [patient_name, patient_mobile]
      );
      if (ptRows.length) {
        return ptRows[0].id;
      }
    }

    if (!emr_patient_id && patient_name) {
      const { rows: ptRows } = await pool.query(
        `SELECT p.id FROM emr_patients p
         WHERE p.name = $1 AND p.deleted_at IS NULL
         ORDER BY p.created_at DESC LIMIT 1`,
        [patient_name]
      );
      if (ptRows.length) {
        return ptRows[0].id;
      }
    }

    // No existing patient found
    return null;
  } catch (error) {
    if (error.message === 'MANUAL_REVIEW_REQUIRED') {
      throw error; // Re-throw for caller to handle
    }
    logger.error('Error resolving patient ID', { error: error.message });
    throw error;
  }
}

module.exports = {
  validateAndRegisterAbdmPatient,
  getOrCreateAbdmPatient,
  resolvePatientId
};
