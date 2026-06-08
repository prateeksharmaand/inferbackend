CREATE TABLE IF NOT EXISTS clinic_subscription_items (
  id             SERIAL PRIMARY KEY,
  clinic_id      INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  item_type      VARCHAR(50) NOT NULL,
  item_key       VARCHAR(50) NOT NULL,
  display_name   VARCHAR(200),
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price_paise INTEGER NOT NULL DEFAULT 0,
  billing_cycle  VARCHAR(20) NOT NULL DEFAULT 'monthly',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_items_clinic ON clinic_subscription_items(clinic_id);
