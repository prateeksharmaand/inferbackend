const LOINC_CODES = {
  blood_pressure: '55284-4', blood_pressure_systolic: '8480-6', blood_pressure_diastolic: '8462-4',
  heart_rate: '8867-4', body_weight: '29463-7', body_height: '8302-2', bmi: '39156-5',
  body_temperature: '8310-5', oxygen_saturation: '59408-5', glucose: '15074-8',
  glucose_fasting: '1558-6', weight: '29463-7', spo2: '59408-5', temperature: '8310-5',
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
