/**
 * Sample Type Autocomplete - searchable dropdown for sample types
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function SampleTypeAutocomplete({ value, onChange, sampleTypes = [], placeholder = 'Search sample type…', styles: s }) {
  const [query, setQuery] = useState(value || '');
  const [filtered, setFiltered] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Filter sample types based on query
  const doFilter = useCallback(debounce((q) => {
    if (q.trim().length === 0) {
      setFiltered(sampleTypes);
    } else {
      const term = q.toLowerCase();
      setFiltered(sampleTypes.filter(st =>
        st.name.toLowerCase().includes(term) ||
        (st.description && st.description.toLowerCase().includes(term))
      ));
    }
  }, 200), [sampleTypes]);

  useEffect(() => { doFilter(query); }, [query, doFilter]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(sampleType) {
    setQuery(sampleType.name);
    setOpen(false);
    onChange(sampleType.name);
  }

  function clear() {
    setQuery('');
    setFiltered(sampleTypes);
    onChange('');
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div className={s.searchBar} style={{ position: 'relative' }}>
        <Search size={14} color="var(--color-text-3)" />
        <input
          className={s.searchInput}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.length >= 0 && setOpen(true)}
          placeholder={placeholder}
        />
        {query && <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', display: 'flex' }}><X size={13} /></button>}
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000, maxHeight: 300, overflowY: 'auto',
        }}>
          {filtered.map((st) => (
            <div key={st.id}
              onClick={() => select(st)}
              style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{st.name}</div>
              {st.description && <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 2 }}>{st.description}</div>}
            </div>
          ))}
        </div>
      )}

      {open && !query && filtered.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000, padding: '14px 16px', fontSize: 13, color: 'var(--color-text-3)',
        }}>
          No sample types available
        </div>
      )}

      {open && query && filtered.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000, padding: '14px 16px', fontSize: 13, color: 'var(--color-text-3)',
        }}>
          No sample types found for "{query}"
        </div>
      )}
    </div>
  );
}
