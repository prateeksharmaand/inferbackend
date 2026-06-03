-- ============================================
-- LABORATORY MANAGEMENT SYSTEM SCHEMA
-- ============================================

-- 1. LABORATORIES TABLE
CREATE TABLE IF NOT EXISTS laboratories (
  id                      SERIAL PRIMARY KEY,
  clinic_id               INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  facility_name           VARCHAR(255) NOT NULL,
  lab_type                VARCHAR(50)  NOT NULL DEFAULT 'DIAGNOSTIC',
  accreditation_number    VARCHAR(100),
  is_nabl_accredited      BOOLEAN      DEFAULT false,
  iso_15189_compliant     BOOLEAN      DEFAULT false,

  -- Contact
  address_line1           VARCHAR(255),
  city                    VARCHAR(100),
  state                   VARCHAR(100),
  postal_code             VARCHAR(20),
  phone                   VARCHAR(20),
  email                   VARCHAR(255),

  -- Integration
  hl7_enabled             BOOLEAN      DEFAULT false,
  fhir_enabled            BOOLEAN      DEFAULT false,
  api_key                 VARCHAR(255) UNIQUE,
  webhook_url             VARCHAR(500),

  -- Config
  processing_sla_seconds  INT          DEFAULT 30,
  critical_value_thresholds JSONB,

  status                  VARCHAR(50)  DEFAULT 'ACTIVE',
  created_at              TIMESTAMPTZ  DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  DEFAULT NOW(),

  CONSTRAINT valid_lab_type   CHECK (lab_type IN ('CLINICAL','DIAGNOSTIC','REFERENCE','NABL','POCT')),
  CONSTRAINT valid_lab_status CHECK (status   IN ('ACTIVE','INACTIVE','SUSPENDED'))
);

CREATE INDEX IF NOT EXISTS idx_labs_clinic ON laboratories(clinic_id);
CREATE INDEX IF NOT EXISTS idx_labs_type   ON laboratories(lab_type);
CREATE INDEX IF NOT EXISTS idx_labs_apikey ON laboratories(api_key);

-- 2. LAB STAFF TABLE
CREATE TABLE IF NOT EXISTS emr_lab_staff (
  id            SERIAL PRIMARY KEY,
  clinic_id     INTEGER NOT NULL REFERENCES emr_clinics(id)    ON DELETE CASCADE,
  lab_id        INTEGER          REFERENCES laboratories(id)   ON DELETE SET NULL,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  lab_role      VARCHAR(50)  DEFAULT 'LAB_TECHNICIAN',
  is_active     BOOLEAN      DEFAULT true,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),

  CONSTRAINT valid_lab_role CHECK (lab_role IN ('LAB_TECHNICIAN','LAB_ADMIN','LAB_DIRECTOR'))
);

CREATE INDEX IF NOT EXISTS idx_lab_staff_clinic ON emr_lab_staff(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lab_staff_lab    ON emr_lab_staff(lab_id);

-- 3. LAB TEST RESULTS
CREATE TABLE IF NOT EXISTS lab_test_results (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id                    INTEGER      NOT NULL REFERENCES laboratories(id),
  clinic_id                 INTEGER      NOT NULL REFERENCES emr_clinics(id),

  -- Patient reference (emr_patients id)
  patient_id                INTEGER      NOT NULL,

  -- Test info
  test_code                 VARCHAR(50)  NOT NULL,
  test_name                 VARCHAR(255) NOT NULL,
  specimen_type             VARCHAR(100),
  collection_timestamp      TIMESTAMPTZ  NOT NULL,
  result_timestamp          TIMESTAMPTZ,

  -- Result
  result_value              NUMERIC(15,4),
  result_unit               VARCHAR(50),
  reference_range_low       NUMERIC(15,4),
  reference_range_high      NUMERIC(15,4),
  result_status             VARCHAR(50)  DEFAULT 'FINAL',

  -- Source
  source_format             VARCHAR(50),
  file_reference_id         UUID,

  -- Flags
  is_critical_value         BOOLEAN      DEFAULT false,
  needs_immediate_attention BOOLEAN      DEFAULT false,
  doctor_notified_at        TIMESTAMPTZ,
  visibility_status         VARCHAR(50)  DEFAULT 'DOCTOR_VISIBLE',
  visible_to_doctor_at      TIMESTAMPTZ,

  created_at                TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_patient  ON lab_test_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_results_lab      ON lab_test_results(lab_id);
CREATE INDEX IF NOT EXISTS idx_results_clinic   ON lab_test_results(clinic_id);
CREATE INDEX IF NOT EXISTS idx_results_critical ON lab_test_results(is_critical_value);
CREATE INDEX IF NOT EXISTS idx_results_visible  ON lab_test_results(visibility_status, created_at DESC);

-- 4. LAB ANOMALIES
CREATE TABLE IF NOT EXISTS lab_anomalies (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id            UUID        NOT NULL REFERENCES lab_test_results(id) ON DELETE CASCADE,
  patient_id           INTEGER     NOT NULL,
  anomaly_type         VARCHAR(50) NOT NULL,
  severity             VARCHAR(50) NOT NULL,
  clinical_context     TEXT,
  recommended_action   TEXT,
  doctor_alerted       BOOLEAN     DEFAULT false,
  alert_acknowledged_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_severity CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL'))
);

CREATE INDEX IF NOT EXISTS idx_anomalies_result  ON lab_anomalies(result_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_patient ON lab_anomalies(patient_id, created_at DESC);

-- 5. AUDIT LOGS
CREATE TABLE IF NOT EXISTS lab_audit_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      INTEGER     REFERENCES emr_clinics(id),
  actor_id       INTEGER,
  actor_role     VARCHAR(50),
  action         VARCHAR(50) NOT NULL,
  resource_type  VARCHAR(50),
  resource_id    TEXT,
  changes_made   JSONB,
  ip_address     INET,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_clinic   ON lab_audit_logs(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON lab_audit_logs(resource_type, resource_id, created_at DESC);
