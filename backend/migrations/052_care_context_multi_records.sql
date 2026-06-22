-- Migration: Support multiple health records (HI types) per Care Context
-- Context: One Care Context = One Visit/Clinical Interaction
--          One Care Context can contain many Health Records (different HI types)
--
-- Architecture:
-- Care Context: OPD-20260622-0001 (represents the clinical visit)
-- Health Records within context:
--   ├─ OPConsultation FHIR bundle
--   ├─ Prescription FHIR bundle
--   ├─ DiagnosticReport FHIR bundle
--   └─ WellnessRecord FHIR bundle

-- Add health_records column to store multiple records per Care Context
ALTER TABLE emr_care_contexts
ADD COLUMN IF NOT EXISTS health_records JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS clinic_id INTEGER,
ADD COLUMN IF NOT EXISTS link_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS link_error TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster lookups by clinic_id and link_status
CREATE INDEX IF NOT EXISTS idx_emr_care_ctx_clinic ON emr_care_contexts(clinic_id);
CREATE INDEX IF NOT EXISTS idx_emr_care_ctx_link_status ON emr_care_contexts(link_status);
CREATE INDEX IF NOT EXISTS idx_emr_care_ctx_reference ON emr_care_contexts(reference_number);

-- health_records structure (example):
-- [
--   {
--     "hi_type": "OPConsultation",
--     "fhir_content": "{...FHIR Bundle...}",
--     "created_at": "2026-06-22T10:30:00Z"
--   },
--   {
--     "hi_type": "Prescription",
--     "fhir_content": "{...FHIR Bundle...}",
--     "created_at": "2026-06-22T10:30:00Z"
--   },
--   {
--     "hi_type": "DiagnosticReport",
--     "fhir_content": "{...FHIR Bundle...}",
--     "created_at": "2026-06-22T10:30:00Z"
--   },
--   {
--     "hi_type": "WellnessRecord",
--     "fhir_content": "{...FHIR Bundle...}",
--     "created_at": "2026-06-22T10:30:00Z"
--   }
-- ]

-- Note: Existing 'hi_type' and 'fhir_content' columns are kept for backward compatibility
--       New code should use health_records JSONB array instead
