-- Drop the FK constraint that ties emr_appointments.doctor_id to emr_doctors.id
-- doctor_id now stores emr_clinic_staff.id (staff with role='doctor')
ALTER TABLE emr_appointments
  DROP CONSTRAINT IF EXISTS emr_appointments_doctor_id_fkey;
