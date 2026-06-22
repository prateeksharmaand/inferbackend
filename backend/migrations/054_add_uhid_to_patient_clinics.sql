-- Migration: Add UHID column to patient_clinics table
-- Context: UHID is clinic-wise unique identifier for patients
-- Stored in patient_clinics (many-to-many) as single source of truth

ALTER TABLE patient_clinics
ADD COLUMN IF NOT EXISTS uhid VARCHAR(100) UNIQUE;

-- Create indexes for UHID lookups
CREATE INDEX IF NOT EXISTS idx_patient_clinics_uhid ON patient_clinics(uhid);
CREATE INDEX IF NOT EXISTS idx_patient_clinics_clinic_uhid ON patient_clinics(clinic_id, uhid);

-- Drop old UHID column from emr_appointments if it exists
ALTER TABLE emr_appointments
DROP COLUMN IF EXISTS uhid;

-- Drop old UHID column from emr_patients if it exists
ALTER TABLE emr_patients
DROP COLUMN IF EXISTS uhid;
