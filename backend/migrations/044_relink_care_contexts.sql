-- Reset link_status to 'pending' for care contexts whose patient's clinic now has a hip_id configured.
-- This forces the next appointment/encounter event to re-link them under the correct clinic HIP ID.
-- Safe to run multiple times (idempotent via WHERE clause).
UPDATE emr_care_contexts cc
SET    link_status = 'pending',
       link_error  = NULL,
       linked_at   = NULL
FROM   emr_patients ep
JOIN   emr_clinics ec ON ec.id = ep.clinic_id
WHERE  cc.patient_id = ep.id
  AND  ec.hip_id IS NOT NULL
  AND  ec.abdm_enabled = TRUE
  AND  cc.link_status IN ('linked', 'failed');
