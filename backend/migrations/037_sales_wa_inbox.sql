-- Sales agent inbound WhatsApp messages (replies from doctor/clinic leads)
-- Separate from whatsapp_messages which handles appointment flows via Exotel.
-- Meta Cloud API sends webhook events here when a lead replies to an outbound template.

CREATE TABLE IF NOT EXISTS sales_wa_inbox (
  id              SERIAL PRIMARY KEY,

  -- Sender
  from_number     VARCHAR(32)  NOT NULL,        -- E.164 without +, e.g. 919876543210
  sender_name     VARCHAR(255),

  -- Message
  wamid           VARCHAR(255) UNIQUE,          -- Meta message ID
  message_type    VARCHAR(32)  NOT NULL DEFAULT 'text',
  body            TEXT,

  -- Matched lead (resolved from phone → Google Sheet)
  lead_email      VARCHAR(255),                 -- matched sales lead email, if found
  lead_clinic     VARCHAR(255),

  -- Processing
  replied_status_synced  BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE once Google Sheet updated
  synced_at       TIMESTAMPTZ,

  -- Raw Meta payload
  raw_payload     JSONB,

  wa_timestamp    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_wa_from    ON sales_wa_inbox(from_number);
CREATE INDEX IF NOT EXISTS idx_sales_wa_wamid   ON sales_wa_inbox(wamid);
CREATE INDEX IF NOT EXISTS idx_sales_wa_synced  ON sales_wa_inbox(replied_status_synced) WHERE replied_status_synced = FALSE;
