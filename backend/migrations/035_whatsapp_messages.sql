-- WhatsApp Business Cloud API message log
-- Captures every inbound message, outbound reply, and delivery status update.

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id               SERIAL PRIMARY KEY,

  -- Direction & identity
  direction        VARCHAR(8)   NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  wamid            VARCHAR(255),                    -- Meta message ID (wa_message_id)
  phone_number_id  VARCHAR(64),                     -- WhatsApp Business number that sent/received
  from_number      VARCHAR(32),                     -- sender  (E.164, e.g. +919876543210)
  to_number        VARCHAR(32),                     -- recipient

  -- Content
  message_type     VARCHAR(32)  NOT NULL DEFAULT 'text',   -- text | interactive | button | template | image | document | …
  body             TEXT,                            -- text body / button title
  media_id         VARCHAR(255),                    -- for image/document/audio messages
  media_mime_type  VARCHAR(128),
  template_name    VARCHAR(128),                    -- for outbound template messages

  -- Sender profile
  sender_name      VARCHAR(255),

  -- Delivery / read tracking
  delivery_status  VARCHAR(16)  DEFAULT 'sent'      -- sent | delivered | read | failed
    CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed', 'unknown')),
  delivered_at     TIMESTAMPTZ,
  read_at          TIMESTAMPTZ,
  failed_reason    TEXT,

  -- Context / threading
  reply_to_wamid   VARCHAR(255),                    -- wamid of the message this replies to
  clinic_id        VARCHAR(64),                     -- resolved clinic (if available)
  appointment_id   INTEGER REFERENCES appointments(id) ON DELETE SET NULL,

  -- Raw payload for full auditability
  raw_payload      JSONB,

  -- Timestamps
  wa_timestamp     TIMESTAMPTZ,                     -- timestamp from Meta webhook
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_wa_messages_from     ON whatsapp_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_wa_messages_to       ON whatsapp_messages(to_number);
CREATE INDEX IF NOT EXISTS idx_wa_messages_wamid    ON whatsapp_messages(wamid);
CREATE INDEX IF NOT EXISTS idx_wa_messages_clinic   ON whatsapp_messages(clinic_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_appt     ON whatsapp_messages(appointment_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_dir_ts   ON whatsapp_messages(direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_status   ON whatsapp_messages(delivery_status);
