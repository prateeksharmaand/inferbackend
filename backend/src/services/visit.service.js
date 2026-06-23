/**
 * Visit Service
 *
 * Manages patient visit lifecycle:
 *   - Create visit (from appointment or walk-in)
 *   - Check-in visit (mark arrival)
 *   - Complete visit (mark departure)
 *   - Track visit history
 *
 * A visit represents a patient's arrival at the clinic.
 * Separate from appointment (scheduling) and encounter (clinical).
 */

const logger = require('../utils/logger');

/**
 * Create a visit (from appointment or walk-in)
 *
 * @param {Pool} pool - Database pool
 * @param {Object} params - {
 *   clinicId: integer,
 *   patientId: integer,
 *   appointmentId?: integer,      // NULL for walk-ins
 *   visitDate: date,
 *   visitTime?: time,
 *   visitType: 'walk_in'|'appointment'|'scheduled'|'emergency',
 *   doctorId?: integer,
 *   queueId?: integer,
 *   tokenNumber?: integer
 * }
 * @returns {Promise<Object>} visit record
 */
async function createVisit(pool, {
  clinicId,
  patientId,
  appointmentId,
  visitDate,
  visitTime,
  visitType = 'appointment',
  doctorId,
  queueId,
  tokenNumber,
}) {
  if (!clinicId || !patientId || !visitDate || !visitType) {
    throw new Error('clinicId, patientId, visitDate, visitType are required');
  }

  // Check if visit already exists for this appointment
  if (appointmentId) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM emr_visits WHERE appointment_id = $1`,
      [appointmentId]
    );
    if (existing.length > 0) {
      logger.info('Visit already exists for appointment', { appointmentId, visitId: existing[0].id });
      return existing[0];
    }
  }

  // Create visit
  const { rows } = await pool.query(
    `INSERT INTO emr_visits (
      clinic_id, patient_id, appointment_id, visit_date, visit_time,
      visit_type, status, doctor_id, queue_id, token_number, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    RETURNING *`,
    [
      clinicId,
      patientId,
      appointmentId || null,
      visitDate,
      visitTime || null,
      visitType,
      'pending',
      doctorId || null,
      queueId || null,
      tokenNumber || null,
    ]
  );

  const visit = rows[0];

  logger.info('Visit created', {
    visitId: visit.id,
    patientId,
    clinicId,
    visitType,
    appointmentId: appointmentId || null,
  });

  return visit;
}

/**
 * Check-in a visit (mark patient arrival)
 *
 * @param {Pool} pool - Database pool
 * @param {Integer} visitId - Visit ID
 * @param {Object} params - { doctorId?, queueId?, tokenNumber? }
 * @returns {Promise<Object>} updated visit record
 */
async function checkInVisit(pool, visitId, { doctorId, queueId, tokenNumber } = {}) {
  if (!visitId) {
    throw new Error('visitId is required');
  }

  // Get visit first to verify it exists
  const { rows: visits } = await pool.query(
    `SELECT * FROM emr_visits WHERE id = $1`,
    [visitId]
  );

  if (!visits.length) {
    throw new Error(`Visit not found: ${visitId}`);
  }

  const visit = visits[0];

  if (visit.status !== 'pending') {
    throw new Error(`Visit already ${visit.status}. Cannot check-in.`);
  }

  // Update visit with check-in timestamp
  const { rows } = await pool.query(
    `UPDATE emr_visits
     SET status = 'checked_in',
         checked_in_at = NOW(),
         doctor_id = COALESCE($1, doctor_id),
         queue_id = COALESCE($2, queue_id),
         token_number = COALESCE($3, token_number),
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [doctorId || null, queueId || null, tokenNumber || null, visitId]
  );

  const updated = rows[0];

  logger.info('Visit checked in', {
    visitId,
    patientId: visit.patient_id,
    clinicId: visit.clinic_id,
    checkedInAt: updated.checked_in_at,
  });

  return updated;
}

/**
 * Complete a visit (mark patient departure)
 *
 * @param {Pool} pool - Database pool
 * @param {Integer} visitId - Visit ID
 * @param {Object} params - { status?, cancellationReason? }
 * @returns {Promise<Object>} updated visit record
 */
