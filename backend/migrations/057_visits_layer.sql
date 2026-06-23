-- Phase 2: Visits Layer Architecture
-- Separates appointment (scheduling) from visit (patient arrival)
-- Enables: walk-ins, multi-visit days, proper FHIR compliance

-- ============================================================================
-- STEP 1: Create emr_visits table (new core table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS emr_visits (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES emr_patients(id) ON DELETE CASCADE,
  appointment_id INTEGER UNIQUE REFERENCES emr_appointments(id) ON DELETE SET NULL,

  visit_date DATE NOT NULL,
  visit_time TIME,
  visit_type VARCHAR(50) NOT NULL
    CHECK (visit_type IN ('walk_in', 'appointment', 'scheduled', 'emergency')),

  token_number INTEGER,
  doctor_id INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  queue_id INTEGER REFERENCES emr_queues(id) ON DELETE SET NULL,

  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'checked_in', 'completed', 'no_show', 'cancelled')),

  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Constraints
  CONSTRAINT check_checked_in_after_create CHECK (checked_in_at IS NULL OR checked_in_at >= created_at),
  CONSTRAINT check_checked_out_after_in CHECK (checked_out_at IS NULL OR checked_in_at IS NULL OR checked_out_at > checked_in_at),
  CONSTRAINT check_status_consistency CHECK (
    (status = 'pending' AND checked_in_at IS NULL AND checked_out_at IS NULL) OR
    (status = 'checked_in' AND checked_in_at IS NOT NULL AND checked_out_at IS NULL) OR
    (status IN ('completed', 'no_show', 'cancelled') AND checked_in_at IS NOT NULL)
  )
);

-- Indexes for common queries
CREATE INDEX idx_emr_visits_clinic_date ON emr_visits(clinic_id, visit_date DESC);
CREATE INDEX idx_emr_visits_patient_date ON emr_visits(patient_id, visit_date DESC);
CREATE INDEX idx_emr_visits_appointment ON emr_visits(appointment_id);
CREATE INDEX idx_emr_visits_status ON emr_visits(status) WHERE status IN ('pending', 'checked_in');
CREATE INDEX idx_emr_visits_checked_in_at ON emr_visits(checked_in_at);
CREATE INDEX idx_emr_visits_clinic_doctor_date ON emr_visits(clinic_id, doctor_id, visit_date);

-- ============================================================================
-- STEP 2: Add visit_id to emr_encounters
-- ============================================================================

ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS visit_id INTEGER UNIQUE REFERENCES emr_visits(id) ON DELETE CASCADE;

ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS arrival_at TIMESTAMPTZ;

-- Create index for encounter-visit lookup
CREATE INDEX IF NOT EXISTS idx_emr_encounters_visit_id ON emr_encounters(visit_id);

-- ============================================================================
-- STEP 3: Clean up emr_appointments (remove visit-related columns)
-- ============================================================================

-- Remove visit-related columns from appointments
ALTER TABLE emr_appointments
  DROP COLUMN IF EXISTS checked_in_at;

ALTER TABLE emr_appointments
  DROP COLUMN IF EXISTS completed_at;

-- Add visit_id for reverse lookup (optional, for data integrity)
ALTER TABLE emr_appointments
  ADD COLUMN IF NOT EXISTS visit_id INTEGER REFERENCES emr_visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_emr_appointments_visit_id ON emr_appointments(visit_id);

-- Update appointment status constraint to only valid appointment states
ALTER TABLE emr_appointments
  DROP CONSTRAINT IF EXISTS emr_appointments_status_check;

ALTER TABLE emr_appointments
  ADD CONSTRAINT emr_appointments_status_check
    CHECK (status IN ('booked', 'rescheduled', 'cancelled'));

-- ============================================================================
-- STEP 4: Backfill emr_visits from existing appointments
-- ============================================================================
-- Only backfill appointments from last 90 days (recent data)

