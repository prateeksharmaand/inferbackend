-- Add permission_date_range and hiu_key_material columns to emr_consent_requests
-- These are required for ABDM-1063 fix: storing consent dateRange and HIU key material

ALTER TABLE emr_consent_requests
ADD COLUMN IF NOT EXISTS permission_date_range JSONB,
ADD COLUMN IF NOT EXISTS hiu_key_material JSONB;

-- Create index for faster lookups by permission_date_range
CREATE INDEX IF NOT EXISTS idx_emr_consent_permission_date_range
ON emr_consent_requests USING GIN (permission_date_range);
