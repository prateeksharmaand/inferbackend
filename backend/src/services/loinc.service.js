const LOINC_CODES = {
  // Vitals
  blood_pressure: '55284-4', blood_pressure_systolic: '8480-6', blood_pressure_diastolic: '8462-4',
  heart_rate: '8867-4', pulse_rate: '8867-4',
  weight: '29463-7', body_weight: '29463-7',
  height: '8302-2', body_height: '8302-2',
  bmi: '39156-5',
  temperature: '8310-5', body_temperature: '8310-5',
  spo2: '59408-5', oxygen_saturation: '59408-5',

  // Blood glucose
  glucose: '15074-8', glucose_random: '2345-7',
  glucose_fasting: '1558-6', fasting_glucose: '1558-6',
  glucose_post_prandial: '1521-4', post_prandial_glucose: '1521-4',
  hba1c: '4548-4', glycated_hemoglobin: '4548-4',

  // CBC
  hemoglobin: '718-7', haemoglobin: '718-7',
  hematocrit: '20570-8', haematocrit: '20570-8', pcv: '20570-8',
  rbc: '789-8', red_blood_cell_count: '789-8',
  wbc: '6690-2', total_leucocyte_count: '6690-2', tlc: '6690-2',
  platelets: '777-3', platelet_count: '777-3', plt: '777-3',
  mcv: '787-2', mch: '785-6', mchc: '786-4', rdw: '788-0',
  neutrophils: '770-3', lymphocytes: '731-0',
  monocytes: '742-7', eosinophils: '711-2', basophils: '704-7',

  // Renal
  creatinine: '2160-0', serum_creatinine: '2160-0',
  bun: '3094-0', blood_urea_nitrogen: '3094-0', urea: '3094-0',
  uric_acid: '3084-1',
  egfr: '33914-3',
  sodium: '2951-2', potassium: '2823-3',
  chloride: '2075-0', bicarbonate: '1963-8',
  calcium: '17861-6',

  // Lipids
  total_cholesterol: '2093-3', cholesterol: '2093-3',
  hdl: '2085-9', hdl_cholesterol: '2085-9',
  ldl: '13457-7', ldl_cholesterol: '13457-7',
  triglycerides: '2571-8', vldl: '13458-5',

  // Liver (LFT)
  sgot: '1920-8', ast: '1920-8',
  sgpt: '1742-6', alt: '1742-6',
  alp: '6768-6', alkaline_phosphatase: '6768-6',
  total_bilirubin: '1975-2', bilirubin: '1975-2',
  direct_bilirubin: '1968-7', indirect_bilirubin: '1971-1',
  albumin: '1751-7', total_protein: '2885-2', ggt: '2324-2',

  // Thyroid
  tsh: '3016-3',
  t3: '3051-0', total_t3: '3051-0',
  t4: '3026-2', total_t4: '3026-2',
  free_t3: '14920-4', free_t4: '3024-7',

  // Vitamins & Iron
  vitamin_d: '1989-3',
  vitamin_b12: '2132-9',
  folate: '2284-9',
  ferritin: '2276-5',
  iron: '2498-4',
  tibc: '2500-7',
};

const THRESHOLDS = {
  blood_pressure: (v) => {
    const s = v.systolic, d = v.diastolic;
    if (s >= 180 || d >= 120) return 'critical';
    if (s >= 140 || d >= 90) return 'high';
    if (s >= 130 || d >= 80) return 'elevated';
    if (s < 90 || d < 60) return 'low';
    return 'normal';
  },
  glucose: (v) => {
    const val = v.value;
    if (!val) return 'unknown';
    if (val >= 300) return 'critical';
    if (val >= 200) return 'high';
    if (val >= 126) return 'elevated';
    if (val < 70) return 'low';
    return 'normal';
  },
  spo2: (v) => {
    const val = v.value;
    if (val < 90) return 'critical';
    if (val < 94) return 'low';
    return 'normal';
  },
  heart_rate: (v) => {
    const bpm = v.bpm;
    if (bpm < 40 || bpm > 150) return 'critical';
    if (bpm < 60) return 'low';
    if (bpm > 100) return 'elevated';
    return 'normal';
  },
  temperature: (v) => {
    const temp = v.value;
    if (temp >= 39.5) return 'critical';
    if (temp >= 38.0) return 'high';
    if (temp < 36.0) return 'low';
    return 'normal';
  },
  weight: () => 'normal',
};

function determineVitalStatus(type, values) {
  const fn = THRESHOLDS[type];
  if (!fn) return 'unknown';
  return fn(values);
}

function getLoincCode(type) {
  return LOINC_CODES[type] || null;
}

function getVitalInterpretation(type, values, status) {
  const messages = {
    blood_pressure: {
      critical: `BP of ${values.systolic}/${values.diastolic} mmHg is a hypertensive crisis. Seek emergency care immediately.`,
      high: `BP of ${values.systolic}/${values.diastolic} mmHg indicates Stage 2 Hypertension. Consult your doctor.`,
      elevated: `BP of ${values.systolic}/${values.diastolic} mmHg is elevated. Monitor closely and reduce salt intake.`,
      low: `BP of ${values.systolic}/${values.diastolic} mmHg is low. Stay hydrated and consult your doctor if symptomatic.`,
      normal: `BP of ${values.systolic}/${values.diastolic} mmHg is normal. Keep up the healthy lifestyle!`,
    },
    glucose: {
      critical: `Glucose of ${values.value} mg/dL is dangerously high. Seek immediate medical attention.`,
      high: `Glucose of ${values.value} mg/dL indicates diabetes range. Consult your doctor.`,
      elevated: `Glucose of ${values.value} mg/dL indicates pre-diabetes range. Diet and exercise can help.`,
      low: `Glucose of ${values.value} mg/dL indicates hypoglycemia. Consume fast-acting carbohydrates.`,
      normal: `Glucose of ${values.value} mg/dL is within normal range.`,
    },
    spo2: {
      critical: `SpO2 of ${values.value}% is critically low. Seek emergency care immediately.`,
      low: `SpO2 of ${values.value}% is below normal. Consult your doctor.`,
      normal: `SpO2 of ${values.value}% is normal.`,
    },
  };
  return messages[type]?.[status] || `${type} reading recorded as ${status}.`;
}

module.exports = { determineVitalStatus, getLoincCode, getVitalInterpretation };
