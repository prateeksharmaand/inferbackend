const axios = require('axios');

const NLM     = 'https://clinicaltables.nlm.nih.gov/api';
const FDA_URL = 'https://api.fda.gov/drug/label.json';

// Popular Indian brand names → generic mapping (covers most common prescriptions)
const INDIAN_BRANDS = [
  { name: 'Dolo 650',        generic: 'Paracetamol 650mg' },
  { name: 'Calpol',          generic: 'Paracetamol' },
  { name: 'Crocin',          generic: 'Paracetamol' },
  { name: 'Pan-D',           generic: 'Pantoprazole + Domperidone' },
  { name: 'Pan 40',          generic: 'Pantoprazole 40mg' },
  { name: 'Pantop',          generic: 'Pantoprazole' },
  { name: 'Omez',            generic: 'Omeprazole' },
  { name: 'Rantac',          generic: 'Ranitidine' },
  { name: 'Gelusil',         generic: 'Aluminium Hydroxide + Magnesium Hydroxide' },
  { name: 'Digene',          generic: 'Antacid' },
  { name: 'Azithral',        generic: 'Azithromycin' },
  { name: 'Zithromax',       generic: 'Azithromycin' },
  { name: 'Moxikind-CV',     generic: 'Amoxicillin + Clavulanic Acid' },
  { name: 'Augmentin',       generic: 'Amoxicillin + Clavulanic Acid' },
  { name: 'Clavam',          generic: 'Amoxicillin + Clavulanic Acid' },
  { name: 'Amoxil',          generic: 'Amoxicillin' },
  { name: 'Amoxyclav',       generic: 'Amoxicillin + Clavulanic Acid' },
  { name: 'Cifran',          generic: 'Ciprofloxacin' },
  { name: 'Ciplox',          generic: 'Ciprofloxacin' },
  { name: 'Norflox',         generic: 'Norfloxacin' },
  { name: 'Levoflox',        generic: 'Levofloxacin' },
  { name: 'Levoquin',        generic: 'Levofloxacin' },
  { name: 'Monocef',         generic: 'Ceftriaxone' },
  { name: 'Taxim-O',         generic: 'Cefixime' },
  { name: 'Cepodem',         generic: 'Cefpodoxime' },
  { name: 'Supacef',         generic: 'Cefuroxime' },
  { name: 'Metrogyl',        generic: 'Metronidazole' },
  { name: 'Flagyl',          generic: 'Metronidazole' },
  { name: 'Tiniba',          generic: 'Tinidazole' },
  { name: 'Dexona',          generic: 'Dexamethasone' },
  { name: 'Wysolone',        generic: 'Prednisolone' },
  { name: 'Medrol',          generic: 'Methylprednisolone' },
  { name: 'Becosules',       generic: 'Vitamin B Complex' },
  { name: 'Neurobion',       generic: 'Vitamin B Complex' },
  { name: 'Shelcal',         generic: 'Calcium + Vitamin D3' },
  { name: 'Calcirol',        generic: 'Cholecalciferol (Vitamin D3)' },
  { name: 'Uprise-D3',       generic: 'Cholecalciferol 60000 IU' },
  { name: 'Limcee',          generic: 'Vitamin C 500mg' },
  { name: 'Zincovit',        generic: 'Zinc + Multivitamin' },
  { name: 'Atorfit',         generic: 'Atorvastatin' },
  { name: 'Storvas',         generic: 'Atorvastatin' },
  { name: 'Lipitor',         generic: 'Atorvastatin' },
  { name: 'Rozavel',         generic: 'Rosuvastatin' },
  { name: 'Crestor',         generic: 'Rosuvastatin' },
  { name: 'Ecosprin',        generic: 'Aspirin 75mg' },
  { name: 'Disprin',         generic: 'Aspirin' },
  { name: 'Clexane',         generic: 'Enoxaparin' },
  { name: 'Losar',           generic: 'Losartan' },
  { name: 'Losartan',        generic: 'Losartan' },
  { name: 'Telma',           generic: 'Telmisartan' },
  { name: 'Telvas',          generic: 'Telmisartan' },
  { name: 'Amlodac',         generic: 'Amlodipine' },
  { name: 'Amlovas',         generic: 'Amlodipine' },
  { name: 'Stamlo',          generic: 'Amlodipine' },
  { name: 'Metolar',         generic: 'Metoprolol' },
  { name: 'Atenolol',        generic: 'Atenolol' },
  { name: 'Tenormin',        generic: 'Atenolol' },
  { name: 'Januvia',         generic: 'Sitagliptin' },
  { name: 'Galvus',          generic: 'Vildagliptin' },
  { name: 'Trajenta',        generic: 'Linagliptin' },
  { name: 'Glucophage',      generic: 'Metformin' },
  { name: 'Glycomet',        generic: 'Metformin' },
  { name: 'Glimy',           generic: 'Glimepiride' },
  { name: 'Amaryl',          generic: 'Glimepiride' },
  { name: 'Cetrizine',       generic: 'Cetirizine' },
  { name: 'Cetirizine',      generic: 'Cetirizine 10mg' },
  { name: 'Levocet',         generic: 'Levocetirizine' },
  { name: 'Montek LC',       generic: 'Montelukast + Levocetirizine' },
  { name: 'Montair LC',      generic: 'Montelukast + Levocetirizine' },
  { name: 'Allegra',         generic: 'Fexofenadine' },
  { name: 'Atarax',          generic: 'Hydroxyzine' },
  { name: 'Deriphyllin',     generic: 'Etofylline + Theophylline' },
  { name: 'Asthalin',        generic: 'Salbutamol' },
  { name: 'Ventolin',        generic: 'Salbutamol' },
  { name: 'Budecort',        generic: 'Budesonide' },
  { name: 'Seroflo',         generic: 'Fluticasone + Salmeterol' },
  { name: 'Foracort',        generic: 'Budesonide + Formoterol' },
  { name: 'Voveran',         generic: 'Diclofenac' },
  { name: 'Brufen',          generic: 'Ibuprofen' },
  { name: 'Combiflam',       generic: 'Ibuprofen + Paracetamol' },
  { name: 'Zerodol',         generic: 'Aceclofenac' },
  { name: 'Hifenac',         generic: 'Aceclofenac' },
  { name: 'Etoshine',        generic: 'Etoricoxib' },
  { name: 'Arcoxia',         generic: 'Etoricoxib' },
  { name: 'Ultracet',        generic: 'Tramadol + Paracetamol' },
  { name: 'Tramazac',        generic: 'Tramadol' },
  { name: 'Pregaba',         generic: 'Pregabalin' },
  { name: 'Lyrica',          generic: 'Pregabalin' },
  { name: 'Gabapin',         generic: 'Gabapentin' },
  { name: 'Rejoint',         generic: 'Diacerhein + Glucosamine' },
  { name: 'Phexin',          generic: 'Cephalexin' },
  { name: 'Sporidex',        generic: 'Cephalexin' },
  { name: 'Doxycycline',     generic: 'Doxycycline' },
  { name: 'Doxt-SL',         generic: 'Doxycycline' },
  { name: 'Nexpro',          generic: 'Esomeprazole' },
  { name: 'Nexium',          generic: 'Esomeprazole' },
  { name: 'Rablet',          generic: 'Rabeprazole' },
  { name: 'Razo',            generic: 'Rabeprazole' },
  { name: 'Domperidone',     generic: 'Domperidone' },
  { name: 'Domstal',         generic: 'Domperidone' },
  { name: 'Perinorm',        generic: 'Metoclopramide' },
  { name: 'Ondansetron',     generic: 'Ondansetron' },
  { name: 'Emeset',          generic: 'Ondansetron' },
  { name: 'ORS',             generic: 'Oral Rehydration Salts' },
  { name: 'Electral',        generic: 'ORS (Oral Rehydration Salts)' },
  { name: 'Normet',          generic: 'Metronidazole + Norfloxacin' },
  { name: 'Econorm',         generic: 'Saccharomyces boulardii' },
  { name: 'Vizylac',         generic: 'Lactobacillus' },
  { name: 'Sporlac',         generic: 'Lactobacillus' },
  { name: 'Folvite',         generic: 'Folic Acid' },
  { name: 'Hb Tone',         generic: 'Iron + Folic Acid' },
  { name: 'Dexorange',       generic: 'Iron + Folic Acid + Vitamin B12' },
  { name: 'Ferium XT',       generic: 'Ferrous Ascorbate + Folic Acid' },
  { name: 'Thyronorm',       generic: 'Levothyroxine' },
  { name: 'Eltroxin',        generic: 'Levothyroxine' },
  { name: 'Clonidine',       generic: 'Clonidine' },
  { name: 'Olmesar',         generic: 'Olmesartan' },
  { name: 'Benicar',         generic: 'Olmesartan' },
  { name: 'Furosemide',      generic: 'Furosemide' },
  { name: 'Lasix',           generic: 'Furosemide' },
  { name: 'Dytor',           generic: 'Torasemide' },
  { name: 'Aldactone',       generic: 'Spironolactone' },
  { name: 'Warfarin',        generic: 'Warfarin' },
  { name: 'Acitrom',         generic: 'Acenocoumarol' },
  { name: 'Clopilet',        generic: 'Clopidogrel' },
  { name: 'Plavix',          generic: 'Clopidogrel' },
  { name: 'Nitrocontin',     generic: 'Isosorbide Mononitrate' },
  { name: 'Isomonit',        generic: 'Isosorbide Mononitrate' },
  { name: 'Concor',          generic: 'Bisoprolol' },
  { name: 'Bisoprolol',      generic: 'Bisoprolol' },
  { name: 'Digoxin',         generic: 'Digoxin' },
  { name: 'Lanoxin',         generic: 'Digoxin' },
  { name: 'Amiodarone',      generic: 'Amiodarone' },
  { name: 'Cordarone',       generic: 'Amiodarone' },
  { name: 'Pentids',         generic: 'Penicillin V' },
  { name: 'Erythromycin',    generic: 'Erythromycin' },
  { name: 'Althrocin',       generic: 'Erythromycin' },
  { name: 'Capsule Doxy',    generic: 'Doxycycline 100mg' },
  { name: 'Tab Mox',         generic: 'Amoxicillin 500mg' },
  { name: 'Zovirax',         generic: 'Acyclovir' },
  { name: 'Acivir',          generic: 'Acyclovir' },
  { name: 'Valacyclovir',    generic: 'Valacyclovir' },
  { name: 'Valtrex',         generic: 'Valacyclovir' },
  { name: 'Fluconazole',     generic: 'Fluconazole' },
  { name: 'Flucos',          generic: 'Fluconazole' },
  { name: 'Itraconazole',    generic: 'Itraconazole' },
  { name: 'Canditral',       generic: 'Itraconazole' },
  { name: 'Terbinafine',     generic: 'Terbinafine' },
  { name: 'Terbicip',        generic: 'Terbinafine' },
  { name: 'Mintop',          generic: 'Minoxidil' },
  { name: 'Finast',          generic: 'Finasteride' },
  { name: 'Propecia',        generic: 'Finasteride' },
  { name: 'Sporanox',        generic: 'Itraconazole' },
  { name: 'Clotrimazole',    generic: 'Clotrimazole' },
  { name: 'Candid',          generic: 'Clotrimazole' },
  { name: 'Tinaderm',        generic: 'Tolnaftate' },
  { name: 'Hydroxychloroquine', generic: 'Hydroxychloroquine' },
  { name: 'HCQS',            generic: 'Hydroxychloroquine' },
  { name: 'Plaquenil',       generic: 'Hydroxychloroquine' },
  { name: 'Sulfasalazine',   generic: 'Sulfasalazine' },
  { name: 'Saaz',            generic: 'Sulfasalazine' },
  { name: 'Methotrexate',    generic: 'Methotrexate' },
  { name: 'Folitrax',        generic: 'Methotrexate' },
  { name: 'Ivermectin',      generic: 'Ivermectin' },
  { name: 'Ivecop',          generic: 'Ivermectin' },
  { name: 'Albendazole',     generic: 'Albendazole' },
  { name: 'Zentel',          generic: 'Albendazole' },
  { name: 'Mebendazole',     generic: 'Mebendazole' },
  { name: 'Bandy',           generic: 'Albendazole' },
  { name: 'Praziquantel',    generic: 'Praziquantel' },
  { name: 'Clonazepam',      generic: 'Clonazepam' },
  { name: 'Rivotril',        generic: 'Clonazepam' },
  { name: 'Alprazolam',      generic: 'Alprazolam' },
  { name: 'Alprax',          generic: 'Alprazolam' },
  { name: 'Diazepam',        generic: 'Diazepam' },
  { name: 'Calmpose',        generic: 'Diazepam' },
  { name: 'Escitalopram',    generic: 'Escitalopram' },
  { name: 'Nexito',          generic: 'Escitalopram' },
  { name: 'Sertraline',      generic: 'Sertraline' },
  { name: 'Sertima',         generic: 'Sertraline' },
  { name: 'Paroxetine',      generic: 'Paroxetine' },
  { name: 'Paxidep',         generic: 'Paroxetine' },
  { name: 'Mirtazapine',     generic: 'Mirtazapine' },
  { name: 'Mirtaz',          generic: 'Mirtazapine' },
  { name: 'Olanzapine',      generic: 'Olanzapine' },
  { name: 'Oleanz',          generic: 'Olanzapine' },
  { name: 'Quetiapine',      generic: 'Quetiapine' },
  { name: 'Qutipin',         generic: 'Quetiapine' },
  { name: 'Risperidone',     generic: 'Risperidone' },
  { name: 'Sizodon',         generic: 'Risperidone' },
  { name: 'Phenytoin',       generic: 'Phenytoin' },
  { name: 'Eptoin',          generic: 'Phenytoin' },
  { name: 'Valproate',       generic: 'Sodium Valproate' },
  { name: 'Valparin',        generic: 'Sodium Valproate' },
  { name: 'Oxcarbazepine',   generic: 'Oxcarbazepine' },
  { name: 'Oxetol',          generic: 'Oxcarbazepine' },
  { name: 'Levetiracetam',   generic: 'Levetiracetam' },
  { name: 'Levroxa',         generic: 'Levetiracetam' },
  { name: 'Piracetam',       generic: 'Piracetam' },
  { name: 'Nootropil',       generic: 'Piracetam' },
  { name: 'Donepezil',       generic: 'Donepezil' },
  { name: 'Aricept',         generic: 'Donepezil' },
  { name: 'Sildenafil',      generic: 'Sildenafil' },
  { name: 'Viagra',          generic: 'Sildenafil' },
  { name: 'Manforce',        generic: 'Sildenafil 100mg' },
  { name: 'Tadalafil',       generic: 'Tadalafil' },
  { name: 'Cialis',          generic: 'Tadalafil' },
  { name: 'Dutas',           generic: 'Dutasteride' },
  { name: 'Avodart',         generic: 'Dutasteride' },
  { name: 'Tamsulosin',      generic: 'Tamsulosin' },
  { name: 'Urimax',          generic: 'Tamsulosin' },
  { name: 'OCP',             generic: 'Oral Contraceptive Pill' },
  { name: 'Unwanted 72',     generic: 'Levonorgestrel (Emergency Contraception)' },
  { name: 'i-Pill',          generic: 'Levonorgestrel (Emergency Contraception)' },
  { name: 'Mifepristone',    generic: 'Mifepristone' },
  { name: 'Misoprostol',     generic: 'Misoprostol' },
  { name: 'Uterone',         generic: 'Progesterone' },
  { name: 'Susten',          generic: 'Progesterone' },
  { name: 'Duphaston',       generic: 'Dydrogesterone' },
  { name: 'Primolut',        generic: 'Norethisterone' },
  { name: 'Clomid',          generic: 'Clomiphene' },
  { name: 'Siphene',         generic: 'Clomiphene' },
  { name: 'Drotin',          generic: 'Drotaverine' },
  { name: 'Nifedipine',      generic: 'Nifedipine' },
  { name: 'Depin',           generic: 'Nifedipine' },
  { name: 'Carboprost',      generic: 'Carboprost' },
  { name: 'Oxytocin',        generic: 'Oxytocin' },
  { name: 'Syntocinon',      generic: 'Oxytocin' },
  { name: 'Methergin',       generic: 'Methylergometrine' },
  { name: 'Piton-S',         generic: 'Oxytocin' },
  { name: 'Betamethasone',   generic: 'Betamethasone' },
  { name: 'Betnesol',        generic: 'Betamethasone' },
  { name: 'Nifuroxazide',    generic: 'Nifuroxazide' },
  { name: 'Niftas',          generic: 'Nitrofurantoin' },
  { name: 'Macrobid',        generic: 'Nitrofurantoin' },
  { name: 'Gentamicin',      generic: 'Gentamicin' },
  { name: 'Amikacin',        generic: 'Amikacin' },
  { name: 'Amikin',          generic: 'Amikacin' },
  { name: 'Meropenem',       generic: 'Meropenem' },
  { name: 'Meronem',         generic: 'Meropenem' },
  { name: 'Imipenem',        generic: 'Imipenem + Cilastatin' },
  { name: 'Piperacillin',    generic: 'Piperacillin + Tazobactam' },
  { name: 'Tazact',          generic: 'Piperacillin + Tazobactam' },
  { name: 'Colistin',        generic: 'Colistin' },
  { name: 'Polymyxin B',     generic: 'Polymyxin B' },
  { name: 'Vancomycin',      generic: 'Vancomycin' },
  { name: 'Linezolid',       generic: 'Linezolid' },
  { name: 'Lizolid',         generic: 'Linezolid' },
  { name: 'Daptomycin',      generic: 'Daptomycin' },
  { name: 'Tigecycline',     generic: 'Tigecycline' },
];

