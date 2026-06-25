/**
 * ABDM HIP Discovery Service
 *
 * Handles patient discovery and care context generation for ABDM Gateway
 * Fixes error: "Invalid count, must be 2 digit and ranges between 1 to 20"
 *
 * Key Changes:
 * 1. Added required "count" field (01-20 format)
 * 2. Added careContextType to all care contexts
 * 3. Creates default care context if none exist
 * 4. Validates response before sending to ABDM
 */

const logger = require('../utils/logger');

/**
 * Generate care contexts for a patient
 * Returns array of care context objects with referenceNumber, display, careContextType
 */
const generateCareContexts = async (patientId, pool) => {
  try {
    if (!patientId) {
      logger.warn('generateCareContexts: no patientId provided');
      return [];
    }

    // Query: Get all completed/ongoing appointments (care contexts) for patient
    // Limit to 20 (ABDM max)
    const { rows: encounters } = await pool.query(
      `SELECT DISTINCT ON (DATE(appointment_date))
         appointment_id := id,
         appointment_date,
         patient_name,
         emr_patient_id
       FROM emr_appointments
       WHERE emr_patient_id = $1
         AND status IN ('completed', 'ongoing', 'checked_in')
         AND appointment_date <= NOW()
         AND deleted_at IS NULL
       ORDER BY DATE(appointment_date) DESC, created_at DESC
       LIMIT 20`,
      [patientId]
    );

    // If no encounters, return empty array (will use default later)
    if (!encounters || encounters.length === 0) {
      logger.info('No care contexts found for patient', { patientId });
      return [];
    }

    // Transform encounters to ABDM care contexts
    const careContexts = encounters.map((encounter) => {
      const apptIso = new Date(encounter.appointment_date).toISOString().split('T')[0];
      const dateStr = apptIso.split("-").join(""); // "2026-06-25" → "20260625"
      return {
        referenceNumber: `${patientId}-${dateStr}`,
        display: `OPD Consultation - ${apptIso}`,
        careContextType: 'OP' // ✅ REQUIRED field
      };
    });

    logger.info('Generated care contexts', {
      patientId,
      count: careContexts.length
    });

    return careContexts;
  } catch (error) {
    logger.error('Error generating care contexts', {
      patientId,
      error: error.message
    });
    return []; // Return empty, will use default
  }
};

/**
 * Get or create a default care context for patient
 * Used when no existing care contexts are found
 */
const getDefaultCareContext = (patientId) => {
  return {
    referenceNumber: `${patientId}-default`,
    display: 'Default OPD Care Context',
    careContextType: 'OP'
  };
};

/**
 * Validate ABDM discovery response structure
 * Throws error if validation fails
 */
const validateDiscoveryResponse = (response) => {
  const errors = [];

  // Validate top-level fields
  if (!response.requestId) errors.push('Missing requestId');
  if (!response.transactionId) errors.push('Missing transactionId');
  if (!response.timestamp) errors.push('Missing timestamp');

  // Validate timestamp format (ISO-8601)
  if (response.timestamp) {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (!iso8601Regex.test(response.timestamp)) {
      errors.push('Invalid timestamp format (must be ISO-8601)');
    }
  }

  // If patient is null, that's valid (patient not found)
  if (response.patient === null) {
    if (!response.resp || !response.resp.requestId) {
      errors.push('resp.requestId required when patient is null');
    }
    // count field not required for null patient
    return;
  }

  // ✅ CRITICAL: count field is REQUIRED
  if (!response.count) {
    errors.push('count field is required (format: 01-20)');
  } else {
    const countNum = parseInt(response.count);
    if (isNaN(countNum) || countNum < 1 || countNum > 20) {
      errors.push(`count must be 2-digit number 01-20, got: ${response.count}`);
    }
  }

  // If patient exists, validate patient object
  if (response.patient) {
    if (!response.patient.id) {
      errors.push('patient.id (ABHA address) is required');
    }
    if (!response.patient.referenceNumber) {
      errors.push('patient.referenceNumber is required');
    }
    if (!response.patient.display) {
      errors.push('patient.display is required');
    }

    // Validate care contexts array
    if (!Array.isArray(response.patient.careContexts)) {
      errors.push('patient.careContexts must be an array');
    } else if (response.patient.careContexts.length === 0) {
      errors.push('patient.careContexts must not be empty');
    } else {
      // Validate each care context
      response.patient.careContexts.forEach((cc, idx) => {
        if (!cc.referenceNumber) {
          errors.push(`careContext[${idx}]: missing referenceNumber`);
        }
        if (!cc.display) {
          errors.push(`careContext[${idx}]: missing display`);
        }
        if (!cc.careContextType) {
          errors.push(`careContext[${idx}]: missing careContextType`);
        } else if (!['IP', 'OP', 'Both', 'Other'].includes(cc.careContextType)) {
          errors.push(`careContext[${idx}]: invalid careContextType '${cc.careContextType}'`);
        }
      });
    }
  }

  // Validate resp
  if (!response.resp || !response.resp.requestId) {
    errors.push('resp.requestId is required');
  }

  // If any validation errors, throw
  if (errors.length > 0) {
    const errorMsg = errors.join(' | ');
    logger.error('ABDM Discovery Response Validation Failed', {
      errors: errors,
      response: response
    });
    throw new Error('Invalid discovery response: ' + errorMsg);
  }
};

