-- ================================================================================
-- Subscription Enforcement Tables - Phase 8
--
-- These tables support the centralized subscription engine:
-- - clinic_active_sessions: Track concurrent user logins against seat limits
-- - subscription_audit_log: Audit trail for subscription changes
-- - subscription_webhook_log: Webhook idempotency and replay protection
-- ================================================================================

-- ── Clinic Active Sessions ────────────────────────────────────────────────────
-- Tracks active user sessions to enforce seat limits
-- When a user logs in, a session is created
-- When seat limit is reached, new logins are rejected
-- When user logs out, session is marked as ended

CREATE TABLE IF NOT EXISTS clinic_active_sessions (
  id              SERIAL PRIMARY KEY,
  clinic_id       INTEGER      NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  staff_id        INTEGER      NOT NULL REFERENCES emr_clinic_staff(id) ON DELETE CASCADE,
  seat_type       VARCHAR(20)  NOT NULL, -- 'premium', 'basic', 'scribe'
  ip_address      INET,
  user_agent      TEXT,
  logged_in_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_activity   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  logged_out_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_active_sessions_clinic ON clinic_active_sessions(clinic_id);
CREATE INDEX idx_active_sessions_staff ON clinic_active_sessions(staff_id);
CREATE INDEX idx_active_sessions_seat_type ON clinic_active_sessions(clinic_id, seat_type);
CREATE INDEX idx_active_sessions_active ON clinic_active_sessions(clinic_id) WHERE logged_out_at IS NULL;

-- ── Subscription Audit Log ────────────────────────────────────────────────────
-- Complete audit trail of all subscription changes
-- Used for compliance, debugging, and change tracking

CREATE TABLE IF NOT EXISTS subscription_audit_log (
  id              SERIAL PRIMARY KEY,
  clinic_id       INTEGER      NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  action          VARCHAR(100) NOT NULL, -- 'subscription_created', 'subscription_updated', 'subscription_cancelled', etc
  admin_id        INTEGER      REFERENCES superadmins(id),
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_audit_clinic ON subscription_audit_log(clinic_id);
CREATE INDEX idx_subscription_audit_action ON subscription_audit_log(action);
CREATE INDEX idx_subscription_audit_created ON subscription_audit_log(created_at DESC);

-- ── Subscription Webhook Log ──────────────────────────────────────────────────
-- Log of all webhook processing for:
-- - Idempotency: prevent duplicate processing of same webhook
-- - Replay protection: track which webhooks have been processed
-- - Debugging: full audit trail of payment processing

CREATE TABLE IF NOT EXISTS subscription_webhook_log (
  id                      SERIAL PRIMARY KEY,
  clinic_id               INTEGER      REFERENCES emr_clinics(id) ON DELETE SET NULL,
  webhook_source          VARCHAR(50)  NOT NULL DEFAULT 'razorpay', -- 'razorpay', 'stripe', etc
  razorpay_event_id       VARCHAR(100) UNIQUE,
  razorpay_order_id       VARCHAR(100),
  razorpay_payment_id     VARCHAR(100),
  razorpay_signature      VARCHAR(255),
  payload                 JSONB        NOT NULL,
  status                  VARCHAR(20)  NOT NULL DEFAULT 'pending', -- 'pending', 'processed', 'failed', 'duplicate'
  error_message           TEXT,
  processed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_order_id ON subscription_webhook_log(razorpay_order_id);
CREATE INDEX idx_webhook_payment_id ON subscription_webhook_log(razorpay_payment_id);
CREATE INDEX idx_webhook_event_id ON subscription_webhook_log(razorpay_event_id);
CREATE INDEX idx_webhook_clinic ON subscription_webhook_log(clinic_id);
CREATE INDEX idx_webhook_status ON subscription_webhook_log(status);
CREATE UNIQUE INDEX idx_webhook_idempotency ON subscription_webhook_log(razorpay_event_id) WHERE razorpay_event_id IS NOT NULL;

-- ── Add Seat Type to Staff Table ──────────────────────────────────────────────
-- This column tracks which type of seat each staff member uses
-- Enables validation of seat limits during staff creation and login

ALTER TABLE emr_clinic_staff ADD COLUMN IF NOT EXISTS seat_type VARCHAR(20) DEFAULT 'basic';

CREATE INDEX IF NOT EXISTS idx_staff_seat_type ON emr_clinic_staff(clinic_id, seat_type);
CREATE INDEX IF NOT EXISTS idx_staff_active_seat ON emr_clinic_staff(clinic_id, seat_type) WHERE is_active = true;

-- ── Grant Proper Permissions ──────────────────────────────────────────────────
-- Ensure application role has proper permissions on new tables
-- (Adjust 'app_user' to match your actual application database role)

GRANT SELECT, INSERT, UPDATE ON clinic_active_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE ON subscription_audit_log TO app_user;
GRANT SELECT, INSERT, UPDATE ON subscription_webhook_log TO app_user;

-- ────────────────────────────────────────────────────────────────────────────────
-- ROLLBACK SCRIPT (if needed):
--
-- DROP INDEX IF EXISTS idx_webhook_idempotency CASCADE;
-- DROP INDEX IF EXISTS idx_webhook_status CASCADE;
-- DROP INDEX IF EXISTS idx_webhook_clinic CASCADE;
-- DROP INDEX IF EXISTS idx_webhook_event_id CASCADE;
-- DROP INDEX IF EXISTS idx_webhook_payment_id CASCADE;
-- DROP INDEX IF EXISTS idx_webhook_order_id CASCADE;
-- DROP TABLE IF EXISTS subscription_webhook_log CASCADE;
--
-- DROP INDEX IF EXISTS idx_subscription_audit_created CASCADE;
-- DROP INDEX IF EXISTS idx_subscription_audit_action CASCADE;
-- DROP INDEX IF EXISTS idx_subscription_audit_clinic CASCADE;
-- DROP TABLE IF EXISTS subscription_audit_log CASCADE;
--
-- DROP INDEX IF EXISTS idx_active_sessions_active CASCADE;
-- DROP INDEX IF EXISTS idx_active_sessions_seat_type CASCADE;
-- DROP INDEX IF EXISTS idx_active_sessions_staff CASCADE;
-- DROP INDEX IF EXISTS idx_active_sessions_clinic CASCADE;
-- DROP TABLE IF EXISTS clinic_active_sessions CASCADE;
--
-- ALTER TABLE emr_clinic_staff DROP COLUMN IF EXISTS seat_type CASCADE;
-- ────────────────────────────────────────────────────────────────────────────────
