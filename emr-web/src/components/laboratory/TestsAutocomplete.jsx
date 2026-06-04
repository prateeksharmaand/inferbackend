/**
 * TestsAutocomplete — multi-select typeahead for lab tests + panels.
 * Props:
 *   allTests:       flat array of test objects {id, test_code, test_name, category, price}
 *   allPanels:      array of panel objects {id, panel_code, panel_name, price, tests[]}
 *   selectedTestIds:  string[]
 *   selectedPanelIds: string[]
 *   onChangeTests:  (ids: string[]) => void
 *   onChangePanels: (ids: string[]) => void  (optional)
 *   styles:         lab portal styles map
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Search, Layers } from 'lucide-react';

export function TestsAutocomplete({
  allTests = [],
  allPanels = [],
  selectedTestIds = [],
  selectedPanelIds = [],
  onChangeTests,
  onChangePanels,
  styles: s,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.trim().toLowerCase();

  const matchingTests = q
    ? allTests.filter(t =>
        t.test_name?.toLowerCase().includes(q) ||
        t.test_code?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q)
      )
    : allTests;

  const matchingPanels = q
    ? allPanels.filter(p =>
        p.panel_name?.toLowerCase().includes(q) ||
        p.panel_code?.toLowerCase().includes(q)
      )
    : allPanels;

  const showDropdown = open && (matchingTests.length > 0 || matchingPanels.length > 0);

  const toggleTest = (id) => {
    const next = selectedTestIds.includes(id)
      ? selectedTestIds.filter(x => x !== id)
      : [...selectedTestIds, id];
    onChangeTests(next);
  };

  const togglePanel = (id) => {
    if (!onChangePanels) return;
    const next = selectedPanelIds.includes(id)
      ? selectedPanelIds.filter(x => x !== id)
      : [...selectedPanelIds, id];
    onChangePanels(next);
  };

  const selectedTestObjs  = allTests.filter(t => selectedTestIds.includes(t.id));
  const selectedPanelObjs = allPanels.filter(p => selectedPanelIds.includes(p.id));
  const totalSelected = selectedTestObjs.length + selectedPanelObjs.length;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)', pointerEvents: 'none' }} />
        <input
          className={s.input}
          style={{ paddingLeft: 32 }}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={totalSelected > 0 ? `${totalSelected} test${totalSelected > 1 ? 's' : ''} selected — search to add more…` : 'Search test name, code or department…'}
        />
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1100,
          background: 'white', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
          maxHeight: 320, overflowY: 'auto',
        }}>
          {/* Panels section */}
          {matchingPanels.length > 0 && onChangePanels && (
            <>
              <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: 0.5, background: '#fafafa', borderBottom: '1px solid var(--color-border)' }}>
                Panels
              </div>
              {matchingPanels.map(p => {
                const sel = selectedPanelIds.includes(p.id);
                return (
                  <div key={p.id} onClick={() => togglePanel(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: sel ? '#eff6ff' : 'white', borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'white'; }}
                  >
                    <Layers size={13} color={sel ? 'var(--color-primary)' : 'var(--color-text-3)'} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? 'var(--color-primary)' : 'var(--color-text)' }}>
                        {sel && '✓ '}{p.panel_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                        {p.panel_code} · {Array.isArray(p.tests) ? p.tests.length : p.test_count || 0} tests
                        {p.price ? ` · ₹${p.price}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Tests section */}
          {matchingTests.length > 0 && (
            <>
              <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: 0.5, background: '#fafafa', borderBottom: '1px solid var(--color-border)' }}>
                Tests
              </div>
              {matchingTests.slice(0, 50).map(t => {
                const sel = selectedTestIds.includes(t.id);
                return (
                  <div key={t.id} onClick={() => { toggleTest(t.id); setQuery(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', background: sel ? '#eff6ff' : 'white', borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'white'; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: sel ? 700 : 400, color: sel ? 'var(--color-primary)' : 'var(--color-text)' }}>
                        {sel && '✓ '}{t.test_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                        {t.test_code} · {t.category}{t.price ? ` · ₹${t.price}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
              {matchingTests.length > 50 && (
                <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--color-text-3)', textAlign: 'center' }}>
                  {matchingTests.length - 50} more — type to narrow down
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Selected chips */}
      {(selectedPanelObjs.length > 0 || selectedTestObjs.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {selectedPanelObjs.map(p => (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ede9fe', color: '#6d28d9', borderRadius: 14, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
              <Layers size={11} /> {p.panel_name}
              {onChangePanels && (
                <button onClick={() => togglePanel(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6d28d9', padding: 0, display: 'flex' }}><X size={11} /></button>
              )}
            </span>
          ))}
          {selectedTestObjs.map(t => (
            <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#dbeafe', color: '#1e40af', borderRadius: 14, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
              {t.test_name}
              <button onClick={() => toggleTest(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', padding: 0, display: 'flex' }}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {totalSelected === 0 && !open && (
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 4 }}>No tests selected — type above to search and select</div>
      )}
    </div>
  );
}

export default TestsAutocomplete;
