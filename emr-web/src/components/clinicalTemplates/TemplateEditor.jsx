/**
 * Clinical template editor — used for three jobs:
 *   mode 'template' : editing a template you own (clinic template, or a system template in the
 *                     super admin panel). Full control; built-in fields can be disabled, not deleted.
 *   mode 'clinic'   : customising a template for the clinic. Inherited items can be renamed,
 *                     required, re-ordered or hidden (not deleted); fields the clinic added are fully editable.
 *   mode 'doctor'   : a doctor's preferences. Inherited items: show/hide (unless required), order,
 *                     defaults and placeholders only. Fields the doctor added are fully editable.
 * Locked items (compliance) cannot be hidden, made optional or have their rules changed below
 * the level that locked them. The server enforces the same rules; this UI just explains them.
 */
import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Pencil, Trash2, Lock, Eye, X, Check } from 'lucide-react';
import DynamicFields, { customFieldsOf } from './DynamicFields';
import s from './TemplateEditor.module.css';

const TYPE_LABELS = {
  text: 'Short text', textarea: 'Long text', number: 'Whole number', decimal: 'Decimal number',
  dropdown: 'Dropdown', multiselect: 'Multi-select', radio: 'Single choice (buttons)', checkbox: 'Checkbox',
  date: 'Date', time: 'Time', datetime: 'Date and time', boolean: 'Yes / No', measurement: 'Measurement with unit',
};
const OPTION_TYPES = new Set(['dropdown', 'multiselect', 'radio']);
const NUMERIC = new Set(['number', 'decimal', 'measurement']);
const RULE_PROPS = ['min', 'max', 'min_length', 'max_length', 'options', 'unit', 'validation'];
const DOCTOR_PROPS = ['enabled', 'default_value', 'placeholder', 'order'];

const clone = v => JSON.parse(JSON.stringify(v));
const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 60);
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const renumber = list => list.forEach((x, i) => { x.order = i; });

