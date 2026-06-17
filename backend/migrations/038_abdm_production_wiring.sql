-- =============================================================================
-- ABDM Production Wiring — 2026-06-14
-- Adds missing columns needed for full EMR ↔ ABDM integration
-- =============================================================================

BEGIN;

-- ── hip_consent_artifacts: add patient_abha column officially ────────────────
-- (was being added in handleConsentNotify dynamically — now in migration)
ALTER TABLE hip_consent_artifacts
  ADD COLUMN IF NOT EXISTS patient_abha TEXT;

CREATE INDEX IF NOT EXISTS idx_hip_consent_patient_abha
  ON hip_consent_artifacts(patient_abha) WHERE patient_abha IS NOT NULL;

-- ── emr_care_contexts: add updated_at for ON CONFLICT DO UPDATE ─────────────
ALTER TABLE emr_care_contexts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Back-fill updated_at from created_at
UPDATE emr_care_contexts SET updated_at = created_at WHERE updated_at IS NULL;

-- ── emr_care_contexts: unique constraint + indexes for lookups ─────────────────
ALTER TABLE emr_care_contexts
  ADD CONSTRAINT uq_care_ctx_ref_num UNIQUE (reference_number) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_care_ctx_patient
  ON emr_care_contexts(patient_id);

-- ── emr_appointments: add doctor_name denorm column for FHIR bundles ─────────
ALTER TABLE emr_appointments
  ADD COLUMN IF NOT EXISTS doctor_name TEXT;

-- Back-fill from emr_doctors
UPDATE emr_appointments a
SET doctor_name = d.name
FROM emr_doctors d
WHERE d.id = a.doctor_id AND a.doctor_name IS NULL;

-- ── hip_health_requests: add status index ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hip_health_req_status
  ON hip_health_requests(status);

-- ── Backfill care contexts for all existing completed encounters ──────────────
-- Creates OPD-YYYYMMDD-<apptId> entries for all past encounters that don't have one.
-- The FHIR content is left NULL — it will be rebuilt on next encounter save.
INSERT INTO emr_care_contexts (patient_id, reference_number, display, hi_type, created_at)
SELECT
  a.emr_patient_id,
  'OPD-' || TO_CHAR(a.appointment_date, 'YYYYMMDD') || '-' || LPAD(a.id::text, 6, '0'),
  'OPD Consultation – ' || TO_CHAR(a.appointment_date, 'YYYY-MM-DD') || ' – ' || a.patient_name,
  'OPConsultation',
  COALESCE(a.completed_at, a.created_at)
FROM emr_appointments a
JOIN emr_encounters e ON e.appointment_id = a.id
WHERE a.emr_patient_id IS NOT NULL
  AND a.status = 'completed'
ON CONFLICT (reference_number) DO NOTHING;

COMMIT;
