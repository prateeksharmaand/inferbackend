// Symptom & diagnosis master data for InferPad.
// Shared terms (clinic_id NULL) + each clinic's own terms; per-clinic hidden flag and usage
// counts live in emr_clinical_term_clinic. Tables: src/db/migrations/031_clinical_terms.sql.
const { pool } = require('../config/database');

const KINDS = ['symptom', 'diagnosis'];
const clean = s => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');

// Terms visible to a clinic, most relevant first. Clinic-specific state joined in.
const VISIBLE_SQL = `
  SELECT t.id, t.kind, t.name, t.icd10_code, t.specialties,
         (t.clinic_id IS NOT NULL)        AS is_custom,
         COALESCE(c.hidden, FALSE)        AS hidden,
         COALESCE(c.usage_count, 0)       AS usage_count
  FROM emr_clinical_terms t
  LEFT JOIN emr_clinical_term_clinic c ON c.term_id = t.id AND c.clinic_id = $1
  WHERE (t.clinic_id IS NULL OR t.clinic_id = $1)`;

/**
 * GET /api/emr/clinical-terms
 *   ?kind=symptom|diagnosis   (optional)
 *   ?q=text                   search name or ICD-10 code
 *   ?specialty=endocrinology  boost/limit to a specialty (quick-add chips)
 *   ?include_hidden=1         Settings screen: include hidden terms
 *   ?limit=20
 */
exports.list = async (req, res) => {
  const clinicId = req.emrUser.clinic_id;
  const { kind, q, specialty } = req.query;
  const includeHidden = req.query.include_hidden === '1';
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 1000);

  const params = [clinicId];
  let where = '';
  if (kind) {
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be symptom or diagnosis' });
    params.push(kind); where += ` AND t.kind = $${params.length}`;
  }
  if (!includeHidden) where += ' AND COALESCE(c.hidden, FALSE) = FALSE';
  const term = clean(q);
  if (term) {
    // Match the start of any word ("urin" → "Painful Urination", not "During"), or a code prefix
    const rx = '\\m' + term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    params.push(rx, `${term.toUpperCase()}%`);
    where += ` AND (LOWER(t.name) ~ $${params.length - 1} OR UPPER(COALESCE(t.icd10_code,'')) LIKE $${params.length})`;
  }
  let specOrder = '';
  if (specialty) {
    params.push(String(specialty).toLowerCase().trim());
    specOrder = `(t.specialties @> ARRAY[$${params.length}]::text[]) DESC,`;
  }
  // Prefix matches first when searching
  let prefixOrder = '';
  if (term) { params.push(`${term.toLowerCase()}%`); prefixOrder = `(LOWER(t.name) LIKE $${params.length}) DESC,`; }
  params.push(limit);

  const { rows } = await pool.query(
    `${VISIBLE_SQL} ${where}
     ORDER BY ${prefixOrder} ${specOrder} COALESCE(c.usage_count, 0) DESC,
              (t.icd10_code IS NULL),  -- coded terms before uncoded (e.g. 032 dataset names)
              t.sort_rank, t.name
     LIMIT $${params.length}`,
    params,
  );
  res.json(rows);
};

/**
 * GET /api/emr/clinical-terms/suggestions?specialty=endocrinology
 * Quick-add chips for InferPad: { symptoms: [{name, code}], diagnoses: [{name, code}] }.
 * The clinic's most-used terms first, then the specialty's shared list.
 */
exports.suggestions = async (req, res) => {
  const clinicId = req.emrUser.clinic_id;
  const spec = String(req.query.specialty || 'general').toLowerCase().trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const { rows } = await pool.query(
    `SELECT kind, name, icd10_code FROM (
       SELECT t.kind, t.name, t.icd10_code,
              ROW_NUMBER() OVER (PARTITION BY t.kind ORDER BY
                COALESCE(c.usage_count, 0) DESC,
                (t.specialties @> ARRAY[$2]::text[]) DESC,
                t.sort_rank, t.name) AS rn
       FROM emr_clinical_terms t
       LEFT JOIN emr_clinical_term_clinic c ON c.term_id = t.id AND c.clinic_id = $1
       WHERE (t.clinic_id IS NULL OR t.clinic_id = $1)
         AND COALESCE(c.hidden, FALSE) = FALSE
         AND (COALESCE(c.usage_count, 0) > 0 OR t.specialties @> ARRAY[$2]::text[])
     ) x WHERE rn <= $3 ORDER BY kind, rn`,
    [clinicId, spec, limit],
  );
  const pick = kind => rows.filter(r => r.kind === kind).map(r => ({ name: r.name, code: r.icd10_code || '' }));
  res.json({ symptoms: pick('symptom'), diagnoses: pick('diagnosis') });
};

// POST /api/emr/clinical-terms  { kind, name, icd10_code? }  — add a clinic term
exports.create = async (req, res) => {
  const clinicId = req.emrUser.clinic_id;
  const kind = req.body.kind;
  const name = clean(req.body.name);
  const code = clean(req.body.icd10_code).toUpperCase() || null;
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be symptom or diagnosis' });
  if (!name || name.length > 200) return res.status(400).json({ error: 'name is required (max 200 characters)' });

  // Already visible (shared or own)? Un-hide it instead of duplicating.
  const { rows: existing } = await pool.query(
    `SELECT id, clinic_id FROM emr_clinical_terms
     WHERE kind = $1 AND LOWER(name) = LOWER($2) AND (clinic_id IS NULL OR clinic_id = $3)
     ORDER BY clinic_id NULLS LAST LIMIT 1`,
    [kind, name, clinicId],
  );
  if (existing.length) {
    await pool.query(
      `INSERT INTO emr_clinical_term_clinic (clinic_id, term_id, hidden) VALUES ($1, $2, FALSE)
       ON CONFLICT (clinic_id, term_id) DO UPDATE SET hidden = FALSE`,
      [clinicId, existing[0].id],
    );
    return res.status(200).json({ id: existing[0].id, existed: true });
  }
  const { rows } = await pool.query(
    `INSERT INTO emr_clinical_terms (clinic_id, kind, name, icd10_code) VALUES ($1, $2, $3, $4) RETURNING *`,
    [clinicId, kind, name, code],
  );
  res.status(201).json(rows[0]);
};