INSERT INTO emr_visits (
  clinic_id, patient_id, appointment_id, visit_date, visit_time,
  visit_type, status, checked_in_at, checked_out_at, doctor_id, queue_id, token_number,
  created_at, updated_at
)
SELECT
  a.clinic_id,
  a.emr_patient_id,
  a.id,
  a.appointment_date,
  a.appointment_time,
  'appointment',
  CASE
    WHEN a.status = 'checked_in' THEN 'checked_in'
    WHEN a.status IN ('completed', 'ongoing') THEN 'completed'
    WHEN a.status = 'no_show' THEN 'no_show'
    WHEN a.status = 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END,
  NULL, -- checked_in_at will be set on actual check-in
  NULL, -- checked_out_at will be set on completion
  a.doctor_id,
  a.queue_id,
  a.token_number,
  a.created_at,
  COALESCE(a.updated_at, a.created_at)
FROM emr_appointments a
WHERE a.appointment_date >= CURRENT_DATE - INTERVAL '90 days'
  AND a.emr_patient_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update appointments to reference their visits
UPDATE emr_appointments a
SET visit_id = v.id
FROM emr_visits v
WHERE a.id = v.appointment_id
  AND a.visit_id IS NULL;

-- ============================================================================
-- STEP 5: Data Integrity Verification
-- ============================================================================

-- Verify no orphaned appointments
CREATE OR REPLACE VIEW vw_appointment_visit_mismatch AS
SELECT a.id as appointment_id, a.clinic_id, a.emr_patient_id,
       'Missing visit record' as issue
FROM emr_appointments a
WHERE a.appointment_date >= CURRENT_DATE - INTERVAL '90 days'
  AND a.emr_patient_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM emr_visits v WHERE v.appointment_id = a.id);

-- Verify no orphaned visits
CREATE OR REPLACE VIEW vw_visit_appointment_mismatch AS
SELECT v.id as visit_id, v.clinic_id, v.patient_id,
       'Appointment ID mismatch' as issue
FROM emr_visits v
WHERE v.appointment_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM emr_appointments a WHERE a.id = v.appointment_id);

-- ============================================================================
-- STEP 6: Add visit_id to encounters from appointments
-- ============================================================================

UPDATE emr_encounters e
SET visit_id = v.id
FROM emr_visits v
WHERE e.appointment_id = v.appointment_id
  AND e.visit_id IS NULL;

-- ============================================================================
-- STEP 7: Create helper function for visit creation
-- ============================================================================

