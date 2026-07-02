-- Fix wrong slugs created by the API's name-based slug generator
UPDATE staff_roles SET slug = 'admin', is_system = true  WHERE name = 'Clinic Admin';
UPDATE staff_roles SET slug = 'staff', is_system = true  WHERE name = 'Staff Member';

-- Mark all other known system roles as is_system = true
UPDATE staff_roles SET is_system = true
WHERE slug IN ('owner','doctor','receptionist','nurse','accountant','pharmacist','lab_technician');
