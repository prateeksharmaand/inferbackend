-- Wallet Credits System Migration
-- Created for SMS, WhatsApp, and Prescription credit management
-- Supports multiple payment gateways and pricing configurations

-- ================================================
-- WALLET TABLE (one per clinic/doctor)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES emr_clinic(id) ON DELETE CASCADE UNIQUE,
  doctor_id UUID NOT NULL REFERENCES emr_doctors(id) ON DELETE CASCADE UNIQUE,
  current_balance DECIMAL(12, 2) DEFAULT 0 NOT NULL CHECK (current_balance >= 0),
  lifetime_purchased DECIMAL(12, 2) DEFAULT 0 NOT NULL,
  lifetime_used DECIMAL(12, 2) DEFAULT 0 NOT NULL,
  subscription_active BOOLEAN DEFAULT TRUE,
  subscription_expires_at TIMESTAMP,
  is_locked BOOLEAN DEFAULT FALSE,
  locked_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1 -- optimistic locking
);

CREATE INDEX idx_wallet_clinic_id ON wallet(clinic_id);
CREATE INDEX idx_wallet_doctor_id ON wallet(doctor_id);
CREATE INDEX idx_wallet_subscription ON wallet(subscription_active);

-- ================================================
-- WALLET TRANSACTIONS (Ledger - immutable log)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL, -- purchase, deduction, refund, reversal, bonus, adjustment
  service_type VARCHAR(50), -- whatsapp, sms, prescription, ai_summary, ocr, voice_call
  amount DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  payment_order_id UUID REFERENCES payment_orders(id),
  reference_id VARCHAR(255), -- invoice ID, order ID, etc
  notes TEXT,
  metadata JSONB, -- service-specific data (phone_no, message_count, etc)
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(transaction_type);
CREATE INDEX idx_wallet_transactions_service ON wallet_transactions(service_type);
CREATE INDEX idx_wallet_transactions_date ON wallet_transactions(created_at);
CREATE INDEX idx_wallet_transactions_reference ON wallet_transactions(reference_id);

-- ================================================
-- WALLET PRICING (configurable service rates)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_type VARCHAR(50) NOT NULL UNIQUE, -- whatsapp, sms, prescription, etc
  service_name VARCHAR(100) NOT NULL,
  description TEXT,
  base_price DECIMAL(10, 4) NOT NULL, -- credits per unit (e.g., 0.66 for WhatsApp)
  unit_type VARCHAR(50) DEFAULT 'per_message', -- per_message, per_sms, per_prescription, etc
  tax_percentage DECIMAL(5, 2) DEFAULT 0,
  minimum_balance_required DECIMAL(10, 2) DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  effective_date DATE DEFAULT CURRENT_DATE,
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_pricing_service ON wallet_pricing(service_type);
CREATE INDEX idx_wallet_pricing_enabled ON wallet_pricing(enabled);

-- Insert default pricing (SMS, WhatsApp, Prescription)
INSERT INTO wallet_pricing (service_type, service_name, description, base_price, unit_type, tax_percentage, enabled)
VALUES
  ('whatsapp', 'WhatsApp Message', 'Send WhatsApp message to patient', 0.66, 'per_message', 0, TRUE),
  ('sms', 'SMS Message', 'Send SMS to patient', 0.14, 'per_sms', 0, TRUE),
  ('prescription', 'Create Prescription', 'Generate and create patient prescription', 1.00, 'per_prescription', 0, TRUE)
ON CONFLICT (service_type) DO NOTHING;

-- ================================================
-- WALLET PACKS (predefined credit bundles)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pack_name VARCHAR(100) NOT NULL,
  description TEXT,
  credit_quantity DECIMAL(12, 2) NOT NULL,
  price_inr DECIMAL(10, 2) NOT NULL,
  gst_amount DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  popularity_rank INT, -- for "Popular" badge
  is_best_value BOOLEAN DEFAULT FALSE,
  enabled BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_packs_enabled ON wallet_packs(enabled);
CREATE INDEX idx_wallet_packs_sort ON wallet_packs(sort_order);

-- Insert default packs
INSERT INTO wallet_packs (pack_name, credit_quantity, price_inr, gst_amount, total_amount, popularity_rank, is_best_value, enabled)
VALUES
  ('Starter Pack', 200, 200.00, 36.00, 236.00, 3, FALSE, TRUE),
  ('Professional Pack', 500, 500.00, 90.00, 590.00, 2, TRUE, TRUE),
  ('Enterprise Pack', 1000, 1000.00, 180.00, 1180.00, 1, FALSE, TRUE)
ON CONFLICT DO NOTHING;

-- ================================================
-- PAYMENT ORDERS (Payment gateway integration)
-- ================================================
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES wallet_packs(id),
  custom_amount DECIMAL(10, 2),
  credit_quantity DECIMAL(12, 2) NOT NULL,
  amount_inr DECIMAL(10, 2) NOT NULL,
  gst_amount DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_gateway VARCHAR(50) NOT NULL, -- razorpay, phonepe, cashfree, stripe
  gateway_order_id VARCHAR(255), -- Razorpay order ID
  gateway_payment_id VARCHAR(255), -- Razorpay payment ID
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, success, failed, refunded, expired
  failure_reason TEXT,
  currency VARCHAR(3) DEFAULT 'INR',
  metadata JSONB,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_orders_wallet_id ON payment_orders(wallet_id);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);
CREATE INDEX idx_payment_orders_gateway ON payment_orders(payment_gateway);
CREATE INDEX idx_payment_orders_gateway_id ON payment_orders(gateway_order_id);

