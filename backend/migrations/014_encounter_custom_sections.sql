ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS custom_sections JSONB DEFAULT '[]';
