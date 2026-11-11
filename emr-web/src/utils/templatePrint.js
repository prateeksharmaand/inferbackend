// Custom clinical-template field values → printable rows (mirrors the server's printableValues,
// used for the browser-rendered prescription; the emailed PDF uses the server version).
const NUMERIC = new Set(['number', 'decimal', 'measurement']);
const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

export function templatePrintRows(definition, values) {
  if (!definition?.sections) return [];
  const out = [];
  for (const s of [...definition.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (!s.enabled || s.print_enabled === false) continue;
    for (const f of [...(s.fields || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      if (f.storage === 'core' || f.print_enabled === false) continue;
      const v = values?.[s.key]?.[f.key];
      if (empty(v)) continue;
      const label = o => (f.options || []).find(x => String(x.value) === String(o))?.label ?? String(o);
      let text;
      if (Array.isArray(v)) text = v.map(label).join(', ');
      else if (typeof v === 'boolean') text = v ? 'Yes' : 'No';
      else if (v && typeof v === 'object') text = `${v.value ?? ''} ${v.unit || f.unit || ''}`.trim();
      else if (f.options?.length) text = label(v);
      else text = `${v}${f.unit && NUMERIC.has(f.type) ? ` ${f.unit}` : ''}`;
      out.push({ section: s.label, label: f.label, value: text });
    }
  }
  return out;
}

/** Is a built-in section printed? Template setting when the consultation has one. */
export function templatePrints(definition, key) {
  const s = definition?.sections?.find(x => x.key === key);
  if (!s) return null;                       // not in the template → caller falls back
  return !!s.enabled && s.print_enabled !== false;
}
