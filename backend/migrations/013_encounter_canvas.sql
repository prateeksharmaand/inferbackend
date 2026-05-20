-- Store prescription canvas drawing as base64 PNG data URL
ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS canvas_image TEXT;
