-- Migration: Add Visit Layer for non-clinical workflows
-- Date: 2026-06-24
-- Purpose: Decouple patient arrivals from appointments, enable lab/vaccination/registration workflows
-- Note: Visit layer does NOT generate ABDM Care Contexts (only Encounters do)

-- ====================================================================
-- CREATE VISITS TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS emr_visits (
  id SERIAL PRIMARY KEY,

  clinic_id INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES emr_patients(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES emr_appointments(id) ON DELETE SET NULL,
  doctor_id INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,

  -- Visit type: consultation, lab, vaccination, pharmacy, report_collection, registration, insurance, procedure, followup, other
  visit_type VARCHAR(50) NOT NULL DEFAULT 'other',

  -- Status: waiting, in_progress, completed, cancelled, no_show
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',

  -- Queue number for display
  queue_number INTEGER,

  -- Check-in/out timestamps
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,

  -- Visit notes
  notes TEXT,

  -- Who created the visit
  created_by INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- ADD VISIT_ID TO ENCOUNTERS
-- ====================================================================

ALTER TABLE emr_encounters
ADD COLUMN IF NOT EXISTS visit_id INTEGER REFERENCES emr_visits(id) ON DELETE SET NULL;

-- ====================================================================
-- CREATE INDEXES
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_emr_visits_clinic_id
  ON emr_visits(clinic_id);

CREATE INDEX IF NOT EXISTS idx_emr_visits_patient_id
  ON emr_visits(patient_id);

CREATE INDEX IF NOT EXISTS idx_emr_visits_appointment_id
  ON emr_visits(appointment_id);

CREATE INDEX IF NOT EXISTS idx_emr_visits_doctor_id
  ON emr_visits(doctor_id);

CREATE INDEX IF NOT EXISTS idx_emr_visits_status
  ON emr_visits(status);

CREATE INDEX IF NOT EXISTS idx_emr_visits_visit_type
  ON emr_visits(visit_type);

CREATE INDEX IF NOT EXISTS idx_emr_visits_created_at
  ON emr_visits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emr_visits_clinic_date
  ON emr_visits(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emr_encounters_visit_id
  ON emr_encounters(visit_id);

-- ====================================================================
-- OPTIONAL: Backfill visits from existing checked-in appointments
-- Uncomment if you want to migrate existing appointment data to visits
-- This maintains continuity for existing appointments
-- ====================================================================

-- BEGIN;

-- INSERT INTO emr_visits (clinic_id, patient_id, appointment_id, doctor_id, visit_type, status, check_in_time, queue_number, created_at, updated_at)
-- SELECT
--   a.clinic_id,
--   a.emr_patient_id,
--   a.id,
--   a.doctor_id,
--   'consultation',  -- All appointments are consultations
--   CASE
--     WHEN a.status = 'checked_in' THEN 'in_progress'
--     WHEN a.status = 'ongoing' THEN 'in_progress'
--     WHEN a.status = 'completed' THEN 'completed'
--     WHEN a.status = 'no_show' THEN 'no_show'
--     WHEN a.status = 'cancelled' THEN 'cancelled'
--     ELSE 'waiting'
--   END,
--   a.checked_in_at,
--   a.token_number,
--   a.created_at,
--   a.updated_at
-- FROM emr_appointments a
-- WHERE a.emr_patient_id IS NOT NULL
--   AND a.status IN ('checked_in', 'ongoing', 'completed', 'no_show', 'cancelled')
--   AND NOT EXISTS (SELECT 1 FROM emr_visits v WHERE v.appointment_id = a.id);

-- COMMIT;

-- ====================================================================
-- VERIFY MIGRATION
-- ====================================================================

-- Check that tables exist:
-- SELECT tablename FROM pg_tables WHERE tablename IN ('emr_visits') AND schemaname = 'public';
--
-- Check that encounters has visit_id column:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'emr_encounters' AND column_name = 'visit_id';
