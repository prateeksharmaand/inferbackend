-- Drop FK constraint on lab_workflow_events.performed_by
-- Lab staff IDs from JWT tokens are not in the users table
ALTER TABLE lab_workflow_events DROP CONSTRAINT IF EXISTS lab_workflow_events_performed_by_fkey;

-- Also drop on lab_samples (collected_by same issue)
ALTER TABLE lab_samples DROP CONSTRAINT IF EXISTS lab_samples_collected_by_fkey;
