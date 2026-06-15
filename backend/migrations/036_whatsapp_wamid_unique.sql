-- Add unique constraint on wamid so ON CONFLICT (wamid) works correctly
-- Safe to run even if the column is already unique (IF NOT EXISTS guard via DO block)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_messages_wamid_key'
      AND conrelid = 'whatsapp_messages'::regclass
  ) THEN
    ALTER TABLE whatsapp_messages ADD CONSTRAINT whatsapp_messages_wamid_key UNIQUE (wamid);
  END IF;
END $$;
