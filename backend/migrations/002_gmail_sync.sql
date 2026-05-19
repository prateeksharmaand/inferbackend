-- Gmail OAuth tokens per user
CREATE TABLE IF NOT EXISTS user_gmail_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES accounts(id) ON DELETE CASCADE,
  gmail_email   VARCHAR(255) NOT NULL,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date   BIGINT,
  last_synced_at TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Track where a document came from (e.g. gmail:<msgId>:<filename>)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_ref VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_documents_source_ref
  ON documents(profile_id, source_ref)
  WHERE source_ref IS NOT NULL;
