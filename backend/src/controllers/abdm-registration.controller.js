const express = require('express');
const router = express.Router();
const abdmValidation = require('../services/abdm-registration-validation.service');
const logger = require('../utils/logger');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * ABDM Registration Controller
 *
 * Handles patient registration through ABDM channels with safety validation:
 * - ABHA QR Scan
 * - Facility QR + Profile Share
 * - ABDM Patient Share
 * - ABHA Number Registration
 */

// ====================================================================
// POST /api/v1/abdm/validate-registration
// ====================================================================

/**
 * Validate ABDM Registration
 *
 * Runs the matching engine against ABDM data
 * Returns:
 * - { status: 'found', action: 'auto_link', patient } → Auto-link ABHA
 * - { status: 'requires_manual_review', action: 'show_dialog', candidates } → Show dialog
 * - { status: 'no_match', action: 'create_new' } → Create new patient
 */
router.post('/validate-registration', authenticate, async (req, res) => {
  try {
    const { abha_number, abha_address, name, dob, gender, mobile, clinic_id } = req.body;

    // Validation
    if (!clinic_id) {
      return res.status(400).json({ error: 'clinic_id is required' });
    }

    if (!name || !dob) {
      return res.status(400).json({ error: 'name and dob are required' });
    }

    logger.info('ABDM Registration Validation Request', {
      clinic_id,
      abha_number,
      name
    });

    // Run matching engine
    const validationResult = await abdmValidation.validateAbdmRegistration(
      {
        abhaNumber: abha_number,
        abhaAddress: abha_address,
        name,
        dob,
        gender,
        mobile
      },
      clinic_id
    );

    // If auto-link needed (Level 1 or Level 2)
    if (validationResult.action === 'auto_link') {
      try {
        // Automatically link ABHA to existing patient
        const linkResult = await abdmValidation.linkAbhaToExistingPatient(
          abha_number,
          abha_address,
          validationResult.patient.id,
          clinic_id,
          req.user.id,
          validationResult.confidence
        );

        return res.status(200).json({
          status: 'success',
          action: 'auto_linked',
          patient_id: linkResult.patient_id,
          confidence: validationResult.confidence,
          audit_id: linkResult.audit_id,
          matched_on: validationResult.matchedOn,
          patient: linkResult.patient
        });
      } catch (error) {
        logger.error('Auto-link failed', { error, patient_id: validationResult.patient.id });
        return res.status(500).json({ error: 'Failed to link ABHA' });
      }
    }

    // If manual review needed (Level 3) or no match (Level 4)
    return res.status(200).json({
      status: validationResult.status,
      confidence: validationResult.confidence,
      action: validationResult.action,
      candidates: validationResult.candidates,
      matched_on: validationResult.matchedOn,
      reason: validationResult.reason
    });
  } catch (error) {
    logger.error('Error validating ABDM registration', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ====================================================================
// POST /api/v1/abdm/link-to-existing
// ====================================================================

/**
 * Link ABHA to Existing Patient
 * Called when user confirms patient match in dialog
 *
 * Request:
 * {
 *   "abha_number": "91-1000-4008-7627",
 *   "abha_address": "user@abdm",
 *   "patient_id": 24,
 *   "clinic_id": 1
 * }
 */
router.post('/link-to-existing', authenticate, async (req, res) => {
  try {
    const { abha_number, abha_address, patient_id, clinic_id } = req.body;

    if (!patient_id || !clinic_id) {
      return res.status(400).json({
        error: 'patient_id and clinic_id are required'
      });
    }

    if (!abha_number && !abha_address) {
      return res.status(400).json({
        error: 'abha_number or abha_address is required'
      });
    }

    logger.info('User confirmed ABHA link to existing patient', {
      clinic_id,
      patient_id,
      abha_number,
      user_id: req.user.id
    });

    // Link ABHA to patient
    const result = await abdmValidation.linkAbhaToExistingPatient(
      abha_number,
      abha_address,
      patient_id,
      clinic_id,
      req.user.id,
      95  // Confidence: manual review
    );

    return res.status(200).json({
      status: 'success',
      patient_id: result.patient_id,
      abha_linked: result.abha_linked,
      audit_id: result.audit_id,
      patient: result.patient
    });
  } catch (error) {
    logger.error('Error linking ABHA to existing patient', { error });
    res.status(500).json({ error: 'Failed to link ABHA' });
  }
});

// ====================================================================
// POST /api/v1/abdm/create-new-patient
// ====================================================================

/**
 * Create New Patient from ABDM Data
 * Called when user chooses to create new patient
 *
 * Request:
 * {
 *   "abha_number": "91-1000-4008-7627",
 *   "abha_address": "user@abdm",
 *   "name": "Prateek Sharma",
 *   "dob": "1986-11-27",
 *   "gender": "M",
 *   "mobile": "9650269758",
 *   "clinic_id": 1
 * }
 */
router.post('/create-new-patient', authenticate, async (req, res) => {
  try {
    const {
      abha_number,
      abha_address,
      name,
      dob,
      gender,
      mobile,
      address,
      clinic_id
    } = req.body;

    if (!clinic_id || !name || !dob) {
      return res.status(400).json({
        error: 'clinic_id, name, and dob are required'
      });
    }

    logger.info('User chose to create new patient for ABDM', {
      clinic_id,
      name,
      dob,
      user_id: req.user.id
    });

    // Create new patient
    const result = await abdmValidation.createNewPatientFromAbdm(
      {
        name,
        dob,
        gender,
        mobile,
        address,
        abhaNumber: abha_number,
        abhaAddress: abha_address
      },
      clinic_id,
      req.user.id,
      'User chose to create new patient'
    );

    return res.status(201).json({
      status: 'success',
      patient_id: result.patient_id,
      is_new: result.is_new,
      audit_id: result.audit_id,
      patient: result.patient
    });
  } catch (error) {
    logger.error('Error creating new patient from ABDM', { error });
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

// ====================================================================
// POST /api/v1/abdm/cancel-registration
// ====================================================================

/**
 * Cancel ABDM Registration
 * Called when user cancels the process
 */
router.post('/cancel-registration', authenticate, async (req, res) => {
  try {
    const { abha_number, abha_address, clinic_id } = req.body;

    if (!clinic_id) {
      return res.status(400).json({ error: 'clinic_id is required' });
    }

    logger.info('User cancelled ABDM registration', {
      clinic_id,
      abha_number,
      user_id: req.user.id
    });

    const result = await abdmValidation.cancelAbdmRegistration(
      abha_number,
      abha_address,
      clinic_id,
      req.user.id,
      'User cancelled registration'
    );

    return res.status(200).json({
      status: 'cancelled',
      audit_id: result.audit_id
    });
  } catch (error) {
    logger.error('Error cancelling ABDM registration', { error });
    res.status(500).json({ error: 'Failed to cancel registration' });
  }
});

// ====================================================================
// GET /api/v1/abdm/audit/patient/:patientId
// ====================================================================

/**
 * Get audit trail for patient
 */
router.get('/audit/patient/:patientId', authenticate, async (req, res) => {
  try {
    const { patientId } = req.params;

    const audit = await abdmValidation.getAuditTrailByPatient(patientId);

    return res.status(200).json({
      patient_id: patientId,
      audit_trail: audit
    });
  } catch (error) {
    logger.error('Error getting audit trail', { error });
    res.status(500).json({ error: 'Failed to get audit trail' });
  }
});

// ====================================================================
// GET /api/v1/abdm/audit/abha/:abhaNumber
// ====================================================================

/**
 * Get audit trail for ABHA
 */
router.get('/audit/abha/:abhaNumber', authenticate, async (req, res) => {
  try {
    const { abhaNumber } = req.params;

    const audit = await abdmValidation.getAuditTrailByAbha(abhaNumber);

    return res.status(200).json({
      abha_number: abhaNumber,
      audit_trail: audit
    });
  } catch (error) {
    logger.error('Error getting audit trail', { error });
    res.status(500).json({ error: 'Failed to get audit trail' });
  }
});

// ====================================================================
// GET /api/v1/abdm/statistics
// ====================================================================

/**
 * Get validation statistics for clinic
 *
 * Query params:
 * - days: Number of days to look back (default: 30)
 */
router.get('/statistics', authenticate, async (req, res) => {
  try {
    const clinicId = req.query.clinic_id || req.user.clinic_id;
    const days = req.query.days || 30;

    if (!clinicId) {
      return res.status(400).json({ error: 'clinic_id is required' });
    }

    const stats = await abdmValidation.getValidationStatistics(clinicId, days);

    return res.status(200).json({
      clinic_id: clinicId,
      period_days: days,
      statistics: stats
    });
  } catch (error) {
    logger.error('Error getting statistics', { error });
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

module.exports = router;
