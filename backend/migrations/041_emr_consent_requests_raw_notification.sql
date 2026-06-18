-- Add raw notification column to emr_consent_requests to store complete ABDM callback payload
-- This ensures we capture all consent metadata (permission.dateRange, hiTypes, etc)
-- instead of relying on truncated artefacts or failing ABDM GET endpoints

ALTER TABLE emr_consent_requests
ADD COLUMN IF NOT EXISTS raw_notification JSONB;

-- Create index for efficient queries on nested permission data
CREATE INDEX IF NOT EXISTS idx_emr_consent_raw_notification
ON emr_consent_requests USING GIN (raw_notification);
