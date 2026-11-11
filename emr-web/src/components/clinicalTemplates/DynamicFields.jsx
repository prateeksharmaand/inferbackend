/**
 * Renders the custom fields of one clinical-template section from its configuration.
 * Used by InferPad (consultation) and by the Clinical Template Builder preview.
 *
 * The server is the authority on validation (it re-checks every save); this component only
 * mirrors visibility conditions and shows the server's errors and the default reference range.
 */
import s from './DynamicFields.module.css';

const NUMERIC = new Set(['number', 'decimal', 'measurement']);
const isEmpty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function isFieldVisible(field, fields, values = {}) {
  const c = field.visibility;
  if (!c) return true;
  const ref = fields.find(f => f.key === c.field);
  if (!ref) return true;
  const v = values[ref.key];
  switch (c.op) {
    case 'eq':     return Array.isArray(v) ? v.includes(c.value) : String(v) === String(c.value);
    case 'neq':    return !isEmpty(v) && String(v) !== String(c.value);
    case 'in':     return Array.isArray(c.value) && c.value.some(x => String(x) === String(v));
    case 'filled': return !isEmpty(v);
    case 'empty':  return isEmpty(v);
    default:       return true;
  }
}

/** Custom (non-core) enabled fields of a section, in order. */
export function customFieldsOf(section) {
  return (section?.fields || []).filter(f => f.enabled !== false && f.storage !== 'core')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function defaultRange(field) {
  const r = field.validation?.ref_ranges?.find(x => !x.sex && x.age_min == null && x.age_max == null);
  return r || null;
}

function FieldInput({ field, value, onChange, disabled }) {
  const id = `ctf-${field.key}`;
  const common = { id, disabled, className: s.input, placeholder: field.placeholder || '' };
  const opts = field.options || [];
  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={2} value={value ?? ''} onChange={e => onChange(e.target.value)} maxLength={field.max_length || undefined} />;
    case 'number': case 'decimal': case 'measurement': {
      const num = value && typeof value === 'object' ? value.value : value;
      return (
        <div className={s.withUnit}>
          <input {...common} type="number" inputMode="decimal" step={field.type === 'number' ? 1 : 'any'}
            min={field.min ?? undefined} max={field.max ?? undefined}
            value={num ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
          {field.unit && <span className={s.unit}>{field.unit}</span>}
        </div>
      );
    }
    case 'dropdown':
      return (
        <select {...common} value={value ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">{field.placeholder || 'Select…'}</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'radio':
      return (
        <div className={s.choices} role="radiogroup" aria-labelledby={`${id}-label`}>
          {opts.map(o => (
            <label key={o.value} className={`${s.choice} ${String(value) === String(o.value) ? s.choiceOn : ''}`}>
              <input type="radio" name={id} value={o.value} disabled={disabled}
                checked={String(value) === String(o.value)} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          ))}
          {!isEmpty(value) && !disabled && <button type="button" className={s.clear} onClick={() => onChange('')}>Clear</button>}
        </div>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div className={s.choices} role="group" aria-labelledby={`${id}-label`}>
          {opts.map(o => {
            const on = arr.includes(o.value);
            return (
              <label key={o.value} className={`${s.choice} ${on ? s.choiceOn : ''}`}>
                <input type="checkbox" disabled={disabled} checked={on}
                  onChange={() => onChange(on ? arr.filter(x => x !== o.value) : [...arr, o.value])} />
                {o.label}
              </label>
            );
          })}
        </div>
      );
    }
    case 'boolean':
      return (
        <div className={s.choices} role="radiogroup" aria-labelledby={`${id}-label`}>
          {[[true, 'Yes'], [false, 'No']].map(([v, l]) => (
            <label key={l} className={`${s.choice} ${value === v ? s.choiceOn : ''}`}>
              <input type="radio" name={id} disabled={disabled} checked={value === v} onChange={() => onChange(v)} />{l}
            </label>
          ))}
          {!isEmpty(value) && !disabled && <button type="button" className={s.clear} onClick={() => onChange('')}>Clear</button>}
        </div>
      );
    case 'checkbox':
      return (
        <label className={s.checkbox}>
          <input type="checkbox" id={id} disabled={disabled} checked={value === true} onChange={e => onChange(e.target.checked)} />
          {field.placeholder || 'Yes'}
        </label>
      );
    case 'date':     return <input {...common} type="date" value={value ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'time':     return <input {...common} type="time" value={value ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'datetime': return <input {...common} type="datetime-local" value={value ?? ''} onChange={e => onChange(e.target.value)} />;
    default:
      return <input {...common} type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} maxLength={field.max_length || undefined} />;
  }
}

/**
 * props: section (template section), values ({ fieldKey: value }), onChange(nextValues),
 *        errors ({ fieldKey: message }), disabled, compact
 */
export default function DynamicFields({ section, values = {}, onChange, errors = {}, disabled = false }) {
  const fields = customFieldsOf(section);
  if (!fields.length) return null;
  const set = (key, v) => onChange?.({ ...values, [key]: v });
  return (
    <div className={s.grid}>
      {fields.filter(f => isFieldVisible(f, fields, values)).map(f => {
        const v = values[f.key];
        const range = NUMERIC.has(f.type) ? defaultRange(f) : null;
        const n = v && typeof v === 'object' ? Number(v.value) : Number(v);
        const out = range && !isEmpty(v) && !Number.isNaN(n) && ((range.low != null && n < range.low) || (range.high != null && n > range.high));
        const wide = ['textarea', 'multiselect', 'radio'].includes(f.type) || (f.options || []).length > 4;
        return (
          <div key={f.key} className={`${s.field} ${wide ? s.wide : ''}`}>
            <label id={`ctf-${f.key}-label`} htmlFor={`ctf-${f.key}`} className={s.label}>
              {f.label}{f.required && <span className={s.req} aria-label="required"> *</span>}
            </label>
            <FieldInput field={f} value={v} onChange={val => set(f.key, val)} disabled={disabled} />
            {range && <span className={`${s.hint} ${out ? s.hintOut : ''}`}>Ref {range.low ?? ''}–{range.high ?? ''}{f.unit ? ` ${f.unit}` : ''}{out ? ' · out of range' : ''}</span>}
            {f.description && !errors[f.key] && <span className={s.hint}>{f.description}</span>}
            {errors[f.key] && <span className={s.error} role="alert">{errors[f.key]}</span>}
          </div>
        );
      })}
    </div>
  );
}
