CREATE TABLE IF NOT EXISTS sales_leads (
  id             SERIAL PRIMARY KEY,
  lead_hash      VARCHAR(64) UNIQUE NOT NULL,
  email          VARCHAR(200) NOT NULL,
  clinic         VARCHAR(200),
  email_opened   BOOLEAN NOT NULL DEFAULT false,
  email_opened_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_hash ON sales_leads(lead_hash);
CREATE INDEX IF NOT EXISTS idx_sales_leads_email ON sales_leads(email);
