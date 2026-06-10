CREATE TABLE IF NOT EXISTS emr_password_resets (
  email      TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'staff',
  token      TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (email, role)
);
