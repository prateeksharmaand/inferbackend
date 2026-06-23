-- Add call tracking to WhatsApp inbox
ALTER TABLE sales_wa_inbox
ADD COLUMN IF NOT EXISTS call_attempted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS call_attempted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_wa_call_attempted ON sales_wa_inbox(call_attempted);
