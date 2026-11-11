/**
 * Default master data every clinic needs to use Infer: staff roles, billing services, queues,
 * custom attributes and UHID numbering (same defaults as deploy-vps/seed-clinic-defaults.sql).
 *
 * ensureClinicDefaults(db, clinicId) is idempotent:
 *   - staff roles: the 9 system roles are always ensured (ON CONFLICT DO NOTHING);
 *   - services, queues, custom attributes, UHID: filled only when the clinic has none, so a
 *     clinic's own setup is never added to or changed.
 * Called when a clinic is created (super admin or self-signup) and once per clinic at startup.
 */
const ROLES = [
  [
    "Clinic Admin",
    "admin",
    "#7c3aed",
    "{\"all\":true}"
  ],
  [
    "Owner",
    "owner",
    "#7c3aed",
    "{\"all\":true}"
  ],
  [
    "Doctor",
    "doctor",
    "#0284c7",
    "{\"patients.view\":true,\"patients.edit\":true,\"consultations.create\":true,\"consultations.edit\":true,\"consultations.view\":true,\"prescriptions.print\":true,\"assessments.view\":true,\"assessments.create\":true,\"inferpad.view\":true,\"inferpad.create\":true}"
  ],
  [
    "Receptionist",
    "receptionist",
    "#16a34a",
    "{\"patients.view\":true,\"patients.add\":true,\"patients.edit\":true,\"appointments.create\":true,\"appointments.edit\":true,\"appointments.cancel\":true,\"appointments.view\":true}"
  ],
  [
    "Nurse",
    "nurse",
    "#0891b2",
    "{\"patients.view\":true,\"patients.edit\":true,\"appointments.view\":true,\"assessments.view\":true,\"assessments.create\":true}"
  ],
  [
    "Accountant",
    "accountant",
    "#d97706",
    "{\"patients.view\":true,\"appointments.view\":true,\"billing.create\":true,\"billing.edit\":true,\"billing.refund\":true,\"billing.reports\":true}"
  ],
  [
    "Pharmacist",
    "pharmacist",
    "#16a34a",
    "{\"patients.view\":true,\"prescriptions.view\":true,\"pharmacy.view\":true,\"pharmacy.dispense\":true}"
  ],
  [
    "Lab Technician",
    "lab_technician",
    "#dc2626",
    "{\"patients.view\":true,\"lab.view\":true,\"lab.edit\":true}"
  ],
  [
    "Staff Member",
    "staff",
    "#64748b",
    "{\"patients.view\":true,\"appointments.view\":true}"
  ]
];

const SERVICES = [["OPD Consultation – MBBS General", 350.0], ["OPD Consultation – MD/Specialist", 700.0], ["OPD Consultation – DM/MCh Super-Specialist", 1650.0], ["Follow-up Consultation", 250.0], ["Telemedicine / Video Consultation", 500.0], ["Home Visit / Domiciliary", 1000.0], ["Emergency Walk-in (after hours)", 650.0], ["Complete Blood Count (CBC)", 300.0], ["Blood Sugar – Fasting", 105.0], ["Blood Sugar – Post-Prandial (PP)", 105.0], ["HbA1c (3-month diabetes avg)", 475.0], ["Lipid Profile", 400.0], ["Liver Function Test (LFT)", 425.0], ["Kidney Function Test (KFT)", 475.0], ["Thyroid Profile (T3, T4, TSH)", 560.0], ["Urine Routine & Microscopy", 140.0], ["Vitamin D Test", 950.0], ["Stool Examination", 120.0], ["Culture & Sensitivity", 650.0], ["Serum Electrolytes (Na, K, Cl)", 450.0], ["CRP / ESR", 250.0], ["Dengue NS1 / Widal", 500.0], ["ECG – Resting", 325.0], ["Holter Monitoring (24-hr ECG)", 4000.0], ["2D Echocardiography", 2500.0], ["X-Ray (single view)", 275.0], ["Ultrasound / Sonography (abdomen)", 850.0], ["Spirometry / PFT", 650.0], ["Audiometry / Hearing Test", 700.0], ["IM / IV Injection (per dose)", 125.0], ["IV Infusion / Drip (per session)", 475.0], ["Nebulization (per session)", 225.0], ["Wound Dressing – Simple", 200.0], ["Wound Dressing – Complex", 475.0], ["Suturing / Stitches", 650.0], ["Suture Removal", 175.0], ["Incision & Drainage (abscess)", 1000.0], ["Ear Wax Removal / Syringing", 350.0], ["Plaster / Splinting", 700.0], ["Cauterization", 850.0], ["Cryotherapy (per lesion)", 650.0], ["Venesection / Blood Letting", 500.0], ["Pap Smear", 575.0], ["Colposcopy", 2250.0], ["Proctoscopy", 850.0], ["Vision / Refraction Test", 350.0], ["Allergy / Skin Patch Test", 1000.0], ["Nerve Conduction Study (NCS)", 2500.0], ["Prescription Medicines (avg bill)", 525.0], ["Consumables (dressings, syringes)", 175.0], ["Influenza Vaccine", 750.0], ["Typhoid Vaccine", 425.0], ["Hepatitis B (per dose)", 350.0], ["MMR / Varicella (per dose)", 700.0], ["COVID Booster", 525.0], ["Fitness / Medical Certificate", 300.0], ["Sick / Leave Certificate", 200.0], ["Pre-employment Medical Report", 650.0], ["Medico-Legal Certificate (MLC)", 1250.0], ["Insurance / TPA Form Fill-up", 550.0], ["Disability Certificate", 1000.0], ["Medical Record Copy", 250.0], ["New Patient Registration", 125.0], ["Case File / Paper Charges", 65.0], ["Report Collection / Courier", 125.0], ["No-show / Cancellation Fee", 250.0], ["Appointment Booking Fee", 100.0], ["Annual Health Check Package", 3000.0], ["Diet / Nutrition Counseling", 650.0], ["Physiotherapy (per session)", 550.0], ["Psychotherapy / Counseling", 1350.0], ["Lifestyle Counseling (DM/HTN)", 500.0]];

