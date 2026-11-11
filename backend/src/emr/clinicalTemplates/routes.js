/**
 * REST API for clinical templates.
 *
 *   emrRouter  — mounted on /api/emr (clinic users; clinic always taken from the login token)
 *   adminRouter — mounted on /api/admin (super admin; system templates)
 *
 * Endpoints (paths relative to the mount):
 *   GET    /clinical-templates                         list (system + this clinic's own)
 *   GET    /clinical-templates/catalog                 sections, field types, vitals, row columns
 *   GET    /clinical-templates/effective?template_id=   effective template for a new consultation
 *   POST   /clinical-templates/validate                 validate a consultation payload (no save)
 *   GET    /clinical-templates/:id                      template, published + draft definitions
 *   POST   /clinical-templates                          create (clinic-owned; system for admin)
 *   PUT    /clinical-templates/:id                      rename / describe
 *   DELETE /clinical-templates/:id                      archive
 *   POST   /clinical-templates/:id/duplicate
 *   PUT    /clinical-templates/:id/draft                replace the draft definition
 *   POST   /clinical-templates/:id/publish
 *   GET    /clinical-templates/:id/versions             version history
 *   POST   /clinical-templates/:id/sections             add a section to the draft
 *   PUT    /clinical-template-sections/:id | DELETE     edit / remove a draft section
 *   POST   /clinical-template-sections/:id/fields       add a field to a draft section
 *   PUT    /clinical-template-fields/:id    | DELETE    edit / remove a draft field
 *   GET|PUT /clinical-template-config                   clinic: which templates are offered (+ default)
 *   GET|PUT /clinical-template-config/templates/:id     clinic customisation of one template
 *   GET|PUT /clinical-template-config/doctors/:staffId  a doctor's preferences ('me' = yourself)
 *   GET    /appointments/:id/effective-template         template + values for a consultation
 *   POST|PUT /appointments/:id/clinical-data            save custom field values only
 *   GET    /clinical-templates/:id/audit                change history
 */
const express = require('express');
const { pool } = require('../../config/database');
const svc = require('./service');
const D = require('./definition');
const C = require('./catalog');
const { validateDefinition, validateConsultation, sanitizeValues } = require('./validator');

const { TemplateError } = svc;

// ── Helpers ─────────────────────────────────────────────────────────────────
const wrap = fn => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof TemplateError) return res.status(e.status).json({ error: e.message, ...(e.details || {}) });
    if (e.message && /cannot be modified|immutable/.test(e.message)) return res.status(409).json({ error: 'Published versions cannot be changed; edit the draft instead' });
    throw e;
  }
};

async function permissions(req) {
  if (req._ctPerms) return req._ctPerms;
  const u = req.emrUser;
  const { rows: [role] } = await pool.query(
    `SELECT permissions FROM staff_roles WHERE clinic_id = $1 AND slug = $2 LIMIT 1`, [u.clinic_id, u.role]);
  const { rows: [staff] } = await pool.query(
    `SELECT permissions FROM emr_clinic_staff WHERE id = $1 AND clinic_id = $2`, [u.id, u.clinic_id]);
  req._ctPerms = { ...(role?.permissions || {}), ...(staff?.permissions || {}) };
  return req._ctPerms;
}
async function canManage(req) {
  if (req.adminUser) return true;
  const p = await permissions(req);
  return req.emrUser.role === 'admin' || !!(p.all || p['settings.clinic'] || p['templates.manage']);
}
async function canPersonalize(req) {
  if (await canManage(req)) return true;
  const p = await permissions(req);
  return req.emrUser.role === 'doctor' || !!p['consultations.create'];
}
async function requireManage(req) {
  if (!(await canManage(req))) throw new TemplateError(403, 'Only clinic admins can change clinical templates');
}

