-- Add clinic_id to laboratories so each clinic owns its labs
ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS clinic_id UUID;
CREATE INDEX IF NOT EXISTS idx_labs_clinic ON laboratories(clinic_id);

-- Add is_active to users if not present
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
