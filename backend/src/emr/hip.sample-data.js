/**
 * Sample Data for ABDM FHIR Bundle Builders
 *
 * This file documents the expected data structures for testing and developing
 * the ABDM M1/M2/M3 health data exchange builders.
 *
 * Reference: backend/src/emr/hip.service.js
 */

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE PATIENT OBJECT (used in all builders)
// ─────────────────────────────────────────────────────────────────────────────

const samplePatient = {
  abhaNumber: '12-3456-7890-1234',        // ABHA number
  name: 'Rajesh Kumar',
  gender: 'M',                             // 'M', 'F', or 'other'
  dob: new Date('1985-06-15'),
  mobile: '+919876543210',
};

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE CARE CONTEXT (encounter data for different hi_types)
// ─────────────────────────────────────────────────────────────────────────────

// OPConsultation: General outpatient consultation with diagnosis & medications
const sampleOPConsultation = {
  display: 'OPD Visit - Fever & Cough',
  hi_type: 'OPConsultation',
  created_at: new Date('2026-06-20T10:30:00'),

  vitals: {
    bp_systolic: 130,
    bp_diastolic: 85,
    pulse: 88,
    spo2: 98,
    temp: 101.5,
    respiratory_rate: 22,
    height: 175,
    weight: 72,
    bmi: 23.5,
  },

  symptoms: [
    { code: '25064002', display: 'Headache' },
    { code: '49727002', display: 'Cough' },
    { code: '68235000', display: 'Nasal congestion' },
  ],

  diagnosis: [
    { code: '54150009', display: 'Fever', system: 'http://snomed.info/sct' },
    { code: '49727002', display: 'Cough', system: 'http://snomed.info/sct' },
  ],

  medications: [
    { name: 'Paracetamol 500mg', dose: '500mg', frequency: 'three times daily', duration: '5 days' },
    { name: 'Cetirizine 10mg', dose: '10mg', frequency: 'once at bedtime', duration: '5 days' },
  ],

  lab_investigations: [
    { test: 'Complete Blood Count' },
    { test: 'Chest X-ray' },
  ],

  instructions: 'Rest well, stay hydrated, avoid cold water',
  advices: 'Take medications with food. Avoid strenuous activity.',
  next_visit_date: new Date('2026-06-27'),
  next_visit_notes: 'Follow-up for fever check. Review lab results.',
  notes: 'Patient presenting with acute fever and persistent cough for 3 days.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Prescription: Medication-focused document
// ─────────────────────────────────────────────────────────────────────────────

const samplePrescription = {
  display: 'Prescription - Type 2 Diabetes',
  hi_type: 'Prescription',
  created_at: new Date('2026-06-20T11:00:00'),

  diagnosis: [
    { code: '44054006', display: 'Type 2 Diabetes Mellitus', system: 'http://snomed.info/sct' },
  ],

  medications: [
    { name: 'Metformin 500mg', dose: '500mg', frequency: 'twice daily', duration: '3 months' },
    { name: 'Atorvastatin 20mg', dose: '20mg', frequency: 'once daily at bedtime', duration: '3 months' },
    { name: 'Lisinopril 10mg', dose: '10mg', frequency: 'once daily', duration: '3 months' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// DiagnosticReport: Lab results and diagnostic findings
// ─────────────────────────────────────────────────────────────────────────────

const sampleDiagnosticReport = {
  display: 'Lab Report - Blood Tests',
  hi_type: 'DiagnosticReport',
  created_at: new Date('2026-06-18T14:30:00'),

  lab_results: [
    { test: 'Blood Glucose (Fasting)', result: '156', unit: 'mg/dL', range: '70-100' },
    { test: 'Total Cholesterol', result: '245', unit: 'mg/dL', range: '<200' },
    { test: 'HDL Cholesterol', result: '38', unit: 'mg/dL', range: '>40' },
    { test: 'LDL Cholesterol', result: '165', unit: 'mg/dL', range: '<100' },
    { test: 'Triglycerides', result: '280', unit: 'mg/dL', range: '<150' },
    { test: 'Creatinine', result: '1.2', unit: 'mg/dL', range: '0.7-1.3' },
    { test: 'Hemoglobin A1c', result: '7.8', unit: '%', range: '<5.7' },
  ],

  notes: 'Recent lab work shows elevated glucose and lipids. Recommend lifestyle modifications and medication review.',
};

// ─────────────────────────────────────────────────────────────────────────────
// HealthDocumentRecord: Generic health document with vitals + labs + assessment
// ─────────────────────────────────────────────────────────────────────────────

const sampleHealthDocumentRecord = {
  display: 'Lab Report with Assessment - Comprehensive Health Check',
  hi_type: 'HealthDocumentRecord',
  created_at: new Date('2026-06-19T09:00:00'),

  vitals: {
    bp_systolic: 135,
    bp_diastolic: 88,
    pulse: 82,
    spo2: 97,
    temp: 98.6,
    respiratory_rate: 18,
    height: 175,
    weight: 78,
    bmi: 25.4,
  },

  lab_results: [
    { test: 'Hemoglobin', result: '14.5', unit: 'g/dL', range: '13.5-17.5' },
    { test: 'White Blood Cell Count', result: '7.2', unit: 'K/uL', range: '4.5-11.0' },
    { test: 'Platelets', result: '250', unit: 'K/uL', range: '150-400' },
    { test: 'Blood Glucose', result: '118', unit: 'mg/dL', range: '70-100' },
    { test: 'Creatinine', result: '1.1', unit: 'mg/dL', range: '0.7-1.3' },
  ],

  examination_findings: 'Patient appears well-nourished and alert. Lungs clear bilaterally. Heart sounds normal. Abdomen soft and non-tender.',

  custom_sections: [
    {
      type: 'assessment',
      risk_level: 'moderate',
      risk_score: 58,
      summary: 'Patient shows moderate risk factors for cardiovascular disease. Blood pressure is elevated. Recommend lifestyle modifications and repeat testing in 3 months.',
      findings: [
        'Elevated systolic blood pressure (135 mmHg)',
        'Borderline high blood glucose (118 mg/dL)',
        'Overweight (BMI 25.4)',
      ],
      recommendations: [
        'Reduce sodium intake to <2300mg/day',
        'Increase aerobic exercise to 150 min/week',
        'Regular monitoring of blood pressure at home',
        'Follow up with physician in 3 months',
      ],
      when_to_see_doctor: 'Schedule routine follow-up in 3 months; seek immediate care if BP exceeds 180/110 or chest pain develops.',
    },
  ],

  notes: 'Comprehensive health check performed. Patient counseled on lifestyle modifications.',
};

// ─────────────────────────────────────────────────────────────────────────────
// WellnessRecord: Preventive care with risk assessment and follow-up plan
// ─────────────────────────────────────────────────────────────────────────────

const sampleWellnessRecord = {
  display: 'Annual Wellness Visit',
  hi_type: 'WellnessRecord',
  created_at: new Date('2026-06-15T10:00:00'),

  vitals: {
    bp_systolic: 128,
    bp_diastolic: 82,
    pulse: 76,
    spo2: 98,
    temp: 98.2,
    respiratory_rate: 16,
    height: 175,
    weight: 75,
    bmi: 24.5,
  },

  symptoms: [
    { code: '193462001', display: 'Stress' },
    { code: '102491009', display: 'Sleep disturbance' },
  ],

  custom_sections: [
    {
      type: 'assessment',
      risk_level: 'low',
      risk_score: 25,
      summary: 'Overall, patient is in good health with well-controlled risk factors. Maintaining healthy lifestyle habits. Continue current routine with minor adjustments.',
      findings: [
        'Normal blood pressure (128/82 mmHg)',
        'Healthy body weight (BMI 24.5)',
        'Good stress management practices reported',
        'Regular exercise routine (5 days/week)',
      ],
      recommendations: [
        'Continue current exercise and dietary habits',
        'Increase daily fiber intake to 30g/day',
        'Limit alcohol to moderate levels',
        'Annual wellness visit and screening labs',
        'Maintain adequate sleep (7-8 hours/night)',
      ],
      warning_signs: [
        'New onset chest pain or shortness of breath',
        'Significant weight changes (>5 kg)',
        'Persistent headaches or vision changes',
      ],
      when_to_see_doctor: 'Routine annual wellness visit completed. Schedule next visit in 12 months.',
    },
  ],

  advices: 'Maintain current healthy lifestyle. Continue regular exercise. Consider stress reduction techniques like yoga or meditation.',
  next_visit_date: new Date('2027-06-15'),
  next_visit_notes: 'Annual wellness check. Review immunizations. Repeat lipid panel if indicated.',
};

// ─────────────────────────────────────────────────────────────────────────────
// ImmunizationRecord: Vaccine administration
// ─────────────────────────────────────────────────────────────────────────────

const sampleImmunizationRecord = {
  display: 'COVID-19 Vaccination',
  hi_type: 'ImmunizationRecord',
  created_at: new Date('2026-06-10T14:00:00'),
};

// ─────────────────────────────────────────────────────────────────────────────
// DischargeSummary: Hospital discharge with encounter summary
// ─────────────────────────────────────────────────────────────────────────────

const sampleDischargeSummary = {
  display: 'Hospital Discharge Summary',
  hi_type: 'DischargeSummary',
  created_at: new Date('2026-06-08T11:30:00'),

  diagnosis: [
    { code: '233604007', display: 'Pneumonia', system: 'http://snomed.info/sct' },
  ],

  medications: [
    { name: 'Amoxicillin-Clavulanate 625mg', dose: '625mg', frequency: 'three times daily', duration: '7 days' },
    { name: 'Paracetamol 500mg', dose: '500mg', frequency: 'as needed for fever', duration: '5 days' },
  ],

  notes: 'Patient admitted with fever and productive cough. Chest X-ray confirmed pneumonia. Treated with antibiotics and supportive care. Discharged on day 5 in stable condition.',
  advices: 'Complete full course of antibiotics. Rest and fluid intake. Avoid strenuous activity for 1 week. Follow-up with primary care in 1 week.',
  next_visit_date: new Date('2026-06-15'),
  next_visit_notes: 'Re-evaluation for cough resolution and chest imaging follow-up.',
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTING GUIDE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * To test the builders:
 *
 * 1. Create test care contexts in database:
 *    INSERT INTO emr_care_contexts (patient_id, reference_number, display, hi_type, created_at)
 *    VALUES (1, 'opd-001', 'OPD Visit - Fever & Cough', 'OPConsultation', NOW()),
 *           (1, 'lab-001', 'Lab Report with Assessment', 'HealthDocumentRecord', NOW()),
 *           (1, 'wellness-001', 'Annual Wellness Visit', 'WellnessRecord', NOW());
 *
 * 2. Create test encounters with sample data:
 *    INSERT INTO emr_encounters
 *      (appointment_id, clinic_id, doctor_id, chief_complaint, symptoms, diagnosis, medications,
 *       vitals, lab_results, examination_findings, advices, notes, custom_sections)
 *    VALUES
 *      (1, 1, 1, 'Fever', '["25064002"]', '[{"code":"54150009","display":"Fever"}]',
 *       '[{"name":"Paracetamol 500mg","dose":"500mg",...}]',
 *       '{"bp_systolic":130,"bp_diastolic":85,...}',
 *       '[{"test":"Blood Glucose","result":"156",...}]',
 *       'Patient appears well...',
 *       'Take medications with food...',
 *       'Presenting with acute fever...',
 *       '[{"type":"assessment","risk_level":"moderate","risk_score":58,...}]');
 *
 * 3. Call buildFhirBundle(patient, careContext) and validate bundle JSON
 *
 * 4. Use FHIR validator:
 *    java -jar validator_cli.jar <bundle.json> -ig https://nrces.in/ndhm/fhir/r4
 *
 * 5. Push via M3 consent flow to verify encryption and PHR display
 */

module.exports = {
  samplePatient,
  sampleOPConsultation,
  samplePrescription,
  sampleDiagnosticReport,
  sampleHealthDocumentRecord,
  sampleWellnessRecord,
  sampleImmunizationRecord,
  sampleDischargeSummary,
};
