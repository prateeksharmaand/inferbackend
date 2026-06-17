-- Add unique constraint on lab_test_panels(lab_id, panel_code)
-- Required for ON CONFLICT DO NOTHING in catalog seed
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='lab_test_panels' AND constraint_name='uq_lab_test_panels_code'
  ) THEN
    ALTER TABLE lab_test_panels ADD CONSTRAINT uq_lab_test_panels_code UNIQUE (lab_id, panel_code);
  END IF;
END $$;
