-- Prevent rows where both abha_number and abha_address are NULL (meaningless mapping).
-- Also ensure at least one identifier is present per mapping row.

BEGIN;

ALTER TABLE abha_mappings
  ADD CONSTRAINT chk_abha_mappings_has_identifier
  CHECK (abha_number IS NOT NULL OR abha_address IS NOT NULL);

COMMIT;
