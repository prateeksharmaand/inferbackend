-- Persistent rate limiting for health-information requests.
-- Replaces in-memory Map that reset on service restart.

BEGIN;

CREATE TABLE IF NOT EXISTS hip_rate_limits (
  key         VARCHAR(255) PRIMARY KEY,
  count       INTEGER      NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hip_rate_limits_window
  ON hip_rate_limits(window_start);

COMMIT;
