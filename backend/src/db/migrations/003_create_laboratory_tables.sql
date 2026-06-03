-- ============================================
-- LABORATORY MANAGEMENT SYSTEM SCHEMA
-- ============================================

-- 1. LABORATORIES TABLE
CREATE TABLE IF NOT EXISTS laboratories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name VARCHAR(255) NOT NULL,
  lab_type VARCHAR(50) NOT NULL, -- 'CLINICAL', 'DIAGNOSTIC', 'REFERENCE', 'NABL', 'POCT'
  accreditation_number VARCHAR(100),
  is_nabl_accredited BOOLEAN DEFAULT false,
  iso_15189_compliant BOOLEAN DEFAULT false,

  -- Contact & Location
  address_line1 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),

  -- Integration
  hl7_enabled BOOLEAN DEFAULT false,
  fhir_enabled BOOLEAN DEFAULT false,
  api_key VARCHAR(255) UNIQUE,
  api_secret_encrypted VARCHAR(500),
  webhook_url VARCHAR(500),

  -- Configuration
  processing_sla_seconds INT DEFAULT 30,
  critical_value_thresholds JSONB,

  -- Status
  status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE', 'SUSPENDED'

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,

  CONSTRAINT valid_lab_type CHECK (lab_type IN ('CLINICAL', 'DIAGNOSTIC', 'REFERENCE', 'NABL', 'POCT')),
  CONSTRAINT valid_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE INDEX IF NOT EXISTS idx_labs_type ON laboratories(lab_type);
CREATE INDEX IF NOT EXISTS idx_labs_status ON laboratories(status);
CREATE INDEX IF NOT EXISTS idx_labs_api_key ON laboratories(api_key);

-- 2. EXTEND USERS TABLE FOR LAB STAFF
ALTER TABLE users ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES laboratories(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS lab_role VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_upload_results BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_all_results BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_lab ON users(lab_id, lab_role);

-- 3. LAB TEST RESULTS
CREATE TABLE IF NOT EXISTS lab_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL,
  lab_id UUID NOT NULL REFERENCES laboratories(id),

  -- Test Info
  test_code VARCHAR(50) NOT NULL, -- LOINC code
  test_name VARCHAR(255) NOT NULL,
  specimen_type VARCHAR(100),

  -- Timestamps
  collection_timestamp TIMESTAMP NOT NULL,
  received_timestamp TIMESTAMP,
  result_timestamp TIMESTAMP,

  -- Result Data
  result_value NUMERIC(15, 4),
  result_unit VARCHAR(50),
  reference_range_low NUMERIC(15, 4),
  reference_range_high NUMERIC(15, 4),
  result_status VARCHAR(50) DEFAULT 'FINAL', -- 'PENDING', 'FINAL', 'PRELIMINARY', 'CORRECTED', 'AMENDED'

  -- Source
  source_format VARCHAR(50), -- 'HL7', 'FHIR', 'JSON', 'PDF', 'CSV'
  raw_data_encrypted BYTEA,
  file_reference_id UUID,

  -- Flags
  is_critical_value BOOLEAN DEFAULT false,
  needs_immediate_attention BOOLEAN DEFAULT false,
  doctor_notified_at TIMESTAMP,

  visibility_status VARCHAR(50) DEFAULT 'PENDING_REVIEW', -- 'DOCTOR_VISIBLE', 'PENDING_REVIEW', 'RESTRICTED'
  visible_to_doctor_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (result_status IN ('PENDING', 'FINAL', 'PRELIMINARY', 'CORRECTED', 'AMENDED')),
  CONSTRAINT valid_visibility CHECK (visibility_status IN ('DOCTOR_VISIBLE', 'PENDING_REVIEW', 'RESTRICTED'))
);

CREATE INDEX IF NOT EXISTS idx_results_patient ON lab_test_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_results_lab ON lab_test_results(lab_id);
CREATE INDEX IF NOT EXISTS idx_results_status ON lab_test_results(result_status);
CREATE INDEX IF NOT EXISTS idx_results_visible ON lab_test_results(visibility_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_results_critical ON lab_test_results(is_critical_value);
CREATE INDEX IF NOT EXISTS idx_results_timestamp ON lab_test_results(result_timestamp DESC);

-- 4. LAB ANOMALIES
CREATE TABLE IF NOT EXISTS lab_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES lab_test_results(id),
  patient_id UUID NOT NULL,

  anomaly_type VARCHAR(50) NOT NULL,
  severity VARCHAR(50) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'

  -- Context
  baseline_value NUMERIC(15, 4),
  population_percentile INT,
  previous_results JSONB,

  -- Clinical Info
  clinical_context TEXT,
  recommended_action TEXT,

  -- Notification
  doctor_alerted BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMP,
  alert_acknowledged_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON lab_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_patient ON lab_anomalies(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_result ON lab_anomalies(result_id);

-- 5. AUDIT LOGS (ISO 15189 compliance)
CREATE TABLE IF NOT EXISTS lab_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_role VARCHAR(50),

  action VARCHAR(50) NOT NULL, -- 'RESULT_UPLOADED', 'RESULT_VIEWED', 'RESULT_MODIFIED'
  resource_type VARCHAR(50),
  resource_id UUID,

  changes_made JSONB,

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON lab_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON lab_audit_logs(resource_type, resource_id, created_at DESC);

-- 6. ENCRYPTED FILES
CREATE TABLE IF NOT EXISTS encrypted_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID REFERENCES lab_test_results(id),
  lab_id UUID NOT NULL REFERENCES laboratories(id),

  original_filename VARCHAR(500),
  file_size_bytes INT,
  mime_type VARCHAR(100),

  -- Encryption
  encrypted_content BYTEA,
  encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',

  -- OCR (if PDF)
  ocr_extracted_text TEXT,
  ocr_confidence NUMERIC(3, 2),

  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_result ON encrypted_files(result_id);
CREATE INDEX IF NOT EXISTS idx_files_lab ON encrypted_files(lab_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_update_labs_timestamp
BEFORE UPDATE ON laboratories
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER IF NOT EXISTS trigger_update_results_timestamp
BEFORE UPDATE ON lab_test_results
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ============================================
-- DATA GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON laboratories TO emr_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_test_results TO emr_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_anomalies TO emr_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_audit_logs TO emr_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON encrypted_files TO emr_app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO emr_app_role;
