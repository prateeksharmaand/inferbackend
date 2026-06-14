-- Fix: add unique constraint on (patient_id, abha_number) so ON CONFLICT works.
-- Partial indexes cannot be used for ON CONFLICT unless the WHERE clause matches exactly.

BEGIN;

-- Drop the partial index (keep it for lookup performance after constraint is added)
DROP INDEX IF EXISTS idx_abha_map_num_patient;

-- Add a proper unique constraint (NULLs are excluded automatically in PG unique constraints)
ALTER TABLE abha_mappings
  ADD CONSTRAINT uq_abha_mappings_patient_number
  UNIQUE (patient_id, abha_number);

-- Re-add the partial index for fast lookup on just abha_number
CREATE INDEX IF NOT EXISTS idx_abha_map_num_patient
  ON abha_mappings(abha_number) WHERE abha_number IS NOT NULL;

COMMIT;
