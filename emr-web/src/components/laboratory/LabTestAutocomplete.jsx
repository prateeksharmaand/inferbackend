/**
 * Lab test name autocomplete — searches /api/v1/autocomplete/lab-tests?q=
 * Used in AddSampleTab, ResultsTab, CatalogTab etc.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function LabTestAutocomplete({ value, onChange, labId, placeholder = 'Search test name or code…', styles: s }) {
  const [query, setQuery] = useState(value?.test_name || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const doSearch = useCallback(debounce(async (q) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const labParam = labId ? `&lab_id=${labId}` : '';
      const res = await fetch(`/api/v1/autocomplete/lab-tests?q=${encodeURIComponent(q.trim())}${labParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setOpen(true);
    } catch { setResults([]); }
    setLoading(false);
  }, 300), [labId]);

  useEffect(() => { doSearch(query); }, [query]);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(test) {
    setQuery(test.test_name);
    setOpen(false);
    onChange(test);
  }

  function clear() {
    setQuery('');
    setResults([]);
    onChange(null);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div className={s?.searchBar} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
        <Search size={14} color="var(--color-text-3)" />
        <input
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: 'var(--color-text)', background: 'transparent' }}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder={placeholder}
        />
        {loading && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>…</span>}
        {query && <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', display: 'flex' }}><X size={13} /></button>}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000, maxHeight: 280, overflowY: 'auto',
        }}>
          {results.map((t) => (
            <div key={t.id || t.test_code}
              onClick={() => select(t)}
              style={{
                padding: '9px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{t.test_name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 2 }}>
                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 8, fontWeight: 600, marginRight: 6 }}>{t.test_code}</span>
                  {t.category && <span style={{ marginRight: 6 }}>{t.category}</span>}
                  {t.unit && <span>· {t.unit}</span>}
                  {(t.reference_range_low != null && t.reference_range_high != null) && (
                    <span style={{ marginLeft: 6, color: 'var(--color-success)' }}>Ref: {t.reference_range_low}–{t.reference_range_high}</span>
                  )}
                </div>
              </div>
              {t.price && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' }}>₹{t.price}</span>}
            </div>
          ))}
        </div>
      )}

      {open && !loading && query.length >= 2 && results.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000, padding: '14px 16px', fontSize: 13, color: 'var(--color-text-3)',
        }}>
          No tests found for "{query}"
        </div>
      )}
    </div>
  );
}
