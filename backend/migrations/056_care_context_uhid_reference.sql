-- Migration: Update Care Context Reference Number Format to Use UHID
-- Date: 2026-06-23
-- Context: Care context reference_number now uses patient UHID as the primary identifier
--          This provides clinic-specific, human-readable care context references
--
-- Previous format (OPD-YYYYMMDD-XXXXXX): appointment-id based
--   Example: OPD-20260622-000001
--
-- New format (UHID-YYYYMMDD): UHID-based with date component
--   Example: 2-1-20260622 (where 2-1 is the UHID, 20260622 is the date)
--
-- Benefits:
-- 1. UHID is clinic-specific, making reference numbers meaningful within clinic context
-- 2. Searchable by patient identifier (UHID) instead of appointment ID
-- 3. Easier patient data reconciliation with existing HIS/ERP systems
--
-- Note: Existing care contexts with OPD- format remain unchanged for backward compatibility
--       New care contexts will use the UHID-YYYYMMDD format
--
-- Application code changes:
-- - emr.appointment.controller.js: Updated createEncounter to fetch UHID from patient_clinics
-- - emr.controller.js: Updated addCareContext to use UHID instead of UUID-based REF-
--
-- Migration: No schema changes needed. Reference number generation updated in code only.

-- Optional: Index optimization for UHID-based lookups (if not already present)
CREATE INDEX IF NOT EXISTS idx_emr_care_contexts_patient_reference
ON emr_care_contexts(patient_id, reference_number);
