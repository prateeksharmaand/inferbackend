-- =============================================================================
-- ABDM Patient Identity Model — abha_mappings table
-- Allows one patient to have multiple ABHA addresses (all backed by one ABHA number)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS abha_mappings (
  id           SERIAL PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES emr_patients(id) ON DELETE CASCADE,
  abha_number  VARCHAR(50),
  abha_address VARCHAR(100),
  status       VARCHAR(20) NOT NULL DEFAULT 'active',
  source       VARCHAR(50),
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_abha_map_num_patient
  ON abha_mappings(patient_id, abha_number)  WHERE abha_number  IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abha_map_addr_patient
  ON abha_mappings(patient_id, abha_address) WHERE abha_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_abha_map_number
  ON abha_mappings(abha_number)  WHERE abha_number  IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_abha_map_address
  ON abha_mappings(abha_address) WHERE abha_address IS NOT NULL;

-- Back-fill from existing emr_patients legacy columns
INSERT INTO abha_mappings (patient_id, abha_number, abha_address, source)
SELECT id, abha_number, abha_address, 'legacy'
FROM emr_patients
WHERE (abha_number IS NOT NULL OR abha_address IS NOT NULL)
ON CONFLICT DO NOTHING;

COMMIT;
