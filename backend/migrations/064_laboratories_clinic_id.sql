ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES emr_clinics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_laboratories_clinic_id ON laboratories(clinic_id);

-- Backfill: link existing labs to the clinic they were created for (via lab staff)
UPDATE laboratories l
SET clinic_id = s.clinic_id
FROM (
  SELECT DISTINCT ON (lab_id) lab_id, clinic_id FROM emr_lab_staff ORDER BY lab_id, id
) s
WHERE l.id = s.lab_id AND l.clinic_id IS NULL;
