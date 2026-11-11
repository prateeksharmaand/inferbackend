/**
 * Clinical template catalogue: the InferPad sections, the core (existing) fields each section
 * stores in emr_encounters, and the default system template for every speciality.
 *
 * Section keys are the existing InferPad keys, so existing consultations, print, PDF, FHIR and
 * ABDM export keep working unchanged. Core fields (storage 'core') map to existing encounter
 * columns; everything else is a custom field (storage 'custom', saved in consultation_field_values).
 *
 * Reference ranges here are configurable DEFAULT flags (adult, no sex/age context) taken from the
 * existing InferPad vitals settings — they raise warnings, never block a save, and can be replaced
 * per clinic with age/sex-specific ranges (validation.ref_ranges).
 */

const FIELD_TYPES = [
  'text', 'textarea', 'number', 'decimal', 'dropdown', 'multiselect', 'radio',
  'checkbox', 'date', 'time', 'datetime', 'boolean', 'measurement',
];
const OPTION_TYPES = new Set(['dropdown', 'multiselect', 'radio']);
const NUMERIC_TYPES = new Set(['number', 'decimal', 'measurement']);

// ── Sections (InferPad order) ───────────────────────────────────────────────
// group: 'core' = the 13 configurable clinical sections (lab_results is part of section 6);
//        'specialty' = built-in speciality blocks (growth/dental/eye/ENT).
const SECTIONS = [
  { key: 'vitals',               label: 'Vitals',                       group: 'core' },
  { key: 'growth_chart',         label: 'Growth Chart [WHO/IAP]',       group: 'specialty' },
  { key: 'medical_history',      label: 'Patient History',              group: 'core', kind: 'list' },
  { key: 'symptoms',             label: 'Chief Complaints',             group: 'core', kind: 'list' },
  { key: 'diagnosis',            label: 'Diagnosis',                    group: 'core', kind: 'list' },
  { key: 'medications',          label: 'Medications / Prescriptions',  group: 'core', kind: 'rows' },
  { key: 'lab_investigations',   label: 'Lab Investigations',           group: 'core', kind: 'rows' },
  { key: 'lab_results',          label: 'Lab Results',                  group: 'core', kind: 'rows', parent: 'lab_investigations' },
  { key: 'examination_findings', label: 'Examination Findings',         group: 'core', kind: 'text' },
  { key: 'notes',                label: 'Clinical Notes',               group: 'core', kind: 'text' },
  { key: 'refer_to',             label: 'Referral',                     group: 'core', kind: 'text' },
  { key: 'follow_up',            label: 'Follow-up',                    group: 'core', kind: 'follow_up' },
  { key: 'advices',              label: 'Advice',                       group: 'core', kind: 'text' },
  { key: 'procedures',           label: 'Procedures',                   group: 'core', kind: 'list' },
  { key: 'injections',           label: 'Injections',                   group: 'core', kind: 'list' },
  { key: 'dental_chart',         label: 'Dental Chart',                 group: 'specialty' },
  { key: 'ophtho_visual_acuity',   label: 'Ophthalmology - Visual Acuity Test',          group: 'specialty' },
  { key: 'ophtho_subj_refraction', label: 'Ophthalmology - Subjective Refraction',       group: 'specialty' },
  { key: 'ophtho_auto_refraction', label: 'Ophthalmology - Auto Refraction',             group: 'specialty' },
  { key: 'ophtho_current_glass',   label: 'Ophthalmology - Current Glass Prescription',  group: 'specialty' },
  { key: 'ophtho_final_glass',     label: 'Ophthalmology - Final Glass Prescription',    group: 'specialty' },
  { key: 'ophtho_iop',             label: 'Ophthalmology - IOP',                         group: 'specialty' },
  { key: 'ophtho_lacrimal',        label: 'Ophthalmology - Lacrimal Syringing',          group: 'specialty' },
  { key: 'ophtho_color_vision',    label: 'Ophthalmology - Color Vision',                group: 'specialty' },
  { key: 'ophtho_pmt',             label: 'Ophthalmology - PMT',                         group: 'specialty' },
  { key: 'ophtho_k_reading',       label: 'Ophthalmology - K Reading / Biometry',        group: 'specialty' },
  { key: 'ophtho_eye_exam',        label: 'Ophthalmology - Eye Examination / Motility',  group: 'specialty' },
  { key: 'ophtho_pachymetry',      label: 'Ophthalmology - Pachymetry',                  group: 'specialty' },
  { key: 'ophtho_amsler',          label: 'Ophthalmology - Amsler Grid',                 group: 'specialty' },
  { key: 'ophtho_contact_lens',    label: 'Ophthalmology - Contact Lens',                group: 'specialty' },
  { key: 'ent_ear_exam',           label: 'ENT - Ear Examination (RE/LE)',               group: 'specialty' },
  { key: 'ent_nose_exam',          label: 'ENT - Nose Examination',                      group: 'specialty' },
  { key: 'ent_throat_exam',        label: 'ENT - Throat Examination',                    group: 'specialty' },
];
const SECTION_KEYS = new Set(SECTIONS.map(s => s.key));
const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

