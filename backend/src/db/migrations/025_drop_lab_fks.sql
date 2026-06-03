-- Drop all remaining FK constraints referencing users(id) in lab tables
-- Lab staff IDs from JWT tokens are not in the users table

ALTER TABLE lab_sample_custody DROP CONSTRAINT IF EXISTS lab_sample_custody_performed_by_fkey;
ALTER TABLE lab_reports DROP CONSTRAINT IF EXISTS lab_reports_performed_by_fkey;
ALTER TABLE lab_reports DROP CONSTRAINT IF EXISTS lab_reports_approved_by_fkey;
ALTER TABLE lab_reports DROP CONSTRAINT IF EXISTS lab_reports_doctor_id_fkey;
ALTER TABLE lab_audit_logs DROP CONSTRAINT IF EXISTS lab_audit_logs_actor_user_id_fkey;