/**
 * Build ABDM-compliant discovery response
 */
const buildDiscoveryResponse = (requestId, transactionId, patient, careContexts) => {
  // If patient not found
  if (!patient) {
    return {
      requestId: requestId,
      timestamp: new Date().toISOString(),
      transactionId: transactionId,
      patient: null,
      resp: {
        requestId: requestId
      }
    };
  }

  // If patient found, ensure care contexts exist
  let contexts = careContexts || [];
  if (!contexts || contexts.length === 0) {
    logger.warn('No care contexts, using default', { patientId: patient.id });
    contexts = [getDefaultCareContext(patient.id)];
  }

  // Build response
  const response = {
    requestId: requestId,
    timestamp: new Date().toISOString(),
    transactionId: transactionId,
    count: String(contexts.length).padStart(2, '0'), // ✅ Format: 01-20
    patient: {
      id: patient.abha_address || patient.abha_number,
      referenceNumber: patient.abha_address || patient.abha_number,
      display: patient.name,
      careContexts: contexts.slice(0, 20), // Max 20
      matchedBy: ['ABHA_ID']
    },
    resp: {
      requestId: requestId
    }
  };

  return response;
};

/**
 * Send discovery result to ABDM Gateway
 */
const sendDiscoveryResult = async (requestId, transactionId, patient, hip, pool) => {
  try {
    let careContexts = [];

    // Generate care contexts if patient found
    if (patient) {
      careContexts = await generateCareContexts(patient.id, pool);
    }

    // Build response
    const response = buildDiscoveryResponse(
      requestId,
      transactionId,
      patient,
      careContexts
    );

    // Validate before sending
    validateDiscoveryResponse(response);

    logger.info('ABDM Discovery Response Ready', {
      patientId: patient?.id,
      careContextCount: response.patient?.careContexts?.length || 0,
      count: response.count
    });

    // Send to ABDM Gateway
    return hip.gwPostWithRetry('/v0.5/care-contexts/on-discover', response);
  } catch (error) {
    logger.error('Discovery result error', {
      error: error.message,
      patientId: patient?.id,
      requestId
    });

    // Send error response to ABDM
    const errorResponse = {
      requestId: requestId,
      timestamp: new Date().toISOString(),
      transactionId: transactionId,
      error: {
        code: 'GATEWAY_ERROR',
        message: 'Unable to process discovery request'
      },
      resp: {
        requestId: requestId
      }
    };

    try {
      return hip.gwPostWithRetry('/v0.5/care-contexts/on-discover', errorResponse);
    } catch (sendError) {
      logger.error('Failed to send error response to ABDM', {
        error: sendError.message
      });
    }
  }
};

module.exports = {
  generateCareContexts,
  getDefaultCareContext,
  validateDiscoveryResponse,
  buildDiscoveryResponse,
  sendDiscoveryResult
};
