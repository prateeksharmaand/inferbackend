-- =============================================================================
-- Session / JWT Blacklist — 2026-06-14
-- OWASP A2: Broken Authentication
-- Invalidates JWT tokens server-side on logout so they cannot be reused.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS jwt_blacklist (
  id           BIGSERIAL   PRIMARY KEY,
  jti          TEXT        UNIQUE NOT NULL,  -- JWT ID (unique per token)
  user_id      INT,
  clinic_id    INT,
  expires_at   TIMESTAMPTZ NOT NULL,         -- mirrors JWT exp — auto-cleanup
  revoked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoke_reason TEXT                         -- 'logout' | 'password_change' | 'admin_revoke'
);

CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_jti        ON jwt_blacklist(jti);
CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_expires_at ON jwt_blacklist(expires_at);
CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_user_id    ON jwt_blacklist(user_id) WHERE user_id IS NOT NULL;

COMMIT;
