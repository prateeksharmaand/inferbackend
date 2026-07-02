-- Add google_review_link to emr_clinic_staff
-- emr_doctors was the old table; all doctors now live in emr_clinic_staff.
-- Migration 020 only added the column to emr_doctors; this backfills emr_clinic_staff.
ALTER TABLE emr_clinic_staff
  ADD COLUMN IF NOT EXISTS google_review_link TEXT DEFAULT NULL;
