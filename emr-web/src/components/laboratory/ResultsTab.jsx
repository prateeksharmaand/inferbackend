/**
 * ResultsTab - OpenELIS-style department-based result entry
 * Shows all pending samples for a department with inline per-test result entry
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FlaskConical, RefreshCw, Search, ChevronDown, CheckCircle, AlertTriangle, Upload, Plus, X } from 'lucide-react';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
});
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const DEPARTMENTS = [
  'Serology Department',
  'Histopathology Department',
  'Microbiology Department',
  'Pathology Department',
  'Biochemistry Department',
  'Haematology Lab Department',
];

const DEPT_KEYWORDS = {
  'Serology Department':        ['SEROLOGY','IMMUNOLOGY','HIV','HEPATITIS','WIDAL','VDRL','DENGUE','TYPHOID','HBS','HCV','RA','ANA','ASO','CRP'],
  'Histopathology Department':  ['HISTOPATHOLOGY','BIOPSY','HISTOLOGY','TISSUE','CYTOLOGY','PAP'],
  'Microbiology Department':    ['MICROBIOLOGY','CULTURE','SENSITIVITY','GRAM','BACTERIA','FUNGAL','AFB','TB'],
  'Pathology Department':       ['PATHOLOGY','URINE','STOOL','OCCULT','PREGNANCY'],
  'Biochemistry Department':    ['BIOCHEMISTRY','GLUCOSE','CREATININE','UREA','CHOLESTEROL','LIVER','KIDNEY','THYROID','TSH','HBA1C','BILIRUBIN','ALT','AST','ALP','PROTEIN','ALBUMIN','ELECTROLYTE','CALCIUM','SODIUM','POTASSIUM','LIPID','TRIGLYCERIDE','FERRITIN','VITAMIN','INSULIN','CORTISOL','TROPONIN','CK','LDH'],
  'Haematology Lab Department': ['HAEMATOLOGY','HEMATOLOGY','CBC','HEMOGLOBIN','PLATELET','WBC','RBC','BLOOD COUNT','ESR','PT','APTT','INR','PERIPHERAL','RETICULOCYTE'],
};

function matchesDept(item, dept) {
  const keywords = DEPT_KEYWORDS[dept] || [];
  const text = `${item.test_name || ''} ${item.test_code || ''} ${item.category || ''}`.toUpperCase();
  return keywords.some(k => text.includes(k));
}

const RESULT_TYPES = ['', 'Indeterminate', 'Reactive', 'Non-Reactive', 'Positive', 'Negative', 'Equivocal'];

function flagResult(value, low, high, critLow, critHigh) {
  const v = parseFloat(value);
  if (isNaN(v)) return null;
  if (critLow  != null && v < parseFloat(critLow))  return 'C-';
  if (critHigh != null && v > parseFloat(critHigh)) return 'C+';
  if (low  != null && v < parseFloat(low))  return 'L';
  if (high != null && v > parseFloat(high)) return 'H';
  return 'N';
}

const FLAG_STYLE = {
  'C-': { bg:'#fee2e2', color:'#991b1b' },
  'C+': { bg:'#fee2e2', color:'#991b1b' },
  'H':  { bg:'#fff7ed', color:'#b45309' },
  'L':  { bg:'#eff6ff', color:'#1e40af' },
  'N':  { bg:'#f0fdf4', color:'#166534' },
};

function computeAge(dob) {
  if (!dob) return null;
  const y = new Date().getFullYear() - new Date(dob).getFullYear();
  return y > 0 ? `${y}y` : null;
}

// One row per test item
function TestResultRow({ item, catalog, onChange, styles: s }) {
  const cat = catalog[item.test_code] || {};
  const rl  = item.rl ?? cat.reference_range_low  ?? null;
  const rh  = item.rh ?? cat.reference_range_high ?? null;
  const cl  = cat.critical_low  ?? null;
  const ch  = cat.critical_high ?? null;
  const unit = item.unit || cat.unit || '';

  const flag = item.result_value !== '' && item.result_value != null
    ? flagResult(item.result_value, rl, rh, cl, ch)
    : null;
  const flagCfg = flag ? FLAG_STYLE[flag] : null;

  const isCategorical = !!(cat.result_type === 'categorical' || item.categorical);

  return (
    <tr style={{ background: (flag === 'C+' || flag === 'C-') ? '#fff5f5' : undefined }}>
      {/* Test name */}
      <td style={{ fontSize: 13, color: 'var(--color-text)', paddingLeft: 28 }}>
        {item.test_name}
        {unit && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--color-text-3)' }}>({unit})</span>}
      </td>

      {/* Result input */}
      <td style={{ minWidth: 140 }}>
        {isCategorical ? (
          <select className={s.select} value={item.result_value || ''} onChange={e => onChange('result_value', e.target.value)}>
            {RESULT_TYPES.map(rt => <option key={rt} value={rt}>{rt || '— Select —'}</option>)}
          </select>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              className={s.input}
              type="text"
              inputMode="decimal"
              value={item.result_value ?? ''}
              onChange={e => onChange('result_value', e.target.value)}
              placeholder="Enter value"
              style={{
                width: 90, fontWeight: 700, fontSize: 14,
                borderColor: flagCfg && flag !== 'N' ? flagCfg.color : undefined,
                background: flagCfg && (flag === 'C+' || flag === 'C-') ? '#fef2f2' : undefined,
              }}
            />
            {unit && <span style={{ fontSize: 12, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>{unit}</span>}
          </div>
        )}
      </td>

      {/* Abnormal checkbox */}
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={!!(flag && flag !== 'N') || !!item.abnormal}
          onChange={e => onChange('abnormal', e.target.checked)} />
      </td>

      {/* Not Reported */}
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={!!item.not_reported}
          onChange={e => onChange('not_reported', e.target.checked)} />
      </td>

      {/* Auto flag */}
      <td>
        {flagCfg ? (
          <span style={{ background: flagCfg.bg, color: flagCfg.color, padding: '2px 7px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{flag}</span>
        ) : '—'}
      </td>

      {/* Normal range */}
      <td style={{ fontSize: 11, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>
        {rl != null && rh != null ? `${rl}–${rh}` : rl != null ? `≥${rl}` : rh != null ? `≤${rh}` : '—'}
        {(cl != null || ch != null) && <div style={{ color: '#991b1b', fontSize: 10 }}>C: {cl ?? '—'}–{ch ?? '—'}</div>}
      </td>

      {/* Referral reason */}
      <td>
        <select className={s.select} style={{ fontSize: 12, minWidth: 110 }} value={item.referral_reason || ''} onChange={e => onChange('referral_reason', e.target.value)}>
          <option value=""></option>
          <option value="Outsourced">Outsourced</option>
          <option value="Equipment Failure">Equipment Failure</option>
          <option value="Reagent Unavailable">Reagent Unavailable</option>
        </select>
      </td>

      {/* Note */}
      <td>
        <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} title="Add note"
          onClick={() => onChange('note_open', !item.note_open)}
          style={{ padding: '2px 8px', color: item.note ? 'var(--color-primary)' : undefined }}>
          <Plus size={11} />
        </button>
      </td>

      {/* File */}
      <td>
        <label style={{ cursor: 'pointer', fontSize: 12, background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)', display: 'inline-block' }}>
          📎 File
          <input type="file" style={{ display: 'none' }} onChange={e => onChange('file', e.target.files[0])} />
        </label>
        {item.file && <div style={{ fontSize: 10, color: 'var(--color-text-3)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>}
      </td>
    </tr>
  );
}

// One card per order (Lab No / Sample Type / Patient)
function OrderCard({ order, catalog, initialItems, onSave, saving, styles: s }) {
  // Keep result state locally so typing doesn't lose focus on parent re-render
  const [items, setItems] = useState(initialItems || []);

  // Sync if initialItems changes (e.g. after load)
  const prevRef = useRef(null);
  useEffect(() => {
    const key = initialItems.map(i => i.test_code).join(',');
    if (prevRef.current !== key) { setItems(initialItems); prevRef.current = key; }
  }, [initialItems]);

  const onChange = (idx, field, val) =>
    setItems(rows => rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const handleSave = (action) => onSave(order, action, items);
  const age        = computeAge(order.patient_dob);
  const isStat     = order.priority === 'STAT';
  const isUrgent   = order.priority === 'URGENT';

  return (
    <div style={{ marginBottom: 16, border: `1px solid ${isStat ? '#fecaca' : 'var(--color-border)'}`, borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: isStat ? '#fef2f2' : isUrgent ? '#fffbeb' : '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>Lab No: {order.order_number}</span>
        {order.sample_type && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>Sample: <strong>{order.sample_type}</strong></span>}
        <span style={{ fontSize: 12 }}>
          Patient: <strong>{order.patient_name || '—'}</strong>
          {age && <span style={{ marginLeft: 4, color: 'var(--color-text-3)' }}>{age}</span>}
        </span>
        {order.patient_uhid && <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 5, fontSize: 12, fontWeight: 700 }}>{order.patient_uhid}</span>}
        {order.doctor_name  && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>Dr: {order.doctor_name}</span>}
        <span style={{ marginLeft: 'auto', background: isStat ? '#fee2e2' : isUrgent ? '#fff7ed' : '#f1f5f9', color: isStat ? '#991b1b' : isUrgent ? '#b45309' : '#64748b', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
          {order.priority || 'ROUTINE'}{isStat ? ' 🔴' : ''}
        </span>
      </div>

      {/* Test rows */}
      {items.length === 0 ? (
        <div style={{ padding: '12px 20px', fontSize: 13, color: 'var(--color-text-3)' }}>No test items found for this order.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px 6px 28px', textAlign: 'left' }}>Test</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Result</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: 70 }}>Abnormal</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: 70 }}>Not Rep.</th>
              <th style={{ padding: '6px 8px', width: 50 }}>Flag</th>
              <th style={{ padding: '6px 8px' }}>Normal Range</th>
              <th style={{ padding: '6px 8px' }}>Referral Reason</th>
              <th style={{ padding: '6px 8px', width: 40 }}>Note</th>
              <th style={{ padding: '6px 8px' }}>File</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <React.Fragment key={item.test_code || idx}>
                <TestResultRow
                  item={item}
                  catalog={catalog}
                  onChange={(field, val) => onChange(order.id, idx, field, val)}
                  styles={s}
                />
                {item.note_open && (
                  <tr>
                    <td colSpan={9} style={{ padding: '4px 28px 8px' }}>
                      <input className={s.input} value={item.note || ''} onChange={e => onChange(order.id, idx, 'note', e.target.value)} placeholder="Technician note for this test…" style={{ fontSize: 12 }} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      {/* Card footer */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, justifyContent: 'flex-end', background: '#fafafa' }}>
        <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} onClick={() => handleSave('draft')} disabled={saving[order.id]}>
          Save Draft
        </button>
        <button className={`${s.btn} ${s.btnSm} ${s.btnPrimary}`} onClick={() => handleSave('validate')} disabled={saving[order.id]}
          style={{ background: isStat ? '#991b1b' : undefined }}>
          <CheckCircle size={12} /> {saving[order.id] ? 'Saving…' : 'Validate'}
        </button>
      </div>
    </div>
  );
}

export function ResultsTab({ labId, styles: s }) {
  const [view,       setView]       = useState('enter'); // 'search' | 'enter' | 'referred'
  const [searchMode, setSearchMode] = useState('patient'); // 'patient' | 'accession' | 'status'
  const [searchVal,  setSearchVal]  = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [searchOpen,    setSearchOpen]    = useState(false);
  const searchRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const [dept,       setDept]       = useState(DEPARTMENTS[4]); // Biochemistry default
  const [deptOpen,   setDeptOpen]   = useState(false);
  const [allOrders,  setAllOrders]  = useState([]);
  const [catalog,    setCatalog]    = useState({});
  const [allResults, setAllResults] = useState({}); // { orderId: [items...] }
  const [saving,     setSaving]     = useState({});
  const [loading,    setLoading]    = useState(false);
  const [labSearch,  setLabSearch]  = useState('');
  const [msg,        setMsg]        = useState('');
  const [msgType,    setMsgType]    = useState('');
  const [critAlert,  setCritAlert]  = useState(null);
  const [page,       setPage]       = useState(0);
  const PER_PAGE = 5;

  const deptRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (deptRef.current && !deptRef.current.contains(e.target)) setDeptOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 5000); };

  const handleSearch = async () => {
    setSearching(true); setSearchResults([]);
    try {
      let url = `/api/v1/orders/lab/${labId}?limit=50`;
      if (searchMode === 'accession' && searchVal.trim()) url += `&accession=${encodeURIComponent(searchVal.trim())}`;
      if (searchMode === 'patient'   && searchVal.trim()) url += `&patient=${encodeURIComponent(searchVal.trim())}`;
      if (searchMode === 'status'    && searchStatus)     url += `&status=${searchStatus}`;
      const data = await apiFetch(url);
      const orders = data.orders || [];
      const q = searchVal.trim().toLowerCase();
      const filtered = searchMode === 'patient'
        ? orders.filter(o => (o.patient_name || '').toLowerCase().includes(q) || (o.patient_uhid || '').toLowerCase().includes(q))
        : orders;
      setSearchResults(filtered);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const loadOrders = useCallback(async () => {
    if (!labId) return;
    setLoading(true);
    try {
      const [ordersData, catData] = await Promise.all([
        apiFetch(`/api/v1/orders/lab/${labId}?status=COLLECTED,PROCESSING`),
        apiFetch(`/api/v1/catalog?lab_id=${labId}`),
      ]);
      const orders = ordersData.orders || [];
      setAllOrders(orders);

      // Build catalog map
      const catMap = {};
      (catData.tests || catData || []).forEach(t => { catMap[t.test_code] = t; });
      setCatalog(catMap);

      // For each order, fetch full order to get items, then match to department
      const resultsMap = {};
      await Promise.all(orders.map(async (o) => {
        try {
          const full = await apiFetch(`/api/v1/orders/${o.id}`);
          const items = (full.order?.items || full.items || []).map(item => {
            const cat = catMap[item.test_code] || {};
            return {
              test_code:      item.test_code,
              test_name:      item.test_name,
              result_value:   item.result_value ?? '',
              unit:           cat.unit || item.unit || '',
              rl:             cat.reference_range_low  ?? null,
              rh:             cat.reference_range_high ?? null,
              cl:             cat.critical_low  ?? null,
              ch:             cat.critical_high ?? null,
              abnormal:       false,
              not_reported:   false,
              referral_reason:'',
              note:           '',
              note_open:      false,
              file:           null,
              category:       cat.category || '',
            };
          });
          resultsMap[o.id] = items;
        } catch {
          resultsMap[o.id] = [];
        }
      }));
      setAllResults(resultsMap);
    } catch { setAllOrders([]); }
    finally { setLoading(false); setPage(0); }
  }, [labId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const onChange = (orderId, idx, field, val) => {
    setAllResults(prev => {
      const rows = [...(prev[orderId] || [])];
      rows[idx] = { ...rows[idx], [field]: val };
      return { ...prev, [orderId]: rows };
    });
  };

  const handleSave = async (order, action, items) => {
    const filled = (items || []).filter(r => r.result_value !== '' && r.result_value != null && !r.not_reported);

    // Critical check before validate
    if (action === 'validate') {
      const crits = filled.filter(r => { const f = flagResult(r.result_value, r.rl, r.rh, r.cl, r.ch); return f === 'C+' || f === 'C-'; });
      if (crits.length > 0 && !critAlert) { setCritAlert({ crits, order, action, items }); return; }
    }
    setCritAlert(null);

    try {
      setSaving(p => ({ ...p, [order.id]: true }));
      if (filled.length > 0) {
        await apiFetch(`/api/v1/orders/${order.id}/results`, {
          method: 'POST',
          body: JSON.stringify({
            results: filled.map(r => ({
              test_code: r.test_code, test_name: r.test_name,
              result_value: r.result_value, result_unit: r.unit,
              reference_range_low: r.rl, reference_range_high: r.rh,
              critical_low: r.cl, critical_high: r.ch,
              is_critical_value: ['C+','C-'].includes(flagResult(r.result_value, r.rl, r.rh, r.cl, r.ch)),
            })),
            action,
          }),
        });
      }
      showMsg(`Order ${order.order_number} — ${action === 'validate' ? 'validated' : 'draft saved'}`);
      loadOrders();
    } catch (err) { showMsg(err.message, 'error'); }
    finally { setSaving(p => ({ ...p, [order.id]: false })); }
  };

  // Filter orders for current department
  const deptOrders = allOrders.filter(o => {
    const items = allResults[o.id] || [];
    if (labSearch.trim()) {
      const q = labSearch.toLowerCase();
      return (o.order_number || '').toLowerCase().includes(q) || (o.patient_name || '').toLowerCase().includes(q);
    }
    // show order if any item matches department
    return items.some(item => matchesDept(item, dept)) || items.length === 0;
  });

  // Filter items per order to only show items matching department
  const getItemsForDept = (orderId) => {
    const items = allResults[orderId] || [];
    const filtered = items.filter(item => matchesDept(item, dept));
    return filtered.length > 0 ? filtered : items;
  };

  const pageOrders  = deptOrders.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages  = Math.ceil(deptOrders.length / PER_PAGE);

  // Referred out orders
  const referredOrders = allOrders.filter(o => (o.clinical_notes || '').toLowerCase().includes('referr'));

  return (
    <div>
      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--color-border)' }}>
        {/* Search(es) with submenu */}
        <div ref={searchRef} style={{ position: 'relative' }}>
          <button onClick={() => { setView('search'); setSearchOpen(o => !o); }}
            style={{ padding: '10px 18px', fontSize: 13, fontWeight: view === 'search' ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', borderBottom: view === 'search' ? '2px solid var(--color-primary)' : '2px solid transparent', color: view === 'search' ? 'var(--color-primary)' : 'var(--color-text)', marginBottom: -2, display: 'flex', alignItems: 'center', gap: 4 }}>
            Search(es) <ChevronDown size={13} />
          </button>
          {searchOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, boxShadow: 'var(--shadow-lg)', zIndex: 1000, minWidth: 180 }}>
              {[['patient', 'By Patient(es)'], ['accession', 'By Accession(es)'], ['status', 'By Status(es)']].map(([mode, label]) => (
                <button key={mode} onClick={() => { setSearchMode(mode); setSearchOpen(false); setView('search'); setSearchResults([]); setSearchVal(''); }}
                  style={{ display: 'block', width: '100%', padding: '9px 16px', textAlign: 'left', fontSize: 13, background: searchMode === mode && view === 'search' ? '#eff6ff' : 'none', color: searchMode === mode && view === 'search' ? 'var(--color-primary)' : 'var(--color-text)', border: 'none', cursor: 'pointer', fontWeight: searchMode === mode && view === 'search' ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Enter(es) with dept submenu */}
        <div ref={deptRef} style={{ position: 'relative' }}>
          <button onClick={() => { setView('enter'); setDeptOpen(d => !d); }}
            style={{ padding: '10px 18px', fontSize: 13, fontWeight: view === 'enter' ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', borderBottom: view === 'enter' ? '2px solid var(--color-primary)' : '2px solid transparent', color: view === 'enter' ? 'var(--color-primary)' : 'var(--color-text)', marginBottom: -2, display: 'flex', alignItems: 'center', gap: 4 }}>
            Enter(es) <ChevronDown size={13} />
          </button>
          {deptOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, boxShadow: 'var(--shadow-lg)', zIndex: 1000, minWidth: 220 }}>
              {DEPARTMENTS.map(d => (
                <button key={d} onClick={() => { setDept(d); setDeptOpen(false); setPage(0); }}
                  style={{ display: 'block', width: '100%', padding: '9px 16px', textAlign: 'left', fontSize: 13, background: dept === d ? '#eff6ff' : 'none', color: dept === d ? 'var(--color-primary)' : 'var(--color-text)', border: 'none', cursor: 'pointer', fontWeight: dept === d ? 600 : 400 }}>
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Referred Out(es) */}
        <button onClick={() => setView('referred')}
          style={{ padding: '10px 18px', fontSize: 13, fontWeight: view === 'referred' ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', borderBottom: view === 'referred' ? '2px solid var(--color-primary)' : '2px solid transparent', color: view === 'referred' ? 'var(--color-primary)' : 'var(--color-text)', marginBottom: -2 }}>
          Referred Out(es)
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Lab No:</span>
          <input className={s.input} style={{ width: 160, padding: '4px 8px', fontSize: 12 }} value={labSearch} onChange={e => { setLabSearch(e.target.value); setPage(0); }} placeholder="Search…" />
          <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} onClick={() => setLabSearch('')}><Search size={12} /></button>
          <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} onClick={loadOrders} disabled={loading}><RefreshCw size={12} /></button>
        </div>
      </div>

      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`} style={{ marginBottom: 12 }}>{msg}</div>}

      {/* ── Enter(es) view ── */}
      {view === 'enter' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{dept}</h3>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Previous</button>
                <span>{page + 1} of {totalPages}</span>
                <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>

          {loading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading orders…</div></div>
          ) : deptOrders.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}><FlaskConical size={48} /></div>
              <div className={s.emptyText}>No pending orders for {dept}</div>
            </div>
          ) : (
            pageOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                catalog={catalog}
                initialItems={getItemsForDept(order.id)}
                onSave={handleSave}
                saving={saving}
                styles={s}
              />
            ))
          )}
        </div>
      )}

      {/* ── Search(es) view ── */}
      {view === 'search' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {[['patient','By Patient(es)'],['accession','By Accession(es)'],['status','By Status(es)']].map(([mode, label]) => (
              <button key={mode} className={`${s.btn} ${s.btnSm} ${searchMode === mode ? s.btnPrimary : s.btnSecondary}`}
                onClick={() => { setSearchMode(mode); setSearchResults([]); setSearchVal(''); }}>
                {label}
              </button>
            ))}
          </div>

          <div className={s.card} style={{ marginBottom: 14 }}>
            <div className={s.cardBody}>
              {searchMode === 'status' ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className={s.select} style={{ width: 220 }} value={searchStatus} onChange={e => setSearchStatus(e.target.value)}>
                    <option value="">— Select Status —</option>
                    {['PENDING','SCHEDULED','COLLECTED','PROCESSING','RESULTED','REPORTED','CANCELLED'].map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                  <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSearch} disabled={searching || !searchStatus}>
                    <Search size={14} /> {searching ? 'Searching…' : 'Search'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className={s.input} style={{ flex: 1 }} value={searchVal}
                    onChange={e => setSearchVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder={searchMode === 'accession' ? 'Enter accession / order number…' : 'Enter patient name or UHID…'} />
                  <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSearch} disabled={searching || !searchVal.trim()}>
                    <Search size={14} /> {searching ? 'Searching…' : 'Search'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.cardTitle}>Search Results</div>
                <span className={`${s.badge} ${s.badgeBlue}`}>{searchResults.length} found</span>
              </div>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>{['Lab No.', 'Patient', 'Sample', 'Tests', 'Status', 'Priority', 'Date', 'Action'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {searchResults.map(o => (
                      <tr key={o.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{o.order_number}</td>
                        <td style={{ fontSize: 12 }}>
                          {o.patient_name || '—'}
                          {o.patient_uhid && <div style={{ fontSize: 10, color: '#6d28d9', fontWeight: 700 }}>{o.patient_uhid}</div>}
                        </td>
                        <td style={{ fontSize: 12 }}>{o.sample_type || '—'}</td>
                        <td style={{ fontSize: 12 }}>{o.total_tests || '—'}</td>
                        <td><span style={{ background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{o.status}</span></td>
                        <td><span style={{ background: o.priority === 'STAT' ? '#fee2e2' : '#f1f5f9', color: o.priority === 'STAT' ? '#991b1b' : '#64748b', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{o.priority || 'ROUTINE'}</span></td>
                        <td style={{ fontSize: 12 }}>{o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN') : '—'}</td>
                        <td>
                          <button className={`${s.btn} ${s.btnSm} ${s.btnPrimary}`}
                            onClick={() => { setView('enter'); setDept(DEPARTMENTS[4]); setLabSearch(o.order_number || ''); }}>
                            Enter Results
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {searchResults.length === 0 && !searching && searchVal && (
            <div className={s.emptyState}><div className={s.emptyText}>No orders found</div></div>
          )}
        </div>
      )}

      {/* ── Referred Out view ── */}
      {view === 'referred' && (
        <div>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Referred Out Orders</h3>
          {referredOrders.length === 0 ? (
            <div className={s.emptyState}><div className={s.emptyText}>No referred orders</div></div>
          ) : (
            <div className={s.card}>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>{['Lab No.', 'Patient', 'Sample', 'Referred To', 'Date', 'Status', 'Action'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {referredOrders.map(o => (
                      <tr key={o.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{o.order_number}</td>
                        <td style={{ fontSize: 12 }}>
                          {o.patient_name || '—'}
                          {o.patient_uhid && <div style={{ fontSize: 10, color: '#6d28d9', fontWeight: 700 }}>{o.patient_uhid}</div>}
                        </td>
                        <td style={{ fontSize: 12 }}>{o.sample_type || '—'}</td>
                        <td style={{ fontSize: 12 }}>{(o.clinical_notes || '').match(/referred to:?\s*([^|]+)/i)?.[1]?.trim() || 'External Lab'}</td>
                        <td style={{ fontSize: 12 }}>{o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN') : '—'}</td>
                        <td><span style={{ background: '#fff7ed', color: '#b45309', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{o.status}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`}
                              onClick={async () => { await apiFetch(`/api/v1/orders/${o.id}/status`, { method:'PATCH', body: JSON.stringify({ status:'RESULTED' }) }).catch(()=>{}); loadOrders(); }}>
                              <CheckCircle size={12} /> Received
                            </button>
                            <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`}><Upload size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Critical value alert */}
      {critAlert && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:12, padding:24, maxWidth:440, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <AlertTriangle size={24} color="#991b1b" />
              <div style={{ fontSize:16, fontWeight:700, color:'#991b1b' }}>🚨 Critical Value Alert</div>
            </div>
            <p style={{ fontSize:13, marginBottom:12 }}>The following results are at critical/panic levels. Please verify and notify the requesting doctor immediately before validating.</p>
            {critAlert.crits.map(r => (
              <div key={r.test_code} style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:13 }}>
                <strong>{r.test_name}</strong>: {r.result_value} {r.unit} —
                <span style={{ color:'#991b1b', fontWeight:700, marginLeft:6 }}>
                  {flagResult(r.result_value, r.rl, r.rh, r.cl, r.ch) === 'C-' ? 'CRITICAL LOW' : 'CRITICAL HIGH'}
                </span>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setCritAlert(null)}>Review Again</button>
              <button className={`${s.btn} ${s.btnPrimary}`} style={{ background:'#991b1b' }}
                onClick={() => handleSave(critAlert.order, critAlert.action, critAlert.items)}>
                Confirm & Validate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResultsTab;
