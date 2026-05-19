-- EMR: patients, care contexts, and HIP link/health-info sessions

CREATE TABLE IF NOT EXISTS emr_patients (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  mobile       VARCHAR(15),
  abha_number  VARCHAR(20),
  abha_address VARCHAR(255),
  dob          DATE,
  gender       CHAR(1) DEFAULT 'M',
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emr_care_contexts (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER NOT NULL REFERENCES emr_patients(id) ON DELETE CASCADE,
  reference_number VARCHAR(64) UNIQUE NOT NULL,
  display          VARCHAR(255) NOT NULL,
  hi_type          VARCHAR(50)  NOT NULL DEFAULT 'OPConsultation',
  fhir_content     TEXT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hip_link_sessions (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER REFERENCES emr_patients(id),
  transaction_id   VARCHAR(64),
  request_id       VARCHAR(64) UNIQUE,
  care_contexts    JSONB,
  otp              VARCHAR(10),
  otp_expires_at   TIMESTAMP WITH TIME ZONE,
  link_ref_number  VARCHAR(128),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending_otp',  -- pending_otp | confirmed | expired
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hip_health_requests (
  id              SERIAL PRIMARY KEY,
  transaction_id  VARCHAR(64) UNIQUE,
  consent_id      VARCHAR(128),
  data_push_url   TEXT,
  key_material    JSONB,
  status          VARCHAR(20) NOT NULL DEFAULT 'received',  -- received | sent | failed
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
