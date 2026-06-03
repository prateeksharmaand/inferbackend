-- Add patient_uhid to lab tables and make patient_id nullable
-- Allows lab orders/samples to be linked by UHID (e.g. INFER1607) without requiring a users.id UUID

ALTER TABLE lab_orders
  ALTER COLUMN patient_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS patient_uhid TEXT,
  ADD COLUMN IF NOT EXISTS patient_name TEXT;

ALTER TABLE lab_samples
  ALTER COLUMN patient_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS patient_uhid TEXT;

ALTER TABLE lab_reports
  ALTER COLUMN patient_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS patient_uhid TEXT;

CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_uhid ON lab_orders(patient_uhid) WHERE patient_uhid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_samples_patient_uhid ON lab_samples(patient_uhid) WHERE patient_uhid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_reports_patient_uhid ON lab_reports(patient_uhid) WHERE patient_uhid IS NOT NULL;
