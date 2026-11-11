/**
 * Validation, in one place for every client (web today, mobile later):
 *   validateDefinition(def)                → structural errors in a template before saving/publishing
 *   validateConsultation(def, payload, ctx) → { errors, warnings } for a consultation save
 *
 * Consultation payload = the existing encounter body (vitals, medications, … ) plus
 *   template_values: { [section_key]: { [field_key]: value } } for custom fields.
 *
 * errors   — block the save; an error on a LOCKED item can never be bypassed, others can be
 *            bypassed with allow_incomplete (the existing "End without Rx" action).
 * warnings — reference-range flags (e.g. BP above the default range); never block.
 */
const { FIELD_TYPES, OPTION_TYPES, NUMERIC_TYPES, SECTION_BY_KEY, CORE_PATHS } = require('./catalog');
const { normalizeDefinition } = require('./definition');

const KEY_RE = /^[a-z][a-z0-9_]{0,59}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function validateDefinition(def) {
  const errors = [];
  const err = (section_key, field_key, message) => errors.push({ section_key, field_key: field_key || '', message });
  const d = normalizeDefinition(def);
  const seen = new Set();
  for (const s of d.sections) {
    if (!KEY_RE.test(s.key)) err(s.key, '', 'Section key must be lower-case letters, digits and _');
    if (seen.has(s.key)) err(s.key, '', 'Duplicate section');
    seen.add(s.key);
    if (!s.label) err(s.key, '', 'Section label is required');
    if (s.builtin && !SECTION_BY_KEY[s.key]) err(s.key, '', 'Unknown built-in section');
    const fkeys = new Set();
    for (const f of s.fields) {
      if (!KEY_RE.test(f.key)) err(s.key, f.key, 'Field key must start with a letter: lower-case letters, digits and _');
      if (fkeys.has(f.key)) err(s.key, f.key, 'Duplicate field key');
      fkeys.add(f.key);
      if (!f.label) err(s.key, f.key, 'Field label is required');
      if (!FIELD_TYPES.includes(f.type)) err(s.key, f.key, `Unknown field type "${f.type}"`);
      if (OPTION_TYPES.has(f.type)) {
        const opts = Array.isArray(f.options) ? f.options : [];
        if (!opts.length) err(s.key, f.key, 'Add at least one option');
        const vals = opts.map(o => o && o.value);
        if (vals.some(v => v === undefined || v === null || v === '')) err(s.key, f.key, 'Every option needs a value');
        if (new Set(vals).size !== vals.length) err(s.key, f.key, 'Option values must be unique');
      }
      if (f.min != null && f.max != null && Number(f.min) > Number(f.max)) err(s.key, f.key, 'Minimum is greater than maximum');
      if (f.min_length != null && f.max_length != null && f.min_length > f.max_length) err(s.key, f.key, 'Minimum length is greater than maximum length');
      if (f.storage === 'core' && !CORE_PATHS.has(f.core_path)) err(s.key, f.key, `Unknown core field "${f.core_path}"`);
      if (f.validation?.pattern) { try { new RegExp(f.validation.pattern); } catch { err(s.key, f.key, 'Invalid validation pattern'); } }
      if (f.visibility) {
        const ref = s.fields.find(x => x.key === f.visibility.field);
        if (!ref || ref.key === f.key) err(s.key, f.key, 'Visibility condition must refer to another field in this section');
        if (!['eq', 'neq', 'in', 'filled', 'empty'].includes(f.visibility.op)) err(s.key, f.key, 'Unknown visibility operator');
      }
      if (f.required && f.enabled === false) err(s.key, f.key, 'A required field cannot be disabled');
    }
    if (s.required && s.enabled === false) err(s.key, '', 'A required section cannot be disabled');
  }
  return errors;
}

// ── Reading values ──────────────────────────────────────────────────────────
const isEmpty = v => v === undefined || v === null || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => isEmpty(x)));

function sectionIsEmpty(section, payload) {
  const custom = payload.template_values?.[section.key] || {};
  const anyCustom = Object.values(custom).some(v => !isEmpty(v));
  if (!section.builtin) return !anyCustom;
  const k = section.key;
  let core;
  if (k === 'follow_up') core = payload.next_visit_date || payload.next_visit_notes;
  else if (k.startsWith('ophtho_')) core = payload.ophtho ?? null;   // flat object of eye readings
  else if (k.startsWith('ent_')) core = payload.ent ?? null;
  else core = payload[k];
  return isEmpty(core) && !anyCustom;
}

function fieldValue(section, field, payload) {
  if (field.storage === 'custom') return payload.template_values?.[section.key]?.[field.key];
  const m = /^([a-z_]+)\.([a-z0-9_]+)$/.exec(field.core_path || '');
  if (m) return payload[m[1]]?.[m[2]];
  return undefined; // row columns are checked per row
}

function visible(field, section, payload) {
  const c = field.visibility;
  if (!c) return true;
  const ref = section.fields.find(f => f.key === c.field);
  if (!ref) return true;
  const v = fieldValue(section, ref, payload);
  switch (c.op) {
    case 'eq':     return Array.isArray(v) ? v.includes(c.value) : v === c.value || String(v) === String(c.value);
    case 'neq':    return !(v === c.value || String(v) === String(c.value)) && !isEmpty(v);
    case 'in':     return Array.isArray(c.value) && c.value.some(x => String(x) === String(v));
    case 'filled': return !isEmpty(v);
    case 'empty':  return isEmpty(v);
    default:       return true;
  }
}

