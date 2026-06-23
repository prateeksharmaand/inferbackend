-- Separate phone and notes in sales leads
-- Add a dedicated phone column and restructure storage

ALTER TABLE sales_leads
ADD COLUMN IF NOT EXISTS phone VARCHAR(32),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'new',
ADD COLUMN IF NOT EXISTS step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_send_date DATE,
ADD COLUMN IF NOT EXISTS last_sent_date DATE,
ADD COLUMN IF NOT EXISTS whatsapp_log TEXT,
ADD COLUMN IF NOT EXISTS email_opened BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_opened_at TIMESTAMPTZ;

-- Index for phone lookups
CREATE INDEX IF NOT EXISTS idx_sales_leads_phone ON sales_leads(phone);
CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_created ON sales_leads(created_at DESC);

-- Table to track WhatsApp replies paired with leads
CREATE TABLE IF NOT EXISTS sales_crm_activity (
  id              SERIAL PRIMARY KEY,
  lead_id         INTEGER REFERENCES sales_leads(id) ON DELETE CASCADE,
  activity_type   VARCHAR(50) NOT NULL,  -- email_sent, whatsapp_sent, whatsapp_reply, email_opened, reply_received
  activity_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_body    TEXT,
  wa_inbox_id     INTEGER REFERENCES sales_wa_inbox(id) ON DELETE SET NULL,
  details         JSONB
);

CREATE INDEX IF NOT EXISTS idx_sales_crm_activity_lead ON sales_crm_activity(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_crm_activity_type ON sales_crm_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_sales_crm_activity_date ON sales_crm_activity(activity_date DESC);

-- Comprehensive CRM view combining all lead data
CREATE VIEW sales_crm_dashboard AS
SELECT
  sl.id,
  sl.lead_hash,
  sl.email,
  sl.clinic,
  sl.phone,
  sl.notes,
  sl.status,
  sl.step,
  sl.next_send_date,
  sl.last_sent_date,
  sl.email_opened,
  sl.email_opened_at,
  sl.created_at,
  COUNT(DISTINCT sca.id) as activity_count,
  MAX(sca.activity_date) as last_activity_date,
  SUM(CASE WHEN sca.activity_type = 'whatsapp_reply' THEN 1 ELSE 0 END) as whatsapp_reply_count,
  SUM(CASE WHEN sca.activity_type = 'email_opened' THEN 1 ELSE 0 END) as email_opened_count
FROM sales_leads sl
LEFT JOIN sales_crm_activity sca ON sl.id = sca.lead_id
GROUP BY sl.id, sl.lead_hash, sl.email, sl.clinic, sl.phone, sl.notes, sl.status, sl.step,
         sl.next_send_date, sl.last_sent_date, sl.email_opened, sl.email_opened_at, sl.created_at;
