-- Tags (Custom Attribute Values for bookings)

CREATE TABLE IF NOT EXISTS emr_tags (
  id           SERIAL PRIMARY KEY,
  clinic_id    INTEGER      NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  code         VARCHAR(50)  NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  color        VARCHAR(7)   NOT NULL DEFAULT '#7c3aed',
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (clinic_id, code)
);

-- Add tags array to appointments (array of tag IDs)
ALTER TABLE emr_appointments ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_emr_tags_clinic ON emr_tags(clinic_id);
