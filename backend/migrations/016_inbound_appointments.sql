-- ============================================================
-- 016 — Automated Inbound Appointment Booking
-- Telnyx (SMS/WhatsApp/IVR) + Gemini AI conversation engine
-- ============================================================

-- Doctor availability windows (defines bookable hours per weekday)
CREATE TABLE IF NOT EXISTS emr_doctor_availability (
  id                    SERIAL PRIMARY KEY,
  clinic_id             INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  doctor_id             INTEGER NOT NULL REFERENCES emr_doctors(id) ON DELETE CASCADE,
  day_of_week           INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  start_time            TIME    NOT NULL DEFAULT '09:00',
  end_time              TIME    NOT NULL DEFAULT '17:00',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 15,
  max_slots_per_day     INTEGER,          -- NULL = unlimited
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(doctor_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS idx_doc_avail_clinic  ON emr_doctor_availability(clinic_id);
CREATE INDEX IF NOT EXISTS idx_doc_avail_doctor  ON emr_doctor_availability(doctor_id);

-- Clinic inbound channel config
-- Links a Telnyx phone number / WhatsApp number to a clinic
CREATE TABLE IF NOT EXISTS clinic_channel_config (
  id              SERIAL PRIMARY KEY,
  clinic_id       INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  channel         VARCHAR(20) NOT NULL CHECK (channel IN ('sms','whatsapp','ivr','chat','email')),
  channel_address VARCHAR(200) NOT NULL, -- E.164 number or email
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  config          JSONB   NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel, channel_address)
);
CREATE INDEX IF NOT EXISTS idx_channel_cfg_clinic ON clinic_channel_config(clinic_id);

-- Multi-turn AI booking conversations
CREATE TABLE IF NOT EXISTS inbound_conversations (
  id              SERIAL PRIMARY KEY,
  clinic_id       INTEGER REFERENCES emr_clinics(id) ON DELETE SET NULL,
  channel         VARCHAR(20)  NOT NULL,               -- sms / whatsapp / ivr / chat
  channel_id      VARCHAR(200) NOT NULL,               -- caller/sender phone or session token
  to_address      VARCHAR(200),                        -- clinic Telnyx number that received the message
  state           VARCHAR(30)  NOT NULL DEFAULT 'active', -- active / booked / cancelled / handoff / expired
  context         JSONB NOT NULL DEFAULT '{}',         -- collected entities: name, mobile, doctor_id, date, time, reason
  messages        JSONB NOT NULL DEFAULT '[]',         -- [{role, content, ts}]
  appointment_id  INTEGER REFERENCES emr_appointments(id) ON DELETE SET NULL,
  is_handoff      BOOLEAN NOT NULL DEFAULT FALSE,
  handoff_reason  TEXT,
  ai_confidence   DECIMAL(5,4) DEFAULT 1.0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inbound_conv_channel ON inbound_conversations(channel, channel_id);
CREATE INDEX IF NOT EXISTS idx_inbound_conv_clinic  ON inbound_conversations(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_conv_active  ON inbound_conversations(channel_id, state)
  WHERE state = 'active';

-- HIPAA-compliant immutable audit log
CREATE TABLE IF NOT EXISTS inbound_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES inbound_conversations(id),
  clinic_id       INTEGER,
  channel         VARCHAR(20),
  channel_id      VARCHAR(200),
  direction       VARCHAR(10) NOT NULL CHECK (direction IN ('inbound','outbound','system')),
  message         TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_conv   ON inbound_audit_log(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_clinic ON inbound_audit_log(clinic_id, created_at DESC);
