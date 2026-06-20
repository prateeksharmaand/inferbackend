-- Fix patients whose clinic_id is NULL — assign them to the clinic where they
-- have the most appointments. This ensures care contexts are linked under
-- the correct HIP for each clinic.
UPDATE emr_patients p
SET    clinic_id = (
         SELECT a.clinic_id
         FROM   emr_appointments a
         WHERE  a.emr_patient_id = p.id
            OR  (a.patient_mobile = p.mobile AND p.mobile IS NOT NULL)
         GROUP  BY a.clinic_id
         ORDER  BY COUNT(*) DESC
         LIMIT  1
       )
WHERE  p.clinic_id IS NULL
  AND  p.deleted_at IS NULL;
