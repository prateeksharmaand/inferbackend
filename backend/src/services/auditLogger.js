/**
 * Audit Logger — OWASP A10 / ABDM Mandatory Audit Trail
 *
 * Logs every security-relevant event to the audit_logs table.
 * Rules:
 *   - Never logs PHI (patient name, mobile, DOB, diagnosis, OTP value)
 *   - Always logs: who, what, when, from where, and the outcome
 *   - Inserts are fire-and-forget (never await in hot paths) but errors are captured
 *   - The details JSONB column stores non-PHI metadata only
 */

const { pool } = require('../config/database');
const logger   = require('../utils/logger');

// ── Event type constants ──────────────────────────────────────────────────────
const EVENTS = {
  // Auth
  AUTH_LOGIN_SUCCESS:      'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAIL:         'AUTH_LOGIN_FAIL',
  AUTH_LOGOUT:             'AUTH_LOGOUT',
  AUTH_PASSWORD_CHANGE:    'AUTH_PASSWORD_CHANGE',
  AUTH_PASSWORD_RESET:     'AUTH_PASSWORD_RESET',
  AUTH_TOKEN_INVALID:      'AUTH_TOKEN_INVALID',
  AUTH_CLINIC_SUSPENDED:   'AUTH_CLINIC_SUSPENDED',

  // Patient
  PATIENT_CREATE:          'PATIENT_CREATE',
  PATIENT_READ:            'PATIENT_READ',
  PATIENT_UPDATE:          'PATIENT_UPDATE',
  PATIENT_DELETE:          'PATIENT_DELETE',
  PATIENT_ABHA_LINK:       'PATIENT_ABHA_LINK',

  // ABDM HIP
  ABDM_DISCOVERY:          'ABDM_DISCOVERY',
  ABDM_LINK_INIT:          'ABDM_LINK_INIT',
  ABDM_LINK_OTP_SUCCESS:   'ABDM_LINK_OTP_SUCCESS',
  ABDM_LINK_OTP_FAIL:      'ABDM_LINK_OTP_FAIL',
  ABDM_LINK_OTP_EXPIRED:   'ABDM_LINK_OTP_EXPIRED',
  ABDM_LINK_OTP_LOCKED:    'ABDM_LINK_OTP_LOCKED',
  ABDM_CONSENT_NOTIFY:     'ABDM_CONSENT_NOTIFY',
  ABDM_HEALTH_INFO_REQ:    'ABDM_HEALTH_INFO_REQ',
  ABDM_HEALTH_INFO_PUSH:   'ABDM_HEALTH_INFO_PUSH',
  ABDM_HEALTH_INFO_DENIED: 'ABDM_HEALTH_INFO_DENIED',
  ABDM_PROFILE_SHARE:      'ABDM_PROFILE_SHARE',
  ABDM_CALLBACK_REJECTED:  'ABDM_CALLBACK_REJECTED',

  // Consent (HIU)
  CONSENT_CREATE:          'CONSENT_CREATE',
  CONSENT_GRANT:           'CONSENT_GRANT',
  CONSENT_DENY:            'CONSENT_DENY',
  CONSENT_DATA_PULL:       'CONSENT_DATA_PULL',

  // ABHA creation / verification
  ABHA_OTP_REQUEST:        'ABHA_OTP_REQUEST',
  ABHA_OTP_VERIFY:         'ABHA_OTP_VERIFY',
  ABHA_CREATE:             'ABHA_CREATE',
  ABHA_VERIFY:             'ABHA_VERIFY',

  // Care contexts
  CARE_CONTEXT_ADD:        'CARE_CONTEXT_ADD',
  CARE_CONTEXT_DELETE:     'CARE_CONTEXT_DELETE',
};

// ── Core log function ─────────────────────────────────────────────────────────

/**
 * @param {object} entry
 * @param {string}  entry.eventType   - one of EVENTS.*
 * @param {object}  [entry.req]       - Express request (for IP, UA, requestId)
 * @param {number}  [entry.userId]
 * @param {string}  [entry.userEmail]
 * @param {string}  [entry.userRole]
 * @param {number}  [entry.clinicId]
 * @param {number}  [entry.patientId]
 * @param {string}  [entry.consentId]
 * @param {string}  [entry.transactionId]
 * @param {string}  [entry.action]    - human-readable summary (no PHI)
 * @param {string}  [entry.status]    - SUCCESS | FAILURE | DENIED
 * @param {string}  [entry.severity]  - INFO | WARN | CRITICAL
 * @param {object}  [entry.details]   - extra non-PHI metadata
 */
