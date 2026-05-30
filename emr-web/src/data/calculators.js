// ── Medical Calculators ───────────────────────────────────────────────────────
// Each calculator: { id, name, inputs[], calculate(vals) → {value, unit, interp, color} }
// input types: 'number' | 'select' | 'checkbox' | 'date'
// vitalKey: auto-fills from form.vitals if present

const GREEN = '#16a34a', AMBER = '#d97706', RED = '#dc2626', BLUE = '#2563eb', PURPLE = '#7c3aed';

function interp(val, breaks) {
  // breaks: [{max, label, color}] sorted ascending, last has no max
  for (const b of breaks) if (b.max === undefined || val <= b.max) return { label: b.label, color: b.color };
  return { label: '—', color: BLUE };
}

export const CALCULATORS = [

  // ── BSA ───────────────────────────────────────────────────────────────────
  {
    id: 'BSA', name: 'BSA Score', desc: 'Body Surface Area (Mosteller)',
    longDesc: 'Body Surface Area is used to calculate drug dosages, especially chemotherapy, and to assess burn size. The Mosteller formula is the most widely used due to its simplicity and accuracy.',
    formula: 'BSA (m²) = √(Height(cm) × Weight(kg) / 3600)',
    interpretation: [
      { range: '< 1.5',    gender: 'Any', category: 'LOW',    color: AMBER },
      { range: '1.5 – 2.1',gender: 'Any', category: 'NORMAL', color: GREEN },
      { range: '> 2.1',    gender: 'Any', category: 'HIGH',   color: AMBER },
    ],
    howToUse: '1. Enter the patient\'s height in cm and weight in kg.\n2. Click Calculate.\n3. The result is used to calculate chemotherapy doses, cardiac output, and burn surface area.\n\nNote: Average adult BSA is ~1.7–1.9 m². Most drug doses are standardized to 1.73 m².',
    inputs: [
      { key: 'height', label: 'Height', unit: 'cm',  type: 'number', vitalKey: 'height' },
      { key: 'weight', label: 'Weight', unit: 'kg',  type: 'number', vitalKey: 'weight' },
    ],
    calculate({ height, weight }) {
      if (!height || !weight) return null;
      const bsa = Math.sqrt((+height * +weight) / 3600).toFixed(2);
      const i = interp(+bsa, [{ max: 1.5, label: 'Low', color: AMBER }, { max: 2.1, label: 'Normal', color: GREEN }, { label: 'High', color: AMBER }]);
      return { value: bsa, unit: 'm²', ...i };
    },
  },

  // ── WAIST_HIP_RATIO ───────────────────────────────────────────────────────
  {
    id: 'WAIST_HIP_RATIO', name: 'Waist Hip Ratio', desc: 'Abdominal obesity risk',
    longDesc: 'WHR is a measure of abdominal obesity and cardiovascular risk. Central adiposity (apple shape) is a stronger predictor of metabolic syndrome than overall BMI. WHO defines high risk as WHR >0.90 (male) or >0.85 (female).',
    formula: 'WHR = Waist circumference (cm) ÷ Hip circumference (cm)',
    interpretation: [
      { range: '0.0 – 0.85', gender: 'Female', category: 'NORMAL', color: GREEN },
      { range: '0.85 – 100', gender: 'Female', category: 'HIGH',   color: AMBER },
      { range: '0.0 – 0.9',  gender: 'Male',   category: 'NORMAL', color: GREEN },
      { range: '0.9 – 100',  gender: 'Male',   category: 'HIGH',   color: AMBER },
    ],
    howToUse: '1. Measure waist circumference at the narrowest point (between ribs and iliac crest).\n2. Measure hip circumference at the widest point (over the buttocks).\n3. Select patient sex — thresholds differ by gender.\n4. Click Calculate.\n\nWHO cut-offs: Female HIGH >0.85 | Male HIGH >0.90',
    inputs: [
      { key: 'waist', label: 'Waist',  unit: 'cm', type: 'number', vitalKey: 'waist' },
      { key: 'hip',   label: 'Hip',    unit: 'cm', type: 'number' },
      { key: 'sex',   label: 'Sex',    type: 'select', options: ['Male', 'Female'] },
    ],
    calculate({ waist, hip, sex }) {
      if (!waist || !hip) return null;
      const whr = (+waist / +hip).toFixed(2);
      const isMale = sex === 'Male';
      const risk = isMale ? (whr < 0.90 ? 'Low' : whr < 1.0 ? 'Moderate' : 'High') : (whr < 0.80 ? 'Low' : whr < 0.85 ? 'Moderate' : 'High');
      return { value: whr, unit: '', label: risk, color: risk === 'Low' ? GREEN : risk === 'Moderate' ? AMBER : RED };
    },
  },

  // ── QUICKI ────────────────────────────────────────────────────────────────
  {
    id: 'QUICKI', name: 'QUICKI', desc: 'Quantitative Insulin Sensitivity Check Index',
    longDesc: 'QUICKI assesses insulin sensitivity from fasting glucose and insulin. It correlates well with the euglycemic-hyperinsulinemic clamp (gold standard). Lower values indicate insulin resistance and higher diabetes risk.',
    formula: 'QUICKI = 1 / [log(Fasting Insulin μIU/mL) + log(Fasting Glucose mg/dL)]\nNormal >0.45 | Insulin resistant 0.30–0.45 | Diabetes <0.30',
    inputs: [
      { key: 'glucose',  label: 'Fasting Glucose',  unit: 'mg/dL',   type: 'number', vitalKey: 'fbs' },
      { key: 'insulin',  label: 'Fasting Insulin',  unit: 'μIU/mL',  type: 'number', vitalKey: 'fasting_insulin' },
    ],
    calculate({ glucose, insulin }) {
      if (!glucose || !insulin) return null;
      const q = (1 / (Math.log10(+insulin) + Math.log10(+glucose))).toFixed(3);
      const i = interp(+q, [{ max: 0.30, label: 'Diabetes', color: RED }, { max: 0.45, label: 'Insulin Resistant', color: AMBER }, { label: 'Normal', color: GREEN }]);
      return { value: q, unit: '', ...i };
    },
  },

  // ── CHILD_PUGH ───────────────────────────────────────────────────────────
  {
    id: 'CHILD_PUGH', name: 'Child-Pugh', desc: 'Liver cirrhosis severity',
    longDesc: 'The Child-Pugh score classifies severity of liver cirrhosis and guides management decisions, including liver transplant eligibility. It considers both lab values and clinical signs of decompensation.',
    formula: 'Score = Bilirubin + Albumin + INR + Ascites + Encephalopathy (each 1–3 pts)\nClass A: 5–6 pts (well compensated) | Class B: 7–9 pts | Class C: 10–15 pts (decompensated)',
    inputs: [
      { key: 'bilirubin', label: 'Bilirubin',      unit: 'mg/dL', type: 'number' },
      { key: 'albumin',   label: 'Albumin',         unit: 'g/dL',  type: 'number' },
      { key: 'inr',       label: 'INR',             unit: '',      type: 'number', vitalKey: 'inr' },
      { key: 'ascites',   label: 'Ascites',         type: 'select', options: ['None', 'Mild', 'Moderate/Severe'] },
      { key: 'enceph',    label: 'Encephalopathy',  type: 'select', options: ['None', 'Grade 1-2', 'Grade 3-4'] },
    ],
    calculate({ bilirubin, albumin, inr, ascites, enceph }) {
      if (!bilirubin || !albumin || !inr) return null;
      const bil = +bilirubin < 2 ? 1 : +bilirubin <= 3 ? 2 : 3;
      const alb = +albumin > 3.5 ? 1 : +albumin >= 2.8 ? 2 : 3;
      const i   = +inr < 1.7 ? 1 : +inr <= 2.2 ? 2 : 3;
      const asc = ascites === 'None' ? 1 : ascites === 'Mild' ? 2 : 3;
      const enc = enceph === 'None' ? 1 : enceph === 'Grade 1-2' ? 2 : 3;
      const score = bil + alb + i + asc + enc;
      const cls = score <= 6 ? 'Class A' : score <= 9 ? 'Class B' : 'Class C';
      return { value: String(score), unit: 'pts', label: cls, color: score <= 6 ? GREEN : score <= 9 ? AMBER : RED };
    },
  },

  // ── MELD ─────────────────────────────────────────────────────────────────
  {
    id: 'MELD', name: 'MELD Score', desc: 'Model for End-stage Liver Disease',
    longDesc: 'MELD-Na predicts 90-day mortality in patients with end-stage liver disease and is used by UNOS to prioritize liver transplant allocation. Higher scores = higher urgency. If sodium is entered, MELD-Na is calculated.',
    formula: 'MELD = 3.78×ln(Bilirubin) + 11.2×ln(INR) + 9.57×ln(Creatinine) + 6.43\nMELD-Na = MELD + 1.32×(137−Na) − 0.033×MELD×(137−Na)',
    inputs: [
      { key: 'creatinine',  label: 'Creatinine',  unit: 'mg/dL', type: 'number', vitalKey: 'creatinine' },
      { key: 'bilirubin',   label: 'Bilirubin',   unit: 'mg/dL', type: 'number' },
      { key: 'inr',         label: 'INR',          unit: '',      type: 'number', vitalKey: 'inr' },
      { key: 'sodium',      label: 'Sodium',        unit: 'mEq/L', type: 'number' },
    ],
    calculate({ creatinine, bilirubin, inr, sodium }) {
      if (!creatinine || !bilirubin || !inr) return null;
      let cr = Math.min(Math.max(+creatinine, 1), 4);
      let bil = Math.max(+bilirubin, 1);
      let i = Math.max(+inr, 1);
      const meld = Math.round(3.78 * Math.log(bil) + 11.2 * Math.log(i) + 9.57 * Math.log(cr) + 6.43);
      let result = meld;
      if (sodium) {
        const na = Math.min(Math.max(+sodium, 125), 137);
        result = Math.round(meld + 1.32 * (137 - na) - 0.033 * meld * (137 - na));
      }
      const i2 = interp(result, [{ max: 9, label: '<10% 3-mo mortality', color: GREEN }, { max: 19, label: '6% 3-mo mortality', color: AMBER }, { max: 29, label: '19.6%', color: RED }, { label: '52.6% 3-mo mortality', color: RED }]);
      return { value: String(result), unit: 'pts', ...i2 };
    },
  },

  // ── GFR ──────────────────────────────────────────────────────────────────
  {
    id: 'GFR', name: 'eGFR', desc: 'Estimated GFR (CKD-EPI)',
    longDesc: 'eGFR estimates kidney filtration capacity using the 2021 CKD-EPI creatinine equation (race-free). It classifies CKD stages G1–G5 and guides drug dosing. Values below 60 for >3 months confirm CKD.',
    formula: 'CKD-EPI: 142 × min(Cr/κ,1)^α × max(Cr/κ,1)^−1.200 × 0.9938^Age × (1.012 if female)\nκ=0.7(F)/0.9(M), α=−0.241(F)/−0.302(M)',
    inputs: [
      { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', type: 'number', vitalKey: 'creatinine' },
      { key: 'age',        label: 'Age',         unit: 'yrs',   type: 'number' },
      { key: 'sex',        label: 'Sex',         type: 'select', options: ['Male', 'Female'] },
    ],
    calculate({ creatinine, age, sex }) {
      if (!creatinine || !age) return null;
      const cr = +creatinine; const a = +age;
      const female = sex === 'Female';
      const kappa = female ? 0.7 : 0.9;
      const alpha = female ? -0.241 : -0.302;
      const sexFactor = female ? 1.012 : 1;
      const ratio = cr / kappa;
      const egfr = 142 * Math.pow(Math.min(ratio, 1), alpha) * Math.pow(Math.max(ratio, 1), -1.200) * Math.pow(0.9938, a) * sexFactor;
      const val = Math.round(egfr);
      const stage = val >= 90 ? 'G1 (Normal)' : val >= 60 ? 'G2 (Mild)' : val >= 45 ? 'G3a' : val >= 30 ? 'G3b' : val >= 15 ? 'G4' : 'G5 (Failure)';
      return { value: String(val), unit: 'mL/min/1.73m²', label: stage, color: val >= 60 ? GREEN : val >= 30 ? AMBER : RED };
    },
  },

  // ── CRCL ─────────────────────────────────────────────────────────────────
  {
    id: 'CRCL', name: 'Creatinine Clearance (CrCl)', desc: 'Cockcroft-Gault',
    longDesc: 'Cockcroft-Gault estimates creatinine clearance to guide drug dosing, especially for renally-cleared medications (antibiotics, anticoagulants, chemotherapy). Multiply by 0.85 for females.',
    formula: 'CrCl = [(140 − Age) × Weight(kg)] / [72 × Serum Creatinine(mg/dL)]\n× 0.85 for females',
    inputs: [
      { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', type: 'number', vitalKey: 'creatinine' },
      { key: 'age',        label: 'Age',         unit: 'yrs',   type: 'number' },
      { key: 'weight',     label: 'Weight',      unit: 'kg',    type: 'number', vitalKey: 'weight' },
      { key: 'sex',        label: 'Sex',         type: 'select', options: ['Male', 'Female'] },
    ],
    calculate({ creatinine, age, weight, sex }) {
      if (!creatinine || !age || !weight) return null;
      let crcl = ((140 - +age) * +weight) / (72 * +creatinine);
      if (sex === 'Female') crcl *= 0.85;
      const val = Math.round(crcl);
      const i = interp(val, [{ max: 29, label: 'Severely Reduced', color: RED }, { max: 59, label: 'Moderately Reduced', color: AMBER }, { max: 89, label: 'Mildly Reduced', color: AMBER }, { label: 'Normal', color: GREEN }]);
      return { value: String(val), unit: 'mL/min', ...i };
    },
  },

  // ── FIB_4 ─────────────────────────────────────────────────────────────────
  {
    id: 'FIB_4', name: 'FIB-4', desc: 'Liver fibrosis index',
    longDesc: 'FIB-4 is a non-invasive test to assess advanced liver fibrosis in patients with chronic liver disease (NAFLD, hepatitis B/C). It avoids the need for liver biopsy in many cases. Validated in HIV/HCV co-infection.',
    formula: 'FIB-4 = (Age × AST) / (Platelets(×10⁹/L) × √ALT)\n<1.30: low risk (F0–F1) | 1.30–2.67: indeterminate | >2.67: high risk (F3–F4)',
    inputs: [
      { key: 'age',       label: 'Age',       unit: 'yrs',    type: 'number' },
      { key: 'ast',       label: 'AST',       unit: 'IU/L',   type: 'number' },
      { key: 'alt',       label: 'ALT',       unit: 'IU/L',   type: 'number' },
      { key: 'platelets', label: 'Platelets', unit: '×10⁹/L', type: 'number', vitalKey: 'platelets' },
    ],
    calculate({ age, ast, alt, platelets }) {
      if (!age || !ast || !alt || !platelets) return null;
      const fib4 = ((+age * +ast) / (+platelets * Math.sqrt(+alt))).toFixed(2);
      const i = interp(+fib4, [{ max: 1.30, label: 'Low Risk (F0-F1)', color: GREEN }, { max: 2.67, label: 'Indeterminate', color: AMBER }, { label: 'High Risk (F3-F4)', color: RED }]);
      return { value: fib4, unit: '', ...i };
    },
  },

  // ── NAFLD ────────────────────────────────────────────────────────────────
  {
    id: 'NAFLD', name: 'NAFLD Fibrosis Score', desc: 'Advanced fibrosis in NAFLD',
    longDesc: 'The NAFLD Fibrosis Score (NFS) distinguishes patients with NAFLD who do or do not have advanced hepatic fibrosis (F3–F4). A score above 0.676 strongly predicts advanced fibrosis and warrants biopsy or specialist referral.',
    formula: 'NFS = −1.675 + 0.037×Age + 0.094×BMI + 1.13×IFG/DM + 0.99×(AST/ALT) − 0.013×Platelets − 0.66×Albumin\n<−1.455: low | −1.455 to 0.676: indeterminate | >0.676: high',
    inputs: [
      { key: 'age',       label: 'Age',       unit: 'yrs',   type: 'number' },
      { key: 'bmi',       label: 'BMI',       unit: 'kg/m²', type: 'number', vitalKey: 'bmi' },
      { key: 'ifg',       label: 'IFG / T2DM', type: 'select', options: ['No', 'Yes'] },
      { key: 'ast',       label: 'AST',       unit: 'IU/L',  type: 'number' },
      { key: 'alt',       label: 'ALT',       unit: 'IU/L',  type: 'number' },
      { key: 'platelets', label: 'Platelets', unit: '×10⁹/L',type: 'number', vitalKey: 'platelets' },
      { key: 'albumin',   label: 'Albumin',   unit: 'g/dL',  type: 'number' },
    ],
    calculate({ age, bmi, ifg, ast, alt, platelets, albumin }) {
      if (!age || !bmi || !ast || !alt || !platelets || !albumin) return null;
      const ratio = +ast / +alt;
      const score = (-1.675 + 0.037 * +age + 0.094 * +bmi + 1.13 * (ifg === 'Yes' ? 1 : 0) + 0.99 * ratio - 0.013 * +platelets - 0.66 * +albumin).toFixed(3);
      const i = interp(+score, [{ max: -1.455, label: 'Low Risk (<5% fibrosis)', color: GREEN }, { max: 0.676, label: 'Indeterminate', color: AMBER }, { label: 'High Risk (>5% fibrosis)', color: RED }]);
      return { value: score, unit: '', ...i };
    },
  },

  // ── GCS ──────────────────────────────────────────────────────────────────
  {
    id: 'GCS', name: 'Glasgow Coma Scale', desc: 'Level of consciousness',
    longDesc: 'GCS measures level of consciousness after brain injury or altered sensorium. Used widely in ICUs, ERs, and trauma settings. Scores ≤8 indicate coma and the need for airway protection.',
    formula: 'GCS = Eye Opening (1–4) + Verbal Response (1–5) + Motor Response (1–6)\nSevere: 3–8 | Moderate: 9–12 | Mild: 13–15',
    inputs: [
      { key: 'eyes',   label: 'Eye Opening',   type: 'select', options: ['1 - No response','2 - To pain','3 - To voice','4 - Spontaneous'] },
      { key: 'verbal', label: 'Verbal Response',type: 'select', options: ['1 - No response','2 - Incomprehensible','3 - Inappropriate','4 - Confused','5 - Oriented'] },
      { key: 'motor',  label: 'Motor Response', type: 'select', options: ['1 - No response','2 - Extension','3 - Abnormal flexion','4 - Withdrawal','5 - Localizes pain','6 - Obeys commands'] },
    ],
    calculate({ eyes, verbal, motor }) {
      if (!eyes || !verbal || !motor) return null;
      const e = parseInt(eyes); const v = parseInt(verbal); const m = parseInt(motor);
      const score = e + v + m;
      const sev = score <= 8 ? 'Severe' : score <= 12 ? 'Moderate' : 'Mild';
      return { value: String(score), unit: '/15', label: sev, color: score <= 8 ? RED : score <= 12 ? AMBER : GREEN };
    },
  },

  // ── CHA2DS2_VASC ─────────────────────────────────────────────────────────
  {
    id: 'CHA2DS2_VASC', name: 'CHA₂DS₂-VASc Score', desc: 'Stroke risk in atrial fibrillation',
    longDesc: 'Used to determine whether anticoagulation is needed in non-valvular AFib. Score ≥2 (male) or ≥3 (female) warrants anticoagulation. Score of 1 in males or 2 in females requires individual assessment.',
    formula: 'C=CHF(1), H=HTN(1), A2=Age≥75(2), D=DM(1), S2=Stroke/TIA(2), V=Vascular(1), A=Age65–74(1), Sc=Female(1)\nMax 9 pts',
    inputs: [
      { key: 'chf',      label: 'Congestive Heart Failure',     type: 'checkbox' },
      { key: 'htn',      label: 'Hypertension',                 type: 'checkbox' },
      { key: 'age75',    label: 'Age ≥ 75 years',               type: 'checkbox' },
      { key: 'dm',       label: 'Diabetes mellitus',            type: 'checkbox' },
      { key: 'stroke',   label: 'Prior Stroke / TIA',           type: 'checkbox' },
      { key: 'vascular', label: 'Vascular disease',             type: 'checkbox' },
      { key: 'age65',    label: 'Age 65–74 years',              type: 'checkbox' },
      { key: 'female',   label: 'Female sex',                   type: 'checkbox' },
    ],
    calculate(v) {
      const score = (v.chf?1:0) + (v.htn?1:0) + (v.age75?2:0) + (v.dm?1:0) + (v.stroke?2:0) + (v.vascular?1:0) + (v.age65?1:0) + (v.female?1:0);
      const risk = score === 0 ? 'Low (no anticoag)' : score === 1 ? 'Low-Mod (consider)' : 'High (anticoag)';
      return { value: String(score), unit: 'pts', label: risk, color: score === 0 ? GREEN : score === 1 ? AMBER : RED };
    },
  },

  // ── HAS_BLED ─────────────────────────────────────────────────────────────
  {
    id: 'HAS_BLED', name: 'HAS-BLED Score', desc: 'Bleeding risk in AFib',
    longDesc: 'HAS-BLED estimates annual bleeding risk in patients on anticoagulation for AFib. Score ≥3 indicates high bleeding risk — use to identify modifiable risk factors, NOT to withhold anticoagulation.',
    formula: 'H=HTN(1), A=Abnormal renal/liver(1–2), S=Stroke(1), B=Bleeding history(1), L=Labile INR(1), E=Elderly>65(1), D=Drugs/alcohol(1–2)\n≥3 = high risk',
    inputs: [
      { key: 'htn',      label: 'Hypertension (uncontrolled SBP>160)', type: 'checkbox' },
      { key: 'renal',    label: 'Abnormal renal function',             type: 'checkbox' },
      { key: 'liver',    label: 'Abnormal liver function',             type: 'checkbox' },
      { key: 'stroke',   label: 'Prior stroke',                       type: 'checkbox' },
      { key: 'bleeding', label: 'Bleeding history or predisposition',  type: 'checkbox' },
      { key: 'labile',   label: 'Labile INR',                         type: 'checkbox' },
      { key: 'elderly',  label: 'Age > 65 years',                     type: 'checkbox' },
      { key: 'drugs',    label: 'Antiplatelet / NSAIDs use',           type: 'checkbox' },
      { key: 'alcohol',  label: 'Alcohol use (≥8 units/week)',         type: 'checkbox' },
    ],
    calculate(v) {
      const score = [v.htn,v.renal,v.liver,v.stroke,v.bleeding,v.labile,v.elderly,v.drugs,v.alcohol].filter(Boolean).length;
      const risk = score < 3 ? 'Low bleeding risk' : score < 5 ? 'Moderate risk' : 'High risk';
      return { value: String(score), unit: 'pts', label: risk, color: score < 3 ? GREEN : score < 5 ? AMBER : RED };
    },
  },

  // ── RCRI ─────────────────────────────────────────────────────────────────
  {
    id: 'RCRI', name: 'RCRI', desc: 'Revised Cardiac Risk Index (pre-op)',
    longDesc: 'RCRI predicts risk of major adverse cardiac events (MACE) in patients undergoing non-cardiac surgery. Developed by Lee et al. (1999). Guides pre-operative cardiac workup and anesthesia planning.',
    formula: '6 independent predictors, 1 point each: IHD, CHF, CVD, Insulin-DM, Cr>2, High-risk surgery\n0=0.4% | 1=1.0% | 2=2.4% | ≥3=5.4% 30-day MACE',
    inputs: [
      { key: 'ihd',     label: 'Ischemic heart disease',          type: 'checkbox' },
      { key: 'chf',     label: 'Congestive heart failure',        type: 'checkbox' },
      { key: 'cvd',     label: 'Cerebrovascular disease',         type: 'checkbox' },
      { key: 'insulin', label: 'Insulin-dependent diabetes',      type: 'checkbox' },
      { key: 'cr',      label: 'Pre-op creatinine > 2.0 mg/dL',  type: 'checkbox' },
      { key: 'surgery', label: 'High-risk surgery',               type: 'checkbox' },
    ],
    calculate(v) {
      const score = [v.ihd,v.chf,v.cvd,v.insulin,v.cr,v.surgery].filter(Boolean).length;
      const risks = ['0.4%','1.0%','2.4%','≥5.4%'];
      const riskLabel = `MACE risk: ${risks[Math.min(score, 3)]}`;
      return { value: String(score), unit: 'pts', label: riskLabel, color: score === 0 ? GREEN : score === 1 ? AMBER : RED };
    },
  },

  // ── ABCD_TIA ─────────────────────────────────────────────────────────────
  {
    id: 'ABCD_TIA', name: 'ABCD² Score', desc: 'Stroke risk after TIA',
    longDesc: 'The ABCD² score stratifies the short-term risk of stroke within 2 days after a TIA. High-risk patients (score ≥4) should be admitted urgently for investigation and secondary prevention.',
    formula: 'A=Age≥60(1), B=BP≥140/90(1), C=Clinical(unilateral weakness=2, speech only=1), D=Duration(≥60min=2, 10–59min=1), D2=Diabetes(1)\nMax 7 | Low<4 | Moderate 4–5 | High 6–7',
    inputs: [
      { key: 'age',      label: 'Age ≥ 60',                     type: 'checkbox' },
      { key: 'bp',       label: 'BP ≥ 140/90 mmHg',             type: 'checkbox' },
      { key: 'clinical', label: 'Clinical feature', type: 'select', options: ['0 - Other symptoms','1 - Speech impairment only','2 - Unilateral weakness'] },
      { key: 'duration', label: 'Duration', type: 'select', options: ['0 - <10 min','1 - 10-59 min','2 - ≥60 min'] },
      { key: 'dm',       label: 'Diabetes',                     type: 'checkbox' },
    ],
    calculate({ age, bp, clinical, duration, dm }) {
      const score = (age?1:0) + (bp?1:0) + (parseInt(clinical)||0) + (parseInt(duration)||0) + (dm?1:0);
      const risk = score <= 3 ? 'Low risk' : score <= 5 ? 'Moderate risk' : 'High risk';
      return { value: String(score), unit: '/7', label: risk, color: score <= 3 ? GREEN : score <= 5 ? AMBER : RED };
    },
  },

  // ── STOP_BANG ─────────────────────────────────────────────────────────────
  {
    id: 'STOP_BANG', name: 'STOP-BANG', desc: 'Obstructive sleep apnea screening',
    longDesc: 'STOP-BANG is a validated screening tool for obstructive sleep apnea (OSA) in surgical and general populations. Score ≥3 indicates high risk and warrants polysomnography referral.',
    formula: 'S=Snoring, T=Tired, O=Observed apnea, P=Pressure(HTN), B=BMI>35, A=Age>50, N=Neck>40cm, G=Male gender\n0–2: Low | 3–4: Moderate | 5–8: High OSA risk',
    inputs: [
      { key: 'snoring',  label: 'S — Snore loudly',              type: 'checkbox' },
      { key: 'tired',    label: 'T — Tired / sleepy daytime',    type: 'checkbox' },
      { key: 'observed', label: 'O — Observed apnea',            type: 'checkbox' },
      { key: 'pressure', label: 'P — High blood pressure',       type: 'checkbox' },
      { key: 'bmi',      label: 'B — BMI > 35',                  type: 'checkbox' },
      { key: 'age',      label: 'A — Age > 50',                  type: 'checkbox' },
      { key: 'neck',     label: 'N — Neck circumference > 40 cm',type: 'checkbox' },
      { key: 'gender',   label: 'G — Male gender',               type: 'checkbox' },
    ],
    calculate(v) {
      const score = Object.values(v).filter(Boolean).length;
      const risk = score < 3 ? 'Low OSA risk' : score < 5 ? 'Moderate OSA risk' : 'High OSA risk';
      return { value: String(score), unit: '/8', label: risk, color: score < 3 ? GREEN : score < 5 ? AMBER : RED };
    },
  },

  // ── ESS ──────────────────────────────────────────────────────────────────
  {
    id: 'ESS', name: 'Epworth Sleepiness Scale', desc: 'Daytime sleepiness assessment',
    longDesc: 'ESS measures the level of daytime sleepiness using eight situational questions, each scored 0–3. It helps diagnose narcolepsy, OSA, and idiopathic hypersomnia. Developed by Murray Johns (1991).',
    formula: 'Sum of 8 items (0=never, 1=slight, 2=moderate, 3=high chance of dozing)\n0–7: Normal | 8–10: Mild | 11–16: Moderate | 17–24: Severe EDS',
    inputs: [
      { key: 's1', label: 'Sitting and reading',              type: 'select', options: ['0','1','2','3'] },
      { key: 's2', label: 'Watching TV',                      type: 'select', options: ['0','1','2','3'] },
      { key: 's3', label: 'Sitting inactive (public)',        type: 'select', options: ['0','1','2','3'] },
      { key: 's4', label: 'Passenger in car (1 hr)',          type: 'select', options: ['0','1','2','3'] },
      { key: 's5', label: 'Lying down in afternoon',          type: 'select', options: ['0','1','2','3'] },
      { key: 's6', label: 'Sitting and talking',              type: 'select', options: ['0','1','2','3'] },
      { key: 's7', label: 'Sitting after lunch (no alcohol)', type: 'select', options: ['0','1','2','3'] },
      { key: 's8', label: 'In car, stopped in traffic',       type: 'select', options: ['0','1','2','3'] },
    ],
    calculate(v) {
      const score = Object.values(v).reduce((s, x) => s + (parseInt(x)||0), 0);
      const sev = score < 8 ? 'Normal' : score < 11 ? 'Mild' : score < 17 ? 'Moderate' : 'Severe';
      return { value: String(score), unit: '/24', label: sev + ' daytime sleepiness', color: score < 8 ? GREEN : score < 11 ? AMBER : score < 17 ? AMBER : RED };
    },
  },

  // ── IPSS ─────────────────────────────────────────────────────────────────
  {
    id: 'IPSS', name: 'IPSS', desc: 'International Prostate Symptom Score',
    longDesc: 'IPSS quantifies lower urinary tract symptoms (LUTS) in men with benign prostatic hyperplasia (BPH). Guides treatment decisions — watchful waiting (mild), medical therapy (moderate), or surgical referral (severe).',
    formula: '7 symptoms scored 0–5 (frequency, nocturia, urgency, weak stream, intermittency, incomplete emptying, straining)\n0–7: Mild | 8–19: Moderate | 20–35: Severe',
    inputs: [
      { key: 'q1', label: 'Incomplete emptying',     type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q2', label: 'Frequency',               type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q3', label: 'Intermittency',            type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q4', label: 'Urgency',                  type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q5', label: 'Weak stream',              type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q6', label: 'Straining',                type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q7', label: 'Nocturia',                 type: 'select', options: ['0','1','2','3','4','5'] },
    ],
    calculate(v) {
      const score = Object.values(v).reduce((s, x) => s + (parseInt(x)||0), 0);
      const sev = score <= 7 ? 'Mild' : score <= 19 ? 'Moderate' : 'Severe';
      return { value: String(score), unit: '/35', label: sev, color: score <= 7 ? GREEN : score <= 19 ? AMBER : RED };
    },
  },

  // ── GCS ── (already defined above)

  // ── DASI ─────────────────────────────────────────────────────────────────
  {
    id: 'DASI', name: 'DASI', desc: 'Duke Activity Status Index',
    longDesc: 'DASI estimates functional capacity (in METs) from 12 self-reported activities of daily living. It predicts perioperative cardiac complications and correlates with peak VO₂ on exercise testing.',
    formula: 'Weighted sum of 12 activities (weights 1.75–8.00)\nVO₂ peak (mL/kg/min) = 0.43 × DASI + 9.6\n<14: <4 METs (poor) | 14–34: moderate | >34: excellent',
    inputs: [
      { key: 'a1',  label: 'Self-care (eat, dress, use toilet)',   type: 'checkbox' },
      { key: 'a2',  label: 'Walk indoors',                         type: 'checkbox' },
      { key: 'a3',  label: 'Walk 1-2 blocks on level ground',      type: 'checkbox' },
      { key: 'a4',  label: 'Climb a flight of stairs / walk uphill',type: 'checkbox' },
      { key: 'a5',  label: 'Run short distance',                   type: 'checkbox' },
      { key: 'a6',  label: 'Light housework',                      type: 'checkbox' },
      { key: 'a7',  label: 'Moderate housework',                   type: 'checkbox' },
      { key: 'a8',  label: 'Heavy housework',                      type: 'checkbox' },
      { key: 'a9',  label: 'Yardwork',                             type: 'checkbox' },
      { key: 'a10', label: 'Sexual relations',                     type: 'checkbox' },
      { key: 'a11', label: 'Moderate recreational activities',     type: 'checkbox' },
      { key: 'a12', label: 'Strenuous sports',                     type: 'checkbox' },
    ],
    calculate(v) {
      const weights = [2.75,1.75,2.75,5.50,8.00,2.70,3.50,8.00,4.50,5.25,6.00,7.50];
      const keys = ['a1','a2','a3','a4','a5','a6','a7','a8','a9','a10','a11','a12'];
      const dasi = keys.reduce((s, k, i) => s + (v[k] ? weights[i] : 0), 0);
      const vo2 = (0.43 * dasi + 9.6).toFixed(1);
      const sev = dasi < 14 ? 'Poor (<4 METs)' : dasi < 34 ? 'Moderate (4-10 METs)' : 'Excellent (>10 METs)';
      return { value: dasi.toFixed(1), unit: 'pts', label: `${sev} · VO₂ ~${vo2}`, color: dasi < 14 ? RED : dasi < 34 ? AMBER : GREEN };
    },
  },

  // ── VITAL_CAPACITY ───────────────────────────────────────────────────────
  {
    id: 'VITAL_CAPACITY', name: 'Vital Capacity', desc: 'Predicted FVC / vital capacity',
    longDesc: 'Predicted vital capacity estimates the maximum air that can be exhaled after a full inhalation, based on age, sex, and height. Used as a reference to interpret spirometry results and detect restrictive lung disease.',
    formula: 'Male: FVC = −4.34 + 0.576×Height(dm) − 0.026×Age\nFemale: FVC = −3.19 + 0.546×Height(dm) − 0.026×Age',
    inputs: [
      { key: 'height', label: 'Height', unit: 'cm',  type: 'number', vitalKey: 'height' },
      { key: 'age',    label: 'Age',    unit: 'yrs', type: 'number' },
      { key: 'sex',    label: 'Sex',    type: 'select', options: ['Male', 'Female'] },
    ],
    calculate({ height, age, sex }) {
      if (!height || !age) return null;
      const h = +height / 100; const a = +age;
      let fvc = sex === 'Female' ? (-3.19 + 0.0546 * +height * 10 - 0.026 * a) : (-4.34 + 0.0576 * +height * 10 - 0.026 * a);
      fvc = Math.max(fvc, 0.5);
      return { value: fvc.toFixed(2), unit: 'L (predicted FVC)', label: '', color: BLUE };
    },
  },

  // ── BODE_INDEX ───────────────────────────────────────────────────────────
  {
    id: 'BODE_INDEX', name: 'BODE Index', desc: 'COPD mortality predictor',
    longDesc: 'BODE Index predicts all-cause and respiratory mortality in COPD better than FEV1 alone. It incorporates BMI, airflow obstruction, dyspnea, and exercise capacity. Higher scores indicate worse prognosis.',
    formula: 'B=BMI≤21(1), O=FEV1%(<50=3, 50–64=2, 65–79=1, ≥80=0), D=mMRC dyspnea(0–4), E=6min walk(<150=3)\nScore 0–10 | Quartile 1(0–2): ~15% 4-yr mortality → Q4(7–10): ~82%',
    inputs: [
      { key: 'bmi',   label: 'BMI',          unit: 'kg/m²', type: 'number', vitalKey: 'bmi' },
      { key: 'fev1',  label: 'FEV1',         unit: '% pred',type: 'number' },
      { key: 'mmrc',  label: 'mMRC Dyspnea', type: 'select', options: ['0','1','2','3','4'] },
      { key: 'walk',  label: '6-min walk',   unit: 'm',     type: 'number' },
    ],
    calculate({ bmi, fev1, mmrc, walk }) {
      if (!fev1) return null;
      const b = +bmi > 21 ? 0 : 1;
      const o = +fev1 >= 65 ? 0 : +fev1 >= 50 ? 1 : +fev1 >= 36 ? 2 : 3;
      const d = parseInt(mmrc) || 0;
      const e = +walk >= 350 ? 0 : +walk >= 250 ? 1 : +walk >= 150 ? 2 : 3;
      const score = b + o + d + e;
      const mort = score <= 2 ? '~15% 4-yr mortality' : score <= 4 ? '~30% 4-yr mortality' : score <= 6 ? '~64% 4-yr mortality' : '~82% 4-yr mortality';
      return { value: String(score), unit: '/10', label: mort, color: score <= 2 ? GREEN : score <= 4 ? AMBER : RED };
    },
  },

  // ── IV_FLOW_RATE ─────────────────────────────────────────────────────────
  {
    id: 'IV_FLOW_RATE', name: 'IV Flow Rate', desc: 'Infusion drip rate calculator',
    longDesc: 'Calculates the IV drip rate (drops per minute) and flow rate (mL/hr) for manual gravity infusions. The drop factor depends on the IV set used — macro sets: 10–20 gtt/mL; micro sets: 60 gtt/mL.',
    formula: 'Drops/min = (Volume(mL) × Drop factor(gtt/mL)) / (Time(hrs) × 60)\nmL/hr = Volume(mL) / Time(hrs)',
    inputs: [
      { key: 'volume',     label: 'Volume',      unit: 'mL',     type: 'number' },
      { key: 'time',       label: 'Time',        unit: 'hours',  type: 'number' },
      { key: 'drop_factor',label: 'Drop factor', unit: 'gtt/mL', type: 'select', options: ['10','15','20','60'] },
    ],
    calculate({ volume, time, drop_factor }) {
      if (!volume || !time) return null;
      const df = parseInt(drop_factor) || 20;
      const dropsPerMin = Math.round((+volume * df) / (+time * 60));
      const mlPerHr = Math.round(+volume / +time);
      return { value: String(dropsPerMin), unit: 'gtt/min', label: `${mlPerHr} mL/hr`, color: BLUE };
    },
  },

  // ── PEDIATRIC_DOSE ───────────────────────────────────────────────────────
  {
    id: 'PEDIATRIC_DOSE', name: 'Pediatric Dose', desc: "Young's / Clark's / Weight-based",
    longDesc: "Estimates the appropriate pediatric drug dose from the adult dose using three validated methods. Weight-based dosing (mg/kg) is most accurate when the child's weight is known. Young's and Clark's are approximation formulas.",
    formula: "Young's: Child dose = Adult dose × Age / (Age + 12)\nClark's: Child dose = Adult dose × Weight(kg) / 70\nWeight-based: Dose = Adult dose(mg/kg) × Child weight(kg)",
    inputs: [
      { key: 'adult_dose', label: 'Adult dose',  unit: 'mg',  type: 'number' },
      { key: 'age',        label: 'Child age',   unit: 'yrs', type: 'number' },
      { key: 'weight',     label: 'Child weight',unit: 'kg',  type: 'number', vitalKey: 'weight' },
      { key: 'method',     label: 'Method',      type: 'select', options: ["Young's (age)","Clark's (weight)","Weight-based (mg/kg)"] },
    ],
    calculate({ adult_dose, age, weight, method }) {
      if (!adult_dose) return null;
      let dose;
      if (method === "Young's (age)" && age) dose = (+adult_dose * +age) / (+age + 12);
      else if (method === "Clark's (weight)" && weight) dose = (+adult_dose * +weight) / 70;
      else if (method === "Weight-based (mg/kg)" && weight) dose = +adult_dose * +weight;
      else return null;
      return { value: dose.toFixed(1), unit: 'mg', label: method, color: PURPLE };
    },
  },

  // ── CVD_RISK ─────────────────────────────────────────────────────────────
  {
    id: 'CVD_RISK', name: 'CVD 10-Year Risk', desc: 'Framingham risk score',
    longDesc: 'Estimates 10-year risk of a cardiovascular event (MI, stroke, coronary death) based on traditional risk factors. Used to guide statin and aspirin therapy decisions. Low <7.5%, Intermediate 7.5–20%, High >20%.',
    formula: 'Framingham (Anderson 1991): Multivariable logistic model using age, total cholesterol, HDL, SBP, BP treatment, smoking, diabetes\nDifferent coefficients for male and female',
    inputs: [
      { key: 'age',     label: 'Age',          unit: 'yrs',   type: 'number' },
      { key: 'sex',     label: 'Sex',          type: 'select', options: ['Male','Female'] },
      { key: 'tchol',   label: 'Total Cholesterol', unit: 'mg/dL', type: 'number', vitalKey: 'cholesterol' },
      { key: 'hdl',     label: 'HDL',          unit: 'mg/dL', type: 'number' },
      { key: 'sbp',     label: 'Systolic BP',  unit: 'mmHg',  type: 'number', vitalKey: 'bp_systolic' },
      { key: 'bp_tx',   label: 'BP treatment', type: 'checkbox' },
      { key: 'smoker',  label: 'Current smoker',type: 'checkbox' },
      { key: 'dm',      label: 'Diabetes',     type: 'checkbox' },
    ],
    calculate({ age, sex, tchol, hdl, sbp, bp_tx, smoker, dm }) {
      if (!age || !tchol || !hdl || !sbp) return null;
      const female = sex === 'Female';
      // Simplified Framingham (Anderson 1991)
      let risk;
      if (female) {
        const ln_a = 31.764001 * Math.log(+age) + 22.465206 * Math.log(+tchol) - 1.187731 * Math.log(+hdl) + 2.552905 * Math.log(+sbp) + (bp_tx ? 0.420251 : 0) + (smoker ? 13.07543 : 0) + (dm ? 0.661 : 0) - 206.7304905;
        risk = 1 - Math.pow(0.98767, Math.exp(ln_a - 23.9388));
      } else {
        const ln_a = 3.06117 * Math.log(+age) + 1.12370 * Math.log(+tchol) - 0.93263 * Math.log(+hdl) + (bp_tx ? 1.93303 * Math.log(+sbp) : 1.99881 * Math.log(+sbp)) + (smoker ? 0.65451 : 0) + (dm ? 0.57367 : 0) - 23.9388;
        risk = 1 - Math.pow(0.88936, Math.exp(ln_a));
      }
      const pct = (risk * 100).toFixed(1);
      const lev = +pct < 7.5 ? 'Low risk' : +pct < 20 ? 'Intermediate risk' : 'High risk';
      return { value: pct, unit: '%', label: lev, color: +pct < 7.5 ? GREEN : +pct < 20 ? AMBER : RED };
    },
  },

  // ── LMP_EDD ──────────────────────────────────────────────────────────────
  {
    id: 'LMP_EDD', name: 'EDD by LMP', desc: "Naegele's rule — Estimated Due Date",
    longDesc: "Naegele's rule calculates the Estimated Due Date (EDD) by adding 280 days (40 weeks) to the first day of the Last Menstrual Period. Also calculates current gestational age. Assumes a regular 28-day cycle.",
    formula: 'EDD = LMP + 280 days\nGA (weeks) = (Today − LMP) ÷ 7',
    inputs: [
      { key: 'lmp', label: 'Last Menstrual Period', type: 'date', vitalKey: 'lmp' },
    ],
    calculate({ lmp }) {
      if (!lmp) return null;
      const d = new Date(lmp);
      d.setDate(d.getDate() + 280);
      const edd = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const today = new Date();
      const ga = Math.floor((today - new Date(lmp)) / (7 * 86400000));
      const gaStr = ga >= 0 ? `GA: ${Math.floor(ga)} weeks` : '';
      return { value: edd, unit: '', label: gaStr, color: PURPLE };
    },
  },

  // ── US_EDD ───────────────────────────────────────────────────────────────
  {
    id: 'US_EDD', name: 'EDD by USG', desc: 'Estimated Due Date from ultrasound',
    longDesc: 'Calculates EDD based on gestational age measured at ultrasound. USG dating is more accurate than LMP, especially in irregular cycles. First trimester USG (CRL) is most accurate (±5 days).',
    formula: 'EDD = USG Date + (280 − GA at scan in days)\nGA at scan = Weeks × 7 + Days',
    inputs: [
      { key: 'usg_date', label: 'USG Date',        type: 'date' },
      { key: 'ga_weeks', label: 'GA at USG (wks)', unit: 'wks', type: 'number' },
      { key: 'ga_days',  label: 'GA at USG (days)',unit: 'days',type: 'number' },
    ],
    calculate({ usg_date, ga_weeks, ga_days }) {
      if (!usg_date || !ga_weeks) return null;
      const gaInDays = +ga_weeks * 7 + (+ga_days || 0);
      const d = new Date(usg_date);
      d.setDate(d.getDate() + (280 - gaInDays));
      const edd = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      return { value: edd, unit: '', label: `EDD from USG (${ga_weeks}w${ga_days||0}d)`, color: PURPLE };
    },
  },

  // ── GESTATIONAL_AGE ──────────────────────────────────────────────────────
  {
    id: 'GESTATIONAL_AGE', name: 'Gestational Age', desc: 'Current gestational age from LMP',
    longDesc: 'Calculates the current gestational age (GA) from the first day of the last menstrual period. Identifies the trimester and helps schedule antenatal care visits and screening tests.',
    formula: 'GA = (Today − LMP) ÷ 7 days\n1st Trimester: <13 weeks | 2nd: 13–27 weeks | 3rd: ≥28 weeks',
    inputs: [
      { key: 'lmp', label: 'Last Menstrual Period', type: 'date', vitalKey: 'lmp' },
    ],
    calculate({ lmp }) {
      if (!lmp) return null;
      const days = Math.floor((new Date() - new Date(lmp)) / 86400000);
      if (days < 0) return null;
      const weeks = Math.floor(days / 7); const rem = days % 7;
      const tri = weeks < 13 ? '1st Trimester' : weeks < 28 ? '2nd Trimester' : '3rd Trimester';
      return { value: `${weeks}w ${rem}d`, unit: '', label: tri, color: PURPLE };
    },
  },

  // ── PGE2 ─────────────────────────────────────────────────────────────────
  {
    id: 'PGE2', name: 'Progesterone/Estradiol Ratio', desc: 'P/E2 ratio for luteal phase',
    longDesc: 'The P/E2 ratio assesses the quality of the luteal phase in fertility evaluation and IVF cycles. A low ratio suggests luteal phase defect or inadequate progesterone support despite normal estradiol.',
    formula: 'P/E2 = Progesterone(ng/mL) / [Estradiol(pg/mL) ÷ 1000]\nRatio >100: adequate luteal phase | <100: possible luteal phase defect',
    inputs: [
      { key: 'prog',  label: 'Progesterone', unit: 'ng/mL', type: 'number' },
      { key: 'e2',    label: 'Estradiol',    unit: 'pg/mL', type: 'number' },
    ],
    calculate({ prog, e2 }) {
      if (!prog || !e2) return null;
      const ratio = (+prog / (+e2 / 1000)).toFixed(2); // convert E2 to ng/mL
      const interp2 = +ratio > 100 ? 'Adequate luteal phase' : 'Low (possible luteal defect)';
      return { value: ratio, unit: '', label: interp2, color: +ratio > 100 ? GREEN : AMBER };
    },
  },

  // ── COPD_CAT ─────────────────────────────────────────────────────────────
  {
    id: 'COPD_CAT', name: 'COPD - CAT', desc: 'COPD Assessment Test',
    longDesc: 'COPD Assessment Test (CAT) measures the impact of COPD on daily life and wellbeing. Used to classify patients as "less symptoms" (CAT<10) or "more symptoms" (CAT≥10) per GOLD 2023 guidelines.',
    formula: '8 items scored 0–5 (cough, phlegm, chest tightness, breathlessness, home activities, leaving home, sleep, energy)\n0–9: Low impact | 10–20: Medium | 21–30: High | 31–40: Very high',
    inputs: [
      { key: 'q1', label: 'Cough',            type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q2', label: 'Phlegm',           type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q3', label: 'Chest tightness',  type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q4', label: 'Breathless (uphill)',type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q5', label: 'Activity at home', type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q6', label: 'Leaving home',     type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q7', label: 'Sleep quality',    type: 'select', options: ['0','1','2','3','4','5'] },
      { key: 'q8', label: 'Energy level',     type: 'select', options: ['0','1','2','3','4','5'] },
    ],
    calculate(v) {
      const score = Object.values(v).reduce((s, x) => s + (parseInt(x)||0), 0);
      const sev = score < 10 ? 'Low impact' : score < 21 ? 'Medium impact' : score < 31 ? 'High impact' : 'Very high impact';
      return { value: String(score), unit: '/40', label: sev, color: score < 10 ? GREEN : score < 21 ? AMBER : RED };
    },
  },

  // ── CCI ──────────────────────────────────────────────────────────────────
  {
    id: 'CCI', name: 'CCI', desc: 'Charlson Comorbidity Index',
    longDesc: 'CCI predicts 10-year survival based on 17 comorbid conditions, each weighted by relative mortality risk. Widely used in research to adjust for comorbidity burden. An age-adjusted version adds 1 point per decade over 40.',
    formula: 'Weighted sum of 17 conditions (weights: 1, 2, 3, or 6)\n10-yr survival ≈ 0.983^exp(0.9 × CCI)\nScore 0: ~98% | 1–2: ~89% | 3–4: ~77% | ≥5: <21%',
    inputs: [
      { key: 'mi',      label: 'Myocardial infarction',       type: 'checkbox' },
      { key: 'chf',     label: 'CHF',                         type: 'checkbox' },
      { key: 'pvd',     label: 'Peripheral vascular disease', type: 'checkbox' },
      { key: 'cvd',     label: 'Cerebrovascular disease',     type: 'checkbox' },
      { key: 'dementia',label: 'Dementia',                    type: 'checkbox' },
      { key: 'copd',    label: 'COPD',                        type: 'checkbox' },
      { key: 'ctd',     label: 'Connective tissue disease',   type: 'checkbox' },
      { key: 'pud',     label: 'Peptic ulcer disease',        type: 'checkbox' },
      { key: 'liver_m', label: 'Mild liver disease',          type: 'checkbox' },
      { key: 'dm_nc',   label: 'DM without complications',    type: 'checkbox' },
      { key: 'dm_cc',   label: 'DM with end organ damage (×2)',type: 'checkbox' },
      { key: 'hemi',    label: 'Hemiplegia (×2)',              type: 'checkbox' },
      { key: 'renal',   label: 'Mod/severe renal disease (×2)',type: 'checkbox' },
      { key: 'cancer',  label: 'Solid tumour (×2)',            type: 'checkbox' },
      { key: 'liver_s', label: 'Mod/severe liver disease (×3)',type: 'checkbox' },
      { key: 'mets',    label: 'Metastatic tumour (×6)',       type: 'checkbox' },
      { key: 'aids',    label: 'AIDS (×6)',                    type: 'checkbox' },
    ],
    calculate(v) {
      const score = (v.mi?1:0)+(v.chf?1:0)+(v.pvd?1:0)+(v.cvd?1:0)+(v.dementia?1:0)+(v.copd?1:0)+(v.ctd?1:0)+(v.pud?1:0)+(v.liver_m?1:0)+(v.dm_nc?1:0)+(v.dm_cc?2:0)+(v.hemi?2:0)+(v.renal?2:0)+(v.cancer?2:0)+(v.liver_s?3:0)+(v.mets?6:0)+(v.aids?6:0);
      const surv10 = Math.round(0.983 ** Math.exp(0.9 * score) * 100);
      return { value: String(score), unit: 'pts', label: `10-yr survival ~${surv10}%`, color: score === 0 ? GREEN : score <= 2 ? AMBER : RED };
    },
  },

  // ── Q_RISK ───────────────────────────────────────────────────────────────
  {
    id: 'Q_RISK', name: 'QRISK3 (Simplified)', desc: 'Cardiovascular risk score',
    longDesc: 'QRISK3 is the UK\'s primary CVD risk algorithm, updated in 2017 to include additional risk factors. This is a simplified approximation — the full QRISK3 uses 20+ variables including ethnicity, deprivation, and comorbidities.',
    formula: 'Approximate: weighted combination of age, sex, SBP, cholesterol ratio, smoking, DM type, BP treatment, AFib\nFull QRISK3 available at qrisk.org',
    inputs: [
      { key: 'age',    label: 'Age',                   unit: 'yrs',   type: 'number' },
      { key: 'sex',    label: 'Sex',                   type: 'select', options: ['Male','Female'] },
      { key: 'sbp',    label: 'Systolic BP',           unit: 'mmHg',  type: 'number', vitalKey: 'bp_systolic' },
      { key: 'tchol',  label: 'Total / HDL ratio',     type: 'number' },
      { key: 'smoker', label: 'Smoker',                type: 'select', options: ['Non-smoker','Ex-smoker','Light (<10/day)','Moderate','Heavy (≥20/day)'] },
      { key: 'dm1',    label: 'Type 1 Diabetes',       type: 'checkbox' },
      { key: 'dm2',    label: 'Type 2 Diabetes',       type: 'checkbox' },
      { key: 'htn_tx', label: 'On BP treatment',       type: 'checkbox' },
      { key: 'af',     label: 'Atrial fibrillation',   type: 'checkbox' },
    ],
    calculate({ age, sex, sbp, tchol, smoker, dm1, dm2, htn_tx, af }) {
      if (!age || !sbp) return null;
      // Simplified approximation (not full QRISK3 which requires 20+ variables)
      const female = sex === 'Female';
      let score = 0;
      score += (+age - 40) * (female ? 0.3 : 0.4);
      score += (+sbp - 120) * 0.04;
      score += (tchol ? (+tchol - 4) * 0.8 : 0);
      const smokeAdd = smoker === 'Light (<10/day)' ? 1.5 : smoker === 'Moderate' ? 2.5 : smoker === 'Heavy (≥20/day)' ? 3.5 : smoker === 'Ex-smoker' ? 0.5 : 0;
      score += smokeAdd + (dm1?3:0) + (dm2?1.5:0) + (htn_tx?1.5:0) + (af?2:0);
      const risk = Math.max(0, Math.min(score, 100)).toFixed(1);
      const lev = +risk < 10 ? 'Low' : +risk < 20 ? 'Moderate' : 'High';
      return { value: risk, unit: '% (10-yr approx)', label: lev, color: +risk < 10 ? GREEN : +risk < 20 ? AMBER : RED };
    },
  },

  // ── REVEAL_TEST ──────────────────────────────────────────────────────────
  {
    id: 'REVEAL_TEST', name: 'REVEAL 2.0', desc: 'PAH risk calculator',
    longDesc: 'REVEAL 2.0 predicts 1-year survival in pulmonary arterial hypertension (PAH). It guides treatment decisions and timing of lung transplant referral. Developed from the REVEAL Registry of >2700 PAH patients.',
    formula: 'Score from: WHO FC, RVSP, BUN, SBP, HR, Male≥60, PAH subtype\nLow(≤6): >95% 1-yr survival | Average(7–8): ~90% | Mod-High(9): ~70% | High(≥10): <65%',
    inputs: [
      { key: 'who_fc',  label: 'WHO Functional Class', type: 'select', options: ['I','II','III','IV'] },
      { key: 'rvsp',    label: 'RVSP',                 unit: 'mmHg', type: 'number' },
      { key: 'bun',     label: 'BUN',                  unit: 'mg/dL',type: 'number' },
      { key: 'sbp',     label: 'Systolic BP',          unit: 'mmHg', type: 'number', vitalKey: 'bp_systolic' },
      { key: 'hr',      label: 'Heart Rate',           unit: 'bpm',  type: 'number', vitalKey: 'pulse' },
      { key: 'male',    label: 'Male ≥ 60 years',      type: 'checkbox' },
      { key: 'pah_type',label: 'PAH type',             type: 'select', options: ['CTD-PAH','POPH/HIV-PAH','IPAH/Familial'] },
    ],
    calculate({ who_fc, rvsp, bun, sbp, hr, male, pah_type }) {
      let score = 0;
      score += who_fc === 'I' ? -2 : who_fc === 'II' ? 0 : who_fc === 'III' ? 1 : 2;
      if (rvsp && +rvsp >= 40) score += 1;
      if (bun && +bun >= 22) score += 1;
      if (sbp && +sbp < 110) score += 1;
      if (hr && +hr >= 92) score += 1;
      if (male) score += 2;
      score += pah_type === 'CTD-PAH' ? 1 : pah_type === 'POPH/HIV-PAH' ? 0 : -2;
      score += 7; // baseline
      const risk = score <= 6 ? 'Low risk (>95% 1-yr survival)' : score <= 8 ? 'Average risk (~90%)' : score <= 9 ? 'Moderate-High (~70%)' : 'High risk (<65%)';
      return { value: String(score), unit: 'pts', label: risk, color: score <= 6 ? GREEN : score <= 8 ? AMBER : RED };
    },
  },
];

// ── Interpretation tables + how-to-use for remaining calculators ─────────────
const EXTRA = {
  QUICKI: {
    interpretation: [
      { range: '> 0.45',       gender: 'Any', category: 'NORMAL (healthy)',     color: GREEN },
      { range: '0.30 – 0.45',  gender: 'Any', category: 'INSULIN RESISTANT',    color: AMBER },
      { range: '< 0.30',       gender: 'Any', category: 'DIABETIC RANGE',       color: RED   },
    ],
    howToUse: '1. Obtain fasting glucose (mg/dL) and fasting insulin (μIU/mL) — both must be from the same fasting sample.\n2. Enter values and click Calculate.\n3. Higher QUICKI = better insulin sensitivity.\n\nNote: QUICKI is most useful to monitor response to lifestyle or pharmacological intervention in pre-diabetic patients.',
  },
  CHILD_PUGH: {
    interpretation: [
      { range: '5 – 6 pts',  gender: 'Any', category: 'CLASS A (compensated)',  color: GREEN },
      { range: '7 – 9 pts',  gender: 'Any', category: 'CLASS B',                color: AMBER },
      { range: '10 – 15 pts',gender: 'Any', category: 'CLASS C (decompensated)',color: RED   },
    ],
    howToUse: '1. Obtain bilirubin, albumin, and INR from recent labs.\n2. Assess ascites clinically (none/mild/moderate-severe).\n3. Assess hepatic encephalopathy grade clinically.\n4. Click Calculate.\n\nClass A: 1-year survival ~100%, 2-year ~85%\nClass B: 1-year ~80%, 2-year ~60%\nClass C: 1-year ~45%, 2-year ~35%',
  },
  MELD: {
    interpretation: [
      { range: '< 10',  gender: 'Any', category: '<10% 3-mo mortality', color: GREEN },
      { range: '10–19', gender: 'Any', category: '6% 3-mo mortality',   color: AMBER },
      { range: '20–29', gender: 'Any', category: '19.6% 3-mo mortality',color: AMBER },
      { range: '30–39', gender: 'Any', category: '52.6% 3-mo mortality',color: RED   },
      { range: '≥ 40',  gender: 'Any', category: '71.3% 3-mo mortality',color: RED   },
    ],
    howToUse: '1. Enter creatinine, bilirubin, and INR from recent labs.\n2. Enter sodium (optional) to calculate MELD-Na.\n3. Values are automatically capped: creatinine max 4, min 1; bilirubin min 1; INR min 1.\n4. Click Calculate.\n\nUsed by UNOS for liver transplant prioritization. Score recalculated every 7–30 days.',
  },
  GFR: {
    interpretation: [
      { range: '≥ 90',    gender: 'Any', category: 'G1 – NORMAL',           color: GREEN },
      { range: '60 – 89', gender: 'Any', category: 'G2 – MILD REDUCTION',   color: GREEN },
      { range: '45 – 59', gender: 'Any', category: 'G3a – MILD-MODERATE',   color: AMBER },
      { range: '30 – 44', gender: 'Any', category: 'G3b – MODERATE-SEVERE', color: AMBER },
      { range: '15 – 29', gender: 'Any', category: 'G4 – SEVERE',           color: RED   },
      { range: '< 15',    gender: 'Any', category: 'G5 – KIDNEY FAILURE',   color: RED   },
    ],
    howToUse: '1. Enter serum creatinine (mg/dL), age, and sex.\n2. Uses the 2021 CKD-EPI creatinine equation (race-free).\n3. CKD confirmed if eGFR <60 for >3 months.\n\nDrug dosing guidance:\n• <60: review renal drug dosing\n• <30: avoid NSAIDs, metformin, contrast\n• <15: dialysis consideration',
  },
  CRCL: {
    interpretation: [
      { range: '≥ 90',    gender: 'Any', category: 'NORMAL',              color: GREEN },
      { range: '60 – 89', gender: 'Any', category: 'MILDLY REDUCED',      color: GREEN },
      { range: '30 – 59', gender: 'Any', category: 'MODERATELY REDUCED',  color: AMBER },
      { range: '< 30',    gender: 'Any', category: 'SEVERELY REDUCED',    color: RED   },
    ],
    howToUse: '1. Enter serum creatinine, age, weight, and sex.\n2. Female multiplier (×0.85) is applied automatically.\n3. Use IDEAL body weight in obese patients.\n\nUsed for: antibiotic dosing (vancomycin, aminoglycosides), LMWH, DOACs, renally-cleared drugs.',
  },
  FIB_4: {
    interpretation: [
      { range: '< 1.30',       gender: 'Any', category: 'LOW RISK (F0–F1)',        color: GREEN },
      { range: '1.30 – 2.67',  gender: 'Any', category: 'INDETERMINATE',           color: AMBER },
      { range: '> 2.67',       gender: 'Any', category: 'HIGH RISK (F3–F4)',       color: RED   },
    ],
    howToUse: '1. Enter patient age, AST, ALT, and platelet count (×10⁹/L).\n2. Click Calculate.\n3. Low score (<1.30): no advanced fibrosis — no biopsy needed.\n4. High score (>2.67): advanced fibrosis likely — consider biopsy or elastography.\n5. Indeterminate: consider fibroscan or other testing.\n\nBest validated in NAFLD, HCV, and HIV/HCV co-infection.',
  },
  NAFLD: {
    interpretation: [
      { range: '< −1.455',      gender: 'Any', category: 'LOW RISK (<5% fibrosis)',   color: GREEN },
      { range: '−1.455 – 0.676',gender: 'Any', category: 'INDETERMINATE',             color: AMBER },
      { range: '> 0.676',       gender: 'Any', category: 'HIGH RISK (>5% fibrosis)',  color: RED   },
    ],
    howToUse: '1. Enter age, BMI, IFG/T2DM status, AST, ALT, platelet count, and albumin.\n2. IFG = impaired fasting glucose ≥100 mg/dL or known T2DM.\n3. Click Calculate.\n\nHigh score: refer to hepatology + consider biopsy or FibroScan.\nCombine with FIB-4 for best accuracy.',
  },
  GCS: {
    interpretation: [
      { range: '13 – 15', gender: 'Any', category: 'MILD',     color: GREEN },
      { range: '9 – 12',  gender: 'Any', category: 'MODERATE', color: AMBER },
      { range: '3 – 8',   gender: 'Any', category: 'SEVERE',   color: RED   },
    ],
    howToUse: '1. Assess Eye Opening (1–4), Verbal Response (1–5), Motor Response (1–6).\n2. Select the best response in each category.\n3. GCS ≤8: coma — consider intubation to protect airway.\n4. Document GCS trend over time, not just a single value.\n\nMinimum score = 3 (deep coma). Score <8 = intubation threshold.',
  },
  CHA2DS2_VASC: {
    interpretation: [
      { range: '0 (male)',   gender: 'Male',   category: 'LOW – No anticoagulation',      color: GREEN },
      { range: '1 (male)',   gender: 'Male',   category: 'LOW-MOD – Consider anticoag',   color: AMBER },
      { range: '≥2 (male)',  gender: 'Male',   category: 'HIGH – Anticoagulate',          color: RED   },
      { range: '1 (female)', gender: 'Female', category: 'LOW – No anticoagulation',      color: GREEN },
      { range: '2 (female)', gender: 'Female', category: 'LOW-MOD – Consider anticoag',   color: AMBER },
      { range: '≥3 (female)',gender: 'Female', category: 'HIGH – Anticoagulate',          color: RED   },
    ],
    howToUse: '1. Check each criterion applicable to the patient.\n2. Note: Age ≥75 scores 2 points; Prior stroke/TIA scores 2 points.\n3. Female sex adds 1 point but does not independently trigger anticoagulation.\n4. Annual stroke risk: score 0=0%, 1=1.3%, 2=2.2%, 3=3.2%, 4=4%, 5=6.7%.\n\nESC Guidelines: anticoagulate if score ≥1 (male) or ≥2 (female).',
  },
  HAS_BLED: {
    interpretation: [
      { range: '0 – 2', gender: 'Any', category: 'LOW bleeding risk',      color: GREEN },
      { range: '3 – 4', gender: 'Any', category: 'MODERATE bleeding risk', color: AMBER },
      { range: '≥ 5',   gender: 'Any', category: 'HIGH bleeding risk',     color: RED   },
    ],
    howToUse: '1. Check each applicable risk factor.\n2. A=Abnormal renal OR liver function = 1 point each (max 2).\n3. D=Drugs (antiplatelet/NSAIDs) OR alcohol = 1 point each (max 2).\n4. Click Calculate.\n\n⚠️ Score ≥3 does NOT mean stop anticoagulation — it means identify and correct modifiable risk factors (uncontrolled BP, labile INR, alcohol use).',
  },
  RCRI: {
    interpretation: [
      { range: '0',  gender: 'Any', category: '0.4% MACE risk', color: GREEN },
      { range: '1',  gender: 'Any', category: '1.0% MACE risk', color: GREEN },
      { range: '2',  gender: 'Any', category: '2.4% MACE risk', color: AMBER },
      { range: '≥3', gender: 'Any', category: '≥5.4% MACE risk',color: RED   },
    ],
    howToUse: '1. Assess all 6 criteria based on patient history and surgery type.\n2. High-risk surgery: suprainguinal vascular, intrathoracic, intraperitoneal.\n3. RCRI ≥3: consider cardiology referral or stress testing.\n\nMACE = Major Adverse Cardiac Events (MI, cardiac arrest, complete heart block).',
  },
  ABCD_TIA: {
    interpretation: [
      { range: '0 – 3', gender: 'Any', category: 'LOW RISK – 1% 2-day stroke',  color: GREEN },
      { range: '4 – 5', gender: 'Any', category: 'MOD RISK – 4% 2-day stroke',  color: AMBER },
      { range: '6 – 7', gender: 'Any', category: 'HIGH RISK – 8% 2-day stroke', color: RED   },
    ],
    howToUse: '1. Select clinical features observed during the TIA episode.\n2. Duration refers to how long the TIA symptoms lasted.\n3. Score ≥4: admit for urgent investigation and secondary prevention.\n\n2-day stroke risk: Score 1=0%, 3=1%, 5=4%, 6=8%, 7=10%.',
  },
  STOP_BANG: {
    interpretation: [
      { range: '0 – 2', gender: 'Any', category: 'LOW OSA risk',      color: GREEN },
      { range: '3 – 4', gender: 'Any', category: 'MODERATE OSA risk', color: AMBER },
      { range: '5 – 8', gender: 'Any', category: 'HIGH OSA risk',     color: RED   },
    ],
    howToUse: '1. Answer Yes/No for each of the 8 items.\n2. Score ≥3: consider polysomnography referral.\n3. For surgical patients: score ≥3 warrants pre-op OSA evaluation.\n\nHigh-risk criteria (for severe OSA):\n• STOP ≥2 + BMI>35, or STOP ≥2 + male, or STOP ≥2 + neck>40cm',
  },
  ESS: {
    interpretation: [
      { range: '0 – 7',   gender: 'Any', category: 'NORMAL alertness',     color: GREEN },
      { range: '8 – 10',  gender: 'Any', category: 'MILD sleepiness',      color: GREEN },
      { range: '11 – 16', gender: 'Any', category: 'MODERATE sleepiness',  color: AMBER },
      { range: '17 – 24', gender: 'Any', category: 'SEVERE sleepiness',    color: RED   },
    ],
    howToUse: '1. Ask patient to rate the chance of dozing in each of 8 situations (0=never, 3=high chance).\n2. Situations range from sitting reading to being a passenger in a car for an hour.\n3. Score >10: further evaluation for sleep disorders (OSA, narcolepsy).\n\nCombine with STOP-BANG for comprehensive OSA screening.',
  },
  IPSS: {
    interpretation: [
      { range: '0 – 7',   gender: 'Male', category: 'MILD LUTS',     color: GREEN },
      { range: '8 – 19',  gender: 'Male', category: 'MODERATE LUTS', color: AMBER },
      { range: '20 – 35', gender: 'Male', category: 'SEVERE LUTS',   color: RED   },
    ],
    howToUse: '1. Ask patient to answer 7 questions about urinary symptoms over the past month.\n2. Each question scored 0–5 (0=not at all, 5=almost always).\n3. Mild (0–7): watchful waiting.\n4. Moderate (8–19): alpha blocker ± 5-ARI.\n5. Severe (20–35): urology referral + consider surgery.\n\nAlso includes optional QoL question (0–6) not included in score.',
  },
  DASI: {
    interpretation: [
      { range: '< 14',   gender: 'Any', category: 'POOR (<4 METs)',     color: RED   },
      { range: '14 – 34',gender: 'Any', category: 'MODERATE (4–10 METs)',color: AMBER },
      { range: '> 34',   gender: 'Any', category: 'EXCELLENT (>10 METs)',color: GREEN },
    ],
    howToUse: '1. Ask patient if they can do each activity WITHOUT chest pain or dyspnea.\n2. Check all activities they can perform.\n3. VO₂ peak = 0.43 × DASI + 9.6 mL/kg/min.\n4. <4 METs: elevated perioperative cardiac risk.\n5. ≥4 METs: proceed to surgery without further cardiac testing (unless high-risk).',
  },
  VITAL_CAPACITY: {
    interpretation: [
      { range: '≥ 80% predicted', gender: 'Any', category: 'NORMAL',           color: GREEN },
      { range: '60–79% predicted', gender: 'Any', category: 'MILD restriction', color: AMBER },
      { range: '50–59% predicted', gender: 'Any', category: 'MODERATE',         color: AMBER },
      { range: '< 50% predicted',  gender: 'Any', category: 'SEVERE restriction',color: RED  },
    ],
    howToUse: '1. Enter height (cm), age, and sex to get the predicted FVC.\n2. Compare with spirometry result: FVC%predicted = measured/predicted × 100.\n3. Reduced FVC with normal FEV1/FVC ratio = restrictive pattern.\n\nUsed as reference value — actual measurement requires spirometry.',
  },
  BODE_INDEX: {
    interpretation: [
      { range: '0 – 2',  gender: 'Any', category: 'Q1 – ~15% 4-yr mortality', color: GREEN },
      { range: '3 – 4',  gender: 'Any', category: 'Q2 – ~30% 4-yr mortality', color: AMBER },
      { range: '5 – 6',  gender: 'Any', category: 'Q3 – ~64% 4-yr mortality', color: RED   },
      { range: '7 – 10', gender: 'Any', category: 'Q4 – ~82% 4-yr mortality', color: RED   },
    ],
    howToUse: '1. Enter BMI, FEV1% predicted (from spirometry), mMRC dyspnea grade, and 6-minute walk distance.\n2. mMRC 0=only strenuous exercise, 4=too breathless to leave house.\n3. Score >4: pulmonology referral; score >7: lung transplant evaluation.\n\nmMRC grades: 0=exercise, 1=hurrying, 2=own pace, 3=100m, 4=housebound.',
  },
  IV_FLOW_RATE: {
    interpretation: [
      { range: 'Any', gender: 'Any', category: 'CHECK against prescribed rate', color: BLUE },
    ],
    howToUse: '1. Enter total volume (mL) and infusion time (hours).\n2. Select drop factor from IV set packaging:\n   • 10 gtt/mL – standard blood sets\n   • 15 gtt/mL – standard IV sets\n   • 20 gtt/mL – most common macro sets\n   • 60 gtt/mL – micro/paediatric sets\n3. Result = drops per minute to count at drip chamber.\n4. Also shows mL/hr for pump programming.',
  },
  PEDIATRIC_DOSE: {
    interpretation: [
      { range: "Young's", gender: 'Any', category: 'Age-based approximation', color: BLUE   },
      { range: "Clark's", gender: 'Any', category: 'Weight-based (kg/70)',    color: BLUE   },
      { range: 'mg/kg',   gender: 'Any', category: 'Most accurate method',   color: GREEN  },
    ],
    howToUse: '1. Enter adult dose (mg) and child\'s age or weight.\n2. Weight-based (mg/kg): most accurate when child weight is known.\n3. Young\'s: use when only age is known (less accurate).\n4. Clark\'s: use weight in lbs/kg relative to 70kg adult.\n\n⚠️ Always verify against paediatric formulary. Maximum dose must not exceed adult dose.',
  },
  CVD_RISK: {
    interpretation: [
      { range: '< 7.5%',  gender: 'Any', category: 'LOW RISK',           color: GREEN },
      { range: '7.5–20%', gender: 'Any', category: 'INTERMEDIATE RISK',  color: AMBER },
      { range: '> 20%',   gender: 'Any', category: 'HIGH RISK',          color: RED   },
    ],
    howToUse: '1. Enter age, sex, total cholesterol, HDL, systolic BP.\n2. Check BP treatment, smoking, and diabetes status.\n3. Click Calculate.\n4. Low: lifestyle modification only.\n5. Intermediate: shared decision-making for statin therapy.\n6. High: statin + aspirin recommended.\n\nBased on Framingham Risk Score (Anderson 1991).',
  },
  LMP_EDD: {
    interpretation: [
      { range: '< 13 wks', gender: 'Any', category: '1st TRIMESTER',  color: PURPLE },
      { range: '13–27 wks',gender: 'Any', category: '2nd TRIMESTER',  color: BLUE   },
      { range: '≥ 28 wks', gender: 'Any', category: '3rd TRIMESTER',  color: GREEN  },
    ],
    howToUse: '1. Enter the first day of the last normal menstrual period (LMP).\n2. EDD is calculated by adding 280 days (Naegele\'s rule).\n3. Assumes regular 28-day cycles — may be inaccurate with irregular cycles.\n4. Confirm with first-trimester ultrasound for dating.\n\nGA displayed = current gestational age from today.',
  },
  US_EDD: {
    interpretation: [
      { range: 'CRL (1st tri)', gender: 'Any', category: '±5 days accuracy',    color: GREEN },
      { range: 'BPD (2nd tri)', gender: 'Any', category: '±10–14 days accuracy',color: AMBER },
      { range: 'BPD (3rd tri)', gender: 'Any', category: '±21–28 days accuracy',color: AMBER },
    ],
    howToUse: '1. Enter the date of the ultrasound.\n2. Enter gestational age in weeks and days as reported at that scan.\n3. Click Calculate to get the EDD adjusted for the ultrasound dating.\n\nFirst trimester USG is most accurate (CRL). USG EDD overrides LMP EDD when scan is done before 20 weeks.',
  },
  GESTATIONAL_AGE: {
    interpretation: [
      { range: '< 13 wks', gender: 'Any', category: '1st TRIMESTER',  color: PURPLE },
      { range: '13–27 wks',gender: 'Any', category: '2nd TRIMESTER',  color: BLUE   },
      { range: '≥ 28 wks', gender: 'Any', category: '3rd TRIMESTER',  color: GREEN  },
    ],
    howToUse: '1. Enter the first day of the last menstrual period.\n2. Gestational age is calculated from today\'s date.\n3. Term = 37–42 weeks. Preterm = <37 weeks.\n\nScheduled visits:\n• 1st trimester: 8–12 weeks (NT scan)\n• 2nd trimester: 18–20 weeks (anomaly scan)\n• 3rd trimester: 32, 36 weeks',
  },
  PGE2: {
    interpretation: [
      { range: '< 100',  gender: 'Any', category: 'LUTEAL PHASE DEFECT', color: RED   },
      { range: '≥ 100',  gender: 'Any', category: 'ADEQUATE LUTEAL PHASE',color: GREEN },
    ],
    howToUse: '1. Obtain mid-luteal phase progesterone (ng/mL) and estradiol (pg/mL) — typically day 21 of a 28-day cycle.\n2. Enter values and click Calculate.\n3. Ratio <100: consider progesterone supplementation.\n\nUsed in fertility evaluation and IVF cycle monitoring.',
  },
  COPD_CAT: {
    interpretation: [
      { range: '0 – 9',   gender: 'Any', category: 'LOW impact',       color: GREEN },
      { range: '10 – 20', gender: 'Any', category: 'MEDIUM impact',    color: AMBER },
      { range: '21 – 30', gender: 'Any', category: 'HIGH impact',      color: RED   },
      { range: '31 – 40', gender: 'Any', category: 'VERY HIGH impact', color: RED   },
    ],
    howToUse: '1. Ask patient to score each of 8 COPD symptoms on a scale of 0–5.\n2. 0 = no symptom, 5 = worst possible.\n3. CAT <10: "less symptoms" group (GOLD A/C).\n4. CAT ≥10: "more symptoms" group (GOLD B/D) — intensify treatment.\n\nAdminister at every clinic visit to track COPD control.',
  },
  CCI: {
    interpretation: [
      { range: '0',    gender: 'Any', category: '~98% 10-yr survival',  color: GREEN },
      { range: '1–2',  gender: 'Any', category: '~89% 10-yr survival',  color: GREEN },
      { range: '3–4',  gender: 'Any', category: '~77% 10-yr survival',  color: AMBER },
      { range: '≥ 5',  gender: 'Any', category: '<21% 10-yr survival',  color: RED   },
    ],
    howToUse: '1. Check all comorbid conditions present in the patient.\n2. Items marked (×2), (×3), or (×6) contribute more points.\n3. Score predicts 10-year survival probability.\n4. Age-adjusted CCI: add 1 point per decade over 50 years.\n\nWidely used in research to control for comorbidity burden. Useful for treatment decision-making.',
  },
  Q_RISK: {
    interpretation: [
      { range: '< 10%',  gender: 'Any', category: 'LOW CVD risk',           color: GREEN },
      { range: '10–20%', gender: 'Any', category: 'INTERMEDIATE CVD risk',  color: AMBER },
      { range: '> 20%',  gender: 'Any', category: 'HIGH CVD risk',          color: RED   },
    ],
    howToUse: '1. Enter age, sex, SBP, total cholesterol/HDL ratio.\n2. Select smoking status (each level increases risk).\n3. Check DM type, BP treatment, and AF.\n4. This is a simplified approximation — full QRISK3 requires 20+ variables.\n\nFor official QRISK3 calculation visit qrisk.org. Used by NICE (UK) guidelines.',
  },
  REVEAL_TEST: {
    interpretation: [
      { range: '≤ 6',  gender: 'Any', category: 'LOW – >95% 1-yr survival',    color: GREEN },
      { range: '7 – 8',gender: 'Any', category: 'AVERAGE – ~90% 1-yr survival', color: AMBER },
      { range: '9',    gender: 'Any', category: 'MOD-HIGH – ~70% 1-yr survival',color: RED   },
      { range: '≥ 10', gender: 'Any', category: 'HIGH – <65% 1-yr survival',    color: RED   },
    ],
    howToUse: '1. Enter WHO functional class, RVSP (from echo), BUN, SBP, and heart rate.\n2. Check if patient is male ≥60 years.\n3. Select PAH subtype: CTD-PAH (higher risk), IPAH/familial (lower risk).\n4. Click Calculate.\n\nHigher scores prompt escalation to combination therapy or transplant referral.',
  },
};

// Merge interpretation + howToUse into CALCULATORS
CALCULATORS.forEach(c => {
  if (EXTRA[c.id]) Object.assign(c, EXTRA[c.id]);
});

// ── Calculator config helpers ─────────────────────────────────────────────────
export function getCalcPrefs(clinicId) {
  try {
    const raw = localStorage.getItem(`calc_cfg_${clinicId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return []; // none enabled by default
}
export function saveCalcPrefs(clinicId, ids) {
  localStorage.setItem(`calc_cfg_${clinicId}`, JSON.stringify(ids));
}
