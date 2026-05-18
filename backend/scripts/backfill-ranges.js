/**
 * Backfill reference ranges for existing documents whose extracted_vitals
 * are missing reference_min / reference_max on one or more entries.
 *
 * Usage:
 *   node scripts/backfill-ranges.js            # dry-run (prints what would change)
 *   node scripts/backfill-ranges.js --fix       # actually re-extracts and saves
 *   node scripts/backfill-ranges.js --fix --id <doc-id>  # single document
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { query, pool } = require('../src/config/database');
const { processDocument }        = require('../src/services/ocrService');
const { extractVitalsWithVision, extractVitalsWithAI } = require('../src/services/ai.service');
const path = require('path');

const FIX  = process.argv.includes('--fix');
const targetId = (() => {
  const i = process.argv.indexOf('--id');
  return i !== -1 ? process.argv[i + 1] : null;
})();

function _needsRanges(vitals) {
  if (!vitals || typeof vitals !== 'object') return false;
  return Object.values(vitals).some(v =>
    v && typeof v === 'object' &&
    (typeof v.reference_min !== 'number' || typeof v.reference_max !== 'number')
  );
}

async function main() {
  console.log(`\n=== Backfill reference ranges | mode: ${FIX ? 'FIX' : 'DRY-RUN'} ===\n`);

  const sql = targetId
    ? `SELECT id, title, file_path, mime_type, ocr_text, extracted_vitals
         FROM documents WHERE id = $1 AND extracted_vitals IS NOT NULL`
    : `SELECT id, title, file_path, mime_type, ocr_text, extracted_vitals
         FROM documents WHERE extracted_vitals IS NOT NULL
         ORDER BY uploaded_at DESC`;

  const { rows } = await query(sql, targetId ? [targetId] : []);
  console.log(`Found ${rows.length} document(s) with extracted vitals.\n`);

  let needsFix = 0, fixed = 0, failed = 0;

  for (const doc of rows) {
    const vitals = doc.extracted_vitals;
    if (!_needsRanges(vitals)) {
      console.log(`[SKIP]  ${doc.id} — "${doc.title}" (ranges already present)`);
      continue;
    }

    const missing = Object.entries(vitals)
      .filter(([, v]) => v && typeof v === 'object' &&
        (typeof v.reference_min !== 'number' || typeof v.reference_max !== 'number'))
      .map(([k]) => k);

    console.log(`[NEEDS FIX]  ${doc.id} — "${doc.title}"`);
    console.log(`  Missing ranges for: ${missing.join(', ')}`);
    needsFix++;

    if (!FIX) continue;

    if (!doc.file_path) {
      console.log(`  SKIP — no file_path on record`);
      failed++;
      continue;
    }

    try {
      console.log(`  Re-extracting via Gemini Vision…`);
      const [{ text }, visionVitals] = await Promise.all([
        processDocument(doc.file_path),
        extractVitalsWithVision(doc.file_path, doc.mime_type || ''),
      ]);

      let newVitals;
      if (visionVitals !== null) {
        console.log(`  Vision succeeded — ${Object.keys(visionVitals).length} vitals`);
        newVitals = visionVitals;
      } else {
        const src = text || doc.ocr_text || '';
        if (!src.trim()) { console.log(`  SKIP — no text available for fallback`); failed++; continue; }
        console.log(`  Vision failed, using text OCR (${src.length} chars)…`);
        newVitals = await extractVitalsWithAI(src);
        console.log(`  Text extracted ${Object.keys(newVitals).length} vitals`);
      }

      if (Object.keys(newVitals).length === 0) {
        console.log(`  SKIP — extraction returned empty`);
        failed++;
        continue;
      }

      await query(
        `UPDATE documents SET extracted_vitals = $1 WHERE id = $2`,
        [JSON.stringify(newVitals), doc.id],
      );

      const stillMissing = Object.entries(newVitals)
        .filter(([, v]) => typeof v.reference_min !== 'number' || typeof v.reference_max !== 'number')
        .map(([k]) => k);

      if (stillMissing.length === 0) {
        console.log(`  ✓ All ranges filled`);
      } else {
        console.log(`  ⚠ Still missing ranges for: ${stillMissing.join(', ')}`);
      }
      fixed++;
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n─── Summary ───`);
  console.log(`Total docs checked : ${rows.length}`);
  console.log(`Needed fix         : ${needsFix}`);
  if (FIX) {
    console.log(`Fixed              : ${fixed}`);
    console.log(`Failed / skipped   : ${failed}`);
  } else {
    console.log(`(Run with --fix to apply changes)`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
