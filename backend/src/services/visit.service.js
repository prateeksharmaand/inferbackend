/**
 * Visit Service
 *
 * Manages clinic visits - decoupled from appointments and doctors.
 * Supports various visit types: consultation, lab, vaccination, report collection, etc.
 */

const logger = require('../utils/logger');
const { pool } = require('../config/database');

const VISIT_TYPES = {
  CONSULTATION: 'consultation',
  LAB: 'lab',
  VACCINATION: 'vaccination',
  PHARMACY: 'pharmacy',
  REPORT_COLLECTION: 'report_collection',
  REGISTRATION: 'registration',
  INSURANCE: 'insurance',
  PROCEDURE: 'procedure',
  FOLLOWUP: 'followup',
  OTHER: 'other'
};

const VISIT_STATUSES = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show'
};

// Visit type rules: doctor requirement and appointment requirement
const VISIT_TYPE_RULES = {
  consultation: { requiresDoctor: true, requiresAppointment: true, abdmEligible: true },
  lab: { requiresDoctor: false, requiresAppointment: false, abdmEligible: true },
  vaccination: { requiresDoctor: false, requiresAppointment: false, abdmEligible: true },
  report_collection: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false },
  pharmacy: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false },
  registration: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false },
  insurance: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false },
  procedure: { requiresDoctor: true, requiresAppointment: true, abdmEligible: true },
  followup: { requiresDoctor: true, requiresAppointment: true, abdmEligible: true },
  other: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false }
};

class VisitService {
  async createVisit(clinicId, patientId, {
    appointmentId = null,
    doctorId = null,
    visitType = 'other',
    notes = null,
    createdBy = null
  }) {
    if (!Object.values(VISIT_TYPES).includes(visitType)) {
      throw new Error(`Invalid visit_type: ${visitType}`);
    }

    const { rows: queueRows } = await pool.query(
      `SELECT MAX(queue_number) as max_queue FROM emr_visits
       WHERE clinic_id = $1 AND DATE(created_at) = CURRENT_DATE`,
      [clinicId]
    );
    const queueNumber = (queueRows[0]?.max_queue || 0) + 1;

    const { rows } = await pool.query(
      `INSERT INTO emr_visits
       (clinic_id, patient_id, appointment_id, doctor_id, visit_type, status, queue_number, check_in_time, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, NOW(), NOW())
       RETURNING *`,
      [clinicId, patientId, appointmentId || null, doctorId || null, visitType, 'waiting', queueNumber, notes, createdBy || null]
    );

    logger.info('[VISIT] Created', { visitId: rows[0].id, visitType, queueNumber });
    return rows[0];
  }

  async listVisits(clinicId, date, { visitType = null, status = null, doctorId = null } = {}) {
    let sql = `SELECT v.*, p.name as patient_name, p.mobile as patient_mobile, d.name as doctor_name
      FROM emr_visits v
      LEFT JOIN emr_patients p ON v.patient_id = p.id
      LEFT JOIN emr_clinic_staff d ON v.doctor_id = d.id
      WHERE v.clinic_id = $1 AND DATE(v.created_at) = $2`;

    const params = [clinicId, date];
    let idx = 3;

    if (visitType) { sql += ` AND v.visit_type = $${idx++}`; params.push(visitType); }
    if (status) { sql += ` AND v.status = $${idx++}`; params.push(status); }
    if (doctorId) { sql += ` AND v.doctor_id = $${idx++}`; params.push(doctorId); }

    sql += ` ORDER BY v.queue_number, v.created_at`;
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  async updateVisitStatus(visitId, clinicId, newStatus) {
    if (!Object.values(VISIT_STATUSES).includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const { rows } = await pool.query(
      `UPDATE emr_visits SET status = $1, updated_at = NOW() WHERE id = $2 AND clinic_id = $3 RETURNING *`,
      [newStatus, visitId, clinicId]
    );

    if (!rows.length) throw new Error('Visit not found');
    logger.info('[VISIT] Status updated', { visitId, newStatus });
    return rows[0];
  }

  async checkInVisit(visitId, clinicId) {
    const { rows } = await pool.query(
      `UPDATE emr_visits SET check_in_time = NOW(), status = $1, updated_at = NOW() WHERE id = $2 AND clinic_id = $3 RETURNING *`,
      ['in_progress', visitId, clinicId]
    );

    if (!rows.length) throw new Error('Visit not found');
    logger.info('[VISIT] Checked in', { visitId });
    return rows[0];
  }

  async checkOutVisit(visitId, clinicId, finalStatus = 'completed') {
    const { rows } = await pool.query(
      `UPDATE emr_visits SET check_out_time = NOW(), status = $1, updated_at = NOW() WHERE id = $2 AND clinic_id = $3 RETURNING *`,
      [finalStatus, visitId, clinicId]
    );

    if (!rows.length) throw new Error('Visit not found');
    logger.info('[VISIT] Checked out', { visitId });
    return rows[0];
  }

  async assignDoctor(visitId, clinicId, doctorId) {
    const { rows } = await pool.query(
      `UPDATE emr_visits SET doctor_id = $1, updated_at = NOW() WHERE id = $2 AND clinic_id = $3 RETURNING *`,
      [doctorId, visitId, clinicId]
    );

    if (!rows.length) throw new Error('Visit not found');
    logger.info('[VISIT] Doctor assigned', { visitId, doctorId });
    return rows[0];
  }

  async getVisitStats(clinicId, date) {
    const { rows: statuses } = await pool.query(
      `SELECT status, COUNT(*) as count FROM emr_visits WHERE clinic_id = $1 AND DATE(created_at) = $2 GROUP BY status`,
      [clinicId, date]
    );

    const { rows: types } = await pool.query(
      `SELECT visit_type, COUNT(*) as count FROM emr_visits WHERE clinic_id = $1 AND DATE(created_at) = $2 GROUP BY visit_type`,
      [clinicId, date]
    );

    return {
      byStatus: Object.fromEntries(statuses.map(s => [s.status, s.count])),
      byType: Object.fromEntries(types.map(t => [t.visit_type, t.count])),
      total: statuses.reduce((sum, s) => sum + s.count, 0)
    };
  }
}

const visitService = new VisitService();

// Export service as default + attach constants
module.exports = visitService;
module.exports.VISIT_TYPES = VISIT_TYPES;
module.exports.VISIT_STATUSES = VISIT_STATUSES;
module.exports.VISIT_TYPE_RULES = VISIT_TYPE_RULES;
