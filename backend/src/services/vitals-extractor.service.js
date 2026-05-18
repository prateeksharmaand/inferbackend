const BP_PATTERN = /(\d{2,3})\s*[\/\\]\s*(\d{2,3})\s*(?:mmhg|mm\s*hg)?/gi;
const GLUCOSE_PATTERN = /(?:glucose|blood\s*sugar|fasting\s*glucose|random\s*glucose)[:\s]+(\d{2,3}(?:\.\d)?)\s*(?:mg\/dl|mg%|mmol)?/gi;
const GLUCOSE_PLAIN = /\b(\d{2,3})\s*mg\/dl\b/gi;
const WEIGHT_PATTERN = /(?:weight|body\s*weight|wt)[:\s]+(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|kgs|kilograms)?/gi;
const HEIGHT_PATTERN = /(?:height|ht)[:\s]+(\d{1,3}(?:\.\d{1,2})?)\s*(?:cm|cms)?/gi;
const TEMP_PATTERN = /(?:temperature|temp|body\s*temp)[:\s]+(\d{2,3}(?:\.\d)?)\s*(?:°c|celsius|°f|fahrenheit|f|c)?/gi;
const SPO2_PATTERN = /(?:spo2|oxygen\s*saturation|o2\s*sat|pulse\s*ox)[:\s]+(\d{2,3})\s*%?/gi;
const HR_PATTERN = /(?:heart\s*rate|pulse|hr|bpm)[:\s]+(\d{2,3})\s*(?:bpm|\/min)?/gi;
const HBA1C_PATTERN = /(?:hba1c|a1c|glycated\s*hemoglobin)[:\s]+(\d{1,2}(?:\.\d)?)\s*%?/gi;
const CREATININE_PATTERN = /(?:creatinine|serum\s*creatinine)[:\s]+(\d{1,2}(?:\.\d{1,2})?)\s*(?:mg\/dl)?/gi;
const HEMOGLOBIN_PATTERN = /(?:hemoglobin|hb|hgb)[:\s]+(\d{1,2}(?:\.\d)?)\s*(?:g\/dl)?/gi;

function extractVitalsFromText(text) {
  if (!text) return {};
  const t = text.toLowerCase();
  const vitals = {};

  const bpMatch = [...t.matchAll(BP_PATTERN)][0];
  if (bpMatch) {
    const sys = parseInt(bpMatch[1]), dia = parseInt(bpMatch[2]);
    if (sys >= 60 && sys <= 250 && dia >= 40 && dia <= 150) {
      vitals.blood_pressure = { systolic: sys, diastolic: dia };
    }
  }

  const glucoseMatch = [...t.matchAll(GLUCOSE_PATTERN)][0] || [...t.matchAll(GLUCOSE_PLAIN)][0];
  if (glucoseMatch) {
    const val = parseFloat(glucoseMatch[1]);
    if (val >= 40 && val <= 600) vitals.glucose = { value: val };
  }

  const weightMatch = [...t.matchAll(WEIGHT_PATTERN)][0];
  if (weightMatch) {
    const val = parseFloat(weightMatch[1]);
    if (val >= 10 && val <= 500) vitals.weight = { value: val };
  }

  const heightMatch = [...t.matchAll(HEIGHT_PATTERN)][0];
  if (heightMatch) {
    const val = parseFloat(heightMatch[1]);
    if (val >= 50 && val <= 250) vitals.height = { value: val };
  }

  const tempMatch = [...t.matchAll(TEMP_PATTERN)][0];
  if (tempMatch) {
    let val = parseFloat(tempMatch[1]);
    if (val > 45) val = (val - 32) * 5 / 9; // F to C
    if (val >= 30 && val <= 45) vitals.temperature = { value: parseFloat(val.toFixed(1)) };
  }

  const spo2Match = [...t.matchAll(SPO2_PATTERN)][0];
  if (spo2Match) {
    const val = parseInt(spo2Match[1]);
    if (val >= 50 && val <= 100) vitals.spo2 = { value: val };
  }

  const hrMatch = [...t.matchAll(HR_PATTERN)][0];
  if (hrMatch) {
    const val = parseInt(hrMatch[1]);
    if (val >= 20 && val <= 300) vitals.heart_rate = { bpm: val };
  }

  const hba1cMatch = [...t.matchAll(HBA1C_PATTERN)][0];
  if (hba1cMatch) {
    const val = parseFloat(hba1cMatch[1]);
    if (val >= 4 && val <= 20) vitals.hba1c = { value: val };
  }

  const hemoglobinMatch = [...t.matchAll(HEMOGLOBIN_PATTERN)][0];
  if (hemoglobinMatch) {
    const val = parseFloat(hemoglobinMatch[1]);
    if (val >= 5 && val <= 25) vitals.hemoglobin = { value: val };
  }

  const creatinineMatch = [...t.matchAll(CREATININE_PATTERN)][0];
  if (creatinineMatch) {
    const val = parseFloat(creatinineMatch[1]);
    if (val >= 0.3 && val <= 20) vitals.creatinine = { value: val };
  }

  return vitals;
}

function analyzeDocumentText(text) {
  if (!text) return {};
  const t = text.toLowerCase();
  let documentType = null;
  let doctorName = null;
  let facilityName = null;
  let documentDate = null;
  let suggestedTitle = null;

  if (t.includes('prescription') || t.includes('rx')) { documentType = 'Prescription'; suggestedTitle = 'Prescription'; }
  else if (t.includes('lab') || t.includes('laboratory') || t.includes('test report')) { documentType = 'Lab Report'; suggestedTitle = 'Lab Report'; }
  else if (t.includes('discharge summary')) { documentType = 'Discharge Summary'; suggestedTitle = 'Discharge Summary'; }
  else if (t.includes('radiology') || t.includes('x-ray') || t.includes('mri') || t.includes('ct scan')) { documentType = 'Radiology Report'; suggestedTitle = 'Radiology Report'; }
  else if (t.includes('vaccination') || t.includes('vaccine') || t.includes('immunization')) { documentType = 'Vaccination Record'; suggestedTitle = 'Vaccination Record'; }
  else if (t.includes('consultation') || t.includes('outpatient') || t.includes('opd')) { documentType = 'Consultation Notes'; suggestedTitle = 'Consultation Notes'; }

  const drMatch = text.match(/Dr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (drMatch) doctorName = `Dr. ${drMatch[1]}`;

  const dateMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dateMatch) {
    try {
      const [, d, m, y] = dateMatch;
      const year = y.length === 2 ? `20${y}` : y;
      documentDate = new Date(`${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`).toISOString();
    } catch (_) {}
  }

  return { document_type: documentType, doctor_name: doctorName, facility_name: facilityName, document_date: documentDate, suggested_title: suggestedTitle };
}

module.exports = { extractVitalsFromText, analyzeDocumentText };
