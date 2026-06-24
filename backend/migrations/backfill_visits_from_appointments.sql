-- Backfill: Create consultation visits for existing appointments
-- This ensures all appointments are linked to visits for consistent queue display
-- Date: 2026-06-24

BEGIN;

-- Create consultation visits for appointments that don't have linked visits
INSERT INTO emr_visits (
  clinic_id, patient_id, appointment_id, doctor_id, visit_type, status, 
  queue_number, check_in_time, created_at, updated_at
)
SELECT 
  a.clinic_id,
  a.emr_patient_id,
  a.id,
  a.doctor_id,
  'consultation',  -- Default all existing appointments to consultation type
  CASE 
    WHEN a.status = 'checked_in' THEN 'in_progress'
    WHEN a.status = 'ongoing' THEN 'in_progress'
    WHEN a.status = 'completed' THEN 'completed'
    WHEN a.status = 'cancelled' THEN 'cancelled'
    WHEN a.status = 'no_show' THEN 'no_show'
    ELSE 'waiting'
  END,
  a.token_number,
  a.checked_in_at,
  a.created_at,
  a.updated_at
FROM emr_appointments a
WHERE a.emr_patient_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM emr_visits v 
    WHERE v.appointment_id = a.id 
    AND v.clinic_id = a.clinic_id
  )
ON CONFLICT DO NOTHING;

COMMIT;

-- Verification
-- SELECT COUNT(*) as appointment_without_visits 
-- FROM emr_appointments a 
-- WHERE NOT EXISTS (SELECT 1 FROM emr_visits v WHERE v.appointment_id = a.id);
