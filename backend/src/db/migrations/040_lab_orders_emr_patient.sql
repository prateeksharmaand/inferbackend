-- Lab orders/samples/reports for EMR patients: their ids are integers
-- (emr_patients.id), while patient_id is the PHR user's UUID. Keep the EMR id alongside.
ALTER TABLE lab_orders  ADD COLUMN IF NOT EXISTS emr_patient_id INTEGER;
ALTER TABLE lab_samples ADD COLUMN IF NOT EXISTS emr_patient_id INTEGER;
ALTER TABLE lab_reports ADD COLUMN IF NOT EXISTS emr_patient_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_lab_orders_emr_patient  ON lab_orders (emr_patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_emr_patient ON lab_samples (emr_patient_id);
