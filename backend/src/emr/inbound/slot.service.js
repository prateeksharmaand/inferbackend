/**
 * Slot availability engine + booking engine
 * Real-time slot computation from doctor availability windows
 * minus already-booked appointments
 */
const { pool } = require('../../config/database');
const logger   = require('../../utils/logger');

const DEFAULT_START    = '09:00';
const DEFAULT_END      = '17:00';
const DEFAULT_DURATION = 15; // minutes

// ── Get available slots for doctor on a date ──────────────────────────────
async function getAvailableSlots(clinicId, doctorId, dateStr, limit = 20) {
  const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=Sun

  // Doctor availability config for this weekday
  const { rows: [avail] } = await pool.query(
    `SELECT start_time, end_time, slot_duration_minutes, max_slots_per_day, is_active
     FROM emr_doctor_availability
     WHERE doctor_id = $1 AND day_of_week = $2`,
    [doctorId, dayOfWeek]
  );

  if (avail && !avail.is_active) return [];

  const startTime  = avail?.start_time   || DEFAULT_START;
  const endTime    = avail?.end_time     || DEFAULT_END;
  const duration   = avail?.slot_duration_minutes || DEFAULT_DURATION;
  const maxSlots   = avail?.max_slots_per_day;

  // All theoretical slots for the day
  const allSlots = _generateSlots(startTime, endTime, duration);

  // Already booked appointments for this doctor/date
  const { rows: booked } = await pool.query(
    `SELECT appointment_time FROM emr_appointments
     WHERE clinic_id = $1 AND doctor_id = $2 AND appointment_date = $3
       AND status NOT IN ('cancelled', 'no_show', 'aborted')`,
    [clinicId, doctorId, dateStr]
  );

  const bookedTimes = new Set(booked.map(r => _normaliseTime(r.appointment_time)));

  let freeSlots = allSlots.filter(s => !bookedTimes.has(s));

  // Enforce max slots cap
  if (maxSlots && booked.length >= maxSlots) freeSlots = [];

  // For today, drop past slots
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) {
    const nowMin = _nowMinutes();
    freeSlots = freeSlots.filter(s => _timeToMinutes(s) > nowMin + 15);
  }

  return freeSlots.slice(0, limit);
}

// ── Check a specific slot is free ─────────────────────────────────────────
async function isSlotAvailable(clinicId, doctorId, dateStr, timeStr) {
  const slots = await getAvailableSlots(clinicId, doctorId, dateStr);
  const norm  = _normaliseTime(timeStr);
  return slots.includes(norm);
}