// ── Vitals catalogue (mirrors emr-web InferPad VITALS_ALL) ──────────────────
// [key, label, unit, decimal, refLow, refHigh]
const VITALS = [
  ['bp_systolic', 'Systolic BP', 'mmHg', true, 100, 140],
  ['bp_diastolic', 'Diastolic BP', 'mmHg', false, 70, 90],
  ['pulse', 'Pulse Rate', '/min', true, 60, 100],
  ['spo2', 'SpO₂', '%', true, 95, 100],
  ['temp', 'Temperature', '°C', true, 36.6, 37.0],
  ['respiratory_rate', 'Respiratory Rate', '/min', false, 12, 16],
  ['height', 'Height', 'cm', true, null, null],
  ['weight', 'Weight', 'kg', true, null, null],
  ['temp_f', 'Temperature (°F)', '°F', true, 97, 99],
  ['height_feet', 'Height (Feet)', 'ft', true, null, null],
  ['weight_lbs', 'Weight (lbs)', 'lbs', true, null, null],
  ['birth_weight', 'Birth Weight', 'kg', true, null, null],
  ['ofc', 'Occipital Frontal Circumference', 'cm', true, null, null],
  ['head_circ', 'Head Circumference (HC)', 'cm', true, null, null],
  ['chest_circ', 'Chest Circumference (CC)', 'cm', true, null, null],
  ['muac', 'Mid Arm Circumference (MUAC)', 'cm', true, null, null],
  ['waist', 'Waist Circumference (WC)', 'cm', true, null, null],
  ['abdominal_girth', 'Abdominal Girth', 'cm', true, null, null],
  ['neck_circ', 'Neck Circumference', 'cm', true, null, null],
  ['muscle_mass', 'Muscle Mass', 'kg', true, 32.4, 40.4],
  ['bone_mass', 'Bone Mass', 'kg', true, 2.3, 2.9],
  ['fat_mass', 'Body Fat Mass', '%', true, 14.6, 25.2],
  ['metabolic_age', 'Metabolic Age', 'years', false, null, null],
  ['rbs', 'Random Blood Sugar (RBS)', 'mg/dL', true, 60, 140],
  ['fbs', 'Fasting Blood Sugar (FBS)', 'mg/dL', true, null, null],
  ['ppbs', 'Post-Prandial Blood Sugar (PPBS)', 'mg/dL', true, null, null],
  ['hba1c', 'HbA1c', '%', true, 3.9, 5.7],
  ['fasting_insulin', 'Fasting Insulin', 'μIU/mL', true, null, null],
  ['creatinine', 'Creatinine, Serum', 'mg/dL', true, null, null],
  ['microalbumin', 'Microalbuminuria', 'mg/dL', true, null, null],
  ['acr', 'Albumin Creatinine Ratio (ACR)', 'mg/g Cr', true, null, null],
  ['crp', 'CRP (C-Reactive Protein)', 'mg/L', true, null, null],
  ['hscrp', 'HsCRP (High Sensitivity CRP)', 'mg/L', true, null, null],
  ['hemoglobin', 'Hemoglobin (Hb)', 'g/dL', true, null, null],
  ['platelets', 'Platelets', 'lakhs', true, null, null],
  ['inr', 'INR', '', true, null, null],
  ['tsh', 'TSH (Thyroid Stimulating Hormone)', 'μIU/mL', true, null, null],
  ['c_peptide', 'C-Peptide, Fasting', 'ng/mL', true, null, null],
  ['vitamin_b12', 'Vitamin B12', 'pg/mL', true, null, null],
  ['vitamin_d', 'Vitamin D (25-OH)', 'ng/mL', true, null, null],
  ['pain_score', 'Pain Score (0-10)', '/10', false, 0, 10],
  ['nips_score', 'NIPS Pain Scale', '/7', false, 0, 7],
  ['wong_baker', 'Wong-Baker Pain Scale', '/10', false, 0, 10],
  ['flacc_score', 'FLACC Pain Severity', '/10', false, 0, 10],
  ['lmp', 'Last Menstrual Period (LMP)', '', false, null, null],
];
const VITAL_KEYS = new Set(VITALS.map(v => v[0]));

