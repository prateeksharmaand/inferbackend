-- Migration: Add ABDM Registration Audit Table
-- Date: 2026-06-24
-- Purpose: Track all ABDM patient registration decisions (auto-link, manual review, new patient creation)

-- ====================================================================
-- CREATE ABDM REGISTRATION AUDIT TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS abdm_registration_audit (
  id SERIAL PRIMARY KEY,

  -- References
  clinic_id INT NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  user_id INT REFERENCES emr_users(id) ON DELETE SET NULL,
  patient_id INT REFERENCES emr_patients(id) ON DELETE SET NULL,

  -- ABDM Identity
  abha_number VARCHAR(50),
  abha_address VARCHAR(255),

  -- Match Details
  confidence_score INT CHECK (confidence_score >= 0 AND confidence_score <= 100),
  matched_on VARCHAR(100),  -- 'abha_exact', 'mobile_dob_name', 'name_dob_gender', 'none'

  -- User Action
  action VARCHAR(50) NOT NULL CHECK (action IN ('LINK_EXISTING_PATIENT', 'CREATE_NEW_PATIENT', 'CANCELLED', 'ABHA_AUTO_LINKED', 'ABDM_AUTO_LINKED_MOBILE_DOB_NAME')),
  reason TEXT,  -- Why the action was taken

  -- Audit Trail
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ====================================================================
-- INDEXES FOR PERFORMANCE
-- ====================================================================

-- Query by clinic and user (staff member activity)
CREATE INDEX IF NOT EXISTS idx_abdm_audit_clinic_user
  ON abdm_registration_audit(clinic_id, user_id, created_at DESC);

-- Query by ABHA (find all registrations for a specific ABHA)
CREATE INDEX IF NOT EXISTS idx_abdm_audit_abha
  ON abdm_registration_audit(clinic_id, abha_number, created_at DESC);

-- Query by patient (audit trail for a specific patient)
CREATE INDEX IF NOT EXISTS idx_abdm_audit_patient
  ON abdm_registration_audit(patient_id, action, created_at DESC);

-- Query by action type (analytics)
CREATE INDEX IF NOT EXISTS idx_abdm_audit_action
  ON abdm_registration_audit(clinic_id, action, created_at DESC);

-- Query recent registrations
CREATE INDEX IF NOT EXISTS idx_abdm_audit_clinic_date
  ON abdm_registration_audit(clinic_id, created_at DESC);

-- ====================================================================
-- UNIQUE CONSTRAINT ON ABHA + CLINIC (OPTIONAL)
-- ====================================================================
-- This prevents the same ABHA from being registered multiple times in the same clinic
-- Commented out as it may not be desired (same ABHA can re-register)
-- ALTER TABLE abdm_registration_audit
-- ADD CONSTRAINT uc_clinic_abha_unique UNIQUE (clinic_id, abha_number, abha_address);

-- ====================================================================
-- VERIFY MIGRATION
-- ====================================================================

-- Check that table exists:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name = 'abdm_registration_audit' AND table_schema = 'public';

-- Check columns:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'abdm_registration_audit'
-- ORDER BY ordinal_position;

-- Check indexes:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'abdm_registration_audit';