const scopeOf = req => (req.adminUser ? { admin: true } : { clinicId: req.emrUser.clinic_id });
const actorOf = req => (req.adminUser
  ? { adminId: req.adminUser.id, clinicId: null }
  : { staffId: req.emrUser.id, clinicId: req.emrUser.clinic_id });

async function loadTemplate(req, db = pool, { write = false, forUpdate = false } = {}) {
  const tpl = await svc.getTemplate(db, Number(req.params.id), { forUpdate });
  svc.assertAccess(tpl, scopeOf(req), { write });
  return tpl;
}

/** Section/field row → its template (+ checks the version is a draft the caller may edit). */
async function draftOwnerOfSection(db, req, sectionId) {
  const { rows: [r] } = await db.query(
    `SELECT s.*, v.status, v.template_id FROM clinical_template_sections s
       JOIN clinical_template_versions v ON v.id = s.version_id WHERE s.id = $1`, [sectionId]);
  if (!r) throw new TemplateError(404, 'Section not found');
  const tpl = await svc.getTemplate(db, r.template_id, { forUpdate: true });
  svc.assertAccess(tpl, scopeOf(req), { write: true });
  if (r.status !== 'draft') throw new TemplateError(409, 'Only draft versions can be edited');
  return { section: r, tpl };
}

async function revalidateDraft(db, versionId) {
  const def = await svc.versionRowsDefinition(db, versionId);
  const errors = validateDefinition(def);
  if (errors.length) throw new TemplateError(422, 'Template has errors', { errors });
  return def;
}

const SECTION_COLS = { label: 'label', description: 'description', enabled: 'enabled', required: 'required', locked: 'locked', print_enabled: 'print_enabled', default_value: 'default_value', order: 'display_order' };
const FIELD_COLS = {
  label: 'label', description: 'description', type: 'field_type', placeholder: 'placeholder', default_value: 'default_value',
  required: 'required', locked: 'locked', enabled: 'enabled', print_enabled: 'print_enabled', min: 'min_value', max: 'max_value',
  min_length: 'min_length', max_length: 'max_length', options: 'options', unit: 'unit', validation: 'validation',
  visibility: 'visibility', order: 'display_order',
};
const JSON_COLS = new Set(['default_value', 'options', 'validation', 'visibility']);
async function updateRow(db, table, id, map, body) {
  const sets = []; const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (!(k in body)) continue;
    vals.push(JSON_COLS.has(col) && body[k] != null ? JSON.stringify(body[k]) : body[k]);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) return;
  vals.push(id);
  await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
}

