CREATE TABLE IF NOT EXISTS risk_predictions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,
  score        INTEGER NOT NULL DEFAULT 0,
  level        VARCHAR(20) NOT NULL DEFAULT 'low',
  factors      JSONB DEFAULT '[]',
  recommendation TEXT,
  computed_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_predictions_user ON risk_predictions(user_id);
