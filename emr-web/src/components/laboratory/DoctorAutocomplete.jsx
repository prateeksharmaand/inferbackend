/**
 * Doctor Autocomplete - searchable doctor list with manual entry
 * Allows selection from EMR doctors or typing custom name
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function DoctorAutocomplete({ value, onChange, doctors = [], placeholder = 'Search or type doctor name…', styles: s }) {
  const [query, setQuery] = useState(value || '');
  const [filtered, setFiltered] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Filter doctors based on query
  const doFilter = useCallback(debounce((q) => {
    if (q.trim().length === 0) {
      setFiltered([]);
    } else {
      const term = q.toLowerCase();
      setFiltered(doctors.filter(d =>
        (d.name && d.name.toLowerCase().includes(term)) ||
        (d.full_name && d.full_name.toLowerCase().includes(term)) ||
        (d.email && d.email.toLowerCase().includes(term))
      ));
    }
  }, 200), [doctors]);

  useEffect(() => { doFilter(query); }, [query, doFilter]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(doctor) {
    const name = doctor.name || doctor.full_name || doctor.id;
    setQuery(name);
    setOpen(false);
    onChange(name);
  }

  function handleManualEntry(e) {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setOpen(val.length >= 2);
  }

  function clear() {
    setQuery('');
    setFiltered([]);
    onChange('');
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div className={s.searchBar} style={{ position: 'relative' }}>
        <Search size={14} color="var(--color-text-3)" />
        <input
          className={s.searchInput}
          value={query}
          onChange={handleManualEntry}
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
          zIndex: 1000, maxHeight: 280, overflowY: 'auto',
        }}>
          {filtered.map((d) => (
            <div key={d.id}
              onClick={() => select(d)}
              style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                {d.name || d.full_name || d.id}
              </div>
              {d.email && <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 2 }}>{d.email}</div>}
              {d.phone && <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{d.phone}</div>}
            </div>
          ))}
        </div>
      )}

      {open && query && filtered.length === 0 && doctors.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000, padding: '10px 14px', fontSize: 12, color: 'var(--color-text-2)',
        }}>
          No matching doctors found. You can enter a custom name above.
        </div>
      )}
    </div>
  );
}
