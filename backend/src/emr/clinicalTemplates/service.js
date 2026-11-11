/**
 * Database layer for clinical templates. Every function takes `db` (the pool or a client inside
 * a transaction) so callers control transaction boundaries. Tenant isolation: every template
 * read goes through assertAccess (system templates are readable by all clinics; a clinic's own
 * templates only by that clinic).
 */
const { pool } = require('../../config/database');
const D = require('./definition');
const { validateDefinition, validateConsultation, sanitizeValues } = require('./validator');
const { buildSpecialtyDefinition } = require('./catalog');

class TemplateError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function audit(db, a) {
  await db.query(
    `INSERT INTO clinical_template_audit (clinic_id, staff_id, admin_id, template_id, version_id, action, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [a.clinicId ?? null, a.staffId ?? null, a.adminId ?? null, a.templateId ?? null, a.versionId ?? null,
      a.action, a.details ? JSON.stringify(a.details) : null]
  );
}

// ── Templates ───────────────────────────────────────────────────────────────
async function getTemplate(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM clinical_templates WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] || null;
}

/** scope: { clinicId } for a clinic user, { admin: true } for the super admin. */
function assertAccess(tpl, scope, { write = false } = {}) {
  if (!tpl) throw new TemplateError(404, 'Template not found');
  if (scope.admin) {
    if (write && tpl.clinic_id !== null) throw new TemplateError(403, 'Super admin edits system templates only');
    return;
  }
  if (tpl.clinic_id === null) {
    if (write) throw new TemplateError(403, 'System templates can only be changed by Infer. Duplicate it or customise it for your clinic.');
    return;
  }
  if (tpl.clinic_id !== scope.clinicId) throw new TemplateError(404, 'Template not found');
}

async function publishedDefinition(db, tpl) {
  if (!tpl.published_version_id) throw new TemplateError(409, 'Template has no published version');
  const { rows } = await db.query(`SELECT id, version_no, definition FROM clinical_template_versions WHERE id = $1`, [tpl.published_version_id]);
  return { versionId: rows[0].id, versionNo: rows[0].version_no, definition: D.normalizeDefinition(rows[0].definition) };
}

async function versionRowsDefinition(db, versionId) {
  const { rows: sections } = await db.query(
    `SELECT * FROM clinical_template_sections WHERE version_id = $1 ORDER BY display_order, id`, [versionId]);
  const { rows: fields } = sections.length ? await db.query(
    `SELECT * FROM clinical_template_fields WHERE section_id = ANY($1) ORDER BY display_order, id`,
    [sections.map(s => s.id)]) : { rows: [] };
  return D.definitionFromRows(sections, fields);
}

async function draftVersion(db, templateId) {
  const { rows } = await db.query(
    `SELECT * FROM clinical_template_versions WHERE template_id = $1 AND status = 'draft'`, [templateId]);
  return rows[0] || null;
}

async function insertDefinitionRows(db, versionId, def) {
  const d = D.normalizeDefinition(def);
  for (const [i, s] of d.sections.entries()) {
    const { rows: [sec] } = await db.query(
      `INSERT INTO clinical_template_sections
         (version_id, section_key, label, description, builtin, enabled, required, locked, print_enabled, default_value, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [versionId, s.key, s.label, s.description, !!s.builtin, s.enabled !== false, !!s.required, !!s.locked,
        s.print_enabled !== false, s.default_value == null ? null : JSON.stringify(s.default_value), i]
    );
    for (const [j, f] of s.fields.entries()) {
      await db.query(
        `INSERT INTO clinical_template_fields
           (section_id, field_key, label, description, field_type, placeholder, default_value, required, locked,
            enabled, print_enabled, min_value, max_value, min_length, max_length, options, unit, validation,
            visibility, storage, core_path, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [sec.id, f.key, f.label, f.description, f.type, f.placeholder,
          f.default_value == null ? null : JSON.stringify(f.default_value), !!f.required, !!f.locked,
          f.enabled !== false, f.print_enabled !== false, f.min, f.max, f.min_length, f.max_length,
          f.options == null ? null : JSON.stringify(f.options), f.unit,
          f.validation == null ? null : JSON.stringify(f.validation),
          f.visibility == null ? null : JSON.stringify(f.visibility), f.storage, f.core_path, j]
      );
    }
  }
}

/** Get (or create from the published version) the template's single draft. */
async function ensureDraft(db, tpl, actor) {
  const existing = await draftVersion(db, tpl.id);
  if (existing) return existing;
  const { rows: [{ n }] } = await db.query(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM clinical_template_versions WHERE template_id = $1`, [tpl.id]);
  const { rows: [v] } = await db.query(
    `INSERT INTO clinical_template_versions (template_id, version_no, status, created_by_staff, created_by_admin)
     VALUES ($1, $2, 'draft', $3, $4) RETURNING *`,
    [tpl.id, n, actor.staffId ?? null, actor.adminId ?? null]);
  if (tpl.published_version_id) {
    const pub = await publishedDefinition(db, tpl);
    await insertDefinitionRows(db, v.id, pub.definition);
  }
  return v;
}

function assertValidDefinition(def) {
  const errors = validateDefinition(def);
  if (errors.length) throw new TemplateError(422, 'Template has errors', { errors });
}

async function saveDraft(db, tpl, def, actor) {
  assertValidDefinition(def);
  const v = await ensureDraft(db, tpl, actor);
  await db.query(`DELETE FROM clinical_template_sections WHERE version_id = $1`, [v.id]);
  await insertDefinitionRows(db, v.id, def);
  await db.query(`UPDATE clinical_templates SET updated_at = NOW() WHERE id = $1`, [tpl.id]);
  await audit(db, { ...actor, templateId: tpl.id, versionId: v.id, action: 'draft_saved' });
  return v;
}

async function publish(db, tpl, actor, notes) {
  const v = await draftVersion(db, tpl.id);
  if (!v) throw new TemplateError(409, 'Nothing to publish: there is no draft');
  const def = D.stripIds(await versionRowsDefinition(db, v.id));
  assertValidDefinition(def);
  if (tpl.published_version_id) {
    await db.query(`UPDATE clinical_template_versions SET status = 'archived' WHERE id = $1`, [tpl.published_version_id]);
  }
  await db.query(
    `UPDATE clinical_template_versions
        SET status = 'published', definition = $2, definition_hash = $3, published_at = NOW(), notes = $4
      WHERE id = $1`,
    [v.id, JSON.stringify(def), D.hashDefinition(def), notes || null]);
  await db.query(`UPDATE clinical_templates SET published_version_id = $2, updated_at = NOW() WHERE id = $1`, [tpl.id, v.id]);
  await audit(db, { ...actor, templateId: tpl.id, versionId: v.id, action: 'published', details: { version_no: v.version_no } });
  return { versionId: v.id, versionNo: v.version_no };
}

/** Create a template (clinic-owned, or system when clinicId is null) and publish version 1. */
async function createTemplate(db, { clinicId, name, specialtyKey, description, scribeSpecialty, definition, sourceTemplateId, actor }) {
  if (!name || !String(name).trim()) throw new TemplateError(400, 'Name is required');
  const def = definition || buildSpecialtyDefinition('general');
  assertValidDefinition(def);
  let tplRow;
  try {
    ({ rows: [tplRow] } = await db.query(
      `INSERT INTO clinical_templates (clinic_id, specialty_key, name, description, scribe_specialty, source_template_id,
                                       created_by_staff, created_by_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [clinicId, specialtyKey || 'general', String(name).trim(), description || null, scribeSpecialty || specialtyKey || 'general',
        sourceTemplateId || null, actor.staffId ?? null, actor.adminId ?? null]));
  } catch (e) {
    if (e.code === '23505') throw new TemplateError(409, 'A template with this name already exists');
    throw e;
  }
  const { rows: [v] } = await db.query(
    `INSERT INTO clinical_template_versions (template_id, version_no, status, created_by_staff, created_by_admin)
     VALUES ($1, 1, 'draft', $2, $3) RETURNING *`, [tplRow.id, actor.staffId ?? null, actor.adminId ?? null]);
  await insertDefinitionRows(db, v.id, D.stripIds(def));
  await audit(db, { ...actor, clinicId, templateId: tplRow.id, action: sourceTemplateId ? 'duplicated' : 'created', details: { source_template_id: sourceTemplateId || null } });
  await publish(db, tplRow, actor, 'Initial version');
  return getTemplate(db, tplRow.id);
}

async function duplicateTemplate(db, source, { clinicId, name, actor, specialtyKey, description }) {
  // A clinic duplicates its effective view of the source (its own customisations included).
  let def;
  if (clinicId != null) def = (await clinicEffective(db, clinicId, source)).definition;
  else def = (await publishedDefinition(db, source)).definition;
  const promoted = D.normalizeDefinition(def);
  promoted.sections.forEach(s => { s.origin = 'template'; s.fields.forEach(f => { f.origin = 'template'; }); });
  return createTemplate(db, {
    clinicId, name: name || `${source.name} (copy)`, specialtyKey: specialtyKey || source.specialty_key,
    description: description || source.description, scribeSpecialty: source.scribe_specialty,
    definition: promoted, sourceTemplateId: source.id, actor,
  });
}

async function listTemplates(db, clinicId) {
  const { rows } = await db.query(
    `SELECT t.id, t.clinic_id, t.specialty_key, t.name, t.description, t.scribe_specialty, t.is_archived,
            t.source_template_id, t.updated_at, pv.version_no AS published_version_no, pv.published_at,
            (SELECT version_no FROM clinical_template_versions d WHERE d.template_id = t.id AND d.status = 'draft') AS draft_version_no,
            cs.template_id IS NOT NULL AS selected, COALESCE(cs.is_default, false) AS is_default,
            (SELECT COUNT(*)::int FROM clinical_template_overrides o
              WHERE o.template_id = t.id AND o.clinic_id = $1 AND o.staff_id IS NULL) AS clinic_override_count
       FROM clinical_templates t
       LEFT JOIN clinical_template_versions pv ON pv.id = t.published_version_id
       LEFT JOIN clinic_template_selections cs ON cs.template_id = t.id AND cs.clinic_id = $1
      WHERE (t.clinic_id IS NULL OR t.clinic_id = $1) AND NOT t.is_archived
      ORDER BY t.clinic_id NULLS FIRST, t.name`, [clinicId]);
  return rows;
}

// ── Overrides and effective definitions ─────────────────────────────────────
async function getOverrides(db, clinicId, staffId, templateId) {
  const { rows } = await db.query(
    `SELECT section_key, field_key, kind, props FROM clinical_template_overrides
      WHERE clinic_id = $1 AND COALESCE(staff_id, 0) = COALESCE($2::int, 0) AND template_id = $3
      ORDER BY id`, [clinicId, staffId ?? null, templateId]);
  return rows;
}

async function replaceOverrides(db, { clinicId, staffId, templateId, rows, actor }) {
  await db.query(
    `DELETE FROM clinical_template_overrides
      WHERE clinic_id = $1 AND COALESCE(staff_id, 0) = COALESCE($2::int, 0) AND template_id = $3`,
    [clinicId, staffId ?? null, templateId]);
  for (const r of rows) {
    await db.query(
      `INSERT INTO clinical_template_overrides (clinic_id, staff_id, template_id, section_key, field_key, kind, props, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [clinicId, staffId ?? null, templateId, r.section_key, r.field_key || '', r.kind || 'modify',
        JSON.stringify(r.props || {}), actor.staffId ?? null]);
  }
  await audit(db, { ...actor, clinicId, templateId, action: staffId ? 'doctor_overrides_saved' : 'clinic_overrides_saved', details: { count: rows.length, staff_id: staffId ?? null } });
}

/** Template + clinic overrides (what a clinic admin edits, and what doctors inherit). */
async function clinicEffective(db, clinicId, tpl) {
  const pub = await publishedDefinition(db, tpl);
  const clinicRows = await getOverrides(db, clinicId, null, tpl.id);
  const r = D.applyOverrides(pub.definition, clinicRows, 'clinic');
  return { ...r, base: pub.definition, versionId: pub.versionId, versionNo: pub.versionNo, overrides: clinicRows };
}

async function effective(db, { clinicId, staffId, tpl }) {
  const pub = await publishedDefinition(db, tpl);
  const clinicRows = await getOverrides(db, clinicId, null, tpl.id);
  const doctorRows = staffId ? await getOverrides(db, clinicId, staffId, tpl.id) : [];
  const r = D.resolveEffective(pub.definition, clinicRows, doctorRows);
  return { ...r, versionId: pub.versionId, versionNo: pub.versionNo };
}

/** Has the clinic opted in to clinical templates? (No selection = legacy InferPad behaviour.) */
async function clinicSelections(db, clinicId) {
  const { rows } = await db.query(
    `SELECT template_id, is_default FROM clinic_template_selections WHERE clinic_id = $1`, [clinicId]);
  return rows;
}

/**
 * Which template a consultation uses: the doctor's choice (if the clinic offers it), else the
 * clinic default, else its first selection. Returns null when the clinic has not opted in.
 */
async function chooseTemplate(db, clinicId, staffId, requestedTemplateId) {
  const selections = await clinicSelections(db, clinicId);
  if (!selections.length) return null;
  const offered = new Set(selections.map(s => s.template_id));
  const candidates = [];
  if (requestedTemplateId) candidates.push(Number(requestedTemplateId));
  if (staffId) {
    const { rows } = await db.query(`SELECT clinical_template_id FROM emr_clinic_staff WHERE id = $1 AND clinic_id = $2`, [staffId, clinicId]);
    if (rows[0]?.clinical_template_id) candidates.push(rows[0].clinical_template_id);
  }
  const def = selections.find(s => s.is_default);
  if (def) candidates.push(def.template_id);
  candidates.push(selections[0].template_id);
  for (const id of candidates) {
    if (!offered.has(id)) continue;
    const tpl = await getTemplate(db, id);
    if (tpl && !tpl.is_archived && tpl.published_version_id && (tpl.clinic_id === null || tpl.clinic_id === clinicId)) return tpl;
  }
  return null;
}

// ── Consultation snapshots and values ───────────────────────────────────────
async function snapshot(db, def, tpl, versionId) {
  const clean = D.stripIds(def);
  // Same template + version + effective content → one shared snapshot row.
  const hash = require('crypto').createHash('sha256')
    .update(D.stableStringify({ t: tpl?.id ?? null, v: versionId ?? null, d: clean })).digest('hex');
  const { rows } = await db.query(
    `INSERT INTO consultation_template_snapshots (hash, template_id, version_id, definition)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (hash) DO UPDATE SET hash = EXCLUDED.hash
     RETURNING id`, [hash, tpl?.id ?? null, versionId ?? null, JSON.stringify({
      ...clean, template: tpl ? { id: tpl.id, name: tpl.name, specialty_key: tpl.specialty_key } : null,
    })]);
  return rows[0].id;
}

async function getSnapshot(db, snapshotId) {
  const { rows } = await db.query(`SELECT * FROM consultation_template_snapshots WHERE id = $1`, [snapshotId]);
  return rows[0] || null;
}

async function saveValues(db, { encounterId, clinicId, snapshotId, values }) {
  const keep = [];
  for (const [sectionKey, fields] of Object.entries(values || {})) {
    for (const [fieldKey, value] of Object.entries(fields || {})) {
      keep.push(`${sectionKey}.${fieldKey}`);
      await db.query(
        `INSERT INTO consultation_field_values (encounter_id, clinic_id, snapshot_id, section_key, field_key, value)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (encounter_id, section_key, field_key)
         DO UPDATE SET value = EXCLUDED.value, snapshot_id = EXCLUDED.snapshot_id, updated_at = NOW()`,
        [encounterId, clinicId, snapshotId, sectionKey, fieldKey, JSON.stringify(value)]);
    }
  }
  // Values the doctor cleared in this save
  await db.query(
    `DELETE FROM consultation_field_values
      WHERE encounter_id = $1 AND NOT ((section_key || '.' || field_key) = ANY($2::text[]))`,
    [encounterId, keep]);
}

async function loadValues(db, encounterId) {
  const { rows } = await db.query(
    `SELECT section_key, field_key, value FROM consultation_field_values WHERE encounter_id = $1`, [encounterId]);
  const out = {};
  for (const r of rows) (out[r.section_key] ||= {})[r.field_key] = r.value;
  return out;
}

/**
 * Called by saveEncounter inside its transaction. Returns null for clinics that have not opted in
 * (the save then behaves exactly as before). Otherwise validates the payload against the
 * consultation's template — its existing snapshot when the consultation was saved before, so a
 * later template change never reshapes an existing record — and returns what to persist.
 */
async function prepareConsultationSave(db, { clinicId, staffId, appointment, existingSnapshotId, body }) {
  let def, snapshotId = existingSnapshotId || null, tpl = null, versionId = null;
  if (snapshotId) {
    const snap = await getSnapshot(db, snapshotId);
    def = snap ? D.normalizeDefinition(snap.definition) : null;
  } else {
    tpl = await chooseTemplate(db, clinicId, staffId, body.template_id);
    if (!tpl) return null;
    const eff = await effective(db, { clinicId, staffId, tpl });
    def = eff.definition;
    versionId = eff.versionId;
  }
  if (!def) return null;
  const patient = {
    sex: appointment.patient_gender,
    age: appointment.patient_dob ? Math.floor((Date.now() - new Date(appointment.patient_dob)) / 31557600000) : null,
  };
  const { errors, warnings } = validateConsultation(def, body, { patient });
  const blocking = body.allow_incomplete ? errors.filter(e => e.locked) : errors;
  if (blocking.length) return { blocked: true, errors: blocking, warnings };
  if (!snapshotId) snapshotId = await snapshot(db, def, tpl, versionId);
  return { blocked: false, snapshotId, values: sanitizeValues(def, body.template_values), warnings, errors };
}

/** What to show for an existing consultation: its snapshot + values (null if none). */
async function encounterTemplate(db, encounterId, snapshotId) {
  if (!snapshotId) return null;
  const snap = await getSnapshot(db, snapshotId);
  if (!snap) return null;
  return { snapshot_id: snap.id, definition: snap.definition, values: await loadValues(db, encounterId) };
}

/** Section → [{ label, value }] for printing / PDF (print-enabled fields with values only). */
function printableValues(def, values) {
  const out = [];
  for (const s of D.normalizeDefinition(def).sections) {
    if (!s.enabled || !s.print_enabled) continue;
    const rows = [];
    for (const f of s.fields) {
      if (f.storage !== 'custom' || !f.print_enabled) continue;
      const v = values?.[s.key]?.[f.key];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
      const label = o => (f.options || []).find(x => String(x.value) === String(o))?.label ?? String(o);
      let text;
      if (Array.isArray(v)) text = v.map(label).join(', ');
      else if (typeof v === 'boolean') text = v ? 'Yes' : 'No';
      else if (v && typeof v === 'object') text = `${v.value ?? ''}${v.unit || f.unit ? ' ' + (v.unit || f.unit) : ''}`;
      else if (f.options) text = label(v);
      else text = `${v}${f.unit && ['number', 'decimal', 'measurement'].includes(f.type) ? ' ' + f.unit : ''}`;
      rows.push({ label: f.label, value: text });
    }
    if (rows.length) out.push({ section_key: s.key, section_label: s.label, fields: rows });
  }
  return out;
}

/** Adds encounter.template_print (custom field values to print) when the encounter has a template. */
async function attachTemplatePrint(db, encounter) {
  if (!encounter?.template_snapshot_id) return encounter;
  const t = await encounterTemplate(db, encounter.id, encounter.template_snapshot_id).catch(() => null);
  if (t) encounter.template_print = printableValues(t.definition, t.values);
  return encounter;
}

module.exports = {
  attachTemplatePrint, TemplateError, tx, audit, getTemplate, assertAccess, publishedDefinition, versionRowsDefinition,
  draftVersion, ensureDraft, saveDraft, publish, createTemplate, duplicateTemplate, listTemplates,
  getOverrides, replaceOverrides, clinicEffective, effective, clinicSelections, chooseTemplate,
  snapshot, getSnapshot, saveValues, loadValues, prepareConsultationSave, encounterTemplate,
  printableValues, insertDefinitionRows,
};