function vitalField(key, order) {
  const v = VITALS.find(x => x[0] === key);
  if (!v) throw new Error(`unknown vital ${key}`);
  const [, label, unit, decimal, low, high] = v;
  const isDate = key === 'lmp';
  return {
    key, label, type: isDate ? 'date' : (decimal ? 'decimal' : 'number'),
    unit: unit || null, storage: 'core', core_path: `vitals.${key}`, order,
    validation: low != null && high != null ? { ref_ranges: [{ low, high }] } : null,
  };
}

// ── Row columns of the list sections (existing keys + optional new ones) ────
// Option value = slug of the label; labels with no letters/digits (e.g. oedema grades "+", "++")
// keep the label itself so values stay unique.
const opt = (...labels) => labels.map(l => ({
  value: String(l).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || String(l),
  label: String(l),
}));
const ROUTES = opt('Oral', 'Sublingual', 'IV', 'IM', 'Subcutaneous', 'Topical', 'Inhalation',
  'Nasal', 'Ophthalmic', 'Otic', 'Per rectal', 'Per vaginal', 'Transdermal');

const ROW_COLUMNS = {
  medications: [
    { key: 'name',         label: 'Medicine',     type: 'text', required: true },
    { key: 'strength',     label: 'Strength',     type: 'text', enabled: false, placeholder: 'e.g. 500 mg' },
    { key: 'dose',         label: 'Dose',         type: 'text', placeholder: 'e.g. 1 tablet' },
    { key: 'route',        label: 'Route',        type: 'dropdown', enabled: false, options: ROUTES },
    { key: 'frequency',    label: 'Frequency',    type: 'text', placeholder: 'e.g. 1-0-1, TDS' },
    { key: 'timing',       label: 'Timing (before / after food)', type: 'text', placeholder: 'e.g. After meal' },
    { key: 'duration',     label: 'Duration',     type: 'text', placeholder: 'e.g. 5 days' },
    { key: 'quantity',     label: 'Quantity',     type: 'number', enabled: false, min: 0 },
    { key: 'start_from',   label: 'Start From',   type: 'text', placeholder: 'e.g. Today, Day 3' },
    { key: 'instructions', label: 'Instructions', type: 'text' },
  ],
  lab_investigations: [
    { key: 'test',      label: 'Investigation', type: 'text', required: true },
    { key: 'category',  label: 'Category',      type: 'dropdown', enabled: false,
      options: opt('Haematology', 'Biochemistry', 'Microbiology', 'Pathology', 'Serology', 'Hormones', 'Radiology', 'Cardiology', 'Other') },
    { key: 'test_code', label: 'Test code',     type: 'text', enabled: false },
    { key: 'repeat_on', label: 'Repeat on',     type: 'text' },
    { key: 'remarks',   label: 'Notes',         type: 'text' },
  ],
  lab_results: [
    { key: 'test',   label: 'Test',             type: 'text', required: true },
    { key: 'result', label: 'Result',           type: 'text' },
    { key: 'unit',   label: 'Unit',             type: 'text' },
    { key: 'range',  label: 'Reference range',  type: 'text', placeholder: 'e.g. 70-110' },
  ],
};
function rowColumns(sectionKey) {
  return (ROW_COLUMNS[sectionKey] || []).map((c, i) => ({
    ...c, storage: 'core', core_path: `${sectionKey}[].${c.key}`, order: i,
  }));
}
// Every core_path the system knows how to read from an encounter payload.
const CORE_PATHS = new Set([
  ...VITALS.map(v => `vitals.${v[0]}`),
  ...Object.entries(ROW_COLUMNS).flatMap(([s, cols]) => cols.map(c => `${s}[].${c.key}`)),
]);

