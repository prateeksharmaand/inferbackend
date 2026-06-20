-- Reset link_status for care contexts that belong to patients who have
-- appointments at a different clinic than their default clinic_id.
-- This forces re-linking under the correct clinic's HIP ID.
UPDATE emr_care_contexts cc
SET    link_status = 'pending',
       link_error  = NULL,
       linked_at   = NULL
FROM   emr_appointments a
JOIN   emr_clinics ec ON ec.id = a.clinic_id AND ec.abdm_enabled = TRUE AND ec.hip_id IS NOT NULL
WHERE  (a.emr_patient_id = cc.patient_id)
  AND  cc.link_status IN ('linked', 'failed', 'pending')
  AND  EXISTS (
         SELECT 1 FROM emr_patients p
         WHERE  p.id = cc.patient_id
           AND  (p.clinic_id IS NULL OR p.clinic_id != a.clinic_id)
       );
