-- UHID (Unique Health ID) settings per clinic
ALTER TABLE emr_clinics
  ADD COLUMN IF NOT EXISTS uhid_prefix      VARCHAR(20)  DEFAULT '',
  ADD COLUMN IF NOT EXISTS uhid_next_number INTEGER      NOT NULL DEFAULT 1;

-- UHID assigned to each appointment/patient visit
ALTER TABLE emr_appointments
  ADD COLUMN IF NOT EXISTS uhid VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_emr_appointments_uhid ON emr_appointments(uhid) WHERE uhid IS NOT NULL;
