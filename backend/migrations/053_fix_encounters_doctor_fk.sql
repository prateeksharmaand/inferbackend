-- Migration: Fix emr_encounters doctor_id foreign key
-- Context: Appointments now store emr_clinic_staff.id instead of emr_doctors.id
-- Action: Update FK constraint to reference emr_clinic_staff

-- Drop existing FK constraint
ALTER TABLE emr_encounters
DROP CONSTRAINT IF EXISTS emr_encounters_doctor_id_fkey;

-- Add new FK constraint pointing to emr_clinic_staff
ALTER TABLE emr_encounters
ADD CONSTRAINT emr_encounters_doctor_id_fkey
FOREIGN KEY (doctor_id) REFERENCES emr_clinic_staff(id) ON DELETE SET NULL;
