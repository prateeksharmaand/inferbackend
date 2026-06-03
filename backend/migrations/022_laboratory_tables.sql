-- ============================================
-- LABORATORY MANAGEMENT SYSTEM SCHEMA
-- ============================================

-- 1. LABORATORIES TABLE (skipped if exists — schema managed elsewhere)
-- TABLE already exists with UUID id and clinic_id columns

-- 2. LAB STAFF TABLE
CREATE TABLE IF NOT EXISTS emr_lab_staff (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     INTEGER      NOT NULL REFERENCES emr_clinics(id)    ON DELETE CASCADE,
  lab_id        UUID                 REFERENCES laboratories(id)   ON DELETE SET NULL,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  lab_role      VARCHAR(50)  DEFAULT 'LAB_TECHNICIAN',
  is_active     BOOLEAN      DEFAULT true,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),

  CONSTRAINT valid_lab_role CHECK (lab_role IN ('LAB_TECHNICIAN','LAB_ADMIN','LAB_DIRECTOR'))
);

CREATE INDEX IF NOT EXISTS idx_lab_staff_clinic ON emr_lab_staff(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lab_staff_lab    ON emr_lab_staff(lab_id);

-- 3. LAB TEST RESULTS (already exists — schema managed elsewhere)
-- 4. LAB ANOMALIES (already exists — schema managed elsewhere)
-- 5. AUDIT LOGS (already exists — schema managed elsewhere)