const QUICK_ACTIONS = ['visit_type', 'payment_status', 'assessment_status', 'write_rx', 'notes', 'print_rx',
  'check_in', 'follow_up', 'past_visits', 'add_vitals', 'mark_no_show', 'exit'];
const QUEUES = [['OPD', 'in_clinic'], ['Follow-up', 'in_clinic'], ['Lab Sample Collection', 'in_clinic'], ['Teleconsultation', 'tele']];

// attr_type: 1 = tags (multi-select), 2 = labels (single-select), 16 = medical record document type
const TAGS = [
  ['T2DM', 'Diabetes', '#ea580c', 1], ['HTN', 'Hypertension', '#7c3aed', 1], ['THYROID', 'Thyroid Disorder', '#0891b2', 1],
  ['ASTHMA_COPD', 'Asthma / COPD', '#0d9488', 1], ['CKD', 'Chronic Kidney Disease', '#4f46e5', 1],
  ['PREGNANT', 'Pregnant', '#db2777', 1], ['VIP', 'VIP', '#ca8a04', 1],
  ['NEW', 'New Patient', '#16a34a', 2], ['FOLLOWUP', 'Follow-up', '#0284c7', 2],
  ['REVIEW', 'Report Review', '#64748b', 2], ['EMERGENCY', 'Emergency', '#dc2626', 2],
  ['LAB_REPORT', 'Lab Report', '#0891b2', 16], ['PRESCRIPTION', 'Prescription', '#7c3aed', 16],
  ['DISCHARGE', 'Discharge Summary', '#ea580c', 16], ['IMAGING', 'Imaging / X-ray / USG', '#4f46e5', 16],
  ['ECG', 'ECG Report', '#db2777', 16], ['REFERRAL', 'Referral Letter', '#16a34a', 16],
  ['INSURANCE', 'Insurance Document', '#64748b', 16],
];

function uhidPrefix(name) {
  const words = String(name || 'CLINIC').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const p = (words.length > 1 ? words.map(w => w[0]).join('') : words[0] || 'CL').slice(0, 5);
  return p.length >= 2 ? p : `${p}CL`;
}

async function count(db, table, clinicId) {
  const { rows: [r] } = await db.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE clinic_id = $1`, [clinicId]);
  return r.n;
}

async function ensureClinicDefaults(db, clinicId) {
  const done = [];
  for (const [name, slug, color, permissions] of ROLES) {
    const r = await db.query(
      `INSERT INTO staff_roles (clinic_id, name, slug, is_system, color, permissions)
       VALUES ($1,$2,$3,true,$4,$5::jsonb) ON CONFLICT (clinic_id, slug) DO NOTHING`,
      [clinicId, name, slug, color, permissions]);
    if (r.rowCount) done.push(`role:${slug}`);
  }
  if (!(await count(db, 'emr_services', clinicId))) {
    for (const [name, price] of SERVICES) {
      await db.query(`INSERT INTO emr_services (clinic_id, name, price) VALUES ($1,$2,$3)`, [clinicId, name, price]);
    }
    done.push(`services:${SERVICES.length}`);
  }
  if (!(await count(db, 'emr_queues', clinicId))) {
    for (const [name, mode] of QUEUES) {
      await db.query(
        `INSERT INTO emr_queues (clinic_id, name, mode, filters, quick_actions, sort_order)
         VALUES ($1,$2,$3,'{}'::jsonb,$4::jsonb,'token')`, [clinicId, name, mode, JSON.stringify(QUICK_ACTIONS)]);
    }
    done.push(`queues:${QUEUES.length}`);
  }
  if (!(await count(db, 'emr_tags', clinicId))) {
    for (const [code, label, color, type] of TAGS) {
      await db.query(
        `INSERT INTO emr_tags (clinic_id, code, display_name, color, attr_type) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (clinic_id, code, attr_type) DO NOTHING`, [clinicId, code, label, color, type]);
    }
    done.push(`custom_attributes:${TAGS.length}`);
  }
  const r = await db.query(
    `UPDATE emr_clinics SET uhid_prefix = $2, uhid_next_number = COALESCE(uhid_next_number, 1001)
      WHERE id = $1 AND COALESCE(uhid_prefix, '') = '' RETURNING uhid_prefix`,
    [clinicId, uhidPrefix((await db.query(`SELECT name FROM emr_clinics WHERE id = $1`, [clinicId])).rows[0]?.name)]);
  if (r.rowCount) done.push(`uhid:${r.rows[0].uhid_prefix}`);
  return done;
}

/** Startup backfill for every clinic (never blocks startup). */
async function ensureAllClinicDefaults(pool, logger) {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM emr_clinics ORDER BY id`);
    for (const c of rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const done = await ensureClinicDefaults(client, c.id);
        await client.query('COMMIT');
        if (done.length) logger.info(`Clinic defaults: ${c.name} (#${c.id}) added ${done.join(', ')}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        logger.error(`Clinic defaults failed for clinic ${c.id}`, { error: e.message });
      } finally { client.release(); }
    }
  } catch (e) {
    logger.error('Clinic defaults: backfill failed', { error: e.message });
  }
}

module.exports = { ensureClinicDefaults, ensureAllClinicDefaults, ROLES, SERVICES };
