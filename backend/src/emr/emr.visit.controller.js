/**
 * Visit Controller - Manages clinic visits
 */

const VisitService = require('../services/visit.service');
const logger = require('../utils/logger');

const createVisit = async (req, res) => {
  try {
    const { patient_id, appointment_id, doctor_id, visit_type, notes } = req.body;
    const clinicId = req.emrUser.clinic_id;
    const createdBy = req.emrUser.id;

    if (!patient_id) return res.status(400).json({ error: 'patient_id required' });
    if (!visit_type) return res.status(400).json({ error: 'visit_type required' });

    const visit = await VisitService.createVisit(clinicId, patient_id, {
      appointmentId: appointment_id,
      doctorId: doctor_id,
      visitType: visit_type,
      notes,
      createdBy
    });

    res.status(201).json(visit);
  } catch (err) {
    logger.error('Create visit failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const listVisits = async (req, res) => {
  try {
    const { date, visit_type, status, doctor_id } = req.query;
    const clinicId = req.emrUser.clinic_id;
    const queryDate = date || new Date().toISOString().slice(0, 10);

    const visits = await VisitService.listVisits(clinicId, queryDate, {
      visitType: visit_type,
      status,
      doctorId: doctor_id
    });

    const stats = await VisitService.getVisitStats(clinicId, queryDate);

    res.json({
      date: queryDate,
      visits,
      ...stats
    });
  } catch (err) {
    logger.error('List visits failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const clinicId = req.emrUser.clinic_id;

    if (!status) return res.status(400).json({ error: 'status required' });

    const visit = await VisitService.updateVisitStatus(id, clinicId, status);
    res.json(visit);
  } catch (err) {
    logger.error('Update visit status failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const checkIn = async (req, res) => {
  try {
    const { id } = req.params;
    const clinicId = req.emrUser.clinic_id;

    const visit = await VisitService.checkInVisit(id, clinicId);
    res.json(visit);
  } catch (err) {
    logger.error('Check-in visit failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const checkOut = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const clinicId = req.emrUser.clinic_id;

    const visit = await VisitService.checkOutVisit(id, clinicId, status || 'completed');
    res.json(visit);
  } catch (err) {
    logger.error('Check-out visit failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const assignDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const { doctor_id } = req.body;
    const clinicId = req.emrUser.clinic_id;

    if (!doctor_id) return res.status(400).json({ error: 'doctor_id required' });

    const visit = await VisitService.assignDoctor(id, clinicId, doctor_id);
    res.json(visit);
  } catch (err) {
    logger.error('Assign doctor failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const updateVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const { appointment_id } = req.body;
    const clinicId = req.emrUser.clinic_id;

    // Update visit with appointment link
    const { rows } = await require('../config/database').pool.query(
      `UPDATE emr_visits SET appointment_id = $1, updated_at = NOW() WHERE id = $2 AND clinic_id = $3 RETURNING *`,
      [appointment_id || null, id, clinicId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Visit not found' });
    logger.info('[VISIT] Updated', { visitId: id, appointmentId: appointment_id });
    res.json(rows[0]);
  } catch (err) {
    logger.error('Update visit failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createVisit,
  listVisits,
  updateStatus,
  checkIn,
  checkOut,
  assignDoctor,
  updateVisit
};
