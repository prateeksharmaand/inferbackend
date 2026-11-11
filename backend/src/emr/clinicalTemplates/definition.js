/**
 * Pure functions over a template definition — no database access, so they are unit-tested
 * directly and shared by the APIs, the consultation save and the seeds.
 *
 * Definition shape:
 *   { sections: [ { key, label, description, builtin, enabled, required, locked, print_enabled,
 *                   default_value, order, origin, fields: [Field] } ] }
 *   Field: { key, label, description, type, placeholder, default_value, required, locked, enabled,
 *            print_enabled, min, max, min_length, max_length, options, unit, validation,
 *            visibility, storage, core_path, order, origin }
 *
 * origin: who introduced the item — 'template' (the template itself), 'clinic' or 'doctor'
 * (added through an override). Only the level that added an item may delete it.
 *
 * Inheritance: effective = applyOverrides(applyOverrides(template, clinicRows, 'clinic'), doctorRows, 'doctor').
 * Rules (compliance):
 *   - a LOCKED section/field cannot be disabled, made optional or have its clinical rules
 *     (type, options, limits, validation, unit) changed by a lower level;
 *   - a doctor can never relax anything required at template or clinic level, and can only
 *     change visibility, order, defaults and placeholders of items they did not add.
 */
const crypto = require('crypto');

const SECTION_DEFAULTS = {
  description: null, builtin: false, enabled: true, required: false, locked: false,
  print_enabled: true, default_value: null, order: 0, origin: 'template',
};
const FIELD_DEFAULTS = {
  description: null, placeholder: null, default_value: null, required: false, locked: false,
  enabled: true, print_enabled: true, min: null, max: null, min_length: null, max_length: null,
  options: null, unit: null, validation: null, visibility: null, storage: 'custom', core_path: null,
  order: 0, origin: 'template',
};

// Properties each level may override on items it did not add.
const CLINIC_SECTION_PROPS = ['label', 'description', 'enabled', 'required', 'locked', 'print_enabled', 'default_value', 'order'];
const CLINIC_FIELD_PROPS = ['label', 'description', 'placeholder', 'default_value', 'required', 'locked', 'enabled',
  'print_enabled', 'min', 'max', 'min_length', 'max_length', 'options', 'unit', 'validation', 'visibility', 'order'];
const DOCTOR_SECTION_PROPS = ['enabled', 'default_value', 'order'];
const DOCTOR_FIELD_PROPS = ['enabled', 'default_value', 'placeholder', 'order'];
// Clinical rules a lock protects.
const LOCK_PROTECTED = new Set(['min', 'max', 'min_length', 'max_length', 'options', 'unit', 'validation', 'locked']);

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const byOrder = (a, b) => (a.order - b.order) || String(a.key).localeCompare(String(b.key));

function normalizeField(f, i = 0) {
  const out = { ...FIELD_DEFAULTS, ...clone(f) };
  out.key = String(out.key || '').trim();
  out.label = String(out.label || out.key).trim();
  out.type = out.type || 'text';
  if (out.storage === 'core' && !out.core_path) out.storage = 'custom';
  if (typeof out.order !== 'number') out.order = i;
  return out;
}

function normalizeSection(s, i = 0) {
  const out = { ...SECTION_DEFAULTS, ...clone(s) };
  out.key = String(out.key || '').trim();
  out.label = String(out.label || out.key).trim();
  if (typeof out.order !== 'number') out.order = i;
  out.fields = (s.fields || []).map(normalizeField).sort(byOrder);
  return out;
}

function normalizeDefinition(def) {
  return { sections: ((def && def.sections) || []).map(normalizeSection).sort(byOrder) };
}

