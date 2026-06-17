-- =============================================================================
-- Audit Log Migration — 2026-06-14
-- OWASP A10: Insufficient Logging & Monitoring
-- ABDM mandatory audit trail for all critical healthcare actions
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL    PRIMARY KEY,
  event_time   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Who
  event_type   VARCHAR(60)  NOT NULL,   -- e.g. AUTH_LOGIN_SUCCESS
  user_id      INT,                     -- emr_doctors / emr_clinic_staff id
  user_email   TEXT,
  user_role    TEXT,                    -- doctor | staff | superadmin | abdm_gateway
  clinic_id    INT,

  -- What / Where
  ip_address   TEXT,
  user_agent   TEXT,
  request_id   TEXT,                    -- X-Request-ID for full trace
  resource     TEXT,                    -- URL path
  action       TEXT,                    -- human-readable summary

  -- Target
  patient_id   INT,                     -- set when action is patient-specific
  consent_id   TEXT,
  transaction_id TEXT,

  -- Result
  status       TEXT   NOT NULL DEFAULT 'SUCCESS', -- SUCCESS | FAILURE | DENIED
  severity     TEXT   NOT NULL DEFAULT 'INFO',    -- INFO | WARN | CRITICAL

  -- Non-PHI context
  details      JSONB
);

-- Indexes for dashboard queries and forensic lookups
CREATE INDEX IF NOT EXISTS idx_audit_event_time   ON audit_logs(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type   ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_user_id      ON audit_logs(user_id)      WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_clinic_id    ON audit_logs(clinic_id)    WHERE clinic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_patient_id   ON audit_logs(patient_id)   WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_ip           ON audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_status       ON audit_logs(status)       WHERE status <> 'SUCCESS';
CREATE INDEX IF NOT EXISTS idx_audit_severity     ON audit_logs(severity)     WHERE severity IN ('WARN','CRITICAL');

COMMIT;
