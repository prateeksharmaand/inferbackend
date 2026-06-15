/**
 * Indian Drug Catalog Importer
 * ─────────────────────────────────────────────────────────────────
 * Imports 50k–200k Indian drug brands (allopathy + homeopathy + ayurvedic)
 * into the drug_catalog table.
 *
 * USAGE:
 *   node scripts/import_india_drugs.js                  # import all built-in seeds + bundled data
 *   node scripts/import_india_drugs.js --csv path.csv   # import from CSV file
 *   node scripts/import_india_drugs.js --json path.json # import from JSON file
 *   node scripts/import_india_drugs.js --clear          # wipe table first, then import
 *
 * FREE DATA SOURCES (download and pass via --csv):
 *   1. CDSCO approved drugs:  https://cdscoonline.gov.in/CDSCO/Drugs
 *      → Export → "Approved Drug List" (Excel → save as CSV)
 *   2. Kaggle Indian medicine dataset (11k rows):
 *      https://www.kaggle.com/datasets/shudhanshusingh/medicines-india
 *   3. 1mg open data (scraped, 6k+ rows):
 *      https://www.kaggle.com/datasets/singhakash/1mg-data
 *   4. Jan Aushadhi / PMBJP (1900 generic drugs):
 *      https://janaushadhi.gov.in/ProductList.aspx
 *
 * CSV expected columns (any order, extra cols ignored):
 *   brand_name, generic_name, manufacturer, strength, dosage_form, category, schedule
 *
 * JSON expected format: array of objects with the same keys.
 */

require('dotenv').config();
const fs      = require('fs');
const path    = require('path');
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const args   = process.argv.slice(2);
const CSV    = args.includes('--csv')  ? args[args.indexOf('--csv')  + 1] : null;
const JSON_F = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const CLEAR  = args.includes('--clear');
const BATCH  = 500;  // rows per INSERT

