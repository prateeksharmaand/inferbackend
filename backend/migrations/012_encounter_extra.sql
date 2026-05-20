-- Add extra clinical fields to emr_encounters
ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS lab_investigations JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS lab_results        JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS examination_findings TEXT,
  ADD COLUMN IF NOT EXISTS notes              TEXT,
  ADD COLUMN IF NOT EXISTS refer_to           TEXT,
  ADD COLUMN IF NOT EXISTS advices            TEXT,
  ADD COLUMN IF NOT EXISTS procedures         JSONB DEFAULT '[]';
