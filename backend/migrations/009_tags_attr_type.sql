-- Add attribute type to emr_tags
-- 1 = Tags (multi-select)
-- 2 = Labels (single-select)
-- 16 = Medical Record Document Type (multi-select)

ALTER TABLE emr_tags ADD COLUMN IF NOT EXISTS attr_type SMALLINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_emr_tags_clinic_type ON emr_tags(clinic_id, attr_type);
