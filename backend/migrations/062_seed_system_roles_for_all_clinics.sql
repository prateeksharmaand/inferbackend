-- Seed default system roles for any clinic that doesn't have them yet
INSERT INTO staff_roles (clinic_id, name, slug, is_system, color, permissions)
SELECT c.id, r.name, r.slug, true, r.color, r.permissions::jsonb
FROM emr_clinics c
CROSS JOIN (VALUES
  ('Clinic Admin',   'admin',          '#7c3aed', '{"all":true}'),
  ('Owner',          'owner',          '#7c3aed', '{"all":true}'),
  ('Doctor',         'doctor',         '#0284c7', '{"patients.view":true,"patients.edit":true,"consultations.create":true,"consultations.edit":true,"consultations.view":true,"prescriptions.print":true,"assessments.view":true,"assessments.create":true,"inferpad.view":true,"inferpad.create":true}'),
  ('Receptionist',   'receptionist',   '#16a34a', '{"patients.view":true,"patients.add":true,"patients.edit":true,"appointments.create":true,"appointments.edit":true,"appointments.cancel":true,"appointments.view":true}'),
  ('Nurse',          'nurse',          '#0891b2', '{"patients.view":true,"patients.edit":true,"appointments.view":true,"assessments.view":true,"assessments.create":true}'),
  ('Accountant',     'accountant',     '#d97706', '{"patients.view":true,"appointments.view":true,"billing.create":true,"billing.edit":true,"billing.refund":true,"billing.reports":true}'),
  ('Pharmacist',     'pharmacist',     '#16a34a', '{"patients.view":true,"prescriptions.view":true,"pharmacy.view":true,"pharmacy.dispense":true}'),
  ('Lab Technician', 'lab_technician', '#dc2626', '{"patients.view":true,"lab.view":true,"lab.edit":true}'),
  ('Staff Member',   'staff',          '#64748b', '{"patients.view":true,"appointments.view":true}')
) AS r(name, slug, color, permissions)
ON CONFLICT (clinic_id, slug) DO NOTHING;
