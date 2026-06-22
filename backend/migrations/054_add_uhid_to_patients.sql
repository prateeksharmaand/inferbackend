-- Migration: Add UHID column to emr_patients
-- Context: UHID (Unique Health ID) is clinic-wise identifier for patients
-- Required for ABDM linking and appointment booking

ALTER TABLE emr_patients
ADD COLUMN IF NOT EXISTS uhid VARCHAR(100) UNIQUE;

-- Create index for faster UHID lookups
CREATE INDEX IF NOT EXISTS idx_emr_patients_uhid ON emr_patients(uhid);
CREATE INDEX IF NOT EXISTS idx_emr_patients_clinic_uhid ON emr_patients(clinic_id, uhid);