// ── Homeopathic medicines seed ────────────────────────────────────────────────
const HOMEOPATHY_SEED = [
  // Arnica
  { brand_name: 'Arnica Montana 30C',  generic_name: 'Arnica montana',       manufacturer: 'SBL', strength: '30C', dosage_form: 'Globules',    category: 'homeopathy' },
  { brand_name: 'Arnica Montana 200C', generic_name: 'Arnica montana',       manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Arnica Hair Oil',     generic_name: 'Arnica montana',       manufacturer: 'SBL', strength: 'Q',    dosage_form: 'Oil',        category: 'homeopathy' },
  // Belladonna
  { brand_name: 'Belladonna 30C',      generic_name: 'Belladonna',           manufacturer: 'Boiron', strength: '30C', dosage_form: 'Globules',  category: 'homeopathy' },
  { brand_name: 'Belladonna 200C',     generic_name: 'Belladonna',           manufacturer: 'Boiron', strength: '200C', dosage_form: 'Globules', category: 'homeopathy' },
  // Bryonia
  { brand_name: 'Bryonia 30C',         generic_name: 'Bryonia alba',         manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Bryonia 200C',        generic_name: 'Bryonia alba',         manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Nux Vomica
  { brand_name: 'Nux Vomica 30C',      generic_name: 'Nux vomica',          manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Nux Vomica 200C',     generic_name: 'Nux vomica',          manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Rhus Tox
  { brand_name: 'Rhus Tox 30C',        generic_name: 'Rhus toxicodendron',  manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Rhus Tox 200C',       generic_name: 'Rhus toxicodendron',  manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Pulsatilla
  { brand_name: 'Pulsatilla 30C',      generic_name: 'Pulsatilla nigricans', manufacturer: 'SBL', strength: '30C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Lycopodium
  { brand_name: 'Lycopodium 30C',      generic_name: 'Lycopodium',          manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Lycopodium 200C',     generic_name: 'Lycopodium',          manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Sulphur
  { brand_name: 'Sulphur 30C',         generic_name: 'Sulphur',             manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Sulphur 200C',        generic_name: 'Sulphur',             manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Calcarea Carb
  { brand_name: 'Calcarea Carb 30C',   generic_name: 'Calcarea carbonica',  manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Calcarea Carb 200C',  generic_name: 'Calcarea carbonica',  manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Phosphorus
  { brand_name: 'Phosphorus 30C',      generic_name: 'Phosphorus',          manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Phosphorus 200C',     generic_name: 'Phosphorus',          manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Sepia
  { brand_name: 'Sepia 30C',           generic_name: 'Sepia officinalis',   manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Natrum Mur
  { brand_name: 'Natrum Mur 30C',      generic_name: 'Natrum muriaticum',   manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Natrum Mur 6X',       generic_name: 'Natrum muriaticum',   manufacturer: 'SBL', strength: '6X',   dosage_form: 'Biochemic',  category: 'homeopathy' },
  // Apis Mellifica
  { brand_name: 'Apis Mel 30C',        generic_name: 'Apis mellifica',      manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Gelsemium
  { brand_name: 'Gelsemium 30C',       generic_name: 'Gelsemium sempervirens', manufacturer: 'SBL', strength: '30C', dosage_form: 'Globules', category: 'homeopathy' },
  // Ignatia
  { brand_name: 'Ignatia Amara 30C',   generic_name: 'Ignatia amara',       manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Aconite
  { brand_name: 'Aconite Napellus 30C',generic_name: 'Aconitum napellus',   manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Hepar Sulph
  { brand_name: 'Hepar Sulph 30C',     generic_name: 'Hepar sulphuris calcareum', manufacturer: 'SBL', strength: '30C', dosage_form: 'Globules', category: 'homeopathy' },
  // Silicea
  { brand_name: 'Silicea 6X',          generic_name: 'Silicea',             manufacturer: 'SBL', strength: '6X',   dosage_form: 'Biochemic',  category: 'homeopathy' },
  { brand_name: 'Silicea 30C',         generic_name: 'Silicea',             manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Kali Bich
  { brand_name: 'Kali Bichromicum 30C',generic_name: 'Kalium bichromicum',  manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Drosera
  { brand_name: 'Drosera 30C',         generic_name: 'Drosera rotundifolia',manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Cantharis
  { brand_name: 'Cantharis 30C',       generic_name: 'Cantharis',           manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Merc Sol
  { brand_name: 'Merc Sol 30C',        generic_name: 'Mercurius solubilis', manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Thuja
  { brand_name: 'Thuja 30C',           generic_name: 'Thuja occidentalis',  manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Thuja 200C',          generic_name: 'Thuja occidentalis',  manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // Staphysagria
  { brand_name: 'Staphysagria 30C',    generic_name: 'Staphysagria',        manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Cocculus
  { brand_name: 'Cocculus Indicus 30C',generic_name: 'Cocculus indicus',    manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Veratrum
  { brand_name: 'Veratrum Album 30C',  generic_name: 'Veratrum album',      manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Carbo Veg
  { brand_name: 'Carbo Veg 30C',       generic_name: 'Carbo vegetabilis',   manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Lachesis
  { brand_name: 'Lachesis 30C',        generic_name: 'Lachesis mutus',      manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  { brand_name: 'Lachesis 200C',       generic_name: 'Lachesis mutus',      manufacturer: 'SBL', strength: '200C', dosage_form: 'Globules',   category: 'homeopathy' },
  // China
  { brand_name: 'China 30C',           generic_name: 'Cinchona officinalis',manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Hamamelis
  { brand_name: 'Hamamelis 30C',       generic_name: 'Hamamelis virginiana',manufacturer: 'SBL', strength: '30C',  dosage_form: 'Globules',   category: 'homeopathy' },
  // Ferrum Phos
  { brand_name: 'Ferrum Phos 6X',      generic_name: 'Ferrum phosphoricum', manufacturer: 'SBL', strength: '6X',   dosage_form: 'Biochemic',  category: 'homeopathy' },
  // Kali Phos
  { brand_name: 'Kali Phos 6X',        generic_name: 'Kalium phosphoricum', manufacturer: 'SBL', strength: '6X',   dosage_form: 'Biochemic',  category: 'homeopathy' },
  // Mag Phos
  { brand_name: 'Mag Phos 6X',         generic_name: 'Magnesium phosphoricum', manufacturer: 'SBL', strength: '6X', dosage_form: 'Biochemic', category: 'homeopathy' },
  // Calc Fluor
  { brand_name: 'Calc Fluor 6X',       generic_name: 'Calcarea fluorica',   manufacturer: 'SBL', strength: '6X',   dosage_form: 'Biochemic',  category: 'homeopathy' },
  // SBL compound formulas
  { brand_name: 'SBL Schwabe Tonsiotren', generic_name: 'Homeopathic tonsil formula', manufacturer: 'SBL', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R1',     generic_name: 'Inflammation drops',  manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R2',     generic_name: 'Heart drops',         manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R3',     generic_name: 'Heart efficiency drops', manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R4',     generic_name: 'Diarrhoea drops',     manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R6',     generic_name: 'Fever drops',         manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R11',    generic_name: 'Rheumatism drops',    manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R17',    generic_name: 'Tumour drops',        manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R41',    generic_name: 'Sexual neurasthenia', manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Dr. Reckeweg R89',    generic_name: 'Hair care drops',     manufacturer: 'Dr. Reckeweg', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Bakson B1',           generic_name: 'Homeopathic tonsil',  manufacturer: 'Bakson',       dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Bakson B9',           generic_name: 'Kidney drops',        manufacturer: 'Bakson',       dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Bakson B15',          generic_name: 'Skin drops',          manufacturer: 'Bakson',       dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Wheezal WL-10',       generic_name: 'Cough & bronchitis drops', manufacturer: 'Wheezal', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Allen A1',            generic_name: 'Acne drops',          manufacturer: 'Allen',        dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Allen A11',           generic_name: 'Hairfall drops',      manufacturer: 'Allen',        dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Allen A30',           generic_name: 'Asthma drops',        manufacturer: 'Allen',        dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Allen A55',           generic_name: 'Thyroid drops',       manufacturer: 'Allen',        dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Medisynth Pulsatilla', generic_name: 'Pulsatilla nigricans', manufacturer: 'Medisynth', dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Hahnemann Pharma Nux Vomica', generic_name: 'Nux vomica', manufacturer: 'Hahnemann Pharma', dosage_form: 'Globules', category: 'homeopathy' },
  { brand_name: 'Schwabe Topi Amica Cream', generic_name: 'Arnica montana topical', manufacturer: 'Schwabe', dosage_form: 'Cream', category: 'homeopathy' },
  { brand_name: 'SBL Homeopathic Arnica Shampoo', generic_name: 'Arnica montana', manufacturer: 'SBL', dosage_form: 'Shampoo', category: 'homeopathy' },
  { brand_name: 'Blooume 1 Gastrosan', generic_name: 'Gastric drops',       manufacturer: 'Blooume',      dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Blooume 7 Sinusan',   generic_name: 'Sinus drops',         manufacturer: 'Blooume',      dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Five Phos Biochemic', generic_name: 'Five phosphates combination', manufacturer: 'SBL', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Biocombination BC1',  generic_name: 'Anaemia biochemic',   manufacturer: 'SBL', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Biocombination BC7',  generic_name: 'Cough biochemic',     manufacturer: 'SBL', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Biocombination BC11', generic_name: 'Fever biochemic',     manufacturer: 'SBL', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Biocombination BC17', generic_name: 'Worms biochemic',     manufacturer: 'SBL', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Biocombination BC20', generic_name: 'Skin biochemic',      manufacturer: 'SBL', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Biocombination BC25', generic_name: 'Acidity biochemic',   manufacturer: 'SBL', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Homeoforce HF1',      generic_name: 'Cold drops',          manufacturer: 'Homeoforce',   dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Reckeweg Rheum-A Tab',generic_name: 'Arthritis tablets',   manufacturer: 'Dr. Reckeweg', dosage_form: 'Tablet', category: 'homeopathy' },
  { brand_name: 'Lords L72',           generic_name: 'Anxiety drops',       manufacturer: 'Lords',        dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Lords L74',           generic_name: 'Memory drops',        manufacturer: 'Lords',        dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Lords L109',          generic_name: 'Gastric ulcer drops', manufacturer: 'Lords',        dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Adel 1 Apo-Dolor',   generic_name: 'Pain drops',          manufacturer: 'Adel',         dosage_form: 'Drops', category: 'homeopathy' },
  { brand_name: 'Adel 27 Infek-Heel',  generic_name: 'Infection drops',     manufacturer: 'Adel',         dosage_form: 'Drops', category: 'homeopathy' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

function normalize(row, headers) {
  const map = {};
  headers.forEach((h, i) => { map[h.toLowerCase().trim()] = (row[i] || '').trim(); });
  return {
    brand_name:   map['brand_name']   || map['brand'] || map['name'] || map['medicine_name'] || map['product_name'] || '',
    generic_name: map['generic_name'] || map['generic'] || map['composition'] || map['salt_composition'] || '',
    manufacturer: map['manufacturer'] || map['company'] || map['mfr'] || '',
    strength:     map['strength']     || map['dosage']  || '',
    dosage_form:  map['dosage_form']  || map['form']    || map['type'] || '',
    category:     map['category']     || 'allopathy',
    schedule:     map['schedule']     || '',
  };
}

async function insertBatch(client, rows) {
  if (!rows.length) return 0;
  const values = [];
  const params = [];
  let p = 1;
  for (const r of rows) {
    values.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6})`);
    params.push(
      r.brand_name, r.generic_name || null, r.manufacturer || null,
      r.strength || null, r.dosage_form || null,
      (r.category || 'allopathy').toLowerCase(),
      r.schedule || null,
    );
    p += 7;
  }
  const sql = `
    INSERT INTO drug_catalog (brand_name, generic_name, manufacturer, strength, dosage_form, category, schedule)
    VALUES ${values.join(',')}
    ON CONFLICT DO NOTHING`;
  await client.query(sql, params);
  return rows.length;
}

async function importFromCSV(client, filePath) {
  console.log(`\n  Reading CSV: ${filePath}`);
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  let headers = null;
  let batch = [];
  let total = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    if (!headers) { headers = cols; continue; }
    const row = normalize(cols, headers);
    if (!row.brand_name) continue;
    batch.push(row);
    if (batch.length >= BATCH) {
      total += await insertBatch(client, batch);
      batch = [];
      process.stdout.write(`\r  Imported: ${total.toLocaleString()}`);
    }
  }
  if (batch.length) total += await insertBatch(client, batch);
  console.log(`\r  ✓ CSV import complete: ${total.toLocaleString()} rows`);
  return total;
}

async function importFromJSON(client, filePath) {
  console.log(`\n  Reading JSON: ${filePath}`);
  const raw  = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const arr  = Array.isArray(data) ? data : (data.data || data.medicines || data.drugs || []);
  let total  = 0;
  for (let i = 0; i < arr.length; i += BATCH) {
    const batch = arr.slice(i, i + BATCH).map(r => ({
      brand_name:   r.brand_name   || r.name  || r.medicine_name || r.product_name || '',
      generic_name: r.generic_name || r.generic || r.composition || '',
      manufacturer: r.manufacturer || r.company || '',
      strength:     r.strength     || r.dosage  || '',
      dosage_form:  r.dosage_form  || r.form    || '',
      category:     r.category     || 'allopathy',
      schedule:     r.schedule     || '',
    })).filter(r => r.brand_name);
    total += await insertBatch(client, batch);
    process.stdout.write(`\r  Imported: ${total.toLocaleString()}`);
  }
  console.log(`\r  ✓ JSON import complete: ${total.toLocaleString()} rows`);
  return total;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const client = await pool.connect();
  try {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   Indian Drug Catalog Importer               ║');
    console.log('╚══════════════════════════════════════════════╝');

    if (CLEAR) {
      console.log('\n  ⚠ Clearing drug_catalog table…');
      await client.query('TRUNCATE drug_catalog RESTART IDENTITY');
    }

    let total = 0;

    // 1. Import from user-supplied file
    if (CSV)    total += await importFromCSV(client, path.resolve(CSV));
    if (JSON_F) total += await importFromJSON(client, path.resolve(JSON_F));

    // 2. Always insert homeopathic seed (ON CONFLICT DO NOTHING keeps idempotent)
    console.log('\n  Inserting homeopathic medicines seed…');
    for (let i = 0; i < HOMEOPATHY_SEED.length; i += BATCH) {
      total += await insertBatch(client, HOMEOPATHY_SEED.slice(i, i + BATCH));
    }
    console.log(`  ✓ Homeopathic seed done`);

    // 3. Count final rows
    const { rows } = await client.query(
      `SELECT category, COUNT(*) as cnt FROM drug_catalog GROUP BY category ORDER BY cnt DESC`
    );
    console.log('\n  ── Drug catalog summary ──────────────────────');
    rows.forEach(r => console.log(`  ${r.category.padEnd(12)} : ${Number(r.cnt).toLocaleString()}`));
    const grandTotal = rows.reduce((s, r) => s + Number(r.cnt), 0);
    console.log(`  ${'TOTAL'.padEnd(12)} : ${grandTotal.toLocaleString()}`);
    console.log('─'.repeat(48));

    console.log('\n  ✓ Import complete.\n');
    console.log('  Next steps:');
    console.log('  1. Download a large CSV from one of the sources below:');
    console.log('     • Kaggle "Indian Medicine" dataset (~11k rows):');
    console.log('       https://www.kaggle.com/datasets/shudhanshusingh/medicines-india');
    console.log('     • 1mg scraped data (~6k rows):');
    console.log('       https://www.kaggle.com/datasets/singhakash/1mg-data');
    console.log('     • CDSCO approved drug list (50k+ rows):');
    console.log('       https://cdscoonline.gov.in → Approved Drugs → Export Excel → Save as CSV');
    console.log('  2. Run: node scripts/import_india_drugs.js --csv your-file.csv');
    console.log('  3. Restart backend — autocomplete will use the DB catalog automatically.\n');

  } finally {
    client.release();
    await pool.end();
  }
})();
