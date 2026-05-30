ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS vaccinations JSONB DEFAULT '{}';
