-- ── Subscription pricing + feature JSONB fix ─────────────────────────────────
--
-- 1. Correct plan prices to business model (₹300 base / ₹600 pro per seat/month)
--    024_subscriptions.sql seeded base=₹0 / pro=₹400; those are wrong.
--    Yearly = −10%, 2-year = −15%, 3-year = −20%
--
-- 2. Add missing ai_meal_plan and ai_assessment keys to plan features JSONB.
--    The Pro plan seed in 024 omits both keys, so FeatureGuard always returns
--    false for them even for paying Pro customers.
--
-- 3. Add UNIQUE constraint to clinic_subscription_items to prevent duplicate
--    line items from ad-hoc inserts (admin controller already deletes+reinserts).

-- Pricing: Base plan
UPDATE subscription_plans SET
  price_monthly = 30000,
  price_yearly  = 27000,
  price_2year   = 25500,
  price_3year   = 24000
WHERE key = 'base';

-- Pricing: Pro plan
UPDATE subscription_plans SET
  price_monthly = 60000,
  price_yearly  = 54000,
  price_2year   = 51000,
  price_3year   = 48000
WHERE key = 'pro';

-- Feature flags: add missing keys to Pro plan
UPDATE subscription_plans
  SET features = features || '{"ai_meal_plan":true,"ai_assessment":true}'::jsonb
  WHERE key = 'pro';

-- Feature flags: explicitly mark as false for Base plan
UPDATE subscription_plans
  SET features = features || '{"ai_meal_plan":false,"ai_assessment":false}'::jsonb
  WHERE key = 'base';

-- UNIQUE constraint on subscription line items
ALTER TABLE clinic_subscription_items
  DROP CONSTRAINT IF EXISTS uq_clinic_subscription_item,
  ADD  CONSTRAINT uq_clinic_subscription_item
  UNIQUE (clinic_id, item_type, item_key);
