-- ── Seat types ────────────────────────────────────────────────────────────────
-- Prices stored as INR paise per seat per month
CREATE TABLE IF NOT EXISTS subscription_seat_types (
  id              SERIAL PRIMARY KEY,
  key             VARCHAR(50)  NOT NULL UNIQUE,
  display_name    VARCHAR(100) NOT NULL,
  description     TEXT,
  price_monthly   INTEGER NOT NULL DEFAULT 0,
  price_yearly    INTEGER NOT NULL DEFAULT 0,
  price_2year     INTEGER NOT NULL DEFAULT 0,
  price_3year     INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_seat_types
  (key, display_name, description, price_monthly, price_yearly, price_2year, price_3year)
VALUES
  ('premium', 'Premium Seats',
   'Ideal for doctors & team members involved in prescribing (Rx). All features including prescription writing.',
   90000, 60000, 54000, 48000),
  ('basic', 'Basic Seats',
   'Ideal for front desk staff, nurses & non-prescribing users. Includes billing, appointments, queue management, patient records & nursing.',
   40000, 30000, 27000, 24000),
  ('scribe', 'EkaScribe',
   'AI assistant that records patient consultations automatically, converting voice into clinical notes & prescriptions.',
   150000, 106000, 100700, 95400)
ON CONFLICT (key) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_yearly  = EXCLUDED.price_yearly,
  price_2year   = EXCLUDED.price_2year,
  price_3year   = EXCLUDED.price_3year;

-- ── Add-ons ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_addons (
  id              SERIAL PRIMARY KEY,
  key             VARCHAR(50)  NOT NULL UNIQUE,
  display_name    VARCHAR(100) NOT NULL,
  description     TEXT,
  price_monthly   INTEGER NOT NULL DEFAULT 0,
  price_yearly    INTEGER NOT NULL DEFAULT 0,
  price_2year     INTEGER NOT NULL DEFAULT 0,
  price_3year     INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_addons
  (key, display_name, price_monthly, price_yearly, price_2year, price_3year)
VALUES
  ('custom_form_builder',    'Custom Form Builder',                  52560, 43800, 39400, 35000),
  ('chatbot_integration',    'Chatbot One Time Integration',        300000,250000,333400,233400),
  ('developer_platform',     'Developer Platform',                  240000,200000,333400,233400),
  ('flabs_basic',            'Flabs – Basic Plan',                   72000, 60000, 60000, 60000),
  ('flabs_inventory',        'Flabs – Inventory Plan',               96000, 80000, 80000, 80000),
  ('flabs_machine_bi',       'Flabs Machine Integration: Bidirectional',  108000, 90000, 81000, 72000),
  ('flabs_machine_uni',      'Flabs Machine Integration: Unidirectional',  80040, 66700, 60000, 53400),
  ('pharmacy_capsule',       'In-clinic Pharmacy Capsule',           61080, 50900, 50900, 50900),
  ('pharmacy_injection',     'In-Clinic Pharmacy Injection',        130080,108400,108400,108400),
  ('whatsapp_integration',   'WhatsApp Integration',                152640,127200,147500,147500)
ON CONFLICT (key) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_yearly  = EXCLUDED.price_yearly,
  price_2year   = EXCLUDED.price_2year,
  price_3year   = EXCLUDED.price_3year;

-- ── Clinic subscription line items ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_subscription_items (
  id               SERIAL PRIMARY KEY,
  clinic_id        INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  item_type        VARCHAR(20)  NOT NULL, -- 'seat' | 'addon'
  item_key         VARCHAR(50)  NOT NULL,
  display_name     VARCHAR(100) NOT NULL,
  quantity         INTEGER      NOT NULL DEFAULT 1,
  unit_price_paise INTEGER      NOT NULL,
  billing_cycle    VARCHAR(20)  NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
