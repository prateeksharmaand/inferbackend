// Predefined scribe templates — stored in code, not DB.
// Each template's focus_prompt is injected into the Gemini SOAP extraction prompt.
// The "infercare" template (empty focus_prompt) preserves the default SOAP behavior.

const PREDEFINED_TEMPLATES = [
  {
    id: 'infercare',
    name: 'Infer care EMR Format',
    description: 'Standard structured SOAP format for InferPad — vitals, symptoms, diagnosis, medications, lab orders, lab results, examination findings, notes, referral, follow-up, advices, and procedures.',
    specialty: 'general',
    is_predefined: true,
    focus_prompt: '',
  },
  {
    id: 'general-checkup',
    name: 'General Health Check-Up',
    description: 'Preventive health visit — risk assessment, vaccination status, screening tests, lifestyle advice, and family history.',
    specialty: 'general',
    is_predefined: true,
    focus_prompt:
      'This is a routine health check-up visit. Focus on:\n' +
      '- Comprehensive vitals and anthropometric measurements (BMI, weight trend).\n' +
      '- Risk assessment: cardiac risk (Framingham factors), metabolic risk (glucose, lipids), cancer screening due.\n' +
      '- Vaccination history and any vaccinations due or administered.\n' +
      '- Screening tests ordered or reviewed (Pap smear, mammography, colonoscopy, eye exam, dental).\n' +
      '- Family history: hereditary conditions (diabetes, hypertension, CAD, cancers).\n' +
      '- Lifestyle: tobacco, alcohol, diet, physical activity level.\n' +
      '- Preventive advice and next steps. Populate "advices" with all preventive recommendations.\n' +
      '- Even if there is no chief complaint, capture all prevention-related discussion.\n',
  },
  {
    id: 'gp-opd',
    name: 'General Physician OPD',
    description: 'Full GP outpatient consultation — multi-system review, SOCRATES pain, fever assessment, pertinent negatives, comorbidity screening.',
    specialty: 'general',
    is_predefined: true,
    focus_prompt:
      'This is a General Physician OPD consultation. Apply these rules:\n' +
      '- Capture both positive findings AND pertinent negatives across systems (e.g., "no chest pain", "denies diabetes").\n' +
      '- For fever: temperature (°F/°C), duration, pattern (continuous/intermittent/remittent), chills/rigors, rash.\n' +
      '- For pain: apply SOCRATES — site, onset, character (dull/sharp/burning/colicky), radiation, associated symptoms, timing, exacerbating/relieving factors, severity 0–10.\n' +
      '- Screen for common Indian GP comorbidities: hypertension, diabetes mellitus, hypothyroidism, asthma/COPD. Capture even if negative.\n' +
      '- Multi-system review: cardiovascular, respiratory, GI, genitourinary, neurological, musculoskeletal, ENT, skin.\n' +
      '- Capture OTC drugs, self-medication, Ayurvedic/herbal remedies in addition to prescriptions.\n' +
      '- For follow-up visits: document treatment response, medication compliance, and new complaints since last visit.\n' +
      '- Use third-person clinical language. Write from the doctor\'s perspective.\n',
  },
  {
    id: 'cardiology',
    name: 'Cardiology Consultation',
    description: 'Cardiac OPD — chest pain (SOCRATES), dyspnoea, ECG findings, echo results, cardiac risk factors, and cardiac medications.',
    specialty: 'cardiology',
    is_predefined: true,
    focus_prompt:
      'This is a cardiology consultation. Focus on:\n' +
      '- Chest pain: character (typical/atypical/pleuritic), radiation (left arm, jaw, back), exertional or rest, duration, relieving factors (nitrates, rest).\n' +
      '- Dyspnoea: NYHA class, orthopnoea, PND, ankle oedema.\n' +
      '- Palpitations: onset, duration, regular/irregular, associated dizziness/syncope.\n' +
      '- Cardiac risk factors: hypertension, diabetes, dyslipidaemia, smoking, family history of premature CAD.\n' +
      '- ECG findings: rhythm, rate, ST changes, Q waves, bundle branch block — exactly as stated.\n' +
      '- Echocardiogram: ejection fraction, wall motion abnormalities, valvular disease — exactly as stated.\n' +
      '- Cardiac biomarkers: troponin, BNP/NT-proBNP — capture values precisely.\n' +
      '- Medications: record cardiac drugs exactly (beta blockers, ACE inhibitors/ARBs, statins, antiplatelets, anticoagulants, nitrates) with dose and frequency.\n' +
      '- Procedures: angiography findings, stent details, pacemaker, ablation — as stated.\n',
  },
  {
    id: 'dermatology',
    name: 'Dermatology Consultation',
    description: 'Skin OPD — lesion morphology, distribution, duration, triggers, topical medications, and systemic associations.',
    specialty: 'dermatology',
    is_predefined: true,
    focus_prompt:
      'This is a dermatology consultation. Focus on:\n' +
      '- Lesion description: primary type (macule/papule/plaque/vesicle/pustule/nodule), secondary changes (scale/crust/ulceration), size, color, border, surface texture.\n' +
      '- Distribution: localized or generalized, body areas affected, symmetry, acral/flexural/extensor.\n' +
      '- Duration, onset, progression (improving/worsening/stable), triggers (sunlight, stress, diet, contact).\n' +
      '- Itch severity (0–10 scale), burning, pain.\n' +
      '- Previous treatments tried and response (topical steroids, antifungals, antihistamines).\n' +
      '- Systemic associations: diabetes (candidiasis, acanthosis), thyroid (hair loss), autoimmune (psoriatic arthritis).\n' +
      '- Topical medications prescribed: name, potency (for steroids), application frequency, duration, area.\n' +
      '- Biopsy or patch test results if reviewed.\n' +
      '- Capture in "examination_findings": morphology, distribution, and all skin findings in detail.\n',
  },
  {
    id: 'orthopedics',
    name: 'Orthopedics & Musculoskeletal',
    description: 'Ortho OPD — injury mechanism, joint/bone examination, X-ray/MRI findings, physiotherapy, cast/splint, activity restrictions.',
    specialty: 'orthopedics',
    is_predefined: true,
    focus_prompt:
      'This is an orthopedics / musculoskeletal consultation. Focus on:\n' +
      '- Injury/onset: mechanism (trauma/overuse/spontaneous), exact date, progression.\n' +
      '- Site: specific joint, bone, or spinal level (e.g., right knee, L4-L5, left shoulder).\n' +
      '- Swelling, tenderness (location), deformity, crepitus, instability.\n' +
      '- Range of motion: restricted movements, active vs. passive.\n' +
      '- Neurological symptoms: tingling, numbness, weakness, bowel/bladder dysfunction (for spine).\n' +
      '- Imaging findings: X-ray, MRI, CT findings exactly as stated (fracture type, displacement, disc herniation level, ligament tear).\n' +
      '- Interventions: cast/splint/brace applied (material, duration), physiotherapy instructions, weight-bearing status.\n' +
      '- Medications: NSAIDs, analgesics, muscle relaxants, calcium + vitamin D (with dose).\n' +
      '- Surgery planned or done: procedure name, implants used, post-op instructions.\n',
  },
  {
    id: 'pediatrics',
    name: 'Pediatrics Consultation',
    description: 'Paediatric OPD — child age (years/months), growth, milestones, immunization, guardian concerns, weight-adjusted dosing.',
    specialty: 'pediatrics',
    is_predefined: true,
    focus_prompt:
      'This is a paediatric consultation. Focus on:\n' +
      '- Age precisely: years and months for children under 5 (e.g., "2 years 4 months").\n' +
      '- Growth parameters: weight (kg), height (cm), head circumference if < 2 years — note percentile if mentioned.\n' +
      '- Developmental milestones: motor, speech, social — any delays mentioned.\n' +
      '- Immunization: vaccines due or administered at this visit; vaccination history gaps.\n' +
      '- Feeding: breastfed, formula, weaning foods — for infants and toddlers.\n' +
      '- Birth history if relevant: gestational age, birth weight, NICU stay.\n' +
      '- Guardian\'s concern: capture the parent/guardian\'s exact concern in chief_complaint.\n' +
      '- Medications: dose by weight (mg/kg) if stated. Do not calculate — capture only as stated.\n' +
      '- Fever: duration, temperature, febrile seizure history, rash.\n' +
      '- Vitamin/supplement supplementation (D3, iron, zinc) in medications section.\n',
  },
  {
    id: 'gynecology',
    name: 'Gynecology & Obstetrics',
    description: 'Gynaecology/OB consultation — LMP, menstrual history, gravida/para, antenatal findings, ultrasound, pelvic examination.',
    specialty: 'gynecology',
    is_predefined: true,
    focus_prompt:
      'This is a gynecology or obstetrics consultation. Focus on:\n' +
      '- LMP date (if stated), cycle regularity, duration, flow (heavy/light/normal), dysmenorrhoea.\n' +
      '- Obstetric history: gravida, para, abortions; current gestational age if pregnant.\n' +
      '- For antenatal: gestational age (weeks), fetal movements, fetal heart rate, fundal height.\n' +
      '- Ultrasound findings: fetal biometry, placenta location, liquor volume — exactly as stated.\n' +
      '- Gynaecological symptoms: discharge (color, odor, amount), intermenstrual/post-coital bleeding, pelvic pain.\n' +
      '- Pelvic examination: uterine size/position, adnexal tenderness, cervical os — exactly as stated.\n' +
      '- Contraceptive history: current method, duration, side effects.\n' +
      '- Hormonal investigations: FSH, LH, estradiol, progesterone, AMH — values as stated.\n' +
      '- Medications: hormonal therapy, supplements (folic acid, iron), tocolytics — with dose.\n' +
      '- Pap smear / HPV test result if reviewed.\n',
  },
  {
    id: 'neurology',
    name: 'Neurology Consultation',
    description: 'Neurology OPD — seizure characterization, headache criteria, stroke symptoms, neurological examination, EEG/MRI findings.',
    specialty: 'neurology',
    is_predefined: true,
    focus_prompt:
      'This is a neurology consultation. Focus on:\n' +
      '- Seizures: type (focal/generalized/absence/tonic-clonic), duration, frequency, postictal state, triggers, anticonvulsant compliance.\n' +
      '- Headache: ICHD-3 criteria — laterality, pulsating quality, severity, nausea/vomiting, photo/phonophobia, duration, aura.\n' +
      '- Stroke/TIA: FAST symptoms (face/arm/speech/time), onset, duration, resolution.\n' +
      '- Neurological examination: GCS, cranial nerve deficits, motor power (0–5), sensory deficits, deep tendon reflexes, cerebellar signs, gait.\n' +
      '- EEG findings: focus, generalization, epileptiform discharges — exactly as stated.\n' +
      '- MRI brain findings: lesion location, size, signal characteristics — exactly as stated.\n' +
      '- Anticonvulsant drugs: dose, level (serum drug level if measured), compliance, side effects.\n' +
      '- Cognitive assessment: MMSE/MoCA score if mentioned.\n' +
      '- Movement disorders: tremor character (resting/intention/postural), rigidity, bradykinesia.\n',
  },
  {
    id: 'psychiatry',
    name: 'Psychiatry & Mental Health',
    description: 'Psychiatry OPD — mood assessment, sleep, appetite, psychotic symptoms, medication compliance, psychosocial history.',
    specialty: 'psychiatry',
    is_predefined: true,
    focus_prompt:
      'This is a psychiatry / mental health consultation. Focus on:\n' +
      '- Mood: depressed/elevated/euthymic; PHQ-9 / GAD-7 / BPRS score if stated.\n' +
      '- Cognitive: concentration, memory, orientation, insight, judgement.\n' +
      '- Sleep: onset latency, duration, quality, early morning awakening, hypersomnia.\n' +
      '- Appetite: increased/decreased, weight change.\n' +
      '- Psychotic symptoms: auditory/visual hallucinations, delusions (type), thought disorder — exactly as described.\n' +
      '- Suicidal ideation: passive/active, plan, intent — only if explicitly mentioned.\n' +
      '- Self-harm: current or history — only if stated.\n' +
      '- Psychosocial: stressors (work/family/financial), relationship status, occupational function.\n' +
      '- Medication compliance: drug name, dose, compliance status, side effects.\n' +
      '- Therapy: CBT, counseling, DBT — type and frequency if stated.\n' +
      '- Substance use: alcohol, cannabis, other substances if discussed.\n' +
      '- Always use clinical, third-person, non-judgmental language.\n',
  },
  {
    id: 'ophthalmology',
    name: 'Ophthalmology Consultation',
    description: 'Eye OPD — visual acuity, IOP, fundus findings, slit lamp, spectacle prescription, and eye drop medications.',
    specialty: 'ophthalmology',
    is_predefined: true,
    focus_prompt:
      'This is an ophthalmology consultation. Focus on:\n' +
      '- Visual acuity: right eye (RE), left eye (LE), both eyes (BE) — corrected and uncorrected separately.\n' +
      '- Intraocular pressure: RE and LE values (mmHg) — instrument used if stated.\n' +
      '- Slit lamp findings: cornea, anterior chamber (depth/cells/flare), iris, lens (clear/cataract grade).\n' +
      '- Fundus examination: disc (cup-disc ratio, pallor), macula (foveal reflex), vessels (A/V ratio), periphery.\n' +
      '- Visual field: defects, pattern — exactly as stated.\n' +
      '- Red eye: discharge (type/amount), photophobia, pain, vision change, corneal staining.\n' +
      '- Spectacle or contact lens prescription change: sphere, cylinder, axis — if stated.\n' +
      '- Eye drop medications: name, concentration, instillation frequency, eye (RE/LE/BE).\n' +
      '- Diabetic retinopathy grade / glaucoma staging if mentioned.\n' +
      '- Surgical history: LASIK, cataract surgery, trabeculectomy — date and eye.\n',
  },
  {
    id: 'ent',
    name: 'ENT Consultation',
    description: 'ENT OPD — ear, nose, throat findings, audiogram results, hearing loss grade, vertigo, and ENT procedures.',
    specialty: 'ent',
    is_predefined: true,
    focus_prompt:
      'This is an ENT (Ear, Nose, Throat) consultation. Focus on:\n' +
      '- Ear: laterality, pain, discharge (character/color/amount/odor), hearing loss grade, tinnitus (pitch/intensity), vertigo (duration/triggers/Hallpike result).\n' +
      '- Audiogram: PTA average (dB), type of loss (conductive/sensorineural/mixed), laterality — exactly as stated.\n' +
      '- Throat: dysphagia (solids/liquids), odynophagia, hoarseness, snoring, tonsil grade (1–4), uvula, post-nasal drip.\n' +
      '- Nose: side of obstruction, discharge (character, color), epistaxis (frequency, site, amount), anosmia.\n' +
      '- Nasal endoscopy / laryngoscopy findings: exactly as stated.\n' +
      '- Sinus tenderness: maxillary/frontal/ethmoidal.\n' +
      '- ENT procedures: myringotomy, FESS, tonsillectomy, septoplasty — date and outcome if mentioned.\n' +
      '- Medications: decongestants, nasal steroids, ear drops (name + concentration + frequency).\n',
  },
  {
    id: 'endocrinology',
    name: 'Endocrinology & Diabetes',
    description: 'Endocrinology OPD — HbA1c, glucose trends, thyroid function, insulin regimen, hypoglycemia episodes, foot exam.',
    specialty: 'endocrinology',
    is_predefined: true,
    focus_prompt:
      'This is an endocrinology / diabetes consultation. Focus on:\n' +
      '- Diabetes: HbA1c value, fasting and post-prandial glucose readings, SMBG frequency, hypoglycemic episodes (frequency/severity/timing).\n' +
      '- Complications screening: diabetic retinopathy status, nephropathy (creatinine, proteinuria), neuropathy (symptoms), foot examination (ulcer, neuropathy signs) — as stated.\n' +
      '- Thyroid: TSH, FT3, FT4 values, symptoms (heat/cold intolerance, weight change, palpitations), goiter size, thyroid nodule findings.\n' +
      '- Lipid profile: total cholesterol, LDL, HDL, triglycerides — values and targets.\n' +
      '- Insulin regimen: type (basal/bolus/premix), brand, dose (units), timing, injection site rotation.\n' +
      '- Oral antidiabetics: drug name, dose, timing — do NOT infer or substitute.\n' +
      '- Weight trend: current weight, target, dietary compliance.\n' +
      '- Adrenal: cortisol, ACTH, aldosterone values if mentioned.\n' +
      '- Bone mineral density (DEXA scan) if mentioned.\n',
  },
  {
    id: 'pulmonology',
    name: 'Pulmonology / Respiratory',
    description: 'Respiratory OPD — spirometry, inhaler technique, peak flow, asthma/COPD staging, exacerbation history, oxygen use.',
    specialty: 'pulmonology',
    is_predefined: true,
    focus_prompt:
      'This is a pulmonology / respiratory consultation. Focus on:\n' +
      '- Spirometry: FEV1 (%), FVC (%), FEV1/FVC ratio, GOLD COPD grade — exactly as stated.\n' +
      '- Peak flow meter readings: current and personal best — if stated.\n' +
      '- Asthma: GINA step, frequency of symptoms and nocturnal wakening, rescue inhaler use per week, trigger factors.\n' +
      '- COPD: GOLD grade, CAT score/mMRC dyspnoea grade if mentioned, exacerbation frequency (past 12 months).\n' +
      '- Exacerbation: duration, severity, hospital admissions, oral steroid use.\n' +
      '- Cough: dry or productive, sputum color/amount/haemoptysis.\n' +
      '- Oxygen: home oxygen use (flow rate, hours/day), SpO2 on room air vs. supplemental O2.\n' +
      '- Inhalers prescribed: device type (MDI/DPI/nebulizer), drug name, dose, frequency — distinguish controller vs. rescue.\n' +
      '- Chest X-ray / HRCT findings: exactly as stated.\n' +
      '- Smoking history: current/ex, pack-years if mentioned.\n',
  },
  {
    id: 'gastroenterology',
    name: 'Gastroenterology Consultation',
    description: 'GI OPD — GERD, peptic ulcer, IBS, liver disease, endoscopy/colonoscopy findings, LFT values, PPI therapy.',
    specialty: 'gastroenterology',
    is_predefined: true,
    focus_prompt:
      'This is a gastroenterology consultation. Focus on:\n' +
      '- Upper GI: heartburn, regurgitation, dysphagia (solids/liquids), early satiety, nausea, vomiting, haematemesis, melena.\n' +
      '- Lower GI: altered bowel habits (constipation/diarrhoea/alternating), blood in stool, mucus, tenesmus, rectal pain.\n' +
      '- Liver: jaundice (progression), pruritus, ascites, encephalopathy, haematemesis from varices.\n' +
      '- LFT values: ALT, AST, bilirubin (total/direct), albumin, PT/INR — exactly as stated.\n' +
      '- Endoscopy findings: oesophagitis grade, Barrett\'s, H. pylori status, ulcer location/size, varices grade — exactly as stated.\n' +
      '- Colonoscopy findings: polyps (number/size/type/location), IBD extent, diverticula — exactly as stated.\n' +
      '- Stool examination results if reviewed.\n' +
      '- Medications: PPI name and dose, antacids, prokinetics, antispasmodics, laxatives, probiotics — as stated.\n' +
      '- Alcohol history: quantity, frequency, duration.\n' +
      '- USG abdomen findings: liver size/echo, spleen, gallbladder, pancreas, ascites — as stated.\n',
  },
  {
    id: 'nephrology',
    name: 'Nephrology Consultation',
    description: 'Nephrology OPD — CKD staging, creatinine/eGFR trend, proteinuria, electrolytes, dialysis, dietary restrictions.',
    specialty: 'nephrology',
    is_predefined: true,
    focus_prompt:
      'This is a nephrology consultation. Focus on:\n' +
      '- Renal function: serum creatinine, BUN, eGFR (CKD stage 1–5) — current and trend if mentioned.\n' +
      '- Urine: proteinuria (24-hour or spot urine protein:creatinine ratio), haematuria (RBC casts), urine routine findings.\n' +
      '- Electrolytes: potassium, sodium, bicarbonate, calcium, phosphorus — capture all values stated.\n' +
      '- Fluid status: oedema (grading/distribution), blood pressure targets, fluid intake/output if mentioned.\n' +
      '- Dialysis: type (haemodialysis/peritoneal), frequency (e.g., 3×/week), access (fistula/catheter), adequacy (Kt/V if stated).\n' +
      '- Anaemia of CKD: haemoglobin, EPO/erythropoietin dose, iron parameters.\n' +
      '- Medications: list antihypertensives, diuretics, phosphate binders, EPO, sodium bicarbonate — dose and frequency.\n' +
      '- Dietary restrictions: protein restriction (g/day), potassium restriction, phosphorus restriction — as stated.\n' +
      '- Nephrotoxic drug avoidance: NSAIDs, contrast — note if discussed.\n' +
      '- Renal biopsy findings if reviewed.\n',
  },
  {
    id: 'emergency',
    name: 'Emergency / Acute Care',
    description: 'Emergency consultation — triage severity, onset time, resuscitation, investigations, disposition (admit/discharge/transfer).',
    specialty: 'general',
    is_predefined: true,
    focus_prompt:
      'This is an emergency / acute care consultation. Focus on:\n' +
      '- Presenting complaint: exact time of onset, mode of arrival, triage severity (P1/P2/P3 or red/yellow/green) if stated.\n' +
      '- Vital signs at presentation: BP, HR, RR, SpO2, GCS, temperature — and trend (improving/deteriorating).\n' +
      '- Pain: severity 0–10, exact location, radiation, duration, rapid onset/gradual.\n' +
      '- Emergency investigations: ECG findings, troponin, D-dimer, CBC, ABG (pH/pO2/pCO2/HCO3), lactate, sugar — all values.\n' +
      '- Resuscitation given: IV fluid type and volume, oxygen delivery (mask/NRM/intubation), emergency medications (adrenaline, atropine, anticonvulsant) — dose and route.\n' +
      '- Procedures performed: IV access, urinary catheter, nebulization, chest tube, ECG cardioversion — exactly as stated.\n' +
      '- Working diagnosis at presentation vs. final diagnosis.\n' +
      '- Disposition: admitted to ward/ICU, observed and discharged, transferred (facility name) — capture clearly.\n' +
      '- Allergies: document any stated drug allergies immediately.\n',
  },
  {
    id: 'oncology',
    name: 'Oncology / Palliative Care',
    description: 'Oncology OPD — cancer diagnosis/staging, chemotherapy regimen, ECOG status, toxicity assessment, supportive care.',
    specialty: 'general',
    is_predefined: true,
    focus_prompt:
      'This is an oncology or palliative care consultation. Focus on:\n' +
      '- Cancer diagnosis: primary site, histological type, grade, and staging (TNM/FIGO/Ann Arbor) — exactly as stated.\n' +
      '- Treatment history: surgery (procedure, date, margins), radiotherapy (dose/fractions/site), prior chemotherapy regimens (drug names, cycles completed, response).\n' +
      '- Current chemotherapy/targeted/immunotherapy: regimen name, cycle number/day, dose, route, schedule.\n' +
      '- ECOG/Karnofsky performance status if stated.\n' +
      '- Toxicity assessment: haematological (neutropenia grade, anaemia, thrombocytopenia), GI (nausea/vomiting grade, mucositis), neuropathy, fatigue — CTCAE grade if stated.\n' +
      '- Tumour markers: CEA, CA-125, PSA, AFP, LDH, beta-HCG — values and trend.\n' +
      '- Imaging review: CT/PET scan findings, response (CR/PR/SD/PD) — exactly as stated.\n' +
      '- Palliative care: pain score (0–10), opioid dose and frequency, constipation management, psychological support.\n' +
      '- Supportive medications: antiemetics, G-CSF, bisphosphonates, steroids — dose as stated.\n',
  },
];

// Build a lookup map for O(1) access by id
const TEMPLATE_MAP = Object.fromEntries(PREDEFINED_TEMPLATES.map(t => [t.id, t]));

function getPredefinedTemplates() {
  return PREDEFINED_TEMPLATES;
}

function getPredefinedTemplate(id) {
  return TEMPLATE_MAP[id] || null;
}

module.exports = { getPredefinedTemplates, getPredefinedTemplate };
