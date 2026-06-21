-- Staff RBAC: roles, permissions, invitations

-- 1. Extend emr_clinic_staff with richer profile fields
ALTER TABLE emr_clinic_staff
  ADD COLUMN IF NOT EXISTS mobile       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS employee_id  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS department   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS designation  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS profile_photo TEXT,        -- URL or base64
  ADD COLUMN IF NOT EXISTS permissions  JSONB NOT NULL DEFAULT '{}',  -- per-user overrides
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

-- Update role column to support all roles
ALTER TABLE emr_clinic_staff
  ALTER COLUMN role SET DEFAULT 'staff';

-- 2. Staff roles table (per clinic, supports custom roles)
CREATE TABLE IF NOT EXISTS staff_roles (
  id          SERIAL PRIMARY KEY,
  clinic_id   INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,            -- 'Receptionist', 'Nurse', etc.
  slug        VARCHAR(50)  NOT NULL,            -- 'receptionist', 'nurse'
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,   -- system roles can't be deleted
  permissions JSONB   NOT NULL DEFAULT '{}',   -- { "patients.view": true, ... }
  color       VARCHAR(7)   DEFAULT '#7c3aed',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clinic_id, slug)
);

-- 3. Invitation links
CREATE TABLE IF NOT EXISTS staff_invitations (
  id          SERIAL PRIMARY KEY,
  clinic_id   INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  token       VARCHAR(64) UNIQUE NOT NULL,
  email       VARCHAR(255),
  role        VARCHAR(50) NOT NULL DEFAULT 'staff',
  role_id     INTEGER REFERENCES staff_roles(id) ON DELETE SET NULL,
  name        VARCHAR(255),
  department  VARCHAR(100),
  designation VARCHAR(100),
  invited_by  INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | expired | revoked
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Staff activity log (clinic-scoped)
CREATE TABLE IF NOT EXISTS staff_activity_logs (
  id          BIGSERIAL PRIMARY KEY,
  clinic_id   INTEGER NOT NULL,
  staff_id    INTEGER,
  staff_email TEXT,
  staff_role  TEXT,
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(50),
  resource_id TEXT,
  details     JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_activity_clinic ON staff_activity_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_activity_staff  ON staff_activity_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_activity_time   ON staff_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_token ON staff_invitations(token);

-- 5. Seed system roles for every existing clinic
INSERT INTO staff_roles (clinic_id, name, slug, is_system, color, permissions)
SELECT
  c.id,
  r.name,
  r.slug,
  TRUE,
  r.color,
  r.permissions::jsonb
FROM emr_clinics c
CROSS JOIN (VALUES
  ('Clinic Admin',       'admin',           '#7c3aed', '{"all":true}'),
  ('Doctor',             'doctor',          '#0284c7', '{"patients.view":true,"patients.edit":true,"consultations.create":true,"consultations.edit":true,"consultations.view":true,"prescriptions.print":true,"assessments.view":true,"assessments.create":true,"inferpad.view":true,"inferpad.create":true}'),
  ('Receptionist',       'receptionist',    '#16a34a', '{"patients.view":true,"patients.add":true,"patients.edit":true,"appointments.create":true,"appointments.edit":true,"appointments.cancel":true,"appointments.view":true}'),
  ('Nurse',              'nurse',           '#0891b2', '{"patients.view":true,"patients.edit":true,"appointments.view":true,"assessments.view":true,"assessments.create":true}'),
  ('Billing Executive',  'billing',         '#d97706', '{"patients.view":true,"appointments.view":true,"billing.create":true,"billing.edit":true,"billing.refund":true,"billing.reports":true}'),
  ('Lab Technician',     'lab_technician',  '#dc2626', '{"patients.view":true,"lab.view":true,"lab.edit":true}'),
  ('Staff Member',       'staff',           '#64748b', '{"patients.view":true,"appointments.view":true}')
) AS r(name, slug, color, permissions)
ON CONFLICT (clinic_id, slug) DO NOTHING;
