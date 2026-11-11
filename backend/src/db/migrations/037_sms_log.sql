-- 037_sms_log.sql
-- Patient messages (WhatsApp templates, or 2Factor transactional SMS as fallback): audit + de-duplication.
CREATE TABLE IF NOT EXISTS sms_log (
  id             BIGSERIAL PRIMARY KEY,
  clinic_id      INTEGER REFERENCES emr_clinics(id) ON DELETE CASCADE,
  appointment_id INTEGER,
  kind           VARCHAR(30) NOT NULL,          -- booked | reminder | prescription | receipt
  channel        VARCHAR(10) NOT NULL DEFAULT 'sms',  -- whatsapp | sms
  dedupe_key     VARCHAR(120),                  -- e.g. booked:1234 — one message per event
  phone_last4    VARCHAR(4),
  status         VARCHAR(20) NOT NULL,          -- sent | failed | skipped
  detail         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_log_dedupe ON sms_log (dedupe_key) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_sms_log_clinic ON sms_log (clinic_id, created_at DESC);