function log(entry) {
  const {
    eventType, req,
    userId, userEmail, userRole, clinicId,
    patientId, consentId, transactionId,
    action, details,
    status   = 'SUCCESS',
    severity = 'INFO',
  } = entry;

  // Extract from request if provided
  const ip        = req?.ip || req?.headers?.['x-forwarded-for'] || null;
  const userAgent = req?.headers?.['user-agent']  || null;
  const requestId = req?.requestId || req?.headers?.['x-request-id'] || null;
  const resource  = req ? `${req.method} ${req.path}` : null;

  // Fire-and-forget — never block the response
  pool.query(
    `INSERT INTO audit_logs
       (event_type, user_id, user_email, user_role, clinic_id,
        ip_address, user_agent, request_id, resource, action,
        patient_id, consent_id, transaction_id,
        status, severity, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      eventType, userId ?? null, userEmail ?? null, userRole ?? null, clinicId ?? null,
      ip, userAgent, requestId, resource, action ?? null,
      patientId ?? null, consentId ?? null, transactionId ?? null,
      status, severity, details ? JSON.stringify(details) : null,
    ]
  ).catch(err => {
    // Audit log failure must never crash the app — but must be visible
    logger.error('AUDIT LOG INSERT FAILED', { eventType, error: err.message });
  });
}

// ── Convenience methods ───────────────────────────────────────────────────────

function loginSuccess(req, user, role) {
  log({
    eventType: EVENTS.AUTH_LOGIN_SUCCESS,
    req,
    userId: user.id, userEmail: user.email, userRole: role, clinicId: user.clinic_id,
    action: `Login successful`,
    status: 'SUCCESS', severity: 'INFO',
    details: { clinicId: user.clinic_id },
  });
}

function loginFail(req, email, reason) {
  log({
    eventType: EVENTS.AUTH_LOGIN_FAIL,
    req,
    userEmail: email,
    action: `Login failed: ${reason}`,
    status: 'FAILURE', severity: 'WARN',
    details: { reason },
  });
}

function abdmCallbackRejected(req, reason) {
  log({
    eventType: EVENTS.ABDM_CALLBACK_REJECTED,
    req,
    userRole: 'abdm_gateway',
    action: `ABDM callback rejected: ${reason}`,
    status: 'DENIED', severity: 'WARN',
    details: { reason, path: req?.path },
  });
}

function abdmDiscovery(req, matched, contextCount) {
  log({
    eventType: EVENTS.ABDM_DISCOVERY,
    req,
    userRole: 'abdm_gateway',
    requestId: req?.headers?.['request-id'],
    action: matched ? `Discovery: matched patient, ${contextCount} care contexts` : 'Discovery: no match',
    status: 'SUCCESS', severity: 'INFO',
    details: { matched, contextCount },
  });
}

function abdmLinkInit(req, linkRefNumber) {
  log({
    eventType: EVENTS.ABDM_LINK_INIT,
    req,
    userRole: 'abdm_gateway',
    action: 'OTP generated for care-context linking',
    status: 'SUCCESS', severity: 'INFO',
    details: { linkRefNumber },
  });
}

function abdmOtpResult(req, eventType, linkRefNumber, attemptsRemaining) {
  const isFailure = [EVENTS.ABDM_LINK_OTP_FAIL, EVENTS.ABDM_LINK_OTP_EXPIRED, EVENTS.ABDM_LINK_OTP_LOCKED].includes(eventType);
  log({
    eventType,
    req,
    userRole: 'abdm_gateway',
    action: `OTP ${eventType.replace('ABDM_LINK_OTP_', '').toLowerCase()}`,
    status: isFailure ? 'FAILURE' : 'SUCCESS',
    severity: eventType === EVENTS.ABDM_LINK_OTP_LOCKED ? 'WARN' : 'INFO',
    details: { linkRefNumber, attemptsRemaining },
  });
}

function abdmHealthInfoRequest(req, transactionId, consentId, status) {
  log({
    eventType: status === 'DENIED' ? EVENTS.ABDM_HEALTH_INFO_DENIED : EVENTS.ABDM_HEALTH_INFO_REQ,
    req,
    userRole: 'abdm_gateway',
    transactionId,
    consentId,
    action: `Health info request: ${status}`,
    status: status === 'DENIED' ? 'DENIED' : 'SUCCESS',
    severity: status === 'DENIED' ? 'WARN' : 'INFO',
    details: { consentId, transactionId },
  });
}

function abdmHealthInfoPush(req, transactionId, entryCount, encrypted) {
  log({
    eventType: EVENTS.ABDM_HEALTH_INFO_PUSH,
    req,
    userRole: 'abdm_gateway',
    transactionId,
    action: `Health data pushed: ${entryCount} care context(s), encrypted=${encrypted}`,
    status: 'SUCCESS', severity: 'INFO',
    details: { entryCount, encrypted, transactionId },
  });
}

function abdmConsentNotify(req, consentId, consentStatus) {
  log({
    eventType: EVENTS.ABDM_CONSENT_NOTIFY,
    req,
    userRole: 'abdm_gateway',
    consentId,
    action: `Consent notification: ${consentStatus}`,
    status: 'SUCCESS', severity: 'INFO',
    details: { consentId, consentStatus },
  });
}

function consentCreate(req, user, patientAbha, requestId) {
  log({
    eventType: EVENTS.CONSENT_CREATE,
    req,
    userId: user?.id, userEmail: user?.email, userRole: user?.role, clinicId: user?.clinic_id,
    consentId: requestId,
    action: `Consent request created for patient`,
    status: 'SUCCESS', severity: 'INFO',
    details: { requestId, hasPatientAbha: !!patientAbha },
  });
}

function patientAccess(req, user, patientId, action) {
  log({
    eventType: action === 'READ' ? EVENTS.PATIENT_READ : action === 'CREATE' ? EVENTS.PATIENT_CREATE : action === 'UPDATE' ? EVENTS.PATIENT_UPDATE : EVENTS.PATIENT_DELETE,
    req,
    userId: user?.id, userEmail: user?.email, userRole: user?.role, clinicId: user?.clinic_id,
    patientId,
    action: `Patient ${action.toLowerCase()}`,
    status: 'SUCCESS', severity: 'INFO',
    details: { patientId },
  });
}

function abhaAction(req, user, eventType, patientId) {
  log({
    eventType,
    req,
    userId: user?.id, userEmail: user?.email, userRole: user?.role, clinicId: user?.clinic_id,
    patientId,
    action: `ABHA: ${eventType}`,
    status: 'SUCCESS', severity: 'INFO',
    details: { patientId },
  });
}

// ── Audit log viewer (admin endpoint) ────────────────────────────────────────

async function getRecentLogs({ clinicId, eventType, status, severity, ipAddress, limit = 100, offset = 0 }) {
  const conditions = [];
  const params = [];

  if (clinicId)   { params.push(clinicId);   conditions.push(`clinic_id = $${params.length}`); }
  if (eventType)  { params.push(eventType);  conditions.push(`event_type = $${params.length}`); }
  if (status)     { params.push(status);     conditions.push(`status = $${params.length}`); }
  if (severity)   { params.push(severity);   conditions.push(`severity = $${params.length}`); }
  if (ipAddress)  { params.push(ipAddress);  conditions.push(`ip_address = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT id, event_time, event_type, user_email, user_role, clinic_id,
            ip_address, user_agent, request_id, resource, action,
            patient_id, consent_id, transaction_id, status, severity, details
     FROM audit_logs
     ${where}
     ORDER BY event_time DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

module.exports = {
  EVENTS,
  log,
  loginSuccess,
  loginFail,
  abdmCallbackRejected,
  abdmDiscovery,
  abdmLinkInit,
  abdmOtpResult,
  abdmHealthInfoRequest,
  abdmHealthInfoPush,
  abdmConsentNotify,
  consentCreate,
  patientAccess,
  abhaAction,
  getRecentLogs,
};
