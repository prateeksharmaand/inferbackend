-- =============================================================================
-- Security Hardening Migration — 2026-06-14
-- Run once: psql $DATABASE_URL -f security_hardening_20260614.sql
-- =============================================================================

BEGIN;

-- ── SEC-007: OTP attempt counter on hip_link_sessions ─────────────────────────
ALTER TABLE hip_link_sessions
  ADD COLUMN IF NOT EXISTS otp_attempt_count INT NOT NULL DEFAULT 0;

-- ── SEC-018: Soft delete on emr_patients ─────────────────────────────────────
ALTER TABLE emr_patients
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id INT;

-- ── SEC-018: Soft delete on emr_doctors ──────────────────────────────────────
ALTER TABLE emr_doctors
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id INT;

-- ── SEC-006: Add clinic_id to emr_patients for BOLA scoping ──────────────────
-- Nullable FK so existing data is not broken; populated going forward on patient create.
ALTER TABLE emr_patients
  ADD COLUMN IF NOT EXISTS clinic_id INT REFERENCES emr_clinics(id) ON DELETE SET NULL;

-- Back-fill clinic_id from the most recent appointment (best-effort)
UPDATE emr_patients p
SET clinic_id = (
  SELECT a.clinic_id
  FROM emr_appointments a
  WHERE a.patient_mobile = p.mobile
     OR a.emr_patient_id = p.id
  ORDER BY a.created_at ASC
  LIMIT 1
)
WHERE p.clinic_id IS NULL;

-- ── SEC-013: xToken session store ─────────────────────────────────────────────
-- If you want full xToken isolation (keep ABDM session tokens server-side):
CREATE TABLE IF NOT EXISTS abdm_xtoken_sessions (
  id          SERIAL PRIMARY KEY,
  session_key TEXT UNIQUE NOT NULL,
  xtoken      TEXT NOT NULL,
  patient_id  INT  REFERENCES emr_patients(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Clean up expired sessions automatically (run via cron or pg_cron)
-- DELETE FROM abdm_xtoken_sessions WHERE expires_at < NOW();

-- ── Indexes for new columns ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emr_patients_clinic_id   ON emr_patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_emr_patients_deleted_at  ON emr_patients(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abdm_xtoken_session_key  ON abdm_xtoken_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_abdm_xtoken_expires_at   ON abdm_xtoken_sessions(expires_at);

-- ── R2-002/R2-007: rename otp → otp_hash (store bcrypt hash, not plaintext) ───
-- Step 1: add new column
ALTER TABLE hip_link_sessions
  ADD COLUMN IF NOT EXISTS otp_hash TEXT;

-- Step 2: existing plaintext OTPs are now expired — clear them
UPDATE hip_link_sessions SET otp = NULL WHERE otp_expires_at < NOW();

-- Step 3: once you have deployed the new code that writes otp_hash, drop old column:
-- ALTER TABLE hip_link_sessions DROP COLUMN IF EXISTS otp;
-- (Do this in a follow-up migration after verifying the new code works)

-- ── R2-011: unique index to prevent duplicate active link sessions per patient ─
CREATE UNIQUE INDEX IF NOT EXISTS idx_link_sessions_one_active_per_patient
  ON hip_link_sessions(patient_id)
  WHERE status IN ('pending_otp', 'pending');

COMMIT;
