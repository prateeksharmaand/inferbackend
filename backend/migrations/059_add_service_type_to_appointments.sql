-- Migration: Add service_type column to emr_appointments
-- Date: 2026-06-24
-- Purpose: Track what type of service/visit each appointment is for

-- ====================================================================
-- ADD SERVICE_TYPE COLUMN
-- ====================================================================

ALTER TABLE emr_appointments
ADD COLUMN service_type VARCHAR(50) DEFAULT 'consultation';

-- ====================================================================
-- ADD CHECK CONSTRAINT FOR VALID SERVICE TYPES
-- ====================================================================

ALTER TABLE emr_appointments
ADD CONSTRAINT service_type_check
CHECK (service_type IN ('consultation', 'lab', 'vaccination', 'report_collection', 'pharmacy', 'registration', 'insurance', 'procedure', 'followup', 'other'));

-- ====================================================================
-- CREATE INDEX FOR PERFORMANCE
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_emr_appointments_service_type
  ON emr_appointments(clinic_id, service_type, appointment_date DESC);

-- ====================================================================
-- VERIFY MIGRATION
-- ====================================================================

-- Check that column exists and constraint is applied:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'emr_appointments' AND column_name = 'service_type';
