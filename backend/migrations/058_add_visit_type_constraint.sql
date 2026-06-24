-- Migration: Add visit_type constraint and index
-- Date: 2026-06-24
-- Purpose: Enforce valid visit types and improve query performance

-- ====================================================================
-- ADD CHECK CONSTRAINT FOR VISIT_TYPE
-- ====================================================================

ALTER TABLE emr_visits
ADD CONSTRAINT visit_type_check 
CHECK (visit_type IN ('consultation', 'lab', 'vaccination', 'report_collection', 'pharmacy', 'registration', 'insurance', 'procedure', 'followup', 'other'));

-- ====================================================================
-- CREATE INDEX FOR VISIT TYPE QUERIES
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_emr_visits_clinic_type_date
  ON emr_visits(clinic_id, visit_type, DATE(created_at) DESC);

-- ====================================================================
-- VERIFY MIGRATION
-- ====================================================================

-- Check that constraint exists:
-- SELECT constraint_name FROM information_schema.table_constraints 
-- WHERE table_name = 'emr_visits' AND constraint_type = 'CHECK';
