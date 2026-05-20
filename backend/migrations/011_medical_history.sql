ALTER TABLE emr_appointments
  ADD COLUMN IF NOT EXISTS medical_history JSONB NOT NULL DEFAULT '[]';