// ── Book a slot — creates the EMR appointment ─────────────────────────────
async function bookSlot(clinicId, doctorId, dateStr, timeStr, patientData, channel = 'online') {
  // Double-check availability (prevent race condition)
  const free = await isSlotAvailable(clinicId, doctorId, dateStr, timeStr);
  if (!free) throw new Error('Slot no longer available. Please choose another time.');

  // Find default queue for this doctor; fallback to any active queue for the clinic
  let { rows: [queue] } = await pool.query(
    `SELECT id FROM emr_queues WHERE clinic_id = $1 AND doctor_id = $2 AND is_active = TRUE LIMIT 1`,
    [clinicId, doctorId]
  );
  if (!queue) {
    const { rows: [anyQueue] } = await pool.query(
      `SELECT id FROM emr_queues WHERE clinic_id = $1 AND is_active = TRUE ORDER BY id LIMIT 1`,
      [clinicId]
    );
    queue = anyQueue;
  }

  // Auto token number
  const queueId = queue?.id || null;
  const { rows: [tok] } = await pool.query(
    `SELECT COALESCE(MAX(token_number), 0) + 1 AS next_token
     FROM emr_appointments
     WHERE queue_id IS NOT DISTINCT FROM $1 AND appointment_date = $2`,
    [queueId, dateStr]
  );

  // Find or upsert patient record
  let emrPatientId = null;
  if (patientData.patient_mobile) {
    const { rows: [existing] } = await pool.query(
      `SELECT id FROM emr_patients WHERE mobile = $1 AND clinic_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      // Note: emr_patients has no clinic_id; match by mobile globally within clinic via appointments
      [patientData.patient_mobile]
    );
    if (existing) {
      emrPatientId = existing.id;
    } else if (patientData.patient_name) {
      const { rows: [created] } = await pool.query(
        `INSERT INTO emr_patients (name, mobile, gender)
         VALUES ($1, $2, $3) RETURNING id`,
        [patientData.patient_name, patientData.patient_mobile, patientData.patient_gender || null]
      );
      emrPatientId = created.id;
    }
  }

  const { rows: [appt] } = await pool.query(
    `INSERT INTO emr_appointments
       (queue_id, clinic_id, doctor_id, emr_patient_id,
        patient_name, patient_mobile, patient_dob, patient_gender,
        token_number, visit_type, channel,
        appointment_date, appointment_time, notes, tags, medical_history)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      queueId, clinicId, doctorId, emrPatientId,
      patientData.patient_name, patientData.patient_mobile || null,
      patientData.patient_dob  || null, patientData.patient_gender || null,
      tok.next_token, 'OPConsultation', channel,
      dateStr, _normaliseTime(timeStr),
      patientData.visit_reason || null,
      JSON.stringify([]),
      JSON.stringify([]),
    ]
  );

  logger.info(`[Slot] Appointment booked: #${appt.id} for ${patientData.patient_name} on ${dateStr} ${timeStr} | queue_id=${queueId} doctor_id=${doctorId}`);
  return appt;
}

// ── Cancel appointment ────────────────────────────────────────────────────
async function cancelAppointment(clinicId, { appointmentId, patientMobile, date }) {
  let sql, params;

  if (appointmentId) {
    sql    = `UPDATE emr_appointments SET status='cancelled' WHERE id=$1 AND clinic_id=$2 RETURNING *`;
    params = [appointmentId, clinicId];
  } else if (patientMobile && date) {
    sql    = `UPDATE emr_appointments SET status='cancelled'
              WHERE clinic_id=$1 AND patient_mobile=$2 AND appointment_date=$3
                AND status='booked' RETURNING *`;
    params = [clinicId, patientMobile, date];
  } else {
    throw new Error('Provide appointment_id or patient_mobile + date to cancel.');
  }

  const { rows } = await pool.query(sql, params);
  if (!rows.length) throw new Error('No active appointment found to cancel.');
  return rows[0];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function _generateSlots(startTime, endTime, durationMin) {
  const slots = [];
  let cur = _timeToMinutes(startTime);
  const end = _timeToMinutes(endTime);
  while (cur + durationMin <= end) {
    slots.push(_minutesToTime(cur));
    cur += durationMin;
  }
  return slots;
}

function _timeToMinutes(t) {
  if (!t) return 0;
  const str = String(t).slice(0, 5); // "HH:MM"
  const [h, m] = str.split(':').map(Number);
  return h * 60 + (m || 0);
}

function _minutesToTime(min) {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function _normaliseTime(t) {
  if (!t) return null;
  return String(t).slice(0, 5); // strip seconds from postgres TIME
}

function _nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// ── Get doctors list for a clinic ─────────────────────────────────────────
async function getDoctors(clinicId) {
  const { rows } = await pool.query(
    `SELECT id, name, specialization, qualification FROM emr_doctors
     WHERE clinic_id = $1 AND is_active = TRUE ORDER BY name`,
    [clinicId]
  );
  return rows;
}

// ── Lookup patient by mobile ──────────────────────────────────────────────
async function findPatient(mobile) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.mobile, p.gender, p.dob,
            COUNT(a.id) AS visit_count,
            MAX(a.appointment_date) AS last_visit
     FROM emr_patients p
     LEFT JOIN emr_appointments a ON a.emr_patient_id = p.id
     WHERE p.mobile = $1
     GROUP BY p.id`,
    [mobile]
  );
  return rows[0] || null;
}

module.exports = { getAvailableSlots, isSlotAvailable, bookSlot, cancelAppointment, getDoctors, findPatient };
