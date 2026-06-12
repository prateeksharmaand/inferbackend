CREATE TABLE IF NOT EXISTS hip_consent_artifacts (
  id          SERIAL PRIMARY KEY,
  consent_id  TEXT UNIQUE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'GRANTED',
  artefacts   JSONB,
  raw         JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
