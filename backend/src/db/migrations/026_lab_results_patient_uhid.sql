-- Make patient_id nullable and add patient_uhid to lab_test_results and lab_anomalies
ALTER TABLE lab_test_results
  ALTER COLUMN patient_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS patient_uhid TEXT;

ALTER TABLE lab_anomalies
  ALTER COLUMN patient_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS patient_uhid TEXT;

CREATE INDEX IF NOT EXISTS idx_lab_results_patient_uhid ON lab_test_results(patient_uhid) WHERE patient_uhid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_anomalies_patient_uhid ON lab_anomalies(patient_uhid) WHERE patient_uhid IS NOT NULL;
