-- 039_clinic_signups.sql
-- Self-service clinic registration: pending sign-ups awaiting the emailed 6-digit code.
CREATE TABLE IF NOT EXISTS clinic_signups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  payload       JSONB NOT NULL,              -- clinic name, admin name, phone, city, bcrypt password hash
  code_hash     TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  sends         INTEGER NOT NULL DEFAULT 1,
  last_sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  clinic_id     INTEGER,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clinic_signups_email ON clinic_signups (lower(email), created_at DESC);
