ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS calc_results JSONB DEFAULT '{}';
