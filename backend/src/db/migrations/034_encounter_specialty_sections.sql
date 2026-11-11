-- 034_encounter_specialty_sections.sql
-- InferPad sends injections, the dental chart, ophthalmology and ENT entries on every save, but
-- emr_encounters had no columns for them, so they were silently dropped. Store them.
ALTER TABLE emr_encounters ADD COLUMN IF NOT EXISTS injections   JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE emr_encounters ADD COLUMN IF NOT EXISTS dental_chart JSONB;
ALTER TABLE emr_encounters ADD COLUMN IF NOT EXISTS ophtho       JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE emr_encounters ADD COLUMN IF NOT EXISTS ent          JSONB NOT NULL DEFAULT '{}'::jsonb;
