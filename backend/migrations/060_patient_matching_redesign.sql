-- =====================================================================
-- Migration: Patient Matching System Redesign (v2.0)
-- Date: 2026-06-24
-- Purpose: Implement 4-tier matching, phone normalization, and safety
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- Step 1: Create normalize_phone() function
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION normalize_phone(mobile TEXT)
RETURNS TEXT AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF mobile IS NULL THEN
    RETURN NULL;
  END IF;

  normalized := mobile;

  -- Remove separators
  normalized := regexp_replace(normalized, '[\s\-()]', '', 'g');

  -- Remove country code variants
  IF normalized ~ '^\+91' THEN
    normalized := substring(normalized FROM 4);
  ELSIF normalized ~ '^91' THEN
    normalized := substring(normalized FROM 3);
  END IF;

  -- Remove leading 0
  IF normalized ~ '^0' THEN
    normalized := substring(normalized FROM 2);
  END IF;

  -- Validate: exactly 10 digits, first digit [6-9]
  IF normalized ~ '^\d{10}$' AND normalized ~ '^[6-9]' THEN
    RETURN normalized;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────
-- Step 2: Add mobile_normalized generated column
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE emr_patients
  ADD COLUMN IF NOT EXISTS mobile_normalized VARCHAR(10)
    GENERATED ALWAYS AS (normalize_phone(mobile)) STORED;

-- ─────────────────────────────────────────────────────────────────────
-- Step 3: Create indexes for 4-tier matching strategy
-- ─────────────────────────────────────────────────────────────────────

-- ABHA Level 1: ABHA Number lookup (GLOBAL)
CREATE INDEX IF NOT EXISTS idx_abha_mappings_number
  ON abha_mappings(abha_number)
  WHERE abha_number IS NOT NULL AND status = 'active';

-- ABHA Level 1b: ABHA Address lookup (GLOBAL)
CREATE INDEX IF NOT EXISTS idx_abha_mappings_address
  ON abha_mappings(abha_address)
  WHERE abha_address IS NOT NULL AND status = 'active';

-- Level 2: Mobile + DOB + Name (CLINIC-SCOPED)
-- Composite index: clinic_id → mobile_normalized → dob → name
CREATE INDEX IF NOT EXISTS idx_emr_patients_mobile_dob_name
  ON emr_patients(clinic_id, mobile_normalized, dob, LOWER(name))
  WHERE deleted_at IS NULL AND mobile_normalized IS NOT NULL;

-- Level 3: Mobile + Name (CLINIC-SCOPED)
-- Composite index: clinic_id → mobile_normalized → name
CREATE INDEX IF NOT EXISTS idx_emr_patients_mobile_name
  ON emr_patients(clinic_id, mobile_normalized, LOWER(name))
  WHERE deleted_at IS NULL AND mobile_normalized IS NOT NULL;

-- Supporting indexes for individual field searches
CREATE INDEX IF NOT EXISTS idx_emr_patients_mobile_normalized
  ON emr_patients(mobile_normalized)
  WHERE deleted_at IS NULL AND mobile_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emr_patients_dob
  ON emr_patients(dob)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_emr_patients_name_lower
  ON emr_patients(LOWER(name))
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Step 4: Create patient_match_log table for audit trail
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_match_log (
  id                    SERIAL PRIMARY KEY,
  clinic_id             INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  search_mobile         VARCHAR(10),
  search_name           VARCHAR(255),
  search_dob            DATE,
  search_gender         CHAR(1),
  matched_by            VARCHAR(50),  -- 'abha_number', 'mobile_dob_name', 'mobile_name', etc.
  confidence            INT CHECK (confidence >= 0 AND confidence <= 100),
  matched_patient_id    INTEGER REFERENCES emr_patients(id) ON DELETE SET NULL,
  candidates_count      INT DEFAULT 0,
  manual_review         BOOLEAN DEFAULT FALSE,
  user_selection_id     INTEGER REFERENCES emr_patients(id) ON DELETE SET NULL,
  created_by_user_id    INTEGER,
  source                VARCHAR(50),  -- 'manual', 'abdm', 'appointment', 'qr', 'consent'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit trail queries
CREATE INDEX IF NOT EXISTS idx_patient_match_log_clinic
  ON patient_match_log(clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_match_log_created
  ON patient_match_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_match_log_matched_patient
  ON patient_match_log(matched_patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_match_log_manual_review
  ON patient_match_log(manual_review)
  WHERE manual_review = TRUE;

-- ─────────────────────────────────────────────────────────────────────
-- Step 5: Verify existing data integrity
-- ─────────────────────────────────────────────────────────────────────

-- Count patients with NULL mobile_normalized (should be 0 if generated column works)
-- SELECT COUNT(*) FROM emr_patients WHERE mobile IS NOT NULL AND mobile_normalized IS NULL;

-- Count patients with invalid mobile format (not matching pattern)
-- SELECT id, mobile FROM emr_patients WHERE mobile IS NOT NULL AND mobile_normalized IS NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- Verification Queries (Run after migration)
-- ─────────────────────────────────────────────────────────────────────

-- SELECT
--   COUNT(*) as total_patients,
--   COUNT(CASE WHEN mobile_normalized IS NOT NULL THEN 1 END) as patients_with_normalized_mobile,
--   COUNT(DISTINCT clinic_id) as total_clinics
-- FROM emr_patients
-- WHERE deleted_at IS NULL;

-- SELECT * FROM pg_indexes WHERE tablename = 'emr_patients' ORDER BY indexname;

-- SELECT * FROM pg_indexes WHERE tablename = 'abha_mappings' ORDER BY indexname;

-- SELECT * FROM information_schema.columns WHERE table_name = 'emr_patients' AND column_name = 'mobile_normalized';
