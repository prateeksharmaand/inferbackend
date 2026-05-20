import { useState, useEffect, useRef } from 'react';
import styles from './AutocompleteInput.module.css';

/**
 * Controlled autocomplete input.
 *
 * Chip mode  (addChip provided):  internal query state, clears after select,
 *                                  Enter / Add button also fires addChip(rawText).
 * Inline mode (value + onChange):  fills value from suggestion, no clear.
 */
export default function AutocompleteInput({
  // controlled value (required in both modes)
  value,
  onChange,
  // called when user picks a suggestion from the dropdown
  onSelect,
  // chip mode: show an "Add" button that fires with raw text
  onAddChip,
  // async (query: string) => [{label, ...}]
  fetchSuggestions,
  // optional custom render for each suggestion row
  renderItem,
  placeholder,
  className,
  inputClassName,
}) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const [active,  setActive]  = useState(-1);
  const wrapRef  = useRef(null);
  const timerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const fn = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Debounced fetch
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!(value || '').trim()) { setItems([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchSuggestions(value);
        setItems(res);
        setOpen(res.length > 0);
        setActive(-1);
      } catch { setItems([]); }
      finally  { setLoading(false); }
    }, 280);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (item) => {
    onSelect(item);
    setItems([]); setOpen(false); setActive(-1);
  };

  const onKey = (e) => {
    if (open) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); return; }
      if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); return; }
      if (e.key === 'Escape')     { setOpen(false); return; }
    }
    if (e.key === 'Enter' && onAddChip) { e.preventDefault(); onAddChip(value); }
  };

  return (
    <div className={`${styles.wrap} ${className || ''}`} ref={wrapRef}>
      <div className={styles.row}>
        <div className={styles.inputWrap}>
          <input
            className={`${styles.input} ${inputClassName || ''}`}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => items.length > 0 && setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
          />
          {loading && <span className={styles.spinner} />}
        </div>
        {onAddChip && (
          <button type="button" className={styles.addBtn}
            onClick={() => onAddChip(value)}>Add</button>
        )}
      </div>

      {open && items.length > 0 && (
        <ul className={styles.dropdown}>
          {items.map((item, i) => (
            <li key={i}
              className={`${styles.item} ${active === i ? styles.itemActive : ''}`}
              onMouseDown={e => { e.preventDefault(); pick(item); }}
              onMouseEnter={() => setActive(i)}>
              {renderItem ? renderItem(item) : item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