async function completeVisit(pool, visitId, {
  status = 'completed',
  cancellationReason = null,
} = {}) {
  if (!visitId) {
    throw new Error('visitId is required');
  }

  if (!['completed', 'no_show', 'cancelled'].includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  // Get visit first
  const { rows: visits } = await pool.query(
    `SELECT * FROM emr_visits WHERE id = $1`,
    [visitId]
  );

  if (!visits.length) {
    throw new Error(`Visit not found: ${visitId}`);
  }

  const visit = visits[0];

  // Validate state transition
  if (status === 'completed' || status === 'no_show') {
    // These require visit to be checked in
    if (!visit.checked_in_at) {
      throw new Error(`Visit must be checked in before marking ${status}`);
    }
  }

  // Update visit
  const { rows } = await pool.query(
    `UPDATE emr_visits
     SET status = $1,
         checked_out_at = NOW(),
         cancellation_reason = $2,
         cancelled_at = CASE WHEN $1 = 'cancelled' THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, cancellationReason || null, visitId]
  );

  const updated = rows[0];

  logger.info('Visit completed', {
    visitId,
    patientId: visit.patient_id,
    status,
    duration: updated.checked_in_at ? new Date(updated.checked_out_at) - new Date(updated.checked_in_at) : null,
  });

  return updated;
}

/**
 * Get visit by ID
 *
 * @param {Pool} pool - Database pool
 * @param {Integer} visitId - Visit ID
 * @returns {Promise<Object>} visit record with related data
 */
async function getVisit(pool, visitId) {
  const { rows } = await pool.query(
    `SELECT v.*,
            p.name as patient_name,
            p.mobile as patient_mobile,
            d.name as doctor_name,
            q.name as queue_name,
            (SELECT ec.id FROM emr_encounters ec WHERE ec.visit_id = v.id LIMIT 1) AS encounter_id
     FROM emr_visits v
     LEFT JOIN emr_patients p ON p.id = v.patient_id
     LEFT JOIN emr_clinic_staff d ON d.id = v.doctor_id
     LEFT JOIN emr_queues q ON q.id = v.queue_id
     WHERE v.id = $1`,
    [visitId]
  );

  if (!rows.length) {
    throw new Error(`Visit not found: ${visitId}`);
  }

  return rows[0];
}

/**
 * List visits for a clinic on a specific date
 *
 * @param {Pool} pool - Database pool
 * @param {Integer} clinicId - Clinic ID
 * @param {String} date - YYYY-MM-DD format
 * @param {Object} filters - { status?, queueId?, doctorId? }
 * @returns {Promise<Array>} visit records
 */
async function listVisitsForDate(pool, clinicId, date, {
  status = null,
  queueId = null,
  doctorId = null,
} = {}) {
  let sql = `
    SELECT v.*,
           p.name as patient_name,
           p.mobile as patient_mobile,
           d.name as doctor_name,
           q.name as queue_name
    FROM emr_visits v
    LEFT JOIN emr_patients p ON p.id = v.patient_id
    LEFT JOIN emr_clinic_staff d ON d.id = v.doctor_id
    LEFT JOIN emr_queues q ON q.id = v.queue_id
    WHERE v.clinic_id = $1 AND v.visit_date = $2::date
  `;
  const params = [clinicId, date];
  let idx = 3;

  if (status) {
    sql += ` AND v.status = $${idx}`;
    params.push(status);
    idx++;
  }
  if (queueId) {
    sql += ` AND v.queue_id = $${idx}`;
    params.push(queueId);
    idx++;
  }
  if (doctorId) {
    sql += ` AND v.doctor_id = $${idx}`;
    params.push(doctorId);
    idx++;
  }

  sql += ` ORDER BY COALESCE(v.token_number, 9999), v.visit_time NULLS LAST, v.checked_in_at NULLS LAST`;

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Get visit history for a patient
 *
 * @param {Pool} pool - Database pool
 * @param {Integer} patientId - Patient ID
 * @param {Integer} clinicId - Clinic ID (optional, for clinic-specific history)
 * @param {Object} options - { limit, offset }
 * @returns {Promise<Array>} visit records (recent first)
 */
async function getVisitHistory(pool, patientId, clinicId = null, {
  limit = 20,
  offset = 0,
} = {}) {
  let sql = `
    SELECT v.*,
           d.name as doctor_name,
           q.name as queue_name,
           (SELECT ec.id FROM emr_encounters ec WHERE ec.visit_id = v.id LIMIT 1) AS encounter_id
    FROM emr_visits v
    LEFT JOIN emr_clinic_staff d ON d.id = v.doctor_id
    LEFT JOIN emr_queues q ON q.id = v.queue_id
    WHERE v.patient_id = $1
  `;
  const params = [patientId];
  let idx = 2;

  if (clinicId) {
    sql += ` AND v.clinic_id = $${idx}`;
    params.push(clinicId);
    idx++;
  }

  sql += ` ORDER BY v.visit_date DESC, v.visit_time DESC
           LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Get visit statistics for a clinic
 *
 * @param {Pool} pool - Database pool
 * @param {Integer} clinicId - Clinic ID
 * @param {String} fromDate - YYYY-MM-DD
 * @param {String} toDate - YYYY-MM-DD
 * @returns {Promise<Object>} statistics
 */
async function getVisitStats(pool, clinicId, fromDate, toDate) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) as total_visits,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
       SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END) as checked_in,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN visit_type = 'walk_in' THEN 1 ELSE 0 END) as walk_ins,
       AVG(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))) as avg_visit_duration_seconds
     FROM emr_visits
     WHERE clinic_id = $1
       AND visit_date >= $2::date
       AND visit_date <= $3::date`,
    [clinicId, fromDate, toDate]
  );

  return rows[0] || {};
}

module.exports = {
  createVisit,
  checkInVisit,
  completeVisit,
  getVisit,
  listVisitsForDate,
  getVisitHistory,
  getVisitStats,
};
