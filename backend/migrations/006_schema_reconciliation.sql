-- Reconcile schema drift: older deployments used user_id/type column names
-- before the profiles refactor. Safe to run on both old and fresh schemas.

DO $$
BEGIN
  -- vitals: user_id → profile_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vitals' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE vitals RENAME COLUMN user_id TO profile_id;
    RAISE NOTICE 'vitals.user_id renamed to profile_id';
  END IF;

  -- vitals: type → vital_type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vitals' AND column_name = 'type'
  ) THEN
    ALTER TABLE vitals RENAME COLUMN type TO vital_type;
    RAISE NOTICE 'vitals.type renamed to vital_type';
  END IF;

  -- documents: user_id → profile_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE documents RENAME COLUMN user_id TO profile_id;
    RAISE NOTICE 'documents.user_id renamed to profile_id';
  END IF;

  -- timeline_events: user_id → profile_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timeline_events' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE timeline_events RENAME COLUMN user_id TO profile_id;
    RAISE NOTICE 'timeline_events.user_id renamed to profile_id';
  END IF;

  -- notifications: user_id → account_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE notifications RENAME COLUMN user_id TO account_id;
    RAISE NOTICE 'notifications.user_id renamed to account_id';
  END IF;

  -- notifications: scheduled_at → scheduled_for
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'scheduled_at'
  ) THEN
    ALTER TABLE notifications RENAME COLUMN scheduled_at TO scheduled_for;
    RAISE NOTICE 'notifications.scheduled_at renamed to scheduled_for';
  END IF;
END;
$$;

-- Re-create missing indexes (IF NOT EXISTS is safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_vitals_profile_id    ON vitals(profile_id);
CREATE INDEX IF NOT EXISTS idx_vitals_type          ON vitals(vital_type);
CREATE INDEX IF NOT EXISTS idx_documents_profile_id ON documents(profile_id);
CREATE INDEX IF NOT EXISTS idx_timeline_profile_id  ON timeline_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_account    ON notifications(account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled  ON notifications(scheduled_for);
