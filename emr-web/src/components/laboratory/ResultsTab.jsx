/**
 * ResultsTab - Full result entry, validation and referred-out management
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FlaskConical, RefreshCw, Search, X, Clock, AlertTriangle, CheckCircle, ChevronRight, Upload } from 'lucide-react';

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

const STATUS_TABS = [
  { id: 'COLLECTED,PROCESSING', label: 'Pending',            badge: 'badgeBlue'   },
  { id: 'RESULTED',             label: 'Pending Validation', badge: 'badgeYellow' },
  { id: 'REPORTED',             label: 'Validated',          badge: 'badgeGreen'  },
];

const INSTRUMENTS = ['Manual / Visual', 'Beckman Coulter', 'Sysmex', 'Siemens Atellica', 'Abbott ARCHITECT', 'Roche Cobas', 'Mindray', 'BioMerieux', 'BD BACTEC', 'Other'];

function computeAge(dob) {
  if (!dob) return null;
  const y = new Date().getFullYear() - new Date(dob).getFullYear();
  return y > 0 ? `${y}y` : null;
}

function tatRemaining(order) {
  // Try to compute from collected_at + min(turnaround_hours)
  const base = order.collected_at || order.created_at;
  const tat  = order.min_tat_hours || 4; // default 4h
  if (!base) return null;
  const deadline = new Date(base).getTime() + tat * 3600000;
  const diff = deadline - Date.now();
  if (diff <= 0) return { label: 'OVERDUE', color: '#991b1b', bg: '#fee2e2', overdue: true };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const color = diff < 3600000 ? '#991b1b' : diff < 7200000 ? '#b45309' : '#166534';
  const bg    = diff < 3600000 ? '#fee2e2' : diff < 7200000 ? '#fff7ed' : '#f0fdf4';
  return { label: h > 0 ? `${h}h ${m}m` : `${m}m`, color, bg, overdue: false };
}

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
  'C-': { bg: '#fee2e2', color: '#991b1b', label: 'Critical Low'  },
  'C+': { bg: '#fee2e2', color: '#991b1b', label: 'Critical High' },
  'H':  { bg: '#fff7ed', color: '#b45309', label: 'High'          },
  'L':  { bg: '#eff6ff', color: '#1e40af', label: 'Low'           },
  'N':  { bg: '#f0fdf4', color: '#166534', label: 'Normal'        },
};

// ─── Worklist ──────────────────────────────────────────────────────────────────
function WorklistTable({ orders, loading, onSelect, styles: s }) {
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchQ = !q || (o.patient_name || '').toLowerCase().includes(q) || (o.order_number || '').toLowerCase().includes(q) || (o.patient_uhid || '').toLowerCase().includes(q);
    const matchP = !priority || o.priority === priority;
    return matchQ && matchP;
  }).sort((a, b) => {
    const pr = { STAT: 0, URGENT: 1, ROUTINE: 2 };
    return (pr[a.priority] ?? 2) - (pr[b.priority] ?? 2);
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)' }} />
          <input className={s.input} style={{ paddingLeft: 28 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, accession or UHID…" />
        </div>
        {['', 'STAT', 'URGENT', 'ROUTINE'].map(p => (
          <button key={p} className={`${s.btn} ${s.btnSm}`} onClick={() => setPriority(p)}
            style={{ fontWeight: 600, fontSize: 12,
              background: priority === p ? (p === 'STAT' ? '#991b1b' : p === 'URGENT' ? '#b45309' : 'var(--color-primary)') : 'white',
              color: priority === p ? 'white' : p === 'STAT' ? '#991b1b' : p === 'URGENT' ? '#b45309' : 'var(--color-text)',
              border: `1.5px solid ${p === 'STAT' ? '#991b1b' : p === 'URGENT' ? '#b45309' : priority === p ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
            {p || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={s.emptyState}><div className={s.emptyText}>Loading…</div></div>
      ) : filtered.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><FlaskConical size={40} /></div>
          <div className={s.emptyText}>No orders in this queue</div>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>{['Accession', 'Patient', 'Tests', 'Ordered By', 'Collected', 'TAT', 'Priority', 'Action'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const tat = tatRemaining(order);
                const isStat = order.priority === 'STAT';
                const isUrgent = order.priority === 'URGENT';
                const testNames = order.items?.map(i => i.test_name).join(', ') || order.sample_type || '—';
                const age = computeAge(order.patient_dob);
                return (
                  <tr key={order.id} style={{ background: isStat ? '#fff5f5' : isUrgent ? '#fffbeb' : undefined }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{order.order_number || order.id}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{order.patient_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                        {order.patient_uhid && <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '0 5px', borderRadius: 4, fontWeight: 700, marginRight: 4 }}>{order.patient_uhid}</span>}
                        {age && <span>{age}</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={testNames}>{testNames}</td>
                    <td style={{ fontSize: 12 }}>{order.doctor_name || '—'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {order.collected_at
                        ? new Date(order.collected_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                        : '—'}
                    </td>
                    <td>
                      {tat ? (
                        <span style={{ background: tat.bg, color: tat.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} /> {tat.label}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span style={{
                        background: isStat ? '#fee2e2' : isUrgent ? '#fff7ed' : '#f1f5f9',
                        color: isStat ? '#991b1b' : isUrgent ? '#b45309' : '#64748b',
                        padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700
                      }}>{order.priority || 'ROUTINE'}{isStat ? ' 🔴' : ''}</span>
                    </td>
                    <td>
                      <button className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} onClick={() => onSelect(order)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Enter Results <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Result Entry Form ─────────────────────────────────────────────────────────
function ResultEntryForm({ order, labId, styles: s, onDone }) {
  const [catalog,     setCatalog]     = useState({}); // { test_code: catalogItem }
  const [resultRows,  setResultRows]  = useState([]); // [{ test_code, test_name, result_value, unit, rl, rh, cl, ch }]
  const [instrument,  setInstrument]  = useState(INSTRUMENTS[0]);
  const [techNotes,   setTechNotes]   = useState('');
  const [prevResults, setPrevResults] = useState({}); // test_code → last value
  const [critAlert,   setCritAlert]   = useState(null); // { test_name, value, flag }
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState('');

  // Load catalog items for this order's tests
  useEffect(() => {
    if (!order?.items?.length) return;
    apiFetch(`/api/v1/catalog?lab_id=${labId}`)
      .then(data => {
        const map = {};
        (data.tests || data || []).forEach(t => { map[t.test_code] = t; });
        setCatalog(map);

        const rows = order.items.map(item => {
          const cat = map[item.test_code] || {};
          return {
            test_code: item.test_code,
            test_name: item.test_name,
            result_value: '',
            unit: cat.unit || item.unit || '',
            rl: cat.reference_range_low,
            rh: cat.reference_range_high,
            cl: cat.critical_low,
            ch: cat.critical_high,
          };
        });
        setResultRows(rows);
      })
      .catch(() => {
        // Fallback: use items directly
        setResultRows((order.items || []).map(item => ({
          test_code: item.test_code,
          test_name: item.test_name,
          result_value: '', unit: '', rl: null, rh: null, cl: null, ch: null,
        })));
      });

    // Load previous results for delta check
    if (order.patient_uhid) {
      apiFetch(`/api/v1/patients/${order.patient_uhid || 'x'}/lab-reports?uhid=${order.patient_uhid || ''}`).then(reports => {
        const prev = {};
        (reports || []).forEach(r => (r.results || []).forEach(res => {
          if (res.test_name && !prev[res.test_name]) prev[res.test_name] = res.result_value;
        }));
        setPrevResults(prev);
      }).catch(() => {});
    }
  }, [order, labId]);

  const setVal = (idx, val) => setResultRows(rows => rows.map((r, i) => i === idx ? { ...r, result_value: val } : r));

  const handleSave = async (action) => {
    const filled = resultRows.filter(r => r.result_value !== '');
    if (filled.length === 0 && action !== 'reject') { setMsg('Enter at least one result value'); return; }

    // Check for criticals before save
    const criticals = filled.filter(r => {
      const f = flagResult(r.result_value, r.rl, r.rh, r.cl, r.ch);
      return f === 'C+' || f === 'C-';
    });
    if (criticals.length > 0 && action === 'validate' && !critAlert) {
      setCritAlert(criticals);
      return;
    }

    try {
      setSaving(true);
      await apiFetch(`/api/v1/orders/${order.id}/results`, {
        method: 'POST',
        body: JSON.stringify({
          results: filled.map(r => ({
            test_code: r.test_code,
            test_name: r.test_name,
            result_value: r.result_value,
            result_unit: r.unit,
            reference_range_low: r.rl,
            reference_range_high: r.rh,
            critical_low: r.cl,
            critical_high: r.ch,
            is_critical_value: ['C+','C-'].includes(flagResult(r.result_value, r.rl, r.rh, r.cl, r.ch)),
          })),
          instrument,
          technician_notes: techNotes,
          action,
        }),
      });
      onDone(`Results ${action === 'validate' ? 'validated' : action === 'draft' ? 'saved as draft' : action === 'review' ? 'sent for review' : 'rejected'}`);
    } catch (err) { setMsg(err.message); }
    finally { setSaving(false); }
  };

  const age = computeAge(order.patient_dob);

  return (
    <div>
      {/* Back */}
      <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => onDone(null)} style={{ marginBottom: 12 }}>
        ← Back to Worklist
      </button>

      {/* Order header */}
      <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13 }}>
        <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>Patient</span><div style={{ fontWeight: 700 }}>{order.patient_name || '—'}{age && ` · ${age}`}</div></div>
        {order.patient_uhid && <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>UHID</span><div style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12 }}>{order.patient_uhid}</div></div>}
        <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>Order</span><div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{order.order_number}</div></div>
        <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>Sample</span><div>{order.sample_type || '—'}</div></div>
        <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>Ordered By</span><div>{order.doctor_name || '—'}</div></div>
        <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>Collected</span><div>{order.collected_at ? new Date(order.collected_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</div></div>
        <div><span style={{ background: order.priority === 'STAT' ? '#fee2e2' : '#f1f5f9', color: order.priority === 'STAT' ? '#991b1b' : '#64748b', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{order.priority || 'ROUTINE'}</span></div>
      </div>

      {msg && <div className={`${s.alert} ${s.alertError}`} style={{ marginBottom: 10 }}>{msg}</div>}

      {/* Parameter table */}
      <div className={s.card} style={{ marginBottom: 14 }}>
        <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>Result Entry</div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Parameter</th>
                <th style={{ width: 140 }}>Result</th>
                <th>Normal Range</th>
                <th>Unit</th>
                <th style={{ width: 80 }}>Flag</th>
                <th>Prev. Result</th>
              </tr>
            </thead>
            <tbody>
              {resultRows.map((row, idx) => {
                const flag   = row.result_value !== '' ? flagResult(row.result_value, row.rl, row.rh, row.cl, row.ch) : null;
                const flagCfg = flag ? FLAG_STYLE[flag] : null;
                const prev   = prevResults[row.test_name];
                return (
                  <tr key={row.test_code} style={{ background: flagCfg && (flag === 'C+' || flag === 'C-') ? '#fff5f5' : undefined }}>
                    <td style={{ fontWeight: 600 }}>{row.test_name}<div style={{ fontSize: 10, color: 'var(--color-text-3)', fontFamily: 'monospace' }}>{row.test_code}</div></td>
                    <td>
                      <input
                        className={s.input}
                        type="number"
                        step="any"
                        value={row.result_value}
                        onChange={e => setVal(idx, e.target.value)}
                        placeholder="—"
                        style={{ borderColor: flagCfg && flag !== 'N' ? flagCfg.color : undefined, fontWeight: 700, fontSize: 14 }}
                        autoFocus={idx === 0}
                      />
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
                      {row.rl != null && row.rh != null ? `${row.rl} – ${row.rh}` : row.rl != null ? `≥ ${row.rl}` : row.rh != null ? `≤ ${row.rh}` : '—'}
                      {row.cl != null || row.ch != null ? <div style={{ fontSize: 10, color: '#991b1b' }}>Crit: {row.cl ?? '—'} – {row.ch ?? '—'}</div> : null}
                    </td>
                    <td style={{ fontSize: 12 }}>{row.unit || '—'}</td>
                    <td>
                      {flagCfg ? (
                        <span style={{ background: flagCfg.bg, color: flagCfg.color, padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                          {flag}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                      {prev != null ? <span>{prev} {row.unit}</span> : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instrument + notes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 14 }}>
        <div className={s.field}>
          <label className={s.label}>Instrument / Analyzer</label>
          <select className={s.select} value={instrument} onChange={e => setInstrument(e.target.value)}>
            {INSTRUMENTS.map(i => <option key={i}>{i}</option>)}
          </select>
        </div>
        <div className={s.field}>
          <label className={s.label}>Technician Notes</label>
          <textarea className={s.input} rows={2} value={techNotes} onChange={e => setTechNotes(e.target.value)} placeholder="Comments, observations, interferences…" style={{ fontFamily: 'inherit', fontSize: 13 }} />
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => onDone(null)}>Cancel</button>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => handleSave('reject')} disabled={saving} style={{ color: '#991b1b', borderColor: '#991b1b' }}>
          Reject Sample
        </button>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => handleSave('draft')} disabled={saving}>
          Save Draft
        </button>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => handleSave('review')} disabled={saving} style={{ color: '#6d28d9', borderColor: '#6d28d9' }}>
          Send for Review
        </button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => handleSave('validate')} disabled={saving}>
          <CheckCircle size={14} /> {saving ? 'Saving…' : 'Validate & Report'}
        </button>
      </div>

      {/* Critical value alert modal */}
      {critAlert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <AlertTriangle size={24} color="#991b1b" />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#991b1b' }}>🚨 Critical Value Alert</div>
            </div>
            <p style={{ fontSize: 13, marginBottom: 12, color: '#334155' }}>The following results are at critical / panic levels. Please verify and notify the requesting doctor immediately.</p>
            {critAlert.map(r => (
              <div key={r.test_code} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 13 }}>
                <strong>{r.test_name}</strong>: {r.result_value} {r.unit} — <span style={{ color: '#991b1b', fontWeight: 700 }}>{flagResult(r.result_value, r.rl, r.rh, r.cl, r.ch) === 'C-' ? 'CRITICAL LOW' : 'CRITICAL HIGH'}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setCritAlert(null)}>Review Again</button>
              <button className={`${s.btn} ${s.btnPrimary}`} style={{ background: '#991b1b' }} onClick={() => { setCritAlert(null); handleSave('validate'); }}>
                Confirm & Validate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Referred Out ──────────────────────────────────────────────────────────────
function ReferredOutView({ orders, onRefresh, styles: s }) {
  const referred = orders.filter(o => (o.clinical_notes || '').toLowerCase().includes('referr') || o.is_referred);

  if (referred.length === 0) return (
    <div className={s.emptyState}>
      <div className={s.emptyIcon}><FlaskConical size={40} /></div>
      <div className={s.emptyText}>No referred orders</div>
    </div>
  );

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>{['Accession', 'Patient', 'Test', 'Referred To', 'Sent Date', 'Expected TAT', 'Status', 'Action'].map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {referred.map(o => (
            <tr key={o.id}>
              <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{o.order_number}</td>
              <td style={{ fontSize: 12 }}>
                {o.patient_name || '—'}
                {o.patient_uhid && <div style={{ fontSize: 10, color: '#6d28d9', fontWeight: 700 }}>{o.patient_uhid}</div>}
              </td>
              <td style={{ fontSize: 12 }}>{o.sample_type || '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
                {(o.clinical_notes || '').match(/Referred to: ([^|]+)/i)?.[1]?.trim() || 'External Lab'}
              </td>
              <td style={{ fontSize: 12 }}>{o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN') : '—'}</td>
              <td style={{ fontSize: 12 }}>—</td>
              <td><span className={`badge`} style={{ background: '#fffbeb', color: '#b45309', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{o.status}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} title="Mark Result Received"
                    onClick={async () => {
                      await apiFetch(`/api/v1/orders/${o.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'RESULTED', notes: 'External result received' }) }).catch(() => {});
                      onRefresh();
                    }}>
                    <CheckCircle size={12} /> Received
                  </button>
                  <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} title="Upload report">
                    <Upload size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function ResultsTab({ labId, styles: s }) {
  const [statusTab, setStatusTab] = useState('COLLECTED,PROCESSING');
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [msg,       setMsg]       = useState('');

  const loadOrders = useCallback(async () => {
    if (!labId) return;
    try {
      setLoading(true);
      const data = await apiFetch(`/api/v1/orders/lab/${labId}?status=${statusTab}`);
      setOrders(data.orders || []);
    } catch { setOrders([]); }
    finally { setLoading(false); }
  }, [labId, statusTab]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleDone = (message) => {
    setSelected(null);
    if (message) { setMsg(message); setTimeout(() => setMsg(''), 4000); }
    loadOrders();
  };

  if (selected) return (
    <div>
      <div className={s.pageHeader}><div><div className={s.pageTitle}>Results</div><div className={s.pageSubtitle}>Enter and validate lab results</div></div></div>
      {msg && <div className={`${s.alert} ${s.alertSuccess}`} style={{ marginBottom: 12 }}>{msg}</div>}
      <ResultEntryForm order={selected} labId={labId} styles={s} onDone={handleDone} />
    </div>
  );

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Results</div>
          <div className={s.pageSubtitle}>Enter and validate lab results by department</div>
        </div>
        <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={loadOrders} disabled={loading}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {msg && <div className={`${s.alert} ${s.alertSuccess}`} style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Status tabs */}
      <div className={s.sectionTabs} style={{ marginBottom: 16 }}>
        {STATUS_TABS.map(tab => (
          <button key={tab.id} className={`${s.sectionTab} ${statusTab === tab.id ? s.sectionTabActive : ''}`}
            onClick={() => { setStatusTab(tab.id); setSelected(null); }}>
            {tab.label}
            <span className={`${s.badge} ${s[tab.badge]}`} style={{ marginLeft: 6, fontSize: 11 }}>
              {statusTab === tab.id ? orders.length : ''}
            </span>
          </button>
        ))}
        <button className={`${s.sectionTab} ${statusTab === 'REFERRED' ? s.sectionTabActive : ''}`}
          onClick={() => { setStatusTab('REFERRED'); }}>
          Referred Out
        </button>
      </div>

      <div className={s.card}>
        <div className={s.cardBody}>
          {statusTab === 'REFERRED' ? (
            <ReferredOutView orders={orders} onRefresh={loadOrders} styles={s} />
          ) : (
            <WorklistTable orders={orders} loading={loading} onSelect={setSelected} styles={s} />
          )}
        </div>
      </div>
    </div>
  );
}

export default ResultsTab;