// ── Custom-field shorthand for the speciality seeds ─────────────────────────
function f(key, label, type, extra = {}) { return { key, label, type, storage: 'custom', ...extra }; }
const yesNo = opt('No', 'Yes');
const severity = opt('None', 'Mild', 'Moderate', 'Severe');

const CORE_VITALS = ['bp_systolic', 'bp_diastolic', 'pulse', 'spo2', 'temp', 'respiratory_rate', 'height', 'weight'];
const CORE_SECTIONS = ['vitals', 'medical_history', 'symptoms', 'diagnosis', 'medications', 'lab_investigations',
  'lab_results', 'examination_findings', 'notes', 'refer_to', 'follow_up', 'advices', 'procedures', 'injections'];
const OPHTHO = SECTIONS.filter(s => s.key.startsWith('ophtho_')).map(s => s.key);
const ENT = SECTIONS.filter(s => s.key.startsWith('ent_')).map(s => s.key);
const BASIC_EYE_ENT = ['vitals', 'symptoms', 'medical_history', 'diagnosis', 'medications', 'examination_findings',
  'lab_investigations', 'notes', 'follow_up', 'advices', 'procedures'];

/**
 * Speciality defaults. `sections` = enabled sections (the rest are present but disabled, so a
 * clinic can switch them on); mirrors emr-web TemplateSelector SPECIALTY_MAP. `fields` = custom
 * fields added to a section.
 */
