-- ── Super Admin table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS superadmins (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Add status + trial columns to emr_clinics if not present ──────────────────
ALTER TABLE emr_clinics
  ADD COLUMN IF NOT EXISTS status       VARCHAR(20)  NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes        TEXT;

-- ── Admin audit log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER     NOT NULL REFERENCES superadmins(id),
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id   INTEGER,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