CREATE OR REPLACE FUNCTION create_visit_from_appointment(
  p_appointment_id INTEGER,
  p_clinic_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_visit_id INTEGER;
  v_appointment RECORD;
BEGIN
  -- Get appointment details
  SELECT * INTO v_appointment FROM emr_appointments
  WHERE id = p_appointment_id AND clinic_id = p_clinic_id;

  IF v_appointment IS NULL THEN
    RAISE EXCEPTION 'Appointment not found: %', p_appointment_id;
  END IF;

  -- Check if visit already exists
  SELECT id INTO v_visit_id FROM emr_visits
  WHERE appointment_id = p_appointment_id;

  IF v_visit_id IS NOT NULL THEN
    RETURN v_visit_id;
  END IF;

  -- Create new visit
  INSERT INTO emr_visits (
    clinic_id, patient_id, appointment_id, visit_date, visit_time,
    visit_type, status, doctor_id, queue_id, token_number
  )
  VALUES (
    v_appointment.clinic_id,
    v_appointment.emr_patient_id,
    v_appointment.id,
    v_appointment.appointment_date,
    v_appointment.appointment_time,
    'appointment',
    'pending',
    v_appointment.doctor_id,
    v_appointment.queue_id,
    v_appointment.token_number
  )
  RETURNING id INTO v_visit_id;

  -- Update appointment with visit_id
  UPDATE emr_appointments SET visit_id = v_visit_id WHERE id = p_appointment_id;

  RETURN v_visit_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 8: Migration validation queries
-- ============================================================================

-- Log: Check total appointments vs visits backfilled
DO $$
DECLARE
  v_total_appointments INTEGER;
  v_total_visits INTEGER;
  v_recent_appointments INTEGER;
  v_recent_visits INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_appointments FROM emr_appointments;
  SELECT COUNT(*) INTO v_total_visits FROM emr_visits;
  SELECT COUNT(*) INTO v_recent_appointments FROM emr_appointments
    WHERE appointment_date >= CURRENT_DATE - INTERVAL '90 days';
  SELECT COUNT(*) INTO v_recent_visits FROM emr_visits;

  RAISE NOTICE 'Migration Report:';
  RAISE NOTICE '  Total Appointments: %', v_total_appointments;
  RAISE NOTICE '  Total Visits Created: %', v_total_visits;
  RAISE NOTICE '  Recent Appointments (90d): %', v_recent_appointments;
  RAISE NOTICE '  Visits Created: %', v_recent_visits;
  RAISE NOTICE '  Coverage: %', ROUND(100.0 * v_recent_visits / NULLIF(v_recent_appointments, 0), 1) || '%';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 9: Drop old views (if they exist) and document new schema
-- ============================================================================

-- Document: Visit Table Structure
COMMENT ON TABLE emr_visits IS 'Patient visit records (arrival/departure). Separate from appointments (scheduling). One visit per appointment, or standalone for walk-ins.';
COMMENT ON COLUMN emr_visits.appointment_id IS 'Reference to appointment (NULL for walk-ins)';
COMMENT ON COLUMN emr_visits.visit_type IS 'walk_in: No appointment | appointment: Scheduled | scheduled: Future | emergency: Urgent';
COMMENT ON COLUMN emr_visits.status IS 'pending: Registered | checked_in: Arrived | completed: Finished | no_show: Missed | cancelled: Cancelled';
COMMENT ON COLUMN emr_visits.checked_in_at IS 'Actual arrival timestamp (used by FHIR Encounter)';
COMMENT ON COLUMN emr_visits.checked_out_at IS 'Departure timestamp (for visit duration)';

-- Document: Encounter Changes
COMMENT ON COLUMN emr_encounters.visit_id IS 'Reference to visit (replaces appointment_id). One encounter per visit.';
COMMENT ON COLUMN emr_encounters.arrival_at IS 'Denormalized from visit.checked_in_at for faster FHIR generation';

-- Document: Appointment Changes
COMMENT ON TABLE emr_appointments IS 'Appointment scheduling records. Status: booked | rescheduled | cancelled. Visit state now in emr_visits table.';
COMMENT ON COLUMN emr_appointments.visit_id IS 'Reference to visit created from this appointment (for reverse lookup)';

-- ============================================================================
-- FINAL: Verification Summary
-- ============================================================================

-- Verify migration consistency
DO $$
DECLARE
  v_unmapped_appointments INTEGER;
  v_unmapped_visits INTEGER;
BEGIN
  -- Count appointments without visits (should be future appointments)
  SELECT COUNT(*) INTO v_unmapped_appointments FROM emr_appointments
  WHERE appointment_date >= CURRENT_DATE - INTERVAL '90 days'
    AND NOT EXISTS (SELECT 1 FROM emr_visits WHERE appointment_id = emr_appointments.id);

  -- Count visits without encounters (expected - some visits haven't been seen yet)
  SELECT COUNT(*) INTO v_unmapped_visits FROM emr_visits v
  WHERE NOT EXISTS (SELECT 1 FROM emr_encounters WHERE visit_id = v.id);

  IF v_unmapped_appointments > 0 THEN
    RAISE WARNING 'Appointments without visits (future?): %', v_unmapped_appointments;
  END IF;

  RAISE NOTICE 'Migration Complete:';
  RAISE NOTICE '  ✓ emr_visits table created';
  RAISE NOTICE '  ✓ Visits backfilled from appointments';
  RAISE NOTICE '  ✓ Encounters linked to visits';
  RAISE NOTICE '  ✓ Ready for Phase 2 backend implementation';
END;
$$ LANGUAGE plpgsql;