// GET /api/emr/autocomplete/icd10?q=fever
const searchICD10 = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const { data } = await axios.get(`${NLM}/icd10cm/v3/search`, {
      params: { terms: q, sf: 'code,name', maxList: 12 },
      timeout: 8000,
    });
    const rows = data[3] || [];
    res.json(rows.map(([code, name]) => ({ code, name })));
  } catch (err) {
    console.error('[autocomplete/icd10] NLM fetch error:', err.code, err.message);
    res.json([]);
  }
};

// GET /api/emr/autocomplete/medicines?q=dolo
// Fans out to: Indian brand index (local) + NLM RxTerms (US generics)
// Results: Indian brands first, then US generics, deduped by name
const searchMedicines = async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) return res.json([]);

  // 1. Match against Indian brand list (instant, local)
  const indianMatches = INDIAN_BRANDS
    .filter(b => b.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map(b => ({ name: b.name, strength: b.generic, source: 'IN' }));

  // 2. NLM RxTerms (US generics — covers most international generics too)
  let nlmResults = [];
  try {
    const { data } = await axios.get(`${NLM}/rxterms/v3/search`, {
      params: { terms: q, ef: 'STRENGTHS_AND_FORMS', maxList: 10 },
      timeout: 6000,
    });
    const rows      = data[3] || [];
    const strengths = (data[2] && data[2].STRENGTHS_AND_FORMS) || [];
    nlmResults = rows.map((row, i) => ({
      name:     row[0],
      strength: (strengths[i] || []).join(', '),
      source:   'NLM',
    }));
  } catch {}

  // Merge: Indian brands first, then NLM — dedupe by lowercase name
  const seen = new Set(indianMatches.map(m => m.name.toLowerCase()));
  const merged = [
    ...indianMatches,
    ...nlmResults.filter(m => !seen.has(m.name.toLowerCase())),
  ].slice(0, 15);

  res.json(merged);
};

// Keep old endpoint for backwards compatibility
const searchRxTerms = async (req, res) => searchMedicines(req, res);

// GET /api/emr/autocomplete/ping — connectivity test
const ping = async (req, res) => {
  try {
    const { data } = await axios.get(`${NLM}/icd10cm/v3/search`, {
      params: { terms: 'fever', sf: 'code,name', maxList: 3 },
      timeout: 8000,
    });
    res.json({ ok: true, sample: data[3] || [] });
  } catch (err) {
    res.json({ ok: false, error: err.message, code: err.code });
  }
};

module.exports = { searchICD10, searchRxTerms, searchMedicines, ping };
