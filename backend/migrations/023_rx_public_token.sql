-- Add secure random token for public QR prescription links
-- Allows public access by token without exposing sequential IDs

ALTER TABLE emr_appointments
  ADD COLUMN IF NOT EXISTS rx_public_token VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_emr_appointments_rx_token
  ON emr_appointments (rx_public_token)
  WHERE rx_public_token IS NOT NULL;
