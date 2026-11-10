-- Default master data for ONE clinic. Every insert skips rows that already exist, so re-running is safe.
-- Usage (on the VPS, from /opt/inferapp):
--   docker compose exec -T db psql -U phr_user -d phr_db -v ON_ERROR_STOP=1 \
--     -v clinic_id=2 -v uhid_prefix=DHAND -v uhid_start=1001 < seed-clinic-defaults.sql
-- Services and staff roles are the repo's defaults (migrations 021 and 062); queues and
-- custom attributes are a starter set for a diabetes clinic, editable in Settings.
\set ON_ERROR_STOP on
BEGIN;

SELECT id, name FROM emr_clinics WHERE id = :clinic_id;

-- Services (billing items) — from migration 021
INSERT INTO emr_services (clinic_id, name, price)
SELECT c.id, s.name, s.price
FROM emr_clinics c
CROSS JOIN (VALUES
  ('OPD Consultation – MBBS General', 350.00),
  ('OPD Consultation – MD/Specialist', 700.00),
  ('OPD Consultation – DM/MCh Super-Specialist', 1650.00),
  ('Follow-up Consultation', 250.00),
  ('Telemedicine / Video Consultation', 500.00),
  ('Home Visit / Domiciliary', 1000.00),
  ('Emergency Walk-in (after hours)', 650.00),
  ('Complete Blood Count (CBC)', 300.00),
  ('Blood Sugar – Fasting', 105.00),
  ('Blood Sugar – Post-Prandial (PP)', 105.00),
  ('HbA1c (3-month diabetes avg)', 475.00),
  ('Lipid Profile', 400.00),
  ('Liver Function Test (LFT)', 425.00),
  ('Kidney Function Test (KFT)', 475.00),
  ('Thyroid Profile (T3, T4, TSH)', 560.00),
  ('Urine Routine & Microscopy', 140.00),
  ('Vitamin D Test', 950.00),
  ('Stool Examination', 120.00),
  ('Culture & Sensitivity', 650.00),
  ('Serum Electrolytes (Na, K, Cl)', 450.00),
  ('CRP / ESR', 250.00),
  ('Dengue NS1 / Widal', 500.00),
  ('ECG – Resting', 325.00),
  ('Holter Monitoring (24-hr ECG)', 4000.00),
  ('2D Echocardiography', 2500.00),
  ('X-Ray (single view)', 275.00),
  ('Ultrasound / Sonography (abdomen)', 850.00),
  ('Spirometry / PFT', 650.00),
  ('Audiometry / Hearing Test', 700.00),
  ('IM / IV Injection (per dose)', 125.00),
  ('IV Infusion / Drip (per session)', 475.00),
  ('Nebulization (per session)', 225.00),
  ('Wound Dressing – Simple', 200.00),
  ('Wound Dressing – Complex', 475.00),
  ('Suturing / Stitches', 650.00),
  ('Suture Removal', 175.00),
  ('Incision & Drainage (abscess)', 1000.00),
  ('Ear Wax Removal / Syringing', 350.00),
  ('Plaster / Splinting', 700.00),
  ('Cauterization', 850.00),
  ('Cryotherapy (per lesion)', 650.00),
  ('Venesection / Blood Letting', 500.00),
  ('Pap Smear', 575.00),
  ('Colposcopy', 2250.00),
  ('Proctoscopy', 850.00),
  ('Vision / Refraction Test', 350.00),
  ('Allergy / Skin Patch Test', 1000.00),
  ('Nerve Conduction Study (NCS)', 2500.00),
  ('Prescription Medicines (avg bill)', 525.00),
  ('Consumables (dressings, syringes)', 175.00),
  ('Influenza Vaccine', 750.00),
  ('Typhoid Vaccine', 425.00),
  ('Hepatitis B (per dose)', 350.00),
  ('MMR / Varicella (per dose)', 700.00),
  ('COVID Booster', 525.00),
  ('Fitness / Medical Certificate', 300.00),
  ('Sick / Leave Certificate', 200.00),
  ('Pre-employment Medical Report', 650.00),
  ('Medico-Legal Certificate (MLC)', 1250.00),
  ('Insurance / TPA Form Fill-up', 550.00),
  ('Disability Certificate', 1000.00),
  ('Medical Record Copy', 250.00),
  ('New Patient Registration', 125.00),
  ('Case File / Paper Charges', 65.00),
  ('Report Collection / Courier', 125.00),
  ('No-show / Cancellation Fee', 250.00),
  ('Appointment Booking Fee', 100.00),
  ('Annual Health Check Package', 3000.00),
  ('Diet / Nutrition Counseling', 650.00),
  ('Physiotherapy (per session)', 550.00),
  ('Psychotherapy / Counseling', 1350.00),
  ('Lifestyle Counseling (DM/HTN)', 500.00)
) AS s(name, price)
WHERE c.id = :clinic_id
  AND NOT EXISTS (SELECT 1 FROM emr_services e WHERE e.clinic_id = c.id AND e.name = s.name);

