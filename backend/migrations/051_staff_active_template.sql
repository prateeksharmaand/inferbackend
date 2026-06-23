-- Active consultation template stored per staff member (replaces emr_doctors columns)
ALTER TABLE emr_clinic_staff
  ADD COLUMN IF NOT EXISTS active_template_id   INTEGER REFERENCES scribe_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_template_slug TEXT;