/** Rebuild a definition from clinical_template_sections / clinical_template_fields rows. */
function definitionFromRows(sectionRows, fieldRows) {
  const fieldsBySection = {};
  for (const r of fieldRows) {
    (fieldsBySection[r.section_id] ||= []).push({
      id: r.id, key: r.field_key, label: r.label, description: r.description, type: r.field_type,
      placeholder: r.placeholder, default_value: r.default_value, required: r.required, locked: r.locked,
      enabled: r.enabled, print_enabled: r.print_enabled,
      min: r.min_value == null ? null : Number(r.min_value), max: r.max_value == null ? null : Number(r.max_value),
      min_length: r.min_length, max_length: r.max_length, options: r.options, unit: r.unit,
      validation: r.validation, visibility: r.visibility, storage: r.storage, core_path: r.core_path,
      order: r.display_order,
    });
  }
  return normalizeDefinition({
    sections: sectionRows.map(r => ({
      id: r.id, key: r.section_key, label: r.label, description: r.description, builtin: r.builtin,
      enabled: r.enabled, required: r.required, locked: r.locked, print_enabled: r.print_enabled,
      default_value: r.default_value, order: r.display_order, fields: fieldsBySection[r.id] || [],
    })),
  });
}

/** Definition without database ids or origin markers (for publishing, hashing, comparing). */
function stripIds(def) {
  return {
    sections: normalizeDefinition(def).sections.map(({ id, fields, ...s }) => ({
      ...s, fields: fields.map(({ id: _id, ...f }) => f),
    })),
  };
}

function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}
function hashDefinition(def) {
  return crypto.createHash('sha256').update(stableStringify(stripIds(def))).digest('hex');
}

/**
 * Apply override rows of one level.
 * rows: [{ section_key, field_key ('' = section), kind: 'modify'|'add', props }]
 * Returns { definition, ignored: [{ section_key, field_key, prop, reason }] }.
 */
function applyOverrides(def, rows, level) {
  const out = normalizeDefinition(def);
  const ignored = [];
  const sectionProps = level === 'doctor' ? DOCTOR_SECTION_PROPS : CLINIC_SECTION_PROPS;
  const fieldProps = level === 'doctor' ? DOCTOR_FIELD_PROPS : CLINIC_FIELD_PROPS;
  const ignore = (r, prop, reason) => ignored.push({ section_key: r.section_key, field_key: r.field_key || '', prop, reason });

  // Additions first, so modifications can target added items too.
  const ordered = [...(rows || [])].sort((a, b) => (a.kind === 'add' ? 0 : 1) - (b.kind === 'add' ? 0 : 1));
  for (const r of ordered) {
    const fieldKey = r.field_key || '';
    const props = r.props || {};
    let section = out.sections.find(s => s.key === r.section_key);

    if (r.kind === 'add') {
      if (!fieldKey) {
        if (section) { ignore(r, '*', 'section_exists'); continue; }
        out.sections.push(normalizeSection({
          ...props, key: r.section_key, builtin: false, origin: level, fields: [],
          order: typeof props.order === 'number' ? props.order : out.sections.length,
        }));
        continue;
      }
      if (!section) { ignore(r, '*', 'section_missing'); continue; }
      if (section.fields.some(f => f.key === fieldKey)) { ignore(r, '*', 'field_exists'); continue; }
      section.fields.push(normalizeField({
        ...props, key: fieldKey, storage: 'custom', core_path: null, origin: level,
        order: typeof props.order === 'number' ? props.order : section.fields.length,
      }));
      continue;
    }

    if (!section) { ignore(r, '*', 'section_missing'); continue; }
    const target = fieldKey ? section.fields.find(f => f.key === fieldKey) : section;
    if (!target) { ignore(r, '*', 'field_missing'); continue; }
    const ownItem = target.origin === level;            // added by this level → full control
    const allowed = ownItem ? null : new Set(fieldKey ? fieldProps : sectionProps);

    for (const [prop, value] of Object.entries(props)) {
      if (allowed && !allowed.has(prop)) { ignore(r, prop, 'not_permitted'); continue; }
      if (!ownItem && target.locked) {
        if ((prop === 'enabled' && value === false) || (prop === 'required' && value === false) || LOCK_PROTECTED.has(prop)) {
          ignore(r, prop, 'locked'); continue;
        }
      }
      if (level === 'doctor' && !ownItem && target.required) {
        if ((prop === 'enabled' && value === false)) { ignore(r, prop, 'required'); continue; }
      }
      target[prop] = clone(value);
    }
    if (fieldKey) section.fields.sort(byOrder);
  }
  out.sections.sort(byOrder);
  return { definition: out, ignored };
}

