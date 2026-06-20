-- Multi-tenant patient architecture:
-- 1. Add clinic_id directly to emr_care_contexts (ownership on the record, not the patient)
-- 2. Create patient_clinics many-to-many table
-- 3. Backfill care context clinic_id from appointments

-- Step 1: Add clinic_id to emr_care_contexts
ALTER TABLE emr_care_contexts
  ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES emr_clinics(id) ON DELETE SET NULL;

-- Step 2: Backfill care_contexts.clinic_id from the appointment that created them.
-- Reference number pattern OPD-YYYYMMDD-XXXXXX maps to appointment id.
UPDATE emr_care_contexts cc
SET    clinic_id = a.clinic_id
FROM   emr_appointments a
WHERE  cc.reference_number = 'OPD-' || TO_CHAR(a.appointment_date, 'YYYYMMDD') || '-' || LPAD(a.id::text, 6, '0')
  AND  cc.clinic_id IS NULL;

-- For REF-* care contexts (manually created), derive from patient's default clinic
UPDATE emr_care_contexts cc
SET    clinic_id = p.clinic_id
FROM   emr_patients p
WHERE  cc.patient_id = p.id
  AND  cc.clinic_id IS NULL
  AND  p.clinic_id IS NOT NULL;

-- Step 3: Create patient_clinics many-to-many mapping
CREATE TABLE IF NOT EXISTS patient_clinics (
  id             SERIAL PRIMARY KEY,
  patient_id     INTEGER NOT NULL REFERENCES emr_patients(id) ON DELETE CASCADE,
  clinic_id      INTEGER NOT NULL REFERENCES emr_clinics(id)  ON DELETE CASCADE,
  first_visit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_visit_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status         VARCHAR(20) NOT NULL DEFAULT 'active',
  UNIQUE (patient_id, clinic_id)
);

-- Step 4: Backfill patient_clinics from appointments
INSERT INTO patient_clinics (patient_id, clinic_id, first_visit_at, last_visit_at)
SELECT
  a.emr_patient_id                    AS patient_id,
  a.clinic_id,
  MIN(a.created_at)                   AS first_visit_at,
  MAX(a.created_at)                   AS last_visit_at
FROM   emr_appointments a
WHERE  a.emr_patient_id IS NOT NULL
GROUP  BY a.emr_patient_id, a.clinic_id
ON CONFLICT (patient_id, clinic_id) DO UPDATE
  SET last_visit_at = EXCLUDED.last_visit_at;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_emr_care_contexts_clinic_id ON emr_care_contexts(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_clinics_patient_id  ON patient_clinics(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_clinics_clinic_id   ON patient_clinics(clinic_id);
