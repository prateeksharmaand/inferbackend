-- Map EMR clinics (INTEGER id) to their laboratory (UUID id)
-- Avoids touching laboratories.clinic_id which may be UUID type from PHR schema
CREATE TABLE IF NOT EXISTS clinic_lab_map (
  clinic_id INTEGER PRIMARY KEY REFERENCES emr_clinics(id) ON DELETE CASCADE,
  lab_id    UUID    NOT NULL    REFERENCES laboratories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill from existing lab staff links
INSERT INTO clinic_lab_map (clinic_id, lab_id)
SELECT DISTINCT ON (clinic_id) clinic_id, lab_id
FROM emr_lab_staff
WHERE lab_id IS NOT NULL
ORDER BY clinic_id, id
ON CONFLICT (clinic_id) DO NOTHING;