function resolveEffective(templateDef, clinicRows, doctorRows) {
  const c = applyOverrides(templateDef, clinicRows, 'clinic');
  const d = applyOverrides(c.definition, doctorRows, 'doctor');
  return { definition: d.definition, ignored: [...c.ignored.map(x => ({ ...x, level: 'clinic' })), ...d.ignored.map(x => ({ ...x, level: 'doctor' }))] };
}

const COMPARABLE_SECTION = [...new Set([...CLINIC_SECTION_PROPS])];
const COMPARABLE_FIELD = [...new Set([...CLINIC_FIELD_PROPS])];
const same = (a, b) => stableStringify(a ?? null) === stableStringify(b ?? null);

/**
 * Turn an edited definition back into override rows of `level`, relative to `base` (the
 * definition that level inherits). Items the level added become 'add' rows; changed inherited
 * items become 'modify' rows holding only the changed, permitted props. Inherited items missing
 * from `desired` are treated as disabled (inherited items are never deleted from a lower level).
 */
function diffDefinitions(base, desired, level) {
  const b = normalizeDefinition(base);
  const d = normalizeDefinition(desired);
  const rows = [];
  const sectionProps = level === 'doctor' ? DOCTOR_SECTION_PROPS : COMPARABLE_SECTION;
  const fieldProps = level === 'doctor' ? DOCTOR_FIELD_PROPS : COMPARABLE_FIELD;
  const strip = ({ id, fields, origin, ...rest }) => rest;
  const stripF = ({ id, origin, storage, core_path, ...rest }) => rest;

  for (const ds of d.sections) {
    const bs = b.sections.find(s => s.key === ds.key);
    if (!bs) {
      rows.push({ section_key: ds.key, field_key: '', kind: 'add', props: strip(ds) });
      ds.fields.forEach(f => rows.push({ section_key: ds.key, field_key: f.key, kind: 'add', props: stripF(f) }));
      continue;
    }
    const sp = {};
    for (const p of sectionProps) if (!same(bs[p], ds[p])) sp[p] = ds[p];
    if (Object.keys(sp).length) rows.push({ section_key: ds.key, field_key: '', kind: 'modify', props: sp });

    for (const df of ds.fields) {
      const bf = bs.fields.find(f => f.key === df.key);
      if (!bf) { rows.push({ section_key: ds.key, field_key: df.key, kind: 'add', props: stripF(df) }); continue; }
      const fp = {};
      for (const p of fieldProps) if (!same(bf[p], df[p])) fp[p] = df[p];
      if (Object.keys(fp).length) rows.push({ section_key: ds.key, field_key: df.key, kind: 'modify', props: fp });
    }
    for (const bf of bs.fields) {
      if (!ds.fields.some(f => f.key === bf.key) && bf.enabled) {
        rows.push({ section_key: ds.key, field_key: bf.key, kind: 'modify', props: { enabled: false } });
      }
    }
  }
  for (const bs of b.sections) {
    if (!d.sections.some(s => s.key === bs.key) && bs.enabled) {
      rows.push({ section_key: bs.key, field_key: '', kind: 'modify', props: { enabled: false } });
    }
  }
  return rows;
}

/** Fields that end up in consultation_field_values (enabled custom fields of enabled sections). */
function customFields(def) {
  const out = [];
  for (const s of def.sections) {
    if (!s.enabled) continue;
    for (const f of s.fields) if (f.enabled && f.storage === 'custom') out.push({ section: s, field: f });
  }
  return out;
}

module.exports = {
  normalizeDefinition, normalizeField, normalizeSection, definitionFromRows, stripIds,
  hashDefinition, stableStringify, applyOverrides, resolveEffective, diffDefinitions, customFields,
  CLINIC_SECTION_PROPS, CLINIC_FIELD_PROPS, DOCTOR_SECTION_PROPS, DOCTOR_FIELD_PROPS,
};
