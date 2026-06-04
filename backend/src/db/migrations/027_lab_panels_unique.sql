-- Add unique constraint on lab_test_panels(lab_id, panel_code)
-- Required for ON CONFLICT DO NOTHING in catalog seed
ALTER TABLE lab_test_panels ADD CONSTRAINT uq_lab_test_panels_code UNIQUE (lab_id, panel_code);
