// LOINC code mapping and biometric marker extraction from OCR text

const LOINC_MAPPINGS = {
  // Blood Pressure
  systolic: { code: '8480-6', name: 'Systolic blood pressure', unit: 'mmHg' },
  diastolic: { code: '8462-4', name: 'Diastolic blood pressure', unit: 'mmHg' },
  blood_pressure: { code: '55284-4', name: 'Blood pressure systolic and diastolic', unit: 'mmHg' },
  // Heart Rate
  heart_rate: { code: '8867-4', name: 'Heart rate', unit: '/min' },
  pulse: { code: '8867-4', name: 'Heart rate', unit: '/min' },
  // Oxygen Saturation
  spo2: { code: '59408-5', name: 'Oxygen saturation', unit: '%' },
  oxygen_saturation: { code: '59408-5', name: 'Oxygen saturation', unit: '%' },
  // Temperature
  temperature: { code: '8310-5', name: 'Body temperature', unit: 'Cel' },
  body_temp: { code: '8310-5', name: 'Body temperature', unit: 'Cel' },
  // Weight
  weight: { code: '29463-7', name: 'Body weight', unit: 'kg' },
  body_weight: { code: '29463-7', name: 'Body weight', unit: 'kg' },
  // Blood Glucose
  glucose: { code: '2339-0', name: 'Glucose [Mass/volume] in Blood', unit: 'mg/dL' },
  blood_sugar: { code: '2339-0', name: 'Glucose [Mass/volume] in Blood', unit: 'mg/dL' },
  fasting_glucose: { code: '1558-6', name: 'Fasting glucose [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
  hba1c: { code: '4548-4', name: 'Hemoglobin A1c', unit: '%' },
  // Lipids
  cholesterol: { code: '2093-3', name: 'Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
  hdl: { code: '2085-9', name: 'Cholesterol in HDL [Mass/volume]', unit: 'mg/dL' },
  ldl: { code: '2089-1', name: 'Cholesterol in LDL [Mass/volume]', unit: 'mg/dL' },
  triglycerides: { code: '2571-8', name: 'Triglycerides', unit: 'mg/dL' },
  // Kidney
  creatinine: { code: '2160-0', name: 'Creatinine [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
  urea: { code: '3094-0', name: 'Urea nitrogen [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
  // Liver
  sgpt: { code: '1742-6', name: 'Alanine aminotransferase [Enzymatic activity/volume]', unit: 'U/L' },
  sgot: { code: '1920-8', name: 'Aspartate aminotransferase [Enzymatic activity/volume]', unit: 'U/L' },
  // Blood Count
  hemoglobin: { code: '718-7', name: 'Hemoglobin [Mass/volume] in Blood', unit: 'g/dL' },
  wbc: { code: '6690-2', name: 'Leukocytes [#/volume] in Blood', unit: '10*3/uL' },
  rbc: { code: '789-8', name: 'Erythrocytes [#/volume] in Blood', unit: '10*6/uL' },
  platelets: { code: '777-3', name: 'Platelets [#/volume] in Blood', unit: '10*3/uL' },
  // Thyroid
  tsh: { code: '3016-3', name: 'Thyrotropin [Units/volume] in Serum or Plasma', unit: 'mIU/L' },
  t3: { code: '3051-0', name: 'Triiodothyronine (T3) [Mass/volume]', unit: 'ng/dL' },
  t4: { code: '3026-2', name: 'Thyroxine (T4) [Mass/volume]', unit: 'ug/dL' },
};

// Regex patterns for extracting values from OCR text
const EXTRACTION_PATTERNS = [
  // BP: 120/80 or 120/80 mmHg
  {
    key: 'blood_pressure',
    regex: /(?:bp|blood\s*pressure|b\.p\.?)[:\s]*(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mmhg)?/i,
    extract: (match) => ({ systolic: parseInt(match[1]), diastolic: parseInt(match[2]) }),
  },
  // Heart Rate
  {
    key: 'heart_rate',
    regex: /(?:hr|heart\s*rate|pulse)[:\s]*(\d{2,3})\s*(?:bpm|\/min)?/i,
    extract: (match) => ({ heart_rate: parseInt(match[1]) }),
  },
  // SpO2
  {
    key: 'spo2',
    regex: /(?:spo2|o2\s*sat|oxygen\s*sat(?:uration)?)[:\s]*(\d{2,3})\s*%?/i,
    extract: (match) => ({ spo2: parseFloat(match[1]) }),
  },
  // Temperature (Celsius)
  {
    key: 'temperature',
    regex: /(?:temp(?:erature)?)[:\s]*(\d{2,3}(?:\.\d)?)\s*(?:°?c|celsius)?/i,
    extract: (match) => ({ temperature: parseFloat(match[1]), unit: 'C' }),
  },
  // Temperature (Fahrenheit)
  {
    key: 'temperature_f',
    regex: /(?:temp(?:erature)?)[:\s]*(\d{2,3}(?:\.\d)?)\s*°?f/i,
    extract: (match) => ({ temperature: ((parseFloat(match[1]) - 32) * 5 / 9).toFixed(1), unit: 'C' }),
  },
  // Weight
  {
    key: 'weight',
    regex: /(?:weight|wt\.?)[:\s]*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|kgs)?/i,
    extract: (match) => ({ weight_kg: parseFloat(match[1]) }),
  },
  // Blood Glucose
  {
    key: 'glucose',
    regex: /(?:glucose|blood\s*sugar|fbs|rbs|ppbs)[:\s]*(\d{2,4}(?:\.\d{1,2})?)\s*(?:mg\/dl|mmol\/l)?/i,
    extract: (match, fullText) => ({
      glucose: parseFloat(match[1]),
      context: /fasting|fbs/i.test(fullText) ? 'fasting' : /post|ppbs/i.test(fullText) ? 'post_meal' : 'random',
    }),
  },
  // HbA1c
  {
    key: 'hba1c',
    regex: /(?:hba1c|glycated\s*hemoglobin)[:\s]*(\d{1,2}(?:\.\d{1,2})?)\s*%?/i,
    extract: (match) => ({ hba1c: parseFloat(match[1]) }),
  },
  // Hemoglobin
  {
    key: 'hemoglobin',
    regex: /(?:hb|hemoglobin|haemoglobin)[:\s]*(\d{1,3}(?:\.\d{1,2})?)\s*(?:g\/dl)?/i,
    extract: (match) => ({ hemoglobin: parseFloat(match[1]) }),
  },
  // Cholesterol
  {
    key: 'cholesterol',
    regex: /(?:total\s*cholesterol|cholesterol)[:\s]*(\d{2,4}(?:\.\d{1,2})?)\s*(?:mg\/dl)?/i,
    extract: (match) => ({ cholesterol: parseFloat(match[1]) }),
  },
  // LDL
  {
    key: 'ldl',
    regex: /(?:ldl)[:\s]*(\d{2,4}(?:\.\d{1,2})?)\s*(?:mg\/dl)?/i,
    extract: (match) => ({ ldl: parseFloat(match[1]) }),
  },
  // HDL
  {
    key: 'hdl',
    regex: /(?:hdl)[:\s]*(\d{2,4}(?:\.\d{1,2})?)\s*(?:mg\/dl)?/i,
    extract: (match) => ({ hdl: parseFloat(match[1]) }),
  },
  // Creatinine
  {
    key: 'creatinine',
    regex: /(?:creatinine)[:\s]*(\d{1,3}(?:\.\d{1,2})?)\s*(?:mg\/dl)?/i,
    extract: (match) => ({ creatinine: parseFloat(match[1]) }),
  },
];

function extractBiometricMarkers(ocrText) {
  const text = ocrText.toLowerCase();
  const extracted = [];

  for (const pattern of EXTRACTION_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      try {
        const values = pattern.extract(match, text);
        const loincInfo = LOINC_MAPPINGS[pattern.key] || LOINC_MAPPINGS[Object.keys(values)[0]];

        if (pattern.key === 'blood_pressure' && values.systolic && values.diastolic) {
          extracted.push({
            vital_type: 'bp',
            systolic: values.systolic,
            diastolic: values.diastolic,
            loinc_code: LOINC_MAPPINGS.blood_pressure.code,
            loinc_name: LOINC_MAPPINGS.blood_pressure.name,
            unit: 'mmHg',
          });
        } else {
          extracted.push({
            vital_type: pattern.key,
            value: Object.values(values)[0],
            ...values,
            loinc_code: loincInfo?.code,
            loinc_name: loincInfo?.name,
            unit: loincInfo?.unit,
          });
        }
      } catch (e) {
        // Skip malformed match
      }
    }
  }

  return extracted;
}

function getLoincInfo(key) {
  return LOINC_MAPPINGS[key] || null;
}

module.exports = { extractBiometricMarkers, getLoincInfo, LOINC_MAPPINGS };
