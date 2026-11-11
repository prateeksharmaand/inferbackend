-- 038_emr_assessments.sql
-- AI patient assessments run during an appointment: questions, answers and the full AI result
-- (risk level / score, summary, findings, warning signs, recommendations) exactly as shown.
CREATE TABLE IF NOT EXISTS emr_assessments (
  id             SERIAL PRIMARY KEY,
  clinic_id      INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES emr_appointments(id) ON DELETE SET NULL,
  patient_id     INTEGER,
  patient_mobile VARCHAR(20),
  patient_name   TEXT,
  category       TEXT NOT NULL,
  subcategory    TEXT NOT NULL,
  answers        JSONB NOT NULL DEFAULT '[]'::jsonb,
  result         JSONB NOT NULL,
  risk_level     VARCHAR(12),
  risk_score     INTEGER,
  created_by     INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emr_assessments_appt   ON emr_assessments (clinic_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_emr_assessments_mobile ON emr_assessments (clinic_id, right(regexp_replace(COALESCE(patient_mobile, ''), '\D', '', 'g'), 10));
