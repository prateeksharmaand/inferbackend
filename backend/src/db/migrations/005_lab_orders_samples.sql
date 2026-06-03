-- Migration 005: Lab Orders, Samples, Reports, Catalog, Analytics

-- Test catalog
CREATE TABLE IF NOT EXISTS lab_test_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID REFERENCES laboratories(id),
  test_code VARCHAR(50) NOT NULL,
  test_name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  sub_category VARCHAR(100),
  specimen_type VARCHAR(100),
  collection_method VARCHAR(100),
  sample_volume_ml DECIMAL(10,3),
  turnaround_hours INTEGER DEFAULT 24,
  price DECIMAL(10,2),
  unit VARCHAR(50),
  reference_range_low DECIMAL(15,6),
  reference_range_high DECIMAL(15,6),
  reference_range_text VARCHAR(200),
  critical_low DECIMAL(15,6),
  critical_high DECIMAL(15,6),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lab_id, test_code)
);

-- Test panels (bundles)
CREATE TABLE IF NOT EXISTS lab_test_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID REFERENCES laboratories(id),
  panel_code VARCHAR(50) NOT NULL,
  panel_name VARCHAR(200) NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_panel_tests (
  panel_id UUID REFERENCES lab_test_panels(id) ON DELETE CASCADE,
  test_id UUID REFERENCES lab_test_catalog(id) ON DELETE CASCADE,
  PRIMARY KEY (panel_id, test_id)
);

-- Orders
CREATE TABLE IF NOT EXISTS lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  patient_id UUID NOT NULL REFERENCES users(id),
  lab_id UUID NOT NULL REFERENCES laboratories(id),
  ordering_doctor_id UUID REFERENCES users(id),
  clinic_id UUID,
  priority VARCHAR(20) DEFAULT 'ROUTINE' CHECK (priority IN ('STAT', 'URGENT', 'ROUTINE')),
  status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING','SCHEDULED','COLLECTED','PROCESSING','RESULTED','REPORTED','CANCELLED')),
  clinical_notes TEXT,
  diagnosis_codes TEXT[],
  scheduled_collection_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  received_at_lab TIMESTAMPTZ,
  reported_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  total_cost DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order line items
CREATE TABLE IF NOT EXISTS lab_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_id UUID REFERENCES lab_test_catalog(id),
  panel_id UUID REFERENCES lab_test_panels(id),
  test_code VARCHAR(50) NOT NULL,
  test_name VARCHAR(200) NOT NULL,
  status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING','COLLECTED','PROCESSING','RESULTED','REPORTED')),
  result_id UUID REFERENCES lab_test_results(id),
  price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Samples
CREATE TABLE IF NOT EXISTS lab_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id VARCHAR(50) UNIQUE NOT NULL,
  barcode VARCHAR(100) UNIQUE,
  order_id UUID REFERENCES lab_orders(id),
  patient_id UUID NOT NULL REFERENCES users(id),
  lab_id UUID NOT NULL REFERENCES laboratories(id),
  specimen_type VARCHAR(100) NOT NULL,
  collection_method VARCHAR(100),
  collection_site VARCHAR(100),
  collected_by UUID REFERENCES users(id),
  collected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  volume_ml DECIMAL(10,3),
  container_type VARCHAR(100),
  status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING','COLLECTED','RECEIVED','PROCESSING','COMPLETED','REJECTED','DISCARDED')),
  rejection_reason TEXT,
  storage_location VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chain of custody
CREATE TABLE IF NOT EXISTS lab_sample_custody (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES lab_samples(id),
  action VARCHAR(50) NOT NULL,
  performed_by UUID REFERENCES users(id),
  performed_by_name VARCHAR(200),
  location VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lab reports
CREATE TABLE IF NOT EXISTS lab_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number VARCHAR(50) UNIQUE NOT NULL,
  order_id UUID REFERENCES lab_orders(id),
  patient_id UUID NOT NULL REFERENCES users(id),
  lab_id UUID NOT NULL REFERENCES laboratories(id),
  doctor_id UUID REFERENCES users(id),
  report_type VARCHAR(50) DEFAULT 'FINAL' CHECK (report_type IN ('PRELIMINARY','FINAL','AMENDED','CORRECTED')),
  status VARCHAR(30) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','RELEASED','CANCELLED')),
  clinical_notes TEXT,
  observations TEXT,
  recommendations TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  pdf_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow events
CREATE TABLE IF NOT EXISTS lab_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  performed_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics snapshots (daily)
CREATE TABLE IF NOT EXISTS lab_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES laboratories(id),
  date DATE NOT NULL,
  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  cancelled_orders INTEGER DEFAULT 0,
  critical_value_count INTEGER DEFAULT 0,
  avg_turnaround_hours DECIMAL(10,2),
  total_revenue DECIMAL(12,2),
  test_counts JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lab_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_lab ON lab_orders(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_doctor ON lab_orders(ordering_doctor_id);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_order ON lab_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_order ON lab_samples(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_patient ON lab_samples(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_status ON lab_samples(status);
CREATE INDEX IF NOT EXISTS idx_lab_reports_order ON lab_reports(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_reports_patient ON lab_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_workflow_entity ON lab_workflow_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_lab ON lab_test_catalog(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_analytics_lab_date ON lab_analytics_daily(lab_id, date);

-- Auto-update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_lab_orders_updated_at ON lab_orders;
CREATE TRIGGER update_lab_orders_updated_at BEFORE UPDATE ON lab_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lab_samples_updated_at ON lab_samples;
CREATE TRIGGER update_lab_samples_updated_at BEFORE UPDATE ON lab_samples FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lab_reports_updated_at ON lab_reports;
CREATE TRIGGER update_lab_reports_updated_at BEFORE UPDATE ON lab_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