// ── Shared template-management routes (clinic + super admin) ────────────────
function templateRoutes(router) {
  router.get('/clinical-templates/catalog', wrap(async (_req, res) => {
    res.json({
      sections: C.SECTIONS, field_types: C.FIELD_TYPES, row_columns: C.ROW_COLUMNS,
      vitals: C.VITALS.map(([key, label, unit, decimal, low, high]) => ({ key, label, unit, decimal, ref_low: low, ref_high: high })),
      specialties: Object.entries(C.SPECIALTIES).map(([key, s]) => ({ key, name: s.name })),
    });
  }));

  router.get('/clinical-templates', wrap(async (req, res) => {
    const clinicId = req.adminUser ? 0 : req.emrUser.clinic_id;   // admin: system templates only
    const templates = await svc.listTemplates(pool, clinicId);
    const adopted = req.adminUser ? null : (await svc.clinicSelections(pool, clinicId)).length > 0;
    res.json({ templates: req.adminUser ? templates.filter(t => t.clinic_id === null) : templates, adopted, can_manage: await canManage(req) });
  }));

  router.get('/clinical-templates/:id(\\d+)', wrap(async (req, res) => {
    const tpl = await loadTemplate(req);
    const pub = await svc.publishedDefinition(pool, tpl);
    const draft = await svc.draftVersion(pool, tpl.id);
    const ownsTemplate = req.adminUser ? tpl.clinic_id === null : tpl.clinic_id === req.emrUser.clinic_id;
    const out = {
      template: tpl, published: { version_id: pub.versionId, version_no: pub.versionNo, definition: pub.definition },
      draft: draft && ownsTemplate ? { version_id: draft.id, version_no: draft.version_no, definition: await svc.versionRowsDefinition(pool, draft.id) } : null,
      can_edit: ownsTemplate && (await canManage(req)),
    };
    if (!req.adminUser) {
      const ce = await svc.clinicEffective(pool, req.emrUser.clinic_id, tpl);
      out.clinic = { definition: ce.definition, overrides: ce.overrides, ignored: ce.ignored };
    }
    res.json(out);
  }));

  router.get('/clinical-templates/:id(\\d+)/versions', wrap(async (req, res) => {
    const tpl = await loadTemplate(req);
    const { rows } = await pool.query(
      `SELECT id, version_no, status, notes, created_at, published_at FROM clinical_template_versions
        WHERE template_id = $1 ORDER BY version_no DESC`, [tpl.id]);
    res.json(rows);
  }));

  router.get('/clinical-templates/:id(\\d+)/audit', wrap(async (req, res) => {
    const tpl = await loadTemplate(req);
    const params = [tpl.id];
    let clinicFilter = '';
    if (!req.adminUser) { params.push(req.emrUser.clinic_id); clinicFilter = 'AND (a.clinic_id = $2 OR a.clinic_id IS NULL)'; }
    const { rows } = await pool.query(
      `SELECT a.id, a.action, a.details, a.created_at, a.version_id, s.name AS staff_name
         FROM clinical_template_audit a LEFT JOIN emr_clinic_staff s ON s.id = a.staff_id
        WHERE a.template_id = $1 ${clinicFilter} ORDER BY a.created_at DESC LIMIT 200`, params);
    res.json(rows);
  }));

  router.post('/clinical-templates', wrap(async (req, res) => {
    await requireManage(req);
    const { name, specialty_key, description, from_template_id } = req.body || {};
    const clinicId = req.adminUser ? null : req.emrUser.clinic_id;
    if (req.adminUser && !/^[a-z][a-z0-9_]{1,49}$/.test(specialty_key || '')) {
      throw new TemplateError(400, 'specialty_key (lower-case letters, digits, _) is required for a system template');
    }
    const tpl = await svc.tx(async db => {
      if (from_template_id) {
        const src = await svc.getTemplate(db, Number(from_template_id));
        svc.assertAccess(src, scopeOf(req));
        return svc.duplicateTemplate(db, src, { clinicId, name, actor: actorOf(req), specialtyKey: specialty_key, description });
      }
      return svc.createTemplate(db, {
        clinicId, name, specialtyKey: specialty_key || 'general', description, actor: actorOf(req),
        definition: C.SPECIALTIES[specialty_key] ? C.buildSpecialtyDefinition(specialty_key) : undefined,
      });
    });
    res.status(201).json(tpl);
  }));

  router.put('/clinical-templates/:id(\\d+)', wrap(async (req, res) => {
    await requireManage(req);
    const { name, description, scribe_specialty } = req.body || {};
    const tpl = await svc.tx(async db => {
      const t = await loadTemplate(req, db, { write: true, forUpdate: true });
      try {
        await db.query(
          `UPDATE clinical_templates SET name = COALESCE($2, name), description = COALESCE($3, description),
                  scribe_specialty = COALESCE($4, scribe_specialty), updated_at = NOW() WHERE id = $1`,
          [t.id, name?.trim() || null, description ?? null, scribe_specialty || null]);
      } catch (e) { if (e.code === '23505') throw new TemplateError(409, 'A template with this name already exists'); throw e; }
      await svc.audit(db, { ...actorOf(req), templateId: t.id, action: 'renamed', details: { name, description } });
      return svc.getTemplate(db, t.id);
    });
    res.json(tpl);
  }));

  router.delete('/clinical-templates/:id(\\d+)', wrap(async (req, res) => {
    await requireManage(req);
    await svc.tx(async db => {
      const t = await loadTemplate(req, db, { write: true, forUpdate: true });
      await db.query(`UPDATE clinical_templates SET is_archived = true, updated_at = NOW() WHERE id = $1`, [t.id]);
      await db.query(`DELETE FROM clinic_template_selections WHERE template_id = $1`, [t.id]);
      await svc.audit(db, { ...actorOf(req), templateId: t.id, action: 'archived' });
    });
    res.json({ ok: true });
  }));

  router.post('/clinical-templates/:id(\\d+)/duplicate', wrap(async (req, res) => {
    await requireManage(req);
    if (req.adminUser) throw new TemplateError(400, 'Create a new system template with from_template_id and a specialty_key instead');
    const tpl = await svc.tx(async db => {
      const src = await loadTemplate(req, db);
      return svc.duplicateTemplate(db, src, { clinicId: req.emrUser.clinic_id, name: req.body?.name, actor: actorOf(req) });
    });
    res.status(201).json(tpl);
  }));

  router.put('/clinical-templates/:id(\\d+)/draft', wrap(async (req, res) => {
    await requireManage(req);
    const def = req.body?.definition;
    if (!def || !Array.isArray(def.sections)) throw new TemplateError(400, 'definition.sections is required');
    const out = await svc.tx(async db => {
      const t = await loadTemplate(req, db, { write: true, forUpdate: true });
      const v = await svc.saveDraft(db, t, def, actorOf(req));
      return { version_id: v.id, version_no: v.version_no, definition: await svc.versionRowsDefinition(db, v.id) };
    });
    res.json(out);
  }));

  router.post('/clinical-templates/:id(\\d+)/publish', wrap(async (req, res) => {
    await requireManage(req);
    const out = await svc.tx(async db => {
      const t = await loadTemplate(req, db, { write: true, forUpdate: true });
      return svc.publish(db, t, actorOf(req), req.body?.notes);
    });
    res.json(out);
  }));

  // Granular draft edits
  router.post('/clinical-templates/:id(\\d+)/sections', wrap(async (req, res) => {
    await requireManage(req);
    const b = req.body || {};
    const out = await svc.tx(async db => {
      const t = await loadTemplate(req, db, { write: true, forUpdate: true });
      const v = await svc.ensureDraft(db, t, actorOf(req));
      const { rows: [{ n }] } = await db.query(`SELECT COALESCE(MAX(display_order), -1) + 1 AS n FROM clinical_template_sections WHERE version_id = $1`, [v.id]);
      const builtin = !!C.SECTION_BY_KEY[b.key];
      const { rows: [s] } = await db.query(
        `INSERT INTO clinical_template_sections (version_id, section_key, label, description, builtin, enabled, required, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [v.id, b.key, b.label || b.key, b.description || null, builtin, b.enabled !== false, !!b.required, b.order ?? n]);
      await revalidateDraft(db, v.id);
      await svc.audit(db, { ...actorOf(req), templateId: t.id, versionId: v.id, action: 'section_added', details: { key: b.key } });
      return { id: s.id, version_id: v.id };
    });
    res.status(201).json(out);
  }));

  router.put('/clinical-template-sections/:id(\\d+)', wrap(async (req, res) => {
    await requireManage(req);
    await svc.tx(async db => {
      const { section, tpl } = await draftOwnerOfSection(db, req, Number(req.params.id));
      await updateRow(db, 'clinical_template_sections', section.id, SECTION_COLS, req.body || {});
      await revalidateDraft(db, section.version_id);
      await svc.audit(db, { ...actorOf(req), templateId: tpl.id, versionId: section.version_id, action: 'section_updated', details: { key: section.section_key } });
    });
    res.json({ ok: true });
  }));

  router.delete('/clinical-template-sections/:id(\\d+)', wrap(async (req, res) => {
    await requireManage(req);
    await svc.tx(async db => {
      const { section, tpl } = await draftOwnerOfSection(db, req, Number(req.params.id));
      if (section.builtin) throw new TemplateError(400, 'Built-in sections cannot be deleted; disable them instead');
      await db.query(`DELETE FROM clinical_template_sections WHERE id = $1`, [section.id]);
      await svc.audit(db, { ...actorOf(req), templateId: tpl.id, versionId: section.version_id, action: 'section_deleted', details: { key: section.section_key } });
    });
    res.json({ ok: true });
  }));

  router.post('/clinical-template-sections/:id(\\d+)/fields', wrap(async (req, res) => {
    await requireManage(req);
    const b = req.body || {};
    const out = await svc.tx(async db => {
      const { section, tpl } = await draftOwnerOfSection(db, req, Number(req.params.id));
      const { rows: [{ n }] } = await db.query(`SELECT COALESCE(MAX(display_order), -1) + 1 AS n FROM clinical_template_fields WHERE section_id = $1`, [section.id]);
      const f = D.normalizeField({ ...b, storage: 'custom', core_path: null, order: b.order ?? n });
      const { rows: [row] } = await db.query(
        `INSERT INTO clinical_template_fields (section_id, field_key, label, description, field_type, placeholder, default_value,
            required, locked, enabled, print_enabled, min_value, max_value, min_length, max_length, options, unit, validation, visibility,
            storage, core_path, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'custom',NULL,$20) RETURNING id`,
        [section.id, f.key, f.label, f.description, f.type, f.placeholder, f.default_value == null ? null : JSON.stringify(f.default_value),
          f.required, f.locked, f.enabled, f.print_enabled, f.min, f.max, f.min_length, f.max_length,
          f.options == null ? null : JSON.stringify(f.options), f.unit, f.validation == null ? null : JSON.stringify(f.validation),
          f.visibility == null ? null : JSON.stringify(f.visibility), f.order]);
      await revalidateDraft(db, section.version_id);
      await svc.audit(db, { ...actorOf(req), templateId: tpl.id, versionId: section.version_id, action: 'field_added', details: { section: section.section_key, key: f.key } });
      return { id: row.id };
    });
    res.status(201).json(out);
  }));

  async function fieldOwner(db, req) {
    const { rows: [f] } = await db.query(`SELECT * FROM clinical_template_fields WHERE id = $1`, [Number(req.params.id)]);
    if (!f) throw new TemplateError(404, 'Field not found');
    const owner = await draftOwnerOfSection(db, req, f.section_id);
    return { field: f, ...owner };
  }

  router.put('/clinical-template-fields/:id(\\d+)', wrap(async (req, res) => {
    await requireManage(req);
    await svc.tx(async db => {
      const { field, section, tpl } = await fieldOwner(db, req);
      const body = { ...(req.body || {}) };
      if (field.storage === 'core') delete body.type;             // core fields keep their type
      await updateRow(db, 'clinical_template_fields', field.id, FIELD_COLS, body);
      await revalidateDraft(db, section.version_id);
      await svc.audit(db, { ...actorOf(req), templateId: tpl.id, versionId: section.version_id, action: 'field_updated', details: { section: section.section_key, key: field.field_key } });
    });
    res.json({ ok: true });
  }));

  router.delete('/clinical-template-fields/:id(\\d+)', wrap(async (req, res) => {
    await requireManage(req);
    await svc.tx(async db => {
      const { field, section, tpl } = await fieldOwner(db, req);
      if (field.storage === 'core') throw new TemplateError(400, 'Built-in fields cannot be deleted; disable them instead');
      await db.query(`DELETE FROM clinical_template_fields WHERE id = $1`, [field.id]);
      await revalidateDraft(db, section.version_id);
      await svc.audit(db, { ...actorOf(req), templateId: tpl.id, versionId: section.version_id, action: 'field_deleted', details: { section: section.section_key, key: field.field_key } });
    });
    res.json({ ok: true });
  }));
}

// ── Clinic-only routes ──────────────────────────────────────────────────────
function clinicRoutes(router) {
  // Which templates the clinic offers. An empty list turns the feature off (legacy InferPad).
  router.get('/clinical-template-config', wrap(async (req, res) => {
    const clinicId = req.emrUser.clinic_id;
    const selections = await svc.clinicSelections(pool, clinicId);
    const { rows: [me] } = await pool.query(`SELECT clinical_template_id FROM emr_clinic_staff WHERE id = $1`, [req.emrUser.id]);
    res.json({ adopted: selections.length > 0, selections, my_template_id: me?.clinical_template_id || null, can_manage: await canManage(req) });
  }));

  router.put('/clinical-template-config', wrap(async (req, res) => {
    await requireManage(req);
    const clinicId = req.emrUser.clinic_id;
    const list = Array.isArray(req.body?.selections) ? req.body.selections : null;
    if (!list) throw new TemplateError(400, 'selections[] is required');
    await svc.tx(async db => {
      for (const s of list) {
        const t = await svc.getTemplate(db, Number(s.template_id));
        svc.assertAccess(t, { clinicId });
        if (!t.published_version_id || t.is_archived) throw new TemplateError(400, `Template ${t.name} is not published`);
      }
      const defaults = list.filter(s => s.is_default);
      if (defaults.length > 1) throw new TemplateError(400, 'Only one default template is allowed');
      await db.query(`DELETE FROM clinic_template_selections WHERE clinic_id = $1`, [clinicId]);
      for (const [i, s] of list.entries()) {
        await db.query(`INSERT INTO clinic_template_selections (clinic_id, template_id, is_default) VALUES ($1,$2,$3)`,
          [clinicId, Number(s.template_id), defaults.length ? !!s.is_default : i === 0]);
      }
      await svc.audit(db, { ...actorOf(req), action: 'selections_saved', details: { selections: list } });
    });
    res.json({ ok: true, selections: await svc.clinicSelections(pool, clinicId) });
  }));

  // Clinic customisation of one template
  router.get('/clinical-template-config/templates/:id(\\d+)', wrap(async (req, res) => {
    const tpl = await loadTemplate(req);
    const ce = await svc.clinicEffective(pool, req.emrUser.clinic_id, tpl);
    res.json({ template: tpl, base: ce.base, definition: ce.definition, overrides: ce.overrides, ignored: ce.ignored, version_no: ce.versionNo });
  }));

  router.put('/clinical-template-config/templates/:id(\\d+)', wrap(async (req, res) => {
    await requireManage(req);
    const clinicId = req.emrUser.clinic_id;
    const out = await svc.tx(async db => {
      const tpl = await loadTemplate(req, db);
      const pub = await svc.publishedDefinition(db, tpl);
      const rows = Array.isArray(req.body?.overrides) ? req.body.overrides
        : req.body?.definition ? D.diffDefinitions(pub.definition, req.body.definition, 'clinic') : null;
      if (!rows) throw new TemplateError(400, 'definition or overrides is required');
      const result = D.applyOverrides(pub.definition, rows, 'clinic');
      const errors = validateDefinition(result.definition);
      if (errors.length) throw new TemplateError(422, 'Customisation has errors', { errors });
      await svc.replaceOverrides(db, { clinicId, staffId: null, templateId: tpl.id, rows, actor: actorOf(req) });
      return { definition: result.definition, ignored: result.ignored, overrides: rows };
    });
    res.json(out);
  }));

  // A doctor's preferences ('me' = the signed-in user). Admins may view/edit any doctor of the clinic.
  async function targetStaff(req) {
    const clinicId = req.emrUser.clinic_id;
    const staffId = req.params.staffId === 'me' ? req.emrUser.id : Number(req.params.staffId);
    if (staffId !== req.emrUser.id && !(await canManage(req))) throw new TemplateError(403, 'You can only change your own preferences');
    const { rows: [s] } = await pool.query(`SELECT id, name, clinical_template_id FROM emr_clinic_staff WHERE id = $1 AND clinic_id = $2`, [staffId, clinicId]);
    if (!s) throw new TemplateError(404, 'Staff member not found');
    return s;
  }

  router.get('/clinical-template-config/doctors/:staffId', wrap(async (req, res) => {
    const staff = await targetStaff(req);
    const clinicId = req.emrUser.clinic_id;
    const tpl = await svc.chooseTemplate(pool, clinicId, staff.id, req.query.template_id);
    if (!tpl) return res.json({ adopted: false, staff });
    const ce = await svc.clinicEffective(pool, clinicId, tpl);
    const mine = await svc.getOverrides(pool, clinicId, staff.id, tpl.id);
    const r = D.applyOverrides(ce.definition, mine, 'doctor');
    res.json({ adopted: true, staff, template: tpl, base: ce.definition, definition: r.definition, overrides: mine, ignored: r.ignored });
  }));

  router.put('/clinical-template-config/doctors/:staffId', wrap(async (req, res) => {
    if (!(await canPersonalize(req))) throw new TemplateError(403, 'Not allowed');
    const staff = await targetStaff(req);
    const clinicId = req.emrUser.clinic_id;
    const out = await svc.tx(async db => {
      const selections = await svc.clinicSelections(db, clinicId);
      if (req.body && 'template_id' in req.body) {
        const tid = req.body.template_id ? Number(req.body.template_id) : null;
        if (tid && !selections.some(s => s.template_id === tid)) throw new TemplateError(400, 'Your clinic does not offer this template');
        await db.query(`UPDATE emr_clinic_staff SET clinical_template_id = $2 WHERE id = $1`, [staff.id, tid]);
      }
      const tpl = await svc.chooseTemplate(db, clinicId, staff.id, req.body?.template_id);
      if (!tpl) throw new TemplateError(409, 'Your clinic has not set up clinical templates yet');
      if (!req.body?.definition && !Array.isArray(req.body?.overrides)) return { template: tpl };
      const ce = await svc.clinicEffective(db, clinicId, tpl);
      const rows = Array.isArray(req.body.overrides) ? req.body.overrides : D.diffDefinitions(ce.definition, req.body.definition, 'doctor');
      const result = D.applyOverrides(ce.definition, rows, 'doctor');
      const errors = validateDefinition(result.definition);
      if (errors.length) throw new TemplateError(422, 'Preferences have errors', { errors });
      await svc.replaceOverrides(db, { clinicId, staffId: staff.id, templateId: tpl.id, rows, actor: actorOf(req) });
      return { template: tpl, definition: result.definition, ignored: result.ignored, overrides: rows };
    });
    res.json(out);
  }));

  // Effective template for a NEW consultation by the signed-in user
  router.get('/clinical-templates/effective', wrap(async (req, res) => {
    const clinicId = req.emrUser.clinic_id;
    const tpl = await svc.chooseTemplate(pool, clinicId, req.emrUser.id, req.query.template_id);
    if (!tpl) return res.json({ adopted: false });
    const eff = await svc.effective(pool, { clinicId, staffId: req.emrUser.id, tpl });
    res.json({ adopted: true, template: { id: tpl.id, name: tpl.name, specialty_key: tpl.specialty_key, scribe_specialty: tpl.scribe_specialty },
      version_no: eff.versionNo, definition: eff.definition, ignored: eff.ignored });
  }));

  async function appointmentOf(req, db = pool) {
    const { rows: [a] } = await db.query(
      `SELECT a.*, e.id AS encounter_id, e.template_snapshot_id
         FROM emr_appointments a LEFT JOIN emr_encounters e ON e.appointment_id = a.id
        WHERE a.id = $1 AND a.clinic_id = $2`, [Number(req.params.id), req.emrUser.clinic_id]);
    if (!a) throw new TemplateError(404, 'Appointment not found');
    return a;
  }

  // Template + values of a consultation: its snapshot once saved, else what a new one would use
  router.get('/appointments/:id(\\d+)/effective-template', wrap(async (req, res) => {
    const a = await appointmentOf(req);
    const saved = await svc.encounterTemplate(pool, a.encounter_id, a.template_snapshot_id);
    if (saved) return res.json({ adopted: true, source: 'snapshot', ...saved, template: saved.definition.template || null });
    const tpl = await svc.chooseTemplate(pool, req.emrUser.clinic_id, a.doctor_id || req.emrUser.id, req.query.template_id);
    if (!tpl) return res.json({ adopted: false });
    const eff = await svc.effective(pool, { clinicId: req.emrUser.clinic_id, staffId: a.doctor_id || req.emrUser.id, tpl });
    res.json({ adopted: true, source: 'current', template: { id: tpl.id, name: tpl.name, specialty_key: tpl.specialty_key },
      version_no: eff.versionNo, definition: eff.definition, values: {} });
  }));

  // Validate without saving (lets any client check against the server's rules)
  router.post('/clinical-templates/validate', wrap(async (req, res) => {
    const payload = req.body?.payload || {};
    let def;
    if (req.body?.appointment_id) {
      req.params.id = req.body.appointment_id;
      const a = await appointmentOf(req);
      const saved = await svc.encounterTemplate(pool, a.encounter_id, a.template_snapshot_id);
      if (saved) def = saved.definition;
    }
    if (!def) {
      const tpl = await svc.chooseTemplate(pool, req.emrUser.clinic_id, req.emrUser.id, req.body?.template_id);
      if (!tpl) return res.json({ adopted: false, errors: [], warnings: [] });
      def = (await svc.effective(pool, { clinicId: req.emrUser.clinic_id, staffId: req.emrUser.id, tpl })).definition;
    }
    res.json({ adopted: true, ...validateConsultation(def, payload, { patient: req.body?.patient }) });
  }));

  // Save only the custom field values of an already-saved consultation
  const saveClinicalData = wrap(async (req, res) => {
    const out = await svc.tx(async db => {
      const a = await appointmentOf(req, db);
      if (!a.encounter_id || !a.template_snapshot_id) throw new TemplateError(409, 'Save the consultation first');
      const snap = await svc.getSnapshot(db, a.template_snapshot_id);
      const { rows: [enc] } = await db.query(`SELECT * FROM emr_encounters WHERE id = $1`, [a.encounter_id]);
      const payload = { ...enc, template_values: req.body?.template_values || {} };
      const { errors, warnings } = validateConsultation(snap.definition, payload, { patient: { sex: a.patient_gender } });
      const blocking = req.body?.allow_incomplete ? errors.filter(e => e.locked) : errors;
      if (blocking.length) throw new TemplateError(422, 'validation_failed', { errors: blocking, warnings });
      const values = sanitizeValues(snap.definition, payload.template_values);
      await svc.saveValues(db, { encounterId: a.encounter_id, clinicId: a.clinic_id, snapshotId: snap.id, values });
      return { values, warnings };
    });
    res.json(out);
  });
  router.post('/appointments/:id(\\d+)/clinical-data', saveClinicalData);
  router.put('/appointments/:id(\\d+)/clinical-data', saveClinicalData);
}

const emrRouter = express.Router();
clinicRoutes(emrRouter);   // before the shared routes so '/clinical-templates/effective' wins
templateRoutes(emrRouter);

const adminRouter = express.Router();
templateRoutes(adminRouter);

module.exports = { emrRouter, adminRouter };