const SPECIALTIES = {
  general: {
    name: 'General Practice', scribe: 'general', sections: CORE_SECTIONS, vitals: CORE_VITALS, fields: {},
  },
  cardiology: {
    name: 'Cardiology', scribe: 'cardiology', sections: CORE_SECTIONS, vitals: [...CORE_VITALS, 'waist'],
    fields: {
      medical_history: [
        f('chest_pain_history', 'Chest pain history', 'textarea', { placeholder: 'Onset, character, radiation, exertional?' }),
        f('cardiac_risk_factors', 'Cardiac risk factors', 'multiselect', {
          options: opt('Smoking', 'Diabetes', 'Hypertension', 'Dyslipidaemia', 'Family history of CAD', 'Obesity', 'Sedentary lifestyle') }),
        f('nyha_class', 'NYHA functional class', 'dropdown', { options: opt('I', 'II', 'III', 'IV') }),
      ],
      examination_findings: [
        f('cvs_exam', 'Cardiovascular examination', 'textarea'),
        f('heart_sounds', 'Heart sounds', 'dropdown', { options: opt('S1 S2 normal', 'S3 present', 'S4 present', 'Muffled', 'Irregular') }),
        f('murmur', 'Murmur', 'radio', { options: opt('Absent', 'Present') }),
        f('murmur_details', 'Murmur details', 'text', { placeholder: 'Grade, site, timing', visibility: { field: 'murmur', op: 'eq', value: 'present' } }),
        f('peripheral_pulses', 'Peripheral pulses', 'dropdown', { options: opt('Normal', 'Diminished', 'Absent') }),
        f('pedal_oedema', 'Pedal oedema', 'dropdown', { options: opt('None', '+', '++', '+++') }),
      ],
      lab_results: [
        f('ecg_findings', 'ECG findings', 'textarea'),
        f('echo_ef', 'Ejection fraction (Echo)', 'measurement', { unit: '%', min: 5, max: 90 }),
      ],
    },
  },
  dermatology: {
    name: 'Dermatology', scribe: 'dermatology', vitals: CORE_VITALS,
    sections: ['vitals', 'medical_history', 'symptoms', 'diagnosis', 'medications', 'examination_findings', 'procedures', 'notes', 'follow_up', 'advices'],
    fields: {
      examination_findings: [
        f('skin_type', 'Skin type (Fitzpatrick)', 'dropdown', { options: opt('I', 'II', 'III', 'IV', 'V', 'VI') }),
        f('lesion_location', 'Lesion location', 'text', { placeholder: 'e.g. Face, both forearms' }),
        f('lesion_morphology', 'Lesion morphology', 'multiselect', {
          options: opt('Macule', 'Patch', 'Papule', 'Plaque', 'Nodule', 'Vesicle', 'Bulla', 'Pustule', 'Wheal', 'Scale', 'Crust', 'Ulcer', 'Erosion') }),
        f('distribution', 'Distribution', 'dropdown', { options: opt('Localised', 'Generalised', 'Symmetrical', 'Unilateral', 'Dermatomal', 'Flexural', 'Extensor', 'Photo-exposed') }),
        f('itching', 'Itching', 'radio', { options: severity }),
        f('derm_exam', 'Dermatological examination', 'textarea'),
      ],
    },
  },
  emergency: {
    name: 'Emergency', scribe: 'general', sections: CORE_SECTIONS, vitals: [...CORE_VITALS, 'rbs', 'pain_score'],
    fields: {
      vitals: [
        f('triage_category', 'Triage category', 'dropdown', { options: opt('Red (immediate)', 'Orange (very urgent)', 'Yellow (urgent)', 'Green (standard)', 'Blue (non-urgent)') }),
        f('gcs', 'Glasgow Coma Scale', 'number', { min: 3, max: 15 }),
      ],
      examination_findings: [
        f('airway', 'Airway', 'dropdown', { options: opt('Patent', 'Maintainable', 'Compromised') }),
        f('mode_of_arrival', 'Mode of arrival', 'dropdown', { options: opt('Walk-in', 'Ambulance', 'Referred', 'Police') }),
        f('mlc', 'Medico-legal case (MLC)', 'boolean'),
      ],
      follow_up: [
        f('disposition', 'Disposition', 'dropdown', { options: opt('Discharged', 'Admitted', 'Referred', 'LAMA', 'Absconded', 'Expired') }),
      ],
    },
  },
  endocrinology: {
    name: 'Endocrinology', scribe: 'endocrinology', sections: CORE_SECTIONS,
    vitals: [...CORE_VITALS, 'waist', 'rbs', 'fbs', 'ppbs', 'hba1c'],
    fields: {
      medical_history: [
        f('diabetes_type', 'Diabetes type', 'dropdown', { options: opt('Type 1', 'Type 2', 'Gestational', 'Prediabetes', 'Secondary', 'Not diabetic') }),
        f('diabetes_duration', 'Duration of diabetes', 'number', { unit: 'years', min: 0, max: 100 }),
        f('on_insulin', 'On insulin', 'boolean'),
        f('hypoglycaemia_episodes', 'Hypoglycaemia episodes (last 3 months)', 'number', { min: 0 }),
        f('thyroid_status', 'Thyroid status', 'dropdown', { options: opt('Euthyroid', 'Hypothyroid', 'Hyperthyroid', 'Not assessed') }),
      ],
      examination_findings: [
        f('foot_exam', 'Diabetic foot examination', 'textarea'),
        f('monofilament', 'Monofilament sensation', 'dropdown', { options: opt('Normal', 'Reduced', 'Absent') }),
      ],
    },
  },
  ent: {
    name: 'ENT', scribe: 'ent', sections: [...BASIC_EYE_ENT, ...ENT], vitals: CORE_VITALS,
    fields: {
      symptoms: [
        f('hearing_loss', 'Hearing loss', 'dropdown', { options: opt('None', 'Right', 'Left', 'Bilateral') }),
        f('tinnitus', 'Tinnitus', 'boolean'),
        f('vertigo', 'Vertigo', 'boolean'),
      ],
    },
  },
  gastroenterology: {
    name: 'Gastroenterology', scribe: 'gastroenterology', sections: CORE_SECTIONS, vitals: [...CORE_VITALS, 'abdominal_girth'],
    fields: {
      medical_history: [
        f('bowel_habits', 'Bowel habits', 'dropdown', { options: opt('Normal', 'Constipation', 'Diarrhoea', 'Alternating') }),
        f('gi_bleed', 'History of GI bleed', 'boolean'),
        f('alcohol_use', 'Alcohol use', 'dropdown', { options: opt('None', 'Occasional', 'Regular', 'Heavy') }),
      ],
      examination_findings: [
        f('abdominal_pain_site', 'Abdominal pain site', 'dropdown', {
          options: opt('None', 'Epigastric', 'Right upper quadrant', 'Left upper quadrant', 'Periumbilical', 'Right iliac fossa', 'Left iliac fossa', 'Suprapubic', 'Diffuse') }),
        f('jaundice', 'Jaundice', 'boolean'),
        f('abdominal_exam', 'Abdominal examination', 'textarea'),
        f('liver_span', 'Liver span', 'measurement', { unit: 'cm', min: 0, max: 30 }),
      ],
      lab_results: [f('endoscopy_findings', 'Endoscopy findings', 'textarea')],
    },
  },
  gynecology: {
    name: 'Gynaecology', scribe: 'gynecology', sections: CORE_SECTIONS, vitals: [...CORE_VITALS, 'lmp'],
    fields: {
      medical_history: [
        f('menstrual_cycle', 'Menstrual cycle', 'dropdown', { options: opt('Regular', 'Irregular', 'Amenorrhoea', 'Menopausal') }),
        f('cycle_length', 'Cycle length', 'number', { unit: 'days', min: 10, max: 120 }),
        f('menstrual_flow', 'Flow', 'dropdown', { options: opt('Scanty', 'Normal', 'Heavy') }),
        f('obstetric_history', 'Obstetric history (G P L A)', 'text', { placeholder: 'e.g. G2 P1 L1 A1' }),
        f('pregnant', 'Currently pregnant', 'radio', { options: opt('No', 'Yes', 'Unsure') }),
        f('edd', 'Expected date of delivery', 'date', { visibility: { field: 'pregnant', op: 'eq', value: 'yes' } }),
        f('last_pap_smear', 'Last Pap smear', 'date'),
      ],
      examination_findings: [f('gyn_exam', 'Gynaecological examination', 'textarea')],
    },
  },
  nephrology: {
    name: 'Nephrology', scribe: 'nephrology', sections: CORE_SECTIONS, vitals: [...CORE_VITALS, 'creatinine'],
    fields: {
      medical_history: [
        f('ckd_stage', 'CKD stage (KDIGO)', 'dropdown', { options: opt('G1', 'G2', 'G3a', 'G3b', 'G4', 'G5', 'G5D (on dialysis)') }),
        f('on_dialysis', 'On dialysis', 'boolean'),
        f('dialysis_type', 'Dialysis type', 'dropdown', {
          options: opt('Haemodialysis', 'Peritoneal dialysis'), visibility: { field: 'on_dialysis', op: 'eq', value: true } }),
      ],
      examination_findings: [
        f('oedema', 'Oedema', 'dropdown', { options: opt('None', 'Pedal', 'Facial', 'Generalised (anasarca)') }),
        f('urine_output', 'Urine output', 'measurement', { unit: 'mL/day', min: 0, max: 10000 }),
      ],
      lab_results: [f('egfr', 'eGFR', 'measurement', { unit: 'mL/min/1.73m²', min: 0, max: 200 })],
    },
  },
  neurology: {
    name: 'Neurology', scribe: 'neurology', sections: CORE_SECTIONS, vitals: CORE_VITALS,
    fields: {
      medical_history: [f('seizure_history', 'History of seizures', 'boolean')],
      examination_findings: [
        f('gcs', 'Glasgow Coma Scale', 'number', { min: 3, max: 15 }),
        f('higher_functions', 'Higher mental functions', 'textarea'),
        f('cranial_nerves', 'Cranial nerves', 'textarea'),
        f('motor_power', 'Motor power (MRC)', 'dropdown', { options: opt('5/5', '4/5', '3/5', '2/5', '1/5', '0/5') }),
        f('reflexes', 'Deep tendon reflexes', 'dropdown', { options: opt('Normal', 'Brisk', 'Diminished', 'Absent') }),
        f('plantar', 'Plantar response', 'dropdown', { options: opt('Flexor', 'Extensor', 'Equivocal') }),
        f('sensory_exam', 'Sensory examination', 'textarea'),
        f('gait', 'Gait', 'dropdown', { options: opt('Normal', 'Ataxic', 'Hemiplegic', 'Parkinsonian', 'Spastic', 'Unable to walk') }),
      ],
    },
  },
  oncology: {
    name: 'Oncology', scribe: 'general', sections: CORE_SECTIONS, vitals: [...CORE_VITALS, 'pain_score'],
    fields: {
      diagnosis: [
        f('primary_site', 'Primary site / cancer type', 'text'),
        f('stage', 'Stage', 'dropdown', { options: opt('0', 'I', 'II', 'III', 'IV', 'Not staged') }),
        f('tnm', 'TNM', 'text', { placeholder: 'e.g. T2 N1 M0' }),
      ],
      examination_findings: [
        f('ecog', 'ECOG performance status', 'dropdown', { options: opt('0', '1', '2', '3', '4') }),
      ],
      procedures: [
        f('treatment_phase', 'Treatment phase', 'dropdown', {
          options: opt('Diagnosis / work-up', 'Neoadjuvant', 'Surgery', 'Adjuvant', 'Palliative', 'Surveillance') }),
        f('chemo_cycle', 'Chemotherapy cycle number', 'number', { min: 0, max: 100 }),
      ],
    },
  },
  ophthalmology: {
    name: 'Ophthalmology', scribe: 'ophthalmology', sections: [...BASIC_EYE_ENT, ...OPHTHO], vitals: CORE_VITALS,
    fields: {
      symptoms: [f('affected_eye', 'Affected eye', 'radio', { options: opt('Right', 'Left', 'Both') })],
    },
  },
  orthopedics: {
    name: 'Orthopaedics', scribe: 'orthopedics', vitals: [...CORE_VITALS, 'pain_score'],
    sections: ['vitals', 'medical_history', 'symptoms', 'diagnosis', 'medications', 'lab_investigations', 'examination_findings', 'procedures', 'injections', 'notes', 'follow_up', 'advices'],
    fields: {
      examination_findings: [
        f('affected_joint', 'Affected joint / region', 'multiselect', {
          options: opt('Cervical spine', 'Shoulder', 'Elbow', 'Wrist / hand', 'Lumbar spine', 'Hip', 'Knee', 'Ankle / foot') }),
        f('side', 'Side', 'radio', { options: opt('Right', 'Left', 'Bilateral') }),
        f('joint_exam', 'Joint examination', 'textarea'),
        f('range_of_motion', 'Range of motion', 'textarea', { placeholder: 'e.g. Knee flexion 0–110°' }),
        f('swelling', 'Swelling', 'boolean'),
        f('mobility', 'Mobility', 'dropdown', { options: opt('Independent', 'With support', 'Wheelchair', 'Bedridden') }),
      ],
      lab_results: [f('imaging_findings', 'Imaging findings (X-ray / MRI)', 'textarea')],
    },
  },
  pediatrics: {
    name: 'Paediatrics', scribe: 'pediatrics', sections: [...CORE_SECTIONS, 'growth_chart'],
    vitals: [...CORE_VITALS, 'head_circ', 'muac', 'birth_weight'],
    fields: {
      medical_history: [
        f('birth_history', 'Birth history', 'textarea', { placeholder: 'Term/preterm, mode of delivery, NICU stay' }),
        f('developmental_milestones', 'Developmental milestones', 'dropdown', { options: opt('Age appropriate', 'Delayed', 'Regression') }),
        f('developmental_notes', 'Developmental history', 'textarea'),
        f('immunisation_status', 'Immunisation status', 'dropdown', { options: opt('Up to date', 'Partially immunised', 'Not immunised', 'Unknown') }),
        f('feeding', 'Feeding', 'dropdown', { options: opt('Exclusive breastfeeding', 'Mixed feeding', 'Formula', 'Complementary feeding', 'Family diet') }),
      ],
    },
  },
  psychiatry: {
    name: 'Psychiatry', scribe: 'psychiatry', vitals: CORE_VITALS,
    sections: ['medical_history', 'symptoms', 'diagnosis', 'medications', 'notes', 'follow_up', 'advices'],
    fields: {
      symptoms: [
        f('mood', 'Mood', 'dropdown', { options: opt('Euthymic', 'Depressed', 'Anxious', 'Elevated', 'Irritable') }),
        f('affect', 'Affect', 'dropdown', { options: opt('Appropriate', 'Restricted', 'Blunted', 'Flat', 'Labile') }),
        f('suicidal_ideation', 'Suicidal ideation', 'radio', { options: opt('None', 'Passive', 'Active without plan', 'Active with plan') }),
        f('phq9', 'PHQ-9 score', 'number', { min: 0, max: 27 }),
        f('gad7', 'GAD-7 score', 'number', { min: 0, max: 21 }),
        f('substance_use', 'Substance use', 'multiselect', { options: opt('None', 'Tobacco', 'Alcohol', 'Cannabis', 'Opioids', 'Other') }),
      ],
      notes: [
        f('mental_status_exam', 'Mental status examination', 'textarea'),
        f('risk_assessment', 'Risk assessment', 'textarea'),
      ],
    },
  },
  pulmonology: {
    name: 'Pulmonology', scribe: 'pulmonology', sections: CORE_SECTIONS, vitals: CORE_VITALS,
    fields: {
      medical_history: [
        f('smoking_status', 'Smoking status', 'dropdown', { options: opt('Never', 'Former', 'Current') }),
        f('pack_years', 'Pack-years', 'decimal', { min: 0, max: 200, visibility: { field: 'smoking_status', op: 'neq', value: 'never' } }),
      ],
      symptoms: [
        f('breathlessness_mmrc', 'Breathlessness (mMRC grade)', 'dropdown', { options: opt('0', '1', '2', '3', '4') }),
        f('cough', 'Cough', 'dropdown', { options: opt('None', 'Dry', 'Productive', 'Haemoptysis') }),
      ],
      examination_findings: [
        f('chest_exam', 'Respiratory examination', 'textarea'),
        f('breath_sounds', 'Breath sounds', 'dropdown', { options: opt('Vesicular', 'Bronchial', 'Diminished', 'Absent') }),
        f('added_sounds', 'Added sounds', 'multiselect', { options: opt('None', 'Wheeze', 'Crackles', 'Rhonchi', 'Pleural rub') }),
      ],
      lab_results: [
        f('pefr', 'Peak expiratory flow (PEFR)', 'measurement', { unit: 'L/min', min: 0, max: 900 }),
        f('fev1_fvc', 'FEV1/FVC', 'measurement', { unit: '%', min: 0, max: 100 }),
      ],
    },
  },
};

