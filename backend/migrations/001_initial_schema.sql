-- PHR Application - Full Database Schema
-- Supports: Multi-profile family members, vitals, documents, medicines, timeline, healthbot

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================
-- ACCOUNTS (the login account - one per household)
-- ================================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  fcm_token TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255),
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ================================================
-- PROFILES (family members - multiple per account)
-- ================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(50) NOT NULL DEFAULT 'self', -- self, spouse, child, parent, sibling, other
  date_of_birth DATE,
  gender VARCHAR(20),
  blood_group VARCHAR(10),
  avatar_url TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  height_cm DECIMAL(5,2),
  weight_kg DECIMAL(5,2),
  allergies TEXT[],
  chronic_conditions TEXT[],
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ================================================
-- VITALS
-- ================================================
CREATE TABLE IF NOT EXISTS vitals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vital_type VARCHAR(50) NOT NULL, -- bp, sugar, weight, temperature, spo2, heart_rate
  -- BP fields
  systolic INTEGER,
  diastolic INTEGER,
  -- Sugar field
  glucose_level DECIMAL(6,2),
  glucose_unit VARCHAR(10) DEFAULT 'mg/dL', -- mg/dL or mmol/L
  measurement_context VARCHAR(50), -- fasting, post_meal, random, bedtime
  -- Weight
  weight_kg DECIMAL(5,2),
  -- Temperature
  temperature DECIMAL(4,1),
  temperature_unit VARCHAR(5) DEFAULT 'C',
  -- SpO2
  spo2_percentage DECIMAL(4,1),
  -- Heart Rate
  heart_rate INTEGER,
  heart_rate_method VARCHAR(20) DEFAULT 'manual', -- manual, camera
  -- Common
  loinc_code VARCHAR(20),
  notes TEXT,
  recorded_at TIMESTAMP DEFAULT NOW(),
  source VARCHAR(20) DEFAULT 'manual', -- manual, ocr, device
  is_abnormal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================
-- DOCUMENTS
-- ================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  document_type VARCHAR(50), -- lab_report, prescription, discharge_summary, imaging, vaccination, other
  file_path TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size INTEGER,
  mime_type VARCHAR(100),
  is_encrypted BOOLEAN DEFAULT TRUE,
  encryption_iv TEXT,
  ocr_text TEXT,
  ocr_status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  extracted_vitals JSONB,
  tags TEXT[],
  doctor_name VARCHAR(255),
  hospital_name VARCHAR(255),
  report_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ================================================
-- MEDICINES & REMINDERS
-- ================================================
CREATE TABLE IF NOT EXISTS medicines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255),
  brand_name VARCHAR(255),
  dosage VARCHAR(100),
  dosage_unit VARCHAR(50),
  frequency VARCHAR(50), -- once_daily, twice_daily, thrice_daily, every_X_hours, as_needed
  route VARCHAR(50) DEFAULT 'oral', -- oral, injection, topical, inhaled
  prescribed_by VARCHAR(255),
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  fda_drug_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicine_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reminder_times TIME[] NOT NULL,
  days_of_week INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5,6],
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicine_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  taken_at TIMESTAMP DEFAULT NOW(),
  scheduled_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'taken', -- taken, skipped, missed
  notes TEXT
);

-- ================================================
-- DRUG INTERACTIONS CACHE
-- ================================================
CREATE TABLE IF NOT EXISTS drug_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drug_1 VARCHAR(255) NOT NULL,
  drug_2 VARCHAR(255) NOT NULL,
  severity VARCHAR(20), -- major, moderate, minor
  description TEXT,
  cached_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(drug_1, drug_2)
);

-- ================================================
-- HEALTH TIMELINE
-- ================================================
CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- vital_recorded, document_uploaded, medicine_taken, appointment, symptom, note
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date TIMESTAMP NOT NULL DEFAULT NOW(),
  reference_id UUID,
  reference_type VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================
-- HEALTHBOT CONVERSATIONS
-- ================================================
CREATE TABLE IF NOT EXISTS healthbot_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS healthbot_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES healthbot_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- user, assistant
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================
-- NOTIFICATIONS
-- ================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50), -- medicine_reminder, abnormal_vital, document_processed, appointment
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP,
  scheduled_for TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================
-- ABNORMAL VITAL THRESHOLDS
-- ================================================
CREATE TABLE IF NOT EXISTS vital_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  vital_type VARCHAR(50) NOT NULL,
  min_normal DECIMAL(8,2),
  max_normal DECIMAL(8,2),
  min_critical DECIMAL(8,2),
  max_critical DECIMAL(8,2),
  is_custom BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(profile_id, vital_type)
);

-- ================================================
-- INDEXES
-- ================================================
-- Indexes that depend only on stable column names (present in all schema versions)
CREATE INDEX IF NOT EXISTS idx_profiles_account_id        ON profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_vitals_recorded_at         ON vitals(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_medicines_profile_id       ON medicines(profile_id);
CREATE INDEX IF NOT EXISTS idx_timeline_event_date        ON timeline_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_healthbot_sessions_profile ON healthbot_sessions(profile_id);
-- Indexes for profile_id / account_id columns are created in 006_schema_reconciliation.sql
-- (after any necessary column renames on existing databases)

-- ================================================
-- DEFAULT VITAL THRESHOLDS (system-wide defaults)
-- ================================================
INSERT INTO vital_thresholds (profile_id, vital_type, min_normal, max_normal, min_critical, max_critical, is_custom)
VALUES
  (NULL, 'systolic',         90,   120,  70,   180,  FALSE),
  (NULL, 'diastolic',        60,   80,   40,   120,  FALSE),
  (NULL, 'heart_rate',       60,   100,  40,   150,  FALSE),
  (NULL, 'spo2',             95,   100,  88,   NULL, FALSE),
  (NULL, 'temperature',      36.1, 37.2, 35.0, 40.0, FALSE),
  (NULL, 'glucose_fasting',  70,   100,  55,   300,  FALSE),
  (NULL, 'glucose_post_meal',70,   140,  55,   300,  FALSE),
  (NULL, 'weight_kg',        40,   120,  30,   200,  FALSE)
ON CONFLICT DO NOTHING;
