-- EMR: clinics, doctors, queues, appointments, encounters (FHIR R4 JSONB)

-- ── Clinics ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emr_clinics (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  address      TEXT,
  phone        VARCHAR(20),
  email        VARCHAR(255) UNIQUE,
  plan         VARCHAR(50)  DEFAULT 'base',
  max_patients INTEGER      DEFAULT 100,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Clinic staff (admin / receptionist) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS emr_clinic_staff (
  id            SERIAL PRIMARY KEY,
  clinic_id     INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(30)  DEFAULT 'admin',   -- admin | staff
  is_active     BOOLEAN      DEFAULT true,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Doctors ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emr_doctors (
  id             SERIAL PRIMARY KEY,
  clinic_id      INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  specialization VARCHAR(100),
  qualification  VARCHAR(100),
  registration_no VARCHAR(50),
  is_active      BOOLEAN     DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Queues ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emr_queues (
  id            SERIAL PRIMARY KEY,
  clinic_id     INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  doctor_id     INTEGER REFERENCES emr_doctors(id) ON DELETE SET NULL,
  name          VARCHAR(255) NOT NULL,
  mode          VARCHAR(20)  DEFAULT 'in_clinic',   -- in_clinic | tele
  filters       JSONB        DEFAULT '{}',
  quick_actions JSONB        DEFAULT '[]',
  sort_order    VARCHAR(50)  DEFAULT 'appointment_start',
  is_active     BOOLEAN      DEFAULT true,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Appointments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emr_appointments (
  id               SERIAL PRIMARY KEY,
  queue_id         INTEGER REFERENCES emr_queues(id) ON DELETE SET NULL,
  clinic_id        INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  doctor_id        INTEGER REFERENCES emr_doctors(id) ON DELETE SET NULL,
  emr_patient_id   INTEGER REFERENCES emr_patients(id) ON DELETE SET NULL,

  -- Patient snapshot (denormalised for speed)
  patient_name     VARCHAR(255) NOT NULL,
  patient_mobile   VARCHAR(15),
  patient_dob      DATE,
  patient_gender   CHAR(1),
  patient_abha     VARCHAR(30),

  token_number     INTEGER,
  visit_type       VARCHAR(50)  DEFAULT 'OPConsultation',
  channel          VARCHAR(50)  DEFAULT 'walk_in',
  -- ABHA | doctor | follow_up | offline | online | patient_requested | staff | walk_in

  status           VARCHAR(30)  DEFAULT 'booked',
  -- booked | checked_in | ongoing | completed | cancelled |
  -- rescheduled | follow_up | parked | no_show | aborted

  payment_status   VARCHAR(20)  DEFAULT 'unbilled',  -- billed | unbilled
  assessment_status VARCHAR(20) DEFAULT 'pending',   -- pending | done

  appointment_date DATE         NOT NULL DEFAULT CURRENT_DATE,
  appointment_time TIME,
  checked_in_at    TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,

  notes            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emr_appt_queue_date  ON emr_appointments(queue_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_emr_appt_clinic_date ON emr_appointments(clinic_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_emr_appt_status      ON emr_appointments(status);

-- ── Encounters (FHIR R4 clinical data) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS emr_encounters (
  id                SERIAL PRIMARY KEY,
  appointment_id    INTEGER UNIQUE REFERENCES emr_appointments(id) ON DELETE CASCADE,
  clinic_id         INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  doctor_id         INTEGER REFERENCES emr_doctors(id) ON DELETE SET NULL,
  emr_patient_id    INTEGER REFERENCES emr_patients(id) ON DELETE SET NULL,

  chief_complaint   TEXT,
  symptoms          JSONB   DEFAULT '[]',
  diagnosis         JSONB   DEFAULT '[]',    -- [{code, display, system, status}]
  medications       JSONB   DEFAULT '[]',    -- FHIR MedicationRequest array
  instructions      TEXT,
  next_visit_date   DATE,
  next_visit_notes  TEXT,
  vitals            JSONB   DEFAULT '{}',    -- {bp, pulse, temp, spo2, weight, height}

  fhir_bundle       JSONB,                   -- full FHIR R4 Bundle stored as JSONB

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auto-token per queue per day ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS emr_token_seq START 1;

-- ── Triggers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION emr_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emr_appt_updated_at ON emr_appointments;
CREATE TRIGGER trg_emr_appt_updated_at
  BEFORE UPDATE ON emr_appointments
  FOR EACH ROW EXECUTE FUNCTION emr_set_updated_at();

DROP TRIGGER IF EXISTS trg_emr_enc_updated_at ON emr_encounters;
CREATE TRIGGER trg_emr_enc_updated_at
  BEFORE UPDATE ON emr_encounters
  FOR EACH ROW EXECUTE FUNCTION emr_set_updated_at();

-- ── Seed: default clinic + admin ──────────────────────────────────────────────
-- Password: Admin@123  (bcrypt hash generated offline)
INSERT INTO emr_clinics (name, address, phone, email, plan, max_patients)
VALUES ('Deenbandhu Hospital', 'New Delhi', '+91-9999999999', 'admin@inferapp.online', 'base', 100)
ON CONFLICT (email) DO NOTHING;