-- Staff roles — from migration 062
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
WHERE c.id = :clinic_id
ON CONFLICT (clinic_id, slug) DO NOTHING;

-- Queues
INSERT INTO emr_queues (clinic_id, name, mode, filters, quick_actions, sort_order)
SELECT :clinic_id, q.name, q.mode, '{}'::jsonb, '["visit_type","payment_status","assessment_status","write_rx","notes","print_rx","check_in","follow_up","past_visits","add_vitals","mark_no_show","exit"]'::jsonb, 'token'
FROM (VALUES
  ('OPD',                            'in_clinic'),
  ('Follow-up',                      'in_clinic'),
  ('Diabetes Education & Counselling','in_clinic'),
  ('Lab Sample Collection',          'in_clinic'),
  ('Teleconsultation',               'tele')
) AS q(name, mode)
WHERE NOT EXISTS (SELECT 1 FROM emr_queues e WHERE e.clinic_id = :clinic_id AND e.name = q.name);

-- Custom attributes: 1 = Tags (multi-select), 2 = Labels (single-select), 16 = Medical record document type
INSERT INTO emr_tags (clinic_id, code, display_name, color, attr_type)
SELECT :clinic_id, t.code, t.display_name, t.color, t.attr_type
FROM (VALUES
  ('T1DM',         'Type 1 Diabetes',        '#dc2626', 1),
  ('T2DM',         'Type 2 Diabetes',        '#ea580c', 1),
  ('PREDIABETES',  'Prediabetes',            '#d97706', 1),
  ('GDM',          'Gestational Diabetes',   '#db2777', 1),
  ('HTN',          'Hypertension',           '#7c3aed', 1),
  ('THYROID',      'Thyroid Disorder',       '#0891b2', 1),
  ('CKD',          'Chronic Kidney Disease', '#4f46e5', 1),
  ('DYSLIPIDEMIA', 'Dyslipidemia',           '#0d9488', 1),
  ('INSULIN',      'On Insulin',             '#2563eb', 1),
  ('VIP',          'VIP',                    '#ca8a04', 1),
  ('NEW',          'New Patient',            '#16a34a', 2),
  ('FOLLOWUP',     'Follow-up',              '#0284c7', 2),
  ('REVIEW',       'Report Review',          '#64748b', 2),
  ('EMERGENCY',    'Emergency',              '#dc2626', 2),
  ('LAB_REPORT',   'Lab Report',             '#0891b2', 16),
  ('PRESCRIPTION', 'Prescription',           '#7c3aed', 16),
  ('DISCHARGE',    'Discharge Summary',      '#ea580c', 16),
  ('IMAGING',      'Imaging / X-ray / USG',  '#4f46e5', 16),
  ('ECG',          'ECG Report',             '#db2777', 16),
  ('REFERRAL',     'Referral Letter',        '#16a34a', 16),
  ('INSURANCE',    'Insurance Document',     '#64748b', 16)
) AS t(code, display_name, color, attr_type)
ON CONFLICT (clinic_id, code, attr_type) DO NOTHING;

-- UHID numbering: set only if the clinic has no prefix yet
UPDATE emr_clinics
SET uhid_prefix = :'uhid_prefix', uhid_next_number = :uhid_start
WHERE id = :clinic_id AND COALESCE(uhid_prefix, '') = '';

SELECT 'services' AS item, count(*) FROM emr_services WHERE clinic_id = :clinic_id
UNION ALL SELECT 'staff_roles', count(*) FROM staff_roles WHERE clinic_id = :clinic_id
UNION ALL SELECT 'queues', count(*) FROM emr_queues WHERE clinic_id = :clinic_id
UNION ALL SELECT 'custom_attributes', count(*) FROM emr_tags WHERE clinic_id = :clinic_id;
SELECT uhid_prefix, uhid_next_number FROM emr_clinics WHERE id = :clinic_id;

COMMIT;
