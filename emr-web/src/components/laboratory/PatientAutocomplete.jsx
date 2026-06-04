/**
 * Shared patient autocomplete for lab portal.
 * Searches /api/v1/patients/search?q= (name or UHID) — same patients as EMR.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, User, X } from 'lucide-react';

export function PatientAutocomplete({ value, onChange, placeholder = 'Search by name or UHID…', styles: s }) {
  const [query, setQuery] = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const doSearch = async () => {
      if (query.trim().length < 1) { setResults([]); return; }
      setLoading(true);
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`/api/v1/patients/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.error('Patient search error:', res.status, res.statusText);
          setResults([]);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Patient search error:', err);
        setResults([]);
      }
      setLoading(false);
    };
    doSearch();
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(patient) {
    setQuery(patient.name);
    setOpen(false);
    onChange(patient);
  }

  function clear() {
    setQuery('');
    setResults([]);
    onChange(null);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div className={s.searchBar} style={{ position: 'relative' }}>
        <Search size={14} color="var(--color-text-3)" />
        <input
          className={s.searchInput}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
        {loading && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>…</span>}
        {query && <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', display: 'flex' }}><X size={13} /></button>}
      </div>

      {open && (loading || results.length > 0) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          zIndex: 2000, maxHeight: 260, overflowY: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--color-text-2)' }}>
              Searching…
            </div>
          )}
          {!loading && results.map((p, i) => (
            <div key={p.id || i}
              onClick={() => select(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--color-primary)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>
                {(p.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 1 }}>
                  {p.uhid && <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 8, fontWeight: 600, marginRight: 6 }}>UHID: {p.uhid}</span>}
                  {p.mobile && <span>{p.mobile}</span>}
                  {p.dob && <span style={{ marginLeft: 6 }}>· {p.dob?.slice(0, 10)}</span>}
                  {p.gender && <span style={{ marginLeft: 6 }}>· {p.gender}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && !loading && query.length >= 1 && results.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000, padding: '14px 16px', fontSize: 13, color: 'var(--color-text-3)',
        }}>
          No patients found for "{query}"
        </div>
      )}
    </div>
  );
}