// PATCH /api/emr/clinical-terms/:id  { hidden?, name?, icd10_code? }
// Any visible term can be hidden/shown for this clinic; name/code edits only on the clinic's own terms.
exports.update = async (req, res) => {
  const clinicId = req.emrUser.clinic_id;
  const { rows: [t] } = await pool.query(
    `SELECT id, clinic_id FROM emr_clinical_terms WHERE id = $1 AND (clinic_id IS NULL OR clinic_id = $2)`,
    [req.params.id, clinicId],
  );
  if (!t) return res.status(404).json({ error: 'Term not found' });

  if (req.body.name !== undefined || req.body.icd10_code !== undefined) {
    if (t.clinic_id === null) return res.status(403).json({ error: 'Shared terms can only be hidden. Add your own term instead.' });
    const name = req.body.name !== undefined ? clean(req.body.name) : null;
    if (req.body.name !== undefined && !name) return res.status(400).json({ error: 'name cannot be empty' });
    const code = req.body.icd10_code !== undefined ? (clean(req.body.icd10_code).toUpperCase() || null) : undefined;
    try {
      await pool.query(
        `UPDATE emr_clinical_terms SET
           name       = COALESCE($1, name),
           icd10_code = CASE WHEN $2::boolean THEN $3 ELSE icd10_code END,
           updated_at = NOW()
         WHERE id = $4`,
        [name, code !== undefined, code ?? null, t.id],
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'A term with this name already exists' });
      throw e;
    }
  }
  if (req.body.hidden !== undefined) {
    await pool.query(
      `INSERT INTO emr_clinical_term_clinic (clinic_id, term_id, hidden) VALUES ($1, $2, $3)
       ON CONFLICT (clinic_id, term_id) DO UPDATE SET hidden = EXCLUDED.hidden`,
      [clinicId, t.id, !!req.body.hidden],
    );
  }
  res.json({ ok: true });
};

// DELETE /api/emr/clinical-terms/:id — delete the clinic's own term, or hide a shared one
exports.remove = async (req, res) => {
  const clinicId = req.emrUser.clinic_id;
  const { rowCount } = await pool.query(
    `DELETE FROM emr_clinical_terms WHERE id = $1 AND clinic_id = $2`, [req.params.id, clinicId]);
  if (rowCount) return res.json({ ok: true, deleted: true });
  const { rows: [shared] } = await pool.query(
    `SELECT id FROM emr_clinical_terms WHERE id = $1 AND clinic_id IS NULL`, [req.params.id]);
  if (!shared) return res.status(404).json({ error: 'Term not found' });
  await pool.query(
    `INSERT INTO emr_clinical_term_clinic (clinic_id, term_id, hidden) VALUES ($1, $2, TRUE)
     ON CONFLICT (clinic_id, term_id) DO UPDATE SET hidden = TRUE`,
    [clinicId, shared.id],
  );
  res.json({ ok: true, hidden: true });
};

/**
 * Learn from a saved prescription: every symptom/diagnosis on it becomes (or stays) a term for
 * the clinic and its usage count goes up, so InferPad suggests it first next time.
 * Terms the clinic had hidden are left hidden. Called fire-and-forget from saveEncounter.
 */
exports.learnFromEncounter = async (clinicId, symptoms, diagnosis) => {
  const items = [];
  for (const s of Array.isArray(symptoms) ? symptoms : []) {
    const name = clean(typeof s === 'string' ? s : s && s.name);
    if (name) items.push({ kind: 'symptom', name, code: clean(s && s.code).toUpperCase() || null });
  }
  for (const d of Array.isArray(diagnosis) ? diagnosis : []) {
    const name = clean(typeof d === 'string' ? d : d && (d.display || d.name));
    if (name) items.push({ kind: 'diagnosis', name, code: clean(d && d.code).toUpperCase() || null });
  }
  for (const it of items.slice(0, 100)) {
    if (it.name.length > 200) continue;
    // Shared term or the clinic's own; otherwise create a clinic term.
    let { rows: [t] } = await pool.query(
      `SELECT id FROM emr_clinical_terms
       WHERE kind = $1 AND LOWER(name) = LOWER($2) AND (clinic_id IS NULL OR clinic_id = $3)
       ORDER BY clinic_id NULLS LAST LIMIT 1`,
      [it.kind, it.name, clinicId],
    );
    if (!t) {
      ({ rows: [t] } = await pool.query(
        `INSERT INTO emr_clinical_terms (clinic_id, kind, name, icd10_code) VALUES ($1, $2, $3, $4)
         ON CONFLICT (COALESCE(clinic_id, 0), kind, LOWER(name)) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [clinicId, it.kind, it.name, it.code],
      ));
    }
    await pool.query(
      `INSERT INTO emr_clinical_term_clinic (clinic_id, term_id, usage_count, last_used_at) VALUES ($1, $2, 1, NOW())
       ON CONFLICT (clinic_id, term_id) DO UPDATE
         SET usage_count = emr_clinical_term_clinic.usage_count + 1, last_used_at = NOW()`,
      [clinicId, t.id],
    );
  }
};