-- ================================================
-- PAYMENT TRANSACTIONS (Gateway webhook logs)
-- ================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_order_id UUID NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  gateway_name VARCHAR(50) NOT NULL,
  gateway_transaction_id VARCHAR(255),
  event_type VARCHAR(100), -- payment.authorized, payment.failed, payment.captured, etc
  status VARCHAR(50),
  amount DECIMAL(10, 2),
  currency VARCHAR(3),
  webhook_signature_verified BOOLEAN DEFAULT FALSE,
  raw_webhook_data JSONB,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  received_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX idx_payment_transactions_order_id ON payment_transactions(payment_order_id);
CREATE INDEX idx_payment_transactions_gateway_id ON payment_transactions(gateway_transaction_id);
CREATE INDEX idx_payment_transactions_processed ON payment_transactions(processed);

-- ================================================
-- WALLET INVOICES
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
  payment_order_id UUID NOT NULL REFERENCES payment_orders(id),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  items JSONB NOT NULL, -- [ { description, quantity, unit_price, tax, amount } ]
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  document_url TEXT, -- S3 or storage URL
  download_count INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'generated', -- generated, sent, downloaded, expired
  sent_at TIMESTAMP,
  downloaded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_invoices_wallet_id ON wallet_invoices(wallet_id);
CREATE INDEX idx_wallet_invoices_number ON wallet_invoices(invoice_number);
CREATE INDEX idx_wallet_invoices_date ON wallet_invoices(invoice_date);

-- ================================================
-- WALLET SERVICE USAGE (analytics)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_service_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,
  usage_date DATE DEFAULT CURRENT_DATE,
  count INT DEFAULT 0, -- number of times used
  credits_used DECIMAL(12, 2) DEFAULT 0,
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(wallet_id, service_type, usage_date)
);

CREATE INDEX idx_wallet_service_usage_wallet ON wallet_service_usage(wallet_id);
CREATE INDEX idx_wallet_service_usage_service ON wallet_service_usage(service_type);
CREATE INDEX idx_wallet_service_usage_date ON wallet_service_usage(usage_date);

-- ================================================
-- WALLET REFUNDS (reversal tracking)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES wallet_transactions(id),
  payment_order_id UUID REFERENCES payment_orders(id),
  refund_amount DECIMAL(10, 2) NOT NULL,
  refund_reason VARCHAR(255) NOT NULL,
  refund_status VARCHAR(50) DEFAULT 'initiated', -- initiated, processing, completed, failed
  gateway_refund_id VARCHAR(255),
  requested_by VARCHAR(100), -- admin email or system
  requested_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  notes TEXT
);

CREATE INDEX idx_wallet_refunds_wallet_id ON wallet_refunds(wallet_id);
CREATE INDEX idx_wallet_refunds_status ON wallet_refunds(refund_status);

-- ================================================
-- WALLET SETTINGS (clinic-level preferences)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE UNIQUE,
  auto_recharge_enabled BOOLEAN DEFAULT FALSE,
  auto_recharge_threshold DECIMAL(12, 2),
  auto_recharge_pack_id UUID REFERENCES wallet_packs(id),
  low_balance_alert_threshold DECIMAL(12, 2) DEFAULT 100,
  email_receipts BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,
  usage_alerts BOOLEAN DEFAULT TRUE,
  gst_registration_number VARCHAR(50),
  gst_details JSONB, -- { company_name, address, pan, etc }
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_settings_wallet_id ON wallet_settings(wallet_id);

-- ================================================
-- WALLET NOTIFICATIONS (sent to doctors)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
  notification_type VARCHAR(100), -- recharge_success, recharge_failed, low_balance, exhausted, large_deduction, etc
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  channels TEXT[] DEFAULT ARRAY['push'], -- push, email, sms, in_app
  status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed
  read_at TIMESTAMP,
  sent_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_notifications_wallet ON wallet_notifications(wallet_id);
CREATE INDEX idx_wallet_notifications_type ON wallet_notifications(notification_type);
CREATE INDEX idx_wallet_notifications_status ON wallet_notifications(status);

-- ================================================
-- WALLET PROMO CODES & COUPONS (future feature)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(50), -- percentage, fixed_credits, fixed_amount
  discount_value DECIMAL(10, 2) NOT NULL,
  max_uses INT,
  current_uses INT DEFAULT 0,
  expiry_date DATE,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_valid_discount CHECK (discount_value > 0)
);

CREATE INDEX idx_promo_codes_code ON wallet_promo_codes(code);
CREATE INDEX idx_promo_codes_expiry ON wallet_promo_codes(expiry_date);

-- ================================================
-- WALLET TRANSACTION LOCKS (prevent race conditions)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_transaction_locks (
  wallet_id UUID PRIMARY KEY REFERENCES wallet(id) ON DELETE CASCADE,
  locked_at TIMESTAMP DEFAULT NOW(),
  locked_by VARCHAR(100),
  lock_duration_seconds INT DEFAULT 30
);

-- ================================================
-- Audit Logging (for compliance)
-- ================================================
CREATE TABLE IF NOT EXISTS wallet_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  action_by VARCHAR(100), -- user email or 'system'
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_audit_log_wallet ON wallet_audit_log(wallet_id);
CREATE INDEX idx_wallet_audit_log_action ON wallet_audit_log(action);
CREATE INDEX idx_wallet_audit_log_date ON wallet_audit_log(created_at);

-- ================================================
-- Ensure wallet records when clinic is created
-- ================================================
-- This trigger is optional; can also create wallet via application code
ALTER TABLE wallet ADD CONSTRAINT fk_wallet_clinic_doctor
FOREIGN KEY (clinic_id, doctor_id) REFERENCES emr_doctors(clinic_id, id);