export default function TemplateEditor({
  definition, mode = 'template', catalog, onSave, saving = false, saveLabel = 'Save', extraActions = null,
  ignored = [], readOnly = false,
}) {
  const [def, setDef] = useState(() => {
    const d = clone(definition || { sections: [] });
    d.sections.sort(byOrder).forEach(sec => (sec.fields || []).sort(byOrder));
    return d;
  });
  const [selected, setSelected] = useState(() => def.sections.find(x => x.enabled)?.key || def.sections[0]?.key);
  const [editing, setEditing] = useState(null);         // { sectionKey, field, isNew }
  const [dirty, setDirty] = useState(false);
  const [previewAll, setPreviewAll] = useState(false);
  const [previewValues, setPreviewValues] = useState({});
  const [filter, setFilter] = useState('');

  const catSections = useMemo(() => Object.fromEntries((catalog?.sections || []).map(x => [x.key, x])), [catalog]);
  const own = item => mode === 'template' || item.origin === mode;
  const lockedFor = item => mode !== 'template' && item.locked && !own(item);
  const canToggle = item => !readOnly && !lockedFor(item) && !(mode === 'doctor' && item.required && !own(item));
  const canEdit = (item, prop) => {
    if (readOnly) return false;
    if (own(item)) return true;
    if (mode === 'doctor') return DOCTOR_PROPS.includes(prop);
    if (lockedFor(item) && (RULE_PROPS.includes(prop) || prop === 'locked')) return false;
    return prop !== 'type' && prop !== 'key';
  };

  const update = fn => { setDef(prev => { const next = clone(prev); fn(next); return next; }); setDirty(true); };
  const section = def.sections.find(x => x.key === selected);
  const ignoredFor = (sk, fk = '') => ignored.filter(i => i.section_key === sk && (i.field_key || '') === fk);

  const moveSection = (key, dir) => update(d => {
    d.sections.sort(byOrder);
    const i = d.sections.findIndex(x => x.key === key); const j = i + dir;
    if (j < 0 || j >= d.sections.length) return;
    [d.sections[i], d.sections[j]] = [d.sections[j], d.sections[i]]; renumber(d.sections);
  });
  const moveField = (key, dir) => update(d => {
    const sec = d.sections.find(x => x.key === selected); sec.fields.sort(byOrder);
    const i = sec.fields.findIndex(f => f.key === key); const j = i + dir;
    if (j < 0 || j >= sec.fields.length) return;
    [sec.fields[i], sec.fields[j]] = [sec.fields[j], sec.fields[i]]; renumber(sec.fields);
  });
  const setSectionProp = (key, prop, value) => update(d => { d.sections.find(x => x.key === key)[prop] = value; });
  const setFieldProp = (fkey, prop, value) => update(d => {
    d.sections.find(x => x.key === selected).fields.find(f => f.key === fkey)[prop] = value;
  });
  const deleteField = fkey => update(d => {
    const sec = d.sections.find(x => x.key === selected);
    sec.fields = sec.fields.filter(f => f.key !== fkey); renumber(sec.fields);
  });
  const addSection = () => {
    const label = window.prompt('Name of the new section (for example "Cardiac assessment")');
    if (!label) return;
    let key = slug(label) || 'section';
    while (def.sections.some(x => x.key === key)) key += '_2';
    update(d => {
      d.sections.push({ key, label: label.trim(), builtin: false, enabled: true, required: false, locked: false,
        print_enabled: true, default_value: null, order: d.sections.length, origin: mode === 'template' ? 'template' : mode, fields: [] });
    });
    setSelected(key);
  };
  const deleteSection = key => {
    if (!window.confirm('Delete this section and its fields from the template? Saved consultations keep their data.')) return;
    update(d => { d.sections = d.sections.filter(x => x.key !== key); renumber(d.sections); });
    setSelected(def.sections.find(x => x.key !== key)?.key);
  };

  const saveField = field => {
    update(d => {
      const sec = d.sections.find(x => x.key === editing.sectionKey);
      if (editing.isNew) sec.fields.push({ ...field, order: sec.fields.length, origin: mode === 'template' ? 'template' : mode, storage: 'custom', core_path: null });
      else sec.fields = sec.fields.map(f => (f.key === editing.field.key ? { ...f, ...field } : f));
    });
    setEditing(null);
  };

  const sections = [...def.sections].sort(byOrder);
  const shown = filter ? sections.filter(x => x.label.toLowerCase().includes(filter.toLowerCase())) : sections;
  const kind = section ? (catSections[section.key]?.kind || (section.builtin ? 'block' : 'custom')) : null;

  return (
    <div className={s.wrap}>
      <div className={s.toolbar}>
        <div className={s.modeNote}>
          {mode === 'template' && 'Editing the template itself. Changes reach consultations when you publish.'}
          {mode === 'clinic' && 'Customising for your clinic. Inherited items can be hidden but not deleted.'}
          {mode === 'doctor' && 'Your personal preferences. Items your clinic made required cannot be hidden.'}
        </div>
        <button type="button" className={s.btnGhost} onClick={() => setPreviewAll(v => !v)} aria-pressed={previewAll}>
          <Eye size={14} /> {previewAll ? 'Back to editing' : 'Preview whole template'}
        </button>
        {extraActions}
        {!readOnly && (
          <button type="button" className={s.btnPrimary} disabled={saving || !dirty} onClick={() => onSave?.(def, () => setDirty(false))}>
            <Check size={14} /> {saving ? 'Saving…' : saveLabel}
          </button>
        )}
      </div>

      {previewAll ? (
        <div className={s.previewAll}>
          {sections.filter(x => x.enabled).map(sec => (
            <div key={sec.key} className={s.previewCard}>
              <div className={s.previewTitle}>{sec.label}{sec.required && <span className={s.reqBadge}>Required</span>}</div>
              {sec.builtin && <BuiltinSummary section={sec} kind={catSections[sec.key]?.kind} />}
              <DynamicFields section={sec} values={previewValues[sec.key] || {}}
                onChange={v => setPreviewValues(p => ({ ...p, [sec.key]: v }))} />
              {!sec.builtin && !customFieldsOf(sec).length && <p className={s.muted}>No fields yet.</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className={s.columns}>
          <nav className={s.sectionList} aria-label="Sections">
            <input className={s.search} placeholder="Find a section…" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Find a section" />
            <ul>
              {shown.map(sec => {
                const idx = sections.findIndex(x => x.key === sec.key);
                return (
                  <li key={sec.key} className={`${s.sectionItem} ${sec.key === selected ? s.sectionItemOn : ''} ${sec.enabled ? '' : s.sectionOff}`}>
                    <label className={s.switch} title={canToggle(sec) ? 'Show / hide section' : 'Required or locked — cannot be hidden'}>
                      <input type="checkbox" checked={!!sec.enabled} disabled={!canToggle(sec)}
                        onChange={e => setSectionProp(sec.key, 'enabled', e.target.checked)} aria-label={`Show ${sec.label}`} />
                      <span />
                    </label>
                    <button type="button" className={s.sectionName} onClick={() => setSelected(sec.key)} aria-current={sec.key === selected}>
                      <span>{sec.label}</span>
                      <span className={s.sectionMeta}>
                        {lockedFor(sec) && <Lock size={11} aria-label="locked" />}
                        {sec.required && <span className={s.reqDot} title="Required">req</span>}
                        {customFieldsOf(sec).length > 0 && <span className={s.count}>{customFieldsOf(sec).length}</span>}
                      </span>
                    </button>
                    {!readOnly && !filter && (
                      <span className={s.moveBtns}>
                        <button type="button" onClick={() => moveSection(sec.key, -1)} disabled={idx === 0} aria-label={`Move ${sec.label} up`}><ArrowUp size={12} /></button>
                        <button type="button" onClick={() => moveSection(sec.key, 1)} disabled={idx === sections.length - 1} aria-label={`Move ${sec.label} down`}><ArrowDown size={12} /></button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!readOnly && mode !== 'doctor' && <button type="button" className={s.btnGhost} onClick={addSection}><Plus size={14} /> Add section</button>}
          </nav>

          {section && (
            <section className={s.detail} aria-label={`${section.label} settings`}>
              <div className={s.detailHead}>
                <input className={s.titleInput} value={section.label} disabled={!canEdit(section, 'label')}
                  onChange={e => setSectionProp(section.key, 'label', e.target.value)} aria-label="Section name" />
                {!section.builtin && own(section) && !readOnly && (
                  <button type="button" className={s.btnDanger} onClick={() => deleteSection(section.key)}><Trash2 size={14} /> Delete section</button>
                )}
              </div>
              {lockedFor(section) && <p className={s.lockNote}><Lock size={12} /> Locked by your clinic or Infer: it cannot be hidden or made optional.</p>}
              {ignoredFor(section.key).map((i, n) => <p key={n} className={s.ignoredNote}>Not applied: “{i.prop}” ({i.reason.replace('_', ' ')}).</p>)}

              <div className={s.toggles}>
                <Toggle label="Shown in consultation" checked={!!section.enabled} disabled={!canToggle(section)} onChange={v => setSectionProp(section.key, 'enabled', v)} />
                <Toggle label="Required before finishing" checked={!!section.required} disabled={!canEdit(section, 'required') || lockedFor(section)} onChange={v => setSectionProp(section.key, 'required', v)} />
                <Toggle label="Printed on prescription" checked={section.print_enabled !== false} disabled={!canEdit(section, 'print_enabled')} onChange={v => setSectionProp(section.key, 'print_enabled', v)} />
                {mode !== 'doctor' && <Toggle label="Locked for doctors" checked={!!section.locked} disabled={!canEdit(section, 'locked')} onChange={v => setSectionProp(section.key, 'locked', v)} />}
              </div>

              {kind === 'text' && (
                <label className={s.block}>
                  <span className={s.blockLabel}>Default text (pre-filled in new consultations)</span>
                  <textarea rows={2} className={s.input} value={section.default_value || ''} disabled={!canEdit(section, 'default_value')}
                    onChange={e => setSectionProp(section.key, 'default_value', e.target.value || null)} />
                </label>
              )}
              {section.builtin && <BuiltinSummary section={section} kind={kind} />}

              <div className={s.fieldsHead}>
                <h4>{section.key === 'vitals' ? 'Vitals and fields' : kind === 'rows' ? 'Columns and fields' : 'Fields'}</h4>
                {!readOnly && (
                  <button type="button" className={s.btnGhost} onClick={() => setEditing({ sectionKey: section.key, field: null, isNew: true })}>
                    <Plus size={14} /> Add field
                  </button>
                )}
              </div>
              {(section.fields || []).length === 0 && <p className={s.muted}>No fields. Add one to capture structured data in this section.</p>}
              <ul className={s.fieldList}>
                {[...(section.fields || [])].sort(byOrder).map((f, i, arr) => (
                  <li key={f.key} className={`${s.fieldRow} ${f.enabled === false ? s.fieldOff : ''}`}>
                    <label className={s.switch} title={canToggle(f) ? 'Show / hide' : 'Required or locked'}>
                      <input type="checkbox" checked={f.enabled !== false} disabled={!canToggle(f)} onChange={e => setFieldProp(f.key, 'enabled', e.target.checked)} aria-label={`Show ${f.label}`} />
                      <span />
                    </label>
                    <div className={s.fieldMain}>
                      <span className={s.fieldLabel}>{f.label}{f.required && <span className={s.req}> *</span>}</span>
                      <span className={s.fieldMeta}>
                        {f.storage === 'core' ? 'Built-in' : TYPE_LABELS[f.type] || f.type}
                        {f.unit ? ` · ${f.unit}` : ''}
                        {f.origin && f.origin !== 'template' ? ` · added by ${f.origin}` : ''}
                        {f.visibility ? ' · conditional' : ''}
                      </span>
                    </div>
                    {lockedFor(f) && <Lock size={12} aria-label="locked" className={s.lockIcon} />}
                    {!readOnly && (
                      <span className={s.rowActions}>
                        <button type="button" onClick={() => moveField(f.key, -1)} disabled={i === 0} aria-label={`Move ${f.label} up`}><ArrowUp size={13} /></button>
                        <button type="button" onClick={() => moveField(f.key, 1)} disabled={i === arr.length - 1} aria-label={`Move ${f.label} down`}><ArrowDown size={13} /></button>
                        <button type="button" onClick={() => setEditing({ sectionKey: section.key, field: f, isNew: false })} aria-label={`Edit ${f.label}`}><Pencil size={13} /></button>
                        {f.storage !== 'core' && own(f) && (
                          <button type="button" onClick={() => window.confirm(`Delete “${f.label}”? Saved consultations keep their values.`) && deleteField(f.key)} aria-label={`Delete ${f.label}`}><Trash2 size={13} /></button>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {customFieldsOf(section).length > 0 && (
                <div className={s.preview}>
                  <div className={s.previewLabel}><Eye size={12} /> Preview</div>
                  <DynamicFields section={section} values={previewValues[section.key] || {}}
                    onChange={v => setPreviewValues(p => ({ ...p, [section.key]: v }))} />
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {editing && (
        <FieldEditor
          field={editing.field} isNew={editing.isNew} siblings={(def.sections.find(x => x.key === editing.sectionKey)?.fields || []).filter(f => f.key !== editing.field?.key)}
          canEdit={prop => (editing.isNew ? true : canEdit(editing.field, prop))}
          isCore={editing.field?.storage === 'core'} mode={mode}
          onCancel={() => setEditing(null)} onSave={saveField}
        />
      )}
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }) {
  return (
    <label className={`${s.toggle} ${disabled ? s.toggleDisabled : ''}`}>
      <span className={s.switch}><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span /></span>
      {label}
    </label>
  );
}

const BUILTIN_TEXT = {
  list: 'Built-in list (search and add items). Add fields below to capture more structured detail.',
  rows: 'Built-in table. Switch columns on or off and make them required below.',
  text: 'Built-in free-text box.',
  follow_up: 'Built-in follow-up date and notes.',
  block: 'Built-in speciality block. Add fields below to capture more detail.',
};
function BuiltinSummary({ section, kind }) {
  const core = (section.fields || []).filter(f => f.storage === 'core' && f.enabled !== false);
  return (
    <p className={s.muted}>
      {section.key === 'vitals' ? `Vitals shown: ${core.map(f => f.label).join(', ') || 'none'}.` : BUILTIN_TEXT[kind] || BUILTIN_TEXT.block}
      {kind === 'rows' && core.length > 0 && ` Columns: ${core.map(f => f.label + (f.required ? ' *' : '')).join(', ')}.`}
    </p>
  );
}

// ── Field editor dialog ─────────────────────────────────────────────────────
function FieldEditor({ field, isNew, siblings, canEdit, isCore, mode, onCancel, onSave }) {
  const [f, setF] = useState(() => clone(field || {
    key: '', label: '', type: 'text', description: '', placeholder: '', required: false, enabled: true,
    print_enabled: true, locked: false, options: [], unit: '', min: null, max: null, min_length: null, max_length: null,
    validation: null, visibility: null, default_value: null,
  }));
  const [keyTouched, setKeyTouched] = useState(!isNew);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setLabel = v => setF(p => ({ ...p, label: v, key: keyTouched ? p.key : slug(v) }));
  const opts = f.options || [];
  const ranges = f.validation?.ref_ranges || [];
  const setRanges = r => set('validation', { ...(f.validation || {}), ref_ranges: r.length ? r : undefined });
  const num = v => (v === '' || v === null || v === undefined ? null : Number(v));

  const submit = e => {
    e.preventDefault();
    if (!f.label.trim()) return setErr('Give the field a label.');
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(f.key)) return setErr('The key must start with a letter and use only lower-case letters, digits and _.');
    if (isNew && siblings.some(x => x.key === f.key)) return setErr('Another field in this section already uses this key.');
    if (OPTION_TYPES.has(f.type) && !opts.filter(o => o.label?.trim()).length) return setErr('Add at least one option.');
    if (f.min != null && f.max != null && Number(f.min) > Number(f.max)) return setErr('Minimum is greater than maximum.');
    const clean = { ...f, label: f.label.trim() };
    if (OPTION_TYPES.has(f.type)) {
      const seen = new Set();
      clean.options = opts.filter(o => o.label?.trim()).map(o => {
        let v = o.value || slug(o.label) || o.label.trim(); while (seen.has(v)) v += '_2'; seen.add(v);
        return { value: v, label: o.label.trim() };
      });
    } else if (!isCore) clean.options = null;
    if (!NUMERIC.has(f.type) && !isCore) { clean.unit = clean.type === 'measurement' ? clean.unit : (clean.unit || null); }
    onSave(clean);
  };

  const dis = prop => !canEdit(prop);
  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="fe-title" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <form className={s.dialog} onSubmit={submit}>
        <div className={s.dialogHead}>
          <h3 id="fe-title">{isNew ? 'Add field' : `Edit “${field.label}”`}</h3>
          <button type="button" className={s.iconBtn} onClick={onCancel} aria-label="Close"><X size={16} /></button>
        </div>
        {mode === 'doctor' && !isNew && <p className={s.muted}>As a doctor you can change visibility, default value and placeholder of inherited fields.</p>}
        <div className={s.formGrid}>
          <label className={s.block}><span className={s.blockLabel}>Label</span>
            <input className={s.input} value={f.label} onChange={e => setLabel(e.target.value)} disabled={dis('label')} autoFocus required /></label>
          <label className={s.block}><span className={s.blockLabel}>Field key (used in data, cannot change later)</span>
            <input className={s.input} value={f.key} disabled={!isNew} onChange={e => { setKeyTouched(true); set('key', e.target.value); }} /></label>
          <label className={s.block}><span className={s.blockLabel}>Type</span>
            <select className={s.input} value={f.type} disabled={isCore || dis('type')} onChange={e => set('type', e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
          <label className={s.block}><span className={s.blockLabel}>Placeholder</span>
            <input className={s.input} value={f.placeholder || ''} disabled={dis('placeholder')} onChange={e => set('placeholder', e.target.value)} /></label>
          <label className={`${s.block} ${s.span2}`}><span className={s.blockLabel}>Description / help text</span>
            <input className={s.input} value={f.description || ''} disabled={dis('description')} onChange={e => set('description', e.target.value)} /></label>
        </div>

        <div className={s.toggles}>
          <Toggle label="Required" checked={!!f.required} disabled={dis('required')} onChange={v => set('required', v)} />
          <Toggle label="Shown" checked={f.enabled !== false} disabled={dis('enabled') || (f.required && mode === 'doctor')} onChange={v => set('enabled', v)} />
          <Toggle label="Printed" checked={f.print_enabled !== false} disabled={dis('print_enabled')} onChange={v => set('print_enabled', v)} />
          {mode !== 'doctor' && <Toggle label="Locked for lower levels" checked={!!f.locked} disabled={dis('locked')} onChange={v => set('locked', v)} />}
        </div>

        {OPTION_TYPES.has(f.type) && (
          <fieldset className={s.fieldset} disabled={dis('options')}>
            <legend>Options</legend>
            {opts.map((o, i) => (
              <div key={i} className={s.optRow}>
                <input className={s.input} value={o.label || ''} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`}
                  onChange={e => set('options', opts.map((x, j) => (j === i ? { ...x, label: e.target.value, value: field && x.value ? x.value : '' } : x)))} />
                <button type="button" className={s.iconBtn} onClick={() => set('options', opts.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" className={s.btnGhost} onClick={() => set('options', [...opts, { label: '', value: '' }])}><Plus size={13} /> Add option</button>
          </fieldset>
        )}

        {NUMERIC.has(f.type) && (
          <fieldset className={s.fieldset} disabled={dis('min')}>
            <legend>Limits and reference ranges</legend>
            <div className={s.formGrid}>
              <label className={s.block}><span className={s.blockLabel}>Unit</span><input className={s.input} value={f.unit || ''} onChange={e => set('unit', e.target.value)} /></label>
              <label className={s.block}><span className={s.blockLabel}>Minimum allowed</span><input type="number" step="any" className={s.input} value={f.min ?? ''} onChange={e => set('min', num(e.target.value))} /></label>
              <label className={s.block}><span className={s.blockLabel}>Maximum allowed</span><input type="number" step="any" className={s.input} value={f.max ?? ''} onChange={e => set('max', num(e.target.value))} /></label>
            </div>
            <p className={s.muted}>Reference ranges only flag a value; they never block saving. Add sex- or age-specific ranges where they differ.</p>
            {ranges.map((r, i) => (
              <div key={i} className={s.rangeRow}>
                <select className={s.input} value={r.sex || ''} aria-label="Sex" onChange={e => setRanges(ranges.map((x, j) => (j === i ? { ...x, sex: e.target.value || undefined } : x)))}>
                  <option value="">Any sex</option><option value="F">Female</option><option value="M">Male</option>
                </select>
                <input type="number" className={s.input} placeholder="Age from" aria-label="Age from" value={r.age_min ?? ''} onChange={e => setRanges(ranges.map((x, j) => (j === i ? { ...x, age_min: num(e.target.value) ?? undefined } : x)))} />
                <input type="number" className={s.input} placeholder="Age to" aria-label="Age to" value={r.age_max ?? ''} onChange={e => setRanges(ranges.map((x, j) => (j === i ? { ...x, age_max: num(e.target.value) ?? undefined } : x)))} />
                <input type="number" step="any" className={s.input} placeholder="Low" aria-label="Low" value={r.low ?? ''} onChange={e => setRanges(ranges.map((x, j) => (j === i ? { ...x, low: num(e.target.value) } : x)))} />
                <input type="number" step="any" className={s.input} placeholder="High" aria-label="High" value={r.high ?? ''} onChange={e => setRanges(ranges.map((x, j) => (j === i ? { ...x, high: num(e.target.value) } : x)))} />
                <button type="button" className={s.iconBtn} onClick={() => setRanges(ranges.filter((_, j) => j !== i))} aria-label="Remove range"><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" className={s.btnGhost} onClick={() => setRanges([...ranges, { low: null, high: null }])}><Plus size={13} /> Add reference range</button>
          </fieldset>
        )}

        {['text', 'textarea'].includes(f.type) && !isCore && (
          <fieldset className={s.fieldset} disabled={dis('min_length')}>
            <legend>Length and format</legend>
            <div className={s.formGrid}>
              <label className={s.block}><span className={s.blockLabel}>Minimum characters</span><input type="number" min="0" className={s.input} value={f.min_length ?? ''} onChange={e => set('min_length', num(e.target.value))} /></label>
              <label className={s.block}><span className={s.blockLabel}>Maximum characters</span><input type="number" min="1" className={s.input} value={f.max_length ?? ''} onChange={e => set('max_length', num(e.target.value))} /></label>
              <label className={`${s.block} ${s.span2}`}><span className={s.blockLabel}>Pattern (advanced, regular expression)</span>
                <input className={s.input} value={f.validation?.pattern || ''} placeholder="e.g. ^[A-Z]{2}\d{4}$"
                  onChange={e => set('validation', { ...(f.validation || {}), pattern: e.target.value || undefined })} /></label>
            </div>
          </fieldset>
        )}

        {siblings.length > 0 && (
          <fieldset className={s.fieldset} disabled={dis('visibility')}>
            <legend>Show only when…</legend>
            <div className={s.formGrid}>
              <label className={s.block}><span className={s.blockLabel}>Field</span>
                <select className={s.input} value={f.visibility?.field || ''} onChange={e => set('visibility', e.target.value ? { field: e.target.value, op: f.visibility?.op || 'eq', value: f.visibility?.value ?? '' } : null)}>
                  <option value="">Always show</option>
                  {siblings.filter(x => x.storage !== 'core').map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select></label>
              {f.visibility && (() => {
                const ref = siblings.find(x => x.key === f.visibility.field);
                return (
                  <>
                    <label className={s.block}><span className={s.blockLabel}>Condition</span>
                      <select className={s.input} value={f.visibility.op} onChange={e => set('visibility', { ...f.visibility, op: e.target.value })}>
                        <option value="eq">is</option><option value="neq">is filled and not</option>
                        <option value="filled">has any value</option><option value="empty">is empty</option>
                      </select></label>
                    {['eq', 'neq'].includes(f.visibility.op) && (
                      <label className={s.block}><span className={s.blockLabel}>Value</span>
                        {ref?.options?.length ? (
                          <select className={s.input} value={String(f.visibility.value ?? '')} onChange={e => set('visibility', { ...f.visibility, value: e.target.value })}>
                            <option value="">Choose…</option>
                            {ref.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : ref?.type === 'boolean' || ref?.type === 'checkbox' ? (
                          <select className={s.input} value={String(f.visibility.value)} onChange={e => set('visibility', { ...f.visibility, value: e.target.value === 'true' })}>
                            <option value="true">Yes</option><option value="false">No</option>
                          </select>
                        ) : (
                          <input className={s.input} value={f.visibility.value ?? ''} onChange={e => set('visibility', { ...f.visibility, value: e.target.value })} />
                        )}
                      </label>
                    )}
                  </>
                );
              })()}
            </div>
          </fieldset>
        )}

        {!isCore && (
          <fieldset className={s.fieldset} disabled={dis('default_value')}>
            <legend>Default value (pre-filled in new consultations)</legend>
            <DynamicFields section={{ key: '_default', fields: [{ ...f, key: 'v', label: 'Default', required: false, visibility: null, storage: 'custom', enabled: true }] }}
              values={{ v: f.default_value ?? undefined }} onChange={v => set('default_value', v.v === '' ? null : v.v)} />
          </fieldset>
        )}

        {err && <p className={s.formError} role="alert">{err}</p>}
        <div className={s.dialogFoot}>
          <button type="button" className={s.btnGhost} onClick={onCancel}>Cancel</button>
          <button type="submit" className={s.btnPrimary}>{isNew ? 'Add field' : 'Apply'}</button>
        </div>
      </form>
    </div>
  );
}
