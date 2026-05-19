-- ABDM M2: async discover + link session tracking

CREATE TABLE IF NOT EXISTS discover_sessions (
  id             SERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id     VARCHAR(64) UNIQUE NOT NULL,
  transaction_id VARCHAR(64),
  hip_id         VARCHAR(128) NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending',   -- pending | done | error
  care_contexts  JSONB,
  error_message  TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS link_sessions (
  id                 SERIAL PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id         VARCHAR(64) UNIQUE NOT NULL,
  confirm_request_id VARCHAR(64) UNIQUE,
  transaction_id     VARCHAR(64),
  link_ref_number    VARCHAR(256),
  hip_id             VARCHAR(128) NOT NULL,
  care_contexts      JSONB,
  status             VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | otp_ready | confirming | confirmed | error
  error_message      TEXT,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