/** Pick the reference range for this patient: most specific sex/age match, else the default. */
function pickRange(field, patient = {}) {
  const ranges = field.validation?.ref_ranges;
  if (!Array.isArray(ranges) || !ranges.length) return null;
  const sex = (patient.sex || '').toUpperCase().slice(0, 1);
  const age = patient.age == null ? null : Number(patient.age);
  const fits = r => (!r.sex || (sex && r.sex.toUpperCase().slice(0, 1) === sex)) &&
    (r.age_min == null || (age != null && age >= r.age_min)) &&
    (r.age_max == null || (age != null && age <= r.age_max));
  const score = r => (r.sex ? 2 : 0) + (r.age_min != null || r.age_max != null ? 1 : 0);
  return ranges.filter(fits).sort((a, b) => score(b) - score(a))[0] || null;
}

function checkValue(field, value) {
  // Returns an error message or null. Empty values are handled by the required check.
  const t = field.type;
  if (NUMERIC_TYPES.has(t)) {
    const num = typeof value === 'object' && value !== null ? value.value : value;
    const n = Number(num);
    if (num === '' || num === null || Number.isNaN(n)) return 'Must be a number';
    if (t === 'number' && !Number.isInteger(n)) return 'Must be a whole number';
    if (field.min != null && n < Number(field.min)) return `Must be at least ${field.min}${field.unit ? ' ' + field.unit : ''}`;
    if (field.max != null && n > Number(field.max)) return `Must be at most ${field.max}${field.unit ? ' ' + field.unit : ''}`;
    return null;
  }
  if (t === 'boolean' || t === 'checkbox') return typeof value === 'boolean' ? null : 'Must be yes or no';
  if (t === 'date') return DATE_RE.test(String(value)) && !Number.isNaN(Date.parse(value)) ? null : 'Must be a date (YYYY-MM-DD)';
  if (t === 'time') return TIME_RE.test(String(value)) ? null : 'Must be a time (HH:MM)';
  if (t === 'datetime') return Number.isNaN(Date.parse(value)) ? 'Must be a date and time' : null;
  const values = (field.options || []).map(o => String(o.value));
  if (t === 'dropdown' || t === 'radio') return values.includes(String(value)) ? null : 'Choose one of the listed options';
  if (t === 'multiselect') {
    if (!Array.isArray(value)) return 'Must be a list of options';
    return value.every(v => values.includes(String(v))) ? null : 'Contains an option that is not listed';
  }
  // text / textarea
  const s = String(value);
  if (field.min_length != null && s.length < field.min_length) return `Must be at least ${field.min_length} characters`;
  if (field.max_length != null && s.length > field.max_length) return `Must be at most ${field.max_length} characters`;
  if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(s)) return field.validation.message || 'Invalid format';
  return null;
}

function validateConsultation(def, payload = {}, ctx = {}) {
  const d = normalizeDefinition(def);
  const errors = [];
  const warnings = [];
  const add = (list, s, f, code, message) => list.push({
    section_key: s.key, section_label: s.label, field_key: f ? f.key : '', field_label: f ? f.label : '',
    code, message, locked: !!(f ? f.locked : s.locked),
  });

  for (const s of d.sections) {
    if (!s.enabled) continue;
    if (s.required && sectionIsEmpty(s, payload)) add(errors, s, null, 'required', `${s.label} is required`);

    for (const f of s.fields) {
      if (!f.enabled) continue;
      const rowMatch = /^([a-z_]+)\[\]\.([a-z0-9_]+)$/.exec(f.core_path || '');
      if (f.storage === 'core' && rowMatch) {
        // A required row column applies to every row that has been started.
        const rows = Array.isArray(payload[rowMatch[1]]) ? payload[rowMatch[1]] : [];
        rows.forEach((row, i) => {
          if (!row || Object.values(row).every(isEmpty)) return;
          const v = row[rowMatch[2]] ?? (rowMatch[2] === 'dose' ? row.dosage : undefined);
          if (f.required && isEmpty(v)) add(errors, s, f, 'required', `${f.label} is required (row ${i + 1})`);
          else if (!isEmpty(v) && f.type !== 'text') { const m = checkValue(f, v); if (m) add(errors, s, f, 'invalid', `${f.label} (row ${i + 1}): ${m}`); }
        });
        continue;
      }
      if (!visible(f, s, payload)) continue;
      const v = fieldValue(s, f, payload);
      if (isEmpty(v)) { if (f.required) add(errors, s, f, 'required', `${f.label} is required`); continue; }
      const msg = checkValue(f, v);
      if (msg) { add(errors, s, f, 'invalid', `${f.label}: ${msg}`); continue; }
      const range = NUMERIC_TYPES.has(f.type) ? pickRange(f, ctx.patient) : null;
      if (range) {
        const n = Number(typeof v === 'object' ? v.value : v);
        if (range.low != null && n < Number(range.low)) add(warnings, s, f, 'below_range', `${f.label} ${n} is below the reference range (${range.low}–${range.high ?? ''})`);
        else if (range.high != null && n > Number(range.high)) add(warnings, s, f, 'above_range', `${f.label} ${n} is above the reference range (${range.low ?? ''}–${range.high})`);
      }
    }
  }
  return { errors, warnings };
}

/** Keep only values of enabled custom fields, so stray keys never reach the database. */
function sanitizeValues(def, templateValues) {
  const out = {};
  const d = normalizeDefinition(def);
  for (const s of d.sections) {
    if (!s.enabled) continue;
    const src = templateValues?.[s.key];
    if (!src || typeof src !== 'object') continue;
    for (const f of s.fields) {
      if (!f.enabled || f.storage !== 'custom') continue;
      if (Object.prototype.hasOwnProperty.call(src, f.key) && !isEmpty(src[f.key])) {
        (out[s.key] ||= {})[f.key] = src[f.key];
      }
    }
  }
  return out;
}

module.exports = { validateDefinition, validateConsultation, sanitizeValues, pickRange, isEmpty, checkValue };
