CREATE TABLE IF NOT EXISTS scribe_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    UUID NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  focus_prompt TEXT NOT NULL DEFAULT '',
  specialty    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scribe_templates_clinic ON scribe_templates(clinic_id);
