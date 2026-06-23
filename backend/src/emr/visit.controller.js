/**
 * Visit Controller
 *
 * Endpoints:
 *   POST /visits - Create visit
 *   GET /visits/:id - Get visit
 *   PATCH /visits/:id/check-in - Check-in visit
 *   PATCH /visits/:id/complete - Complete visit
 *   GET /visits?clinic_id=X&date=YYYY-MM-DD - List visits for date
 *   GET /patients/:patientId/visits - Get visit history
 *   GET /clinics/:clinicId/visits/stats - Visit statistics
 */

const { pool } = require('../config/database');
const VisitService = require('../services/visit.service');
const logger = require('../utils/logger');

// POST /visits - Create visit
const createVisit = async (req, res) => {
  const {
    patient_id,
    appointment_id,
    visit_date,
    visit_time,
    visit_type = 'appointment',
    doctor_id,
    queue_id,
    token_number,
  } = req.body;

  if (!patient_id || !visit_date || !visit_type) {
    return res.status(400).json({
      error: 'patient_id, visit_date, visit_type are required',
    });
  }

  try {
    const visit = await VisitService.createVisit(pool, {
      clinicId: req.emrUser.clinic_id,
      patientId: patient_id,
      appointmentId: appointment_id || null,
      visitDate: visit_date,
      visitTime: visit_time || null,
      visitType: visit_type,
      doctorId: doctor_id || null,
      queueId: queue_id || null,
      tokenNumber: token_number || null,
    });

    res.status(201).json(visit);
  } catch (err) {
    logger.error('Failed to create visit', { error: err.message, patient_id });
    res.status(400).json({ error: err.message });
  }
};

// GET /visits/:id - Get visit with details
const getVisit = async (req, res) => {
  try {
    const visit = await VisitService.getVisit(pool, parseInt(req.params.id, 10));
    res.json(visit);
  } catch (err) {
    logger.warn('Visit not found', { visitId: req.params.id });
    res.status(404).json({ error: err.message });
  }
};

// PATCH /visits/:id/check-in - Check-in visit
const checkInVisit = async (req, res) => {
  const { doctor_id, queue_id, token_number } = req.body;

  try {
    const visit = await VisitService.checkInVisit(pool, parseInt(req.params.id, 10), {
      doctorId: doctor_id || null,
      queueId: queue_id || null,
      tokenNumber: token_number || null,
    });

    res.json(visit);
  } catch (err) {
    logger.warn('Check-in failed', { visitId: req.params.id, error: err.message });
    res.status(400).json({ error: err.message });
  }
};

// PATCH /visits/:id/complete - Complete/cancel visit
const completeVisit = async (req, res) => {
  const { status = 'completed', cancellation_reason } = req.body;

  if (!['completed', 'no_show', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const visit = await VisitService.completeVisit(pool, parseInt(req.params.id, 10), {
      status,
      cancellationReason: cancellation_reason || null,
    });

    res.json(visit);
  } catch (err) {
    logger.warn('Complete visit failed', { visitId: req.params.id, error: err.message });
    res.status(400).json({ error: err.message });
  }
};

// GET /visits?clinic_id=X&date=YYYY-MM-DD&status=X&queue_id=X&doctor_id=X
const listVisitsForDate = async (req, res) => {
  const { date, status, queue_id, doctor_id } = req.query;
  const clinicId = req.emrUser.clinic_id;

  if (!date) {
    return res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
  }

  try {
    const visits = await VisitService.listVisitsForDate(pool, clinicId, date, {
      status: status || null,
      queueId: queue_id ? parseInt(queue_id, 10) : null,
      doctorId: doctor_id ? parseInt(doctor_id, 10) : null,
    });

    res.json(visits);
  } catch (err) {
    logger.error('Failed to list visits', { error: err.message, date, clinicId });
    res.status(400).json({ error: err.message });
  }
};

// GET /patients/:patientId/visits - Get visit history
const getPatientVisitHistory = async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const patientId = parseInt(req.params.patientId, 10);
  const clinicId = req.emrUser.clinic_id;

  try {
    const visits = await VisitService.getVisitHistory(
      pool,
      patientId,
      clinicId,
      {
        limit: Math.min(parseInt(limit, 10), 100), // Max 100
        offset: Math.max(parseInt(offset, 10), 0),
      }
    );

    res.json(visits);
  } catch (err) {
    logger.error('Failed to get visit history', { error: err.message, patientId });
    res.status(400).json({ error: err.message });
  }
};

// GET /clinics/:clinicId/visits/stats - Visit statistics
const getVisitStats = async (req, res) => {
  const { from_date, to_date } = req.query;
  const clinicId = req.emrUser.clinic_id;

  if (!from_date || !to_date) {
    return res.status(400).json({
      error: 'from_date and to_date query parameters required (YYYY-MM-DD)',
    });
  }

  try {
    const stats = await VisitService.getVisitStats(pool, clinicId, from_date, to_date);
    res.json(stats);
  } catch (err) {
    logger.error('Failed to get visit stats', { error: err.message, clinicId });
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  createVisit,
  getVisit,
  checkInVisit,
  completeVisit,
  listVisitsForDate,
  getPatientVisitHistory,
  getVisitStats,
};
