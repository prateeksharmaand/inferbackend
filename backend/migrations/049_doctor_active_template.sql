-- Doctor active consultation template
ALTER TABLE emr_doctors
  ADD COLUMN IF NOT EXISTS active_template_id   INTEGER REFERENCES scribe_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_template_slug TEXT;   -- stores predefined template id (string) or null
