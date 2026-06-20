-- Multi-tenant ABDM: add HIP/HIU identity fields to emr_clinics
ALTER TABLE emr_clinics
  ADD COLUMN IF NOT EXISTS hip_id            VARCHAR(100)  NULL,
  ADD COLUMN IF NOT EXISTS hip_name          VARCHAR(255)  NULL,
  ADD COLUMN IF NOT EXISTS hiu_id            VARCHAR(100)  NULL,
  ADD COLUMN IF NOT EXISTS hiu_name          VARCHAR(255)  NULL,
  ADD COLUMN IF NOT EXISTS abdm_enabled      BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS abdm_status       VARCHAR(50)   NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS abdm_last_synced_at TIMESTAMPTZ NULL;

-- Enforce uniqueness of HIP/HIU IDs across clinics (partial index — ignores NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS emr_clinics_hip_id_unique ON emr_clinics(hip_id) WHERE hip_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS emr_clinics_hiu_id_unique ON emr_clinics(hiu_id) WHERE hiu_id IS NOT NULL;
