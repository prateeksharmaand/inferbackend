-- ── Subscription Plans catalog ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id              SERIAL PRIMARY KEY,
  key             VARCHAR(50)  NOT NULL UNIQUE, -- 'base', 'pro'
  display_name    VARCHAR(100) NOT NULL,
  tagline         TEXT,
  price_monthly   INTEGER      NOT NULL DEFAULT 0,  -- INR paise (0 = free)
  price_yearly    INTEGER      NOT NULL DEFAULT 0,
  price_2year     INTEGER      NOT NULL DEFAULT 0,
  price_3year     INTEGER      NOT NULL DEFAULT 0,
  max_users       INTEGER      NOT NULL DEFAULT 1,   -- -1 = unlimited
  max_patients    INTEGER      NOT NULL DEFAULT 100,
  max_appointments INTEGER     NOT NULL DEFAULT 150,
  max_prescriptions INTEGER    NOT NULL DEFAULT 150,
  max_storage_mb  INTEGER      NOT NULL DEFAULT 250, -- -1 = unlimited
  features        JSONB        NOT NULL DEFAULT '{}',
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Seed plans ────────────────────────────────────────────────────────────────
INSERT INTO subscription_plans
  (key, display_name, tagline,
   price_monthly, price_yearly, price_2year, price_3year,
   max_users, max_patients, max_appointments, max_prescriptions, max_storage_mb,
   features)
VALUES
  ('base', 'Base Plan',
   'Smart workflow management starts here.',
   0, 0, 0, 0,
   1, 100, 150, 150, 250,
   '{"queue":true,"billing":true,"appointments":true,"prescriptions":true,"ai_docassist":false,"scribe":false,"vitals_graph":false,"lab_upload":false}'
  ),
  ('pro', 'Infer Pro',
   'Streamline your workflow — unlimited everything.',
   40000, 400000, 720000, 1008000,
   -1, -1, -1, -1, -1,
   '{"queue":true,"billing":true,"appointments":true,"prescriptions":true,"ai_docassist":true,"scribe":true,"vitals_graph":true,"lab_upload":true,"qr_prescription":true,"analytics":true}'
  )
ON CONFLICT (key) DO NOTHING;

-- ── Clinic subscriptions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_subscriptions (
  id              SERIAL PRIMARY KEY,
  clinic_id       INTEGER      NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  plan_id         INTEGER      NOT NULL REFERENCES subscription_plans(id),
  seat_count      INTEGER      NOT NULL DEFAULT 1,
  billing_cycle   VARCHAR(20)  NOT NULL DEFAULT 'free', -- 'free','monthly','yearly','2year','3year'
  status          VARCHAR(20)  NOT NULL DEFAULT 'active', -- 'active','expired','cancelled','trial'
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  razorpay_order_id   VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_sub_id     VARCHAR(100),
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id)   -- one active subscription per clinic
);

-- Assign base plan to all existing clinics
INSERT INTO clinic_subscriptions (clinic_id, plan_id, billing_cycle, status)
SELECT c.id,
       (SELECT id FROM subscription_plans WHERE key = 'base'),
       'free',
       'active'
FROM   emr_clinics c
WHERE  NOT EXISTS (
  SELECT 1 FROM clinic_subscriptions cs WHERE cs.clinic_id = c.id
);

-- Razorpay payment orders log
CREATE TABLE IF NOT EXISTS subscription_orders (
  id                  SERIAL PRIMARY KEY,
  clinic_id           INTEGER      NOT NULL REFERENCES emr_clinics(id),
  plan_id             INTEGER      NOT NULL REFERENCES subscription_plans(id),
  seat_count          INTEGER      NOT NULL DEFAULT 1,
  billing_cycle       VARCHAR(20)  NOT NULL,
  amount_paise        INTEGER      NOT NULL,
  currency            VARCHAR(10)  NOT NULL DEFAULT 'INR',
  razorpay_order_id   VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending', -- 'pending','paid','failed'
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  paid_at             TIMESTAMPTZ
);