/** The full definition (every catalogue section, enabled per speciality) for one speciality. */
function buildSpecialtyDefinition(specialtyKey) {
  const spec = SPECIALTIES[specialtyKey];
  if (!spec) throw new Error(`unknown specialty ${specialtyKey}`);
  const enabled = new Set(spec.sections);
  const sections = SECTIONS.map((s, i) => {
    let fields = [];
    if (s.key === 'vitals') {
      // Every vital is present (so a clinic can switch any on); the speciality's set is on, in order.
      const on = new Set(spec.vitals);
      const rest = VITALS.map(v => v[0]).filter(k => !on.has(k));
      fields = [...spec.vitals, ...rest].map((k, j) => ({ ...vitalField(k, j), enabled: on.has(k) }));
    }
    else if (ROW_COLUMNS[s.key]) fields = rowColumns(s.key);
    const extra = (spec.fields[s.key] || []).map((x, j) => ({ ...x, order: fields.length + j }));
    return {
      key: s.key, label: s.label, builtin: true, enabled: enabled.has(s.key),
      required: false, locked: false, print_enabled: true, default_value: null, order: i,
      fields: [...fields, ...extra],
    };
  });
  return { sections };
}

module.exports = {
  FIELD_TYPES, OPTION_TYPES, NUMERIC_TYPES, SECTIONS, SECTION_KEYS, SECTION_BY_KEY,
  VITALS, VITAL_KEYS, ROW_COLUMNS, CORE_PATHS, SPECIALTIES, buildSpecialtyDefinition, opt,
};
