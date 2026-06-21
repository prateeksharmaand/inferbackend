/**
 * Specialty-specific quick-add suggestions for InferPad sections.
 * Keyed by template specialty (lowercase, matches scribe_templates.specialty).
 */

const SUGGESTIONS = {
  endocrinology: {
    symptoms:       ['Polyuria', 'Polydipsia', 'Polyphagia', 'Fatigue', 'Blurred Vision', 'Weight Loss', 'Slow Healing Wounds', 'Numbness in Feet', 'Tingling', 'Excessive Sweating'],
    diagnoses:      ['Type 2 Diabetes Mellitus', 'Type 1 Diabetes Mellitus', 'Diabetic Neuropathy', 'Diabetic Nephropathy', 'Diabetic Retinopathy', 'Hypothyroidism', 'Hyperthyroidism', 'Metabolic Syndrome'],
    investigations: ['HbA1c', 'Fasting Blood Sugar', 'Post Prandial Blood Sugar', 'Lipid Profile', 'Kidney Function Test', 'Urine Microalbumin', 'TSH', 'T3 T4', 'Urine Routine'],
  },
  cardiology: {
    symptoms:       ['Chest Pain', 'Palpitations', 'Shortness of Breath', 'Dizziness', 'Syncope', 'Leg Swelling', 'Orthopnoea', 'Cyanosis', 'Fatigue on Exertion'],
    diagnoses:      ['Hypertension', 'Coronary Artery Disease', 'Heart Failure', 'Atrial Fibrillation', 'Angina Pectoris', 'Myocardial Infarction', 'Mitral Valve Disease'],
    investigations: ['ECG', '2D Echocardiography', 'Stress Test', 'Lipid Profile', 'CBC', 'Serum Troponin', 'BNP / NT-proBNP', 'Holter Monitor'],
  },
  pulmonology: {
    symptoms:       ['Cough', 'Breathlessness', 'Wheezing', 'Chest Tightness', 'Haemoptysis', 'Sputum Production', 'Fever', 'Night Sweats', 'Weight Loss'],
    diagnoses:      ['Asthma', 'COPD', 'Pneumonia', 'Pleural Effusion', 'Pulmonary Tuberculosis', 'Interstitial Lung Disease', 'Bronchiectasis'],
    investigations: ['Spirometry', 'Chest X-Ray', 'HRCT Chest', 'Sputum Culture', 'ABG', 'Peak Flow Rate', 'Sputum AFB', 'CBNAAT'],
  },
  gastroenterology: {
    symptoms:       ['Abdominal Pain', 'Nausea', 'Vomiting', 'Diarrhoea', 'Constipation', 'Bloating', 'Heartburn', 'Blood in Stool', 'Loss of Appetite', 'Jaundice'],
    diagnoses:      ['GERD', 'Peptic Ulcer Disease', 'IBS', 'IBD', 'Hepatitis', 'Liver Cirrhosis', 'Pancreatitis', 'Cholecystitis'],
    investigations: ['LFT', 'Liver USG', 'H. Pylori Test', 'Stool Routine', 'Colonoscopy', 'Upper GI Endoscopy', 'Serum Amylase', 'Serum Lipase', 'HBsAg', 'Anti-HCV'],
  },
  nephrology: {
    symptoms:       ['Swelling of Legs', 'Facial Puffiness', 'Decreased Urine Output', 'Frothy Urine', 'Blood in Urine', 'Hypertension', 'Fatigue', 'Nausea'],
    diagnoses:      ['Chronic Kidney Disease', 'Acute Kidney Injury', 'Nephrotic Syndrome', 'Nephritic Syndrome', 'Diabetic Nephropathy', 'PCKD'],
    investigations: ['Kidney Function Test', 'Urine Routine & Microscopy', 'Urine Protein Creatinine Ratio', 'USG Abdomen', 'eGFR', '24hr Urine Protein', 'CBC', 'Serum Electrolytes'],
  },
  neurology: {
    symptoms:       ['Headache', 'Dizziness', 'Seizures', 'Weakness', 'Numbness', 'Memory Loss', 'Tremors', 'Speech Difficulty', 'Vision Problems', 'Loss of Balance'],
    diagnoses:      ['Migraine', 'Epilepsy', 'Cerebrovascular Accident', 'Parkinson\'s Disease', 'Multiple Sclerosis', 'Neuropathy', 'Dementia'],
    investigations: ['MRI Brain', 'CT Scan Brain', 'EEG', 'Nerve Conduction Study', 'Lumbar Puncture', 'CBC', 'Blood Sugar', 'Thyroid Profile'],
  },
  orthopedics: {
    symptoms:       ['Joint Pain', 'Back Pain', 'Swelling', 'Stiffness', 'Limited Range of Motion', 'Muscle Weakness', 'Tenderness', 'Locking of Joint', 'Gait Abnormality'],
    diagnoses:      ['Osteoarthritis', 'Rheumatoid Arthritis', 'Intervertebral Disc Disease', 'Fracture', 'Ligament Tear', 'Tendinitis', 'Gout'],
    investigations: ['X-Ray', 'MRI', 'Bone Density Scan', 'Uric Acid', 'CRP', 'ESR', 'RA Factor', 'Anti-CCP'],
  },
  gynecology: {
    symptoms:       ['Menstrual Irregularity', 'Pelvic Pain', 'Vaginal Discharge', 'Dysmenorrhoea', 'Amenorrhoea', 'Infertility', 'Bleeding PV', 'Breast Lump', 'Hot Flushes'],
    diagnoses:      ['PCOS', 'Endometriosis', 'Uterine Fibroids', 'Ovarian Cyst', 'Cervical Erosion', 'PID', 'Menopause', 'Preeclampsia'],
    investigations: ['Pap Smear', 'Pelvic USG', 'Hormonal Profile (LH/FSH/PRL)', 'Beta HCG', 'CBC', 'Thyroid Profile', 'HVS Culture', 'Mammogram'],
  },
  pediatrics: {
    symptoms:       ['Fever', 'Cough', 'Runny Nose', 'Vomiting', 'Diarrhoea', 'Rash', 'Poor Feeding', 'Ear Pain', 'Crying', 'Weight Loss'],
    diagnoses:      ['Viral URTI', 'Bronchiolitis', 'Acute Otitis Media', 'Febrile Seizure', 'Malnutrition', 'Iron Deficiency Anaemia', 'Allergic Rhinitis', 'Eczema'],
    investigations: ['CBC', 'CRP', 'Blood Culture', 'Urine Routine', 'Chest X-Ray', 'Throat Swab', 'Dengue NS1/IgM', 'Malaria Antigen Test'],
  },
  dermatology: {
    symptoms:       ['Rash', 'Itching', 'Dryness', 'Scaling', 'Redness', 'Hair Loss', 'Pigmentation', 'Acne', 'Lesion', 'Burning Sensation'],
    diagnoses:      ['Eczema', 'Psoriasis', 'Urticaria', 'Acne Vulgaris', 'Tinea Infection', 'Vitiligo', 'Seborrhoea', 'Contact Dermatitis'],
    investigations: ['Skin Biopsy', 'KOH Mount', 'Patch Test', 'Fungal Culture', 'IgE Levels', 'ANA', 'CBC', 'Blood Sugar'],
  },
  ophthalmology: {
    symptoms:       ['Blurred Vision', 'Eye Pain', 'Redness', 'Watering', 'Discharge', 'Photophobia', 'Double Vision', 'Floaters', 'Flashes', 'Reduced Night Vision'],
    diagnoses:      ['Conjunctivitis', 'Glaucoma', 'Cataract', 'Diabetic Retinopathy', 'Refractive Error', 'Dry Eye Syndrome', 'Uveitis', 'Age-Related Macular Degeneration'],
    investigations: ['Visual Acuity Test', 'Tonometry', 'Fundoscopy', 'Slit Lamp Exam', 'OCT Retina', 'Perimetry', 'B-Scan USG', 'Corneal Topography'],
  },
  ent: {
    symptoms:       ['Ear Pain', 'Hearing Loss', 'Tinnitus', 'Ear Discharge', 'Nasal Obstruction', 'Nasal Discharge', 'Sneezing', 'Sore Throat', 'Hoarseness', 'Dysphagia'],
    diagnoses:      ['Otitis Media', 'Sinusitis', 'Allergic Rhinitis', 'Pharyngitis', 'Tonsillitis', 'Laryngitis', 'Vertigo', 'Nasal Polyp', 'Deviated Nasal Septum'],
    investigations: ['Pure Tone Audiometry', 'Tympanometry', 'X-Ray PNS', 'CT Scan PNS', 'Throat Swab Culture', 'Nasal Smear Eosinophil', 'ENT Endoscopy'],
  },
  psychiatry: {
    symptoms:       ['Low Mood', 'Anxiety', 'Insomnia', 'Fatigue', 'Poor Concentration', 'Suicidal Ideation', 'Hallucinations', 'Mood Swings', 'Irritability', 'Social Withdrawal'],
    diagnoses:      ['Depression', 'Anxiety Disorder', 'Bipolar Disorder', 'Schizophrenia', 'OCD', 'PTSD', 'ADHD', 'Panic Disorder'],
    investigations: ['PHQ-9', 'GAD-7', 'Thyroid Profile', 'CBC', 'Blood Sugar', 'Serum B12', 'Serum Vitamin D', 'Drug Level (if on Lithium/Valproate)'],
  },
  // Generic / General OPD
  general: {
    symptoms:       ['Fever', 'Headache', 'Fatigue', 'Body Ache', 'Cough', 'Sore Throat', 'Loss of Appetite', 'Nausea', 'Abdominal Pain', 'Dizziness'],
    diagnoses:      ['Viral Fever', 'Upper Respiratory Infection', 'Gastroenteritis', 'Hypertension', 'Diabetes Mellitus', 'Anaemia'],
    investigations: ['CBC', 'Blood Sugar', 'Urine Routine', 'Liver Function Test', 'Kidney Function Test', 'Chest X-Ray', 'ECG'],
  },
  emergency: {
    symptoms:       ['Chest Pain', 'Breathlessness', 'Loss of Consciousness', 'Seizures', 'High Fever', 'Severe Headache', 'Vomiting', 'Acute Abdominal Pain'],
    diagnoses:      ['Acute MI', 'Stroke', 'Sepsis', 'Anaphylaxis', 'Acute Asthma', 'Pulmonary Embolism', 'Hypertensive Crisis'],
    investigations: ['ECG', 'Troponin', 'D-Dimer', 'ABG', 'CBC', 'BMP', 'CT Brain', 'Chest X-Ray', 'Blood Culture'],
  },
  oncology: {
    symptoms:       ['Weight Loss', 'Fatigue', 'Loss of Appetite', 'Pain', 'Lump', 'Bleeding', 'Night Sweats', 'Fever', 'Shortness of Breath'],
    diagnoses:      ['Carcinoma', 'Lymphoma', 'Leukaemia', 'Myeloma', 'Metastatic Disease', 'Glioma', 'Sarcoma'],
    investigations: ['CBC with Differential', 'Tumour Markers', 'CT Chest/Abdomen/Pelvis', 'PET Scan', 'Bone Marrow Biopsy', 'CBNAAT', 'LDH', 'Biopsy'],
  },
};

/**
 * Get suggestions for a given template.
 * Falls back to 'general' if no specialty match.
 */
export function getTemplateSuggestions(template) {
  if (!template) return null;
  const spec = (template.specialty || '').toLowerCase().trim();
  return SUGGESTIONS[spec] || SUGGESTIONS.general;
}

export default SUGGESTIONS;
