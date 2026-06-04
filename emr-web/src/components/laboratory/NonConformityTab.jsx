/**
 * NonConformityTab - Full QA Event / Non-Conformity management
 * NABH/CAP compliant fields: stage, severity, root cause, corrective action
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, AlertTriangle, Plus, RefreshCw, Check, X } from 'lucide-react';

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

const EVENT_TYPES = [
  'Haemolysed',
  'Lipemic',
  'Icteric',
  'Clotted',
  'Insufficient Volume',
  'Wrong Container',
  'Unlabelled Sample',
  'Mislabelled',
  'Leaked / Broken',
  'Expired Container',
  'Delayed Transport',
  'Temperature Breach',
  'Duplicate Request',
  'Patient Refused',
  'Quantity Not Sufficient',
  'Improper Storage',
  'Instrument Failure',
  'Reagent Issue',
  'Other',
];

const ACTIONS = [
  'Sample Rejected',
  'Sample Recollection Requested',
  'Test Performed with Note',
  'Referred to Senior',
  'Discarded',
  'Repeat Test Ordered',
  'Escalated to Lab Director',
  'No Action Required',
];

const ROOT_CAUSES = [
  'Phlebotomist Error',
  'Patient Non-cooperation',
  'Transport Delay',
  'Instrument Failure',
  'Reagent Issue',
  'Labelling Error',
  'Inadequate Patient Preparation',
  'Wrong Tube / Container',
  'Cold Chain Failure',
  'Unknown',
];

const SEVERITY_CONFIG = {
  MINOR:    { color: '#92400e', bg: '#fffbeb', label: 'Minor — noted but processed' },
  MAJOR:    { color: '#b45309', bg: '#fff7ed', label: 'Major — affected result / recollect needed' },
  CRITICAL: { color: '#991b1b', bg: '#fef2f2', label: 'Critical — patient safety risk' },
};

const STAGE_CONFIG = {
  PRE_ANALYTICAL:  { label: 'Pre-Analytical',  sub: 'Collection / Transport / Receipt' },
  ANALYTICAL:      { label: 'Analytical',       sub: 'During testing / Instrument' },
  POST_ANALYTICAL: { label: 'Post-Analytical',  sub: 'Reporting / Delivery' },
};

const STATUS_COLORS = {
  OPEN:        { bg: '#fee2e2', color: '#991b1b' },
  IN_PROGRESS: { bg: '#fff7ed', color: '#b45309' },
  RESOLVED:    { bg: '#dcfce7', color: '#166534' },
  ESCALATED:   { bg: '#ede9fe', color: '#6d28d9' },
};

const now = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

function OrderAutocomplete({ labId, value, onChange, onSelect, styles: s }) {
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const timer   = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (q) => {
    clearTimeout(timer.current);
    if (!q || q.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/api/v1/orders/lab/${labId}?limit=20`);
        const orders = data.orders || [];
        const q2 = q.toLowerCase();
        setResults(orders.filter(o =>
          (o.order_number || '').toLowerCase().includes(q2) ||
          (o.patient_name || '').toLowerCase().includes(q2) ||
          (o.patient_uhid || o.uhid || '').toLowerCase().includes(q2)
        ).slice(0, 10));
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <input className={s.input} value={value}
        onChange={e => { onChange(e.target.value); search(e.target.value); setOpen(true); }}
        onFocus={() => value && setOpen(true)}
        placeholder="Order number or patient name / UHID…" />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 2000,
          background: 'white', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', maxHeight: 260, overflowY: 'auto' }}>
          {results.map(o => (
            <div key={o.id} onClick={() => { onSelect(o); onChange(o.order_number || ''); setOpen(false); }}
              style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}>
              <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{o.order_number}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 2 }}>
                {o.patient_name && <span>{o.patient_name}</span>}
                {(o.patient_uhid || o.uhid) && <span style={{ marginLeft: 8, background: '#ede9fe', color: '#6d28d9', padding: '0 5px', borderRadius: 4, fontWeight: 700 }}>{o.patient_uhid || o.uhid}</span>}
                {o.sample_type && <span style={{ marginLeft: 8 }}>{o.sample_type}</span>}
                <span style={{ marginLeft: 8, background: '#f1f5f9', padding: '0 5px', borderRadius: 4 }}>{o.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {loading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-text-3)' }}>…</span>}
    </div>
  );
}

const EMPTY_FORM = {
  accession_number: '', event_type: EVENT_TYPES[0],
  stage: 'PRE_ANALYTICAL', severity: 'MINOR',
  event_datetime: now(),
  description: '',
  action_taken: ACTIONS[0], root_cause: ROOT_CAUSES[0],
  corrective_action: '', resolution_status: 'OPEN',
  recollection_requested: false, doctor_notified: false, tat_impacted: false,
};

export function NonConformityTab({ labId, styles: s }) {
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [foundOrder,   setFoundOrder]   = useState(null);
  const [searching,    setSearching]    = useState(false);
  const [searchErr,    setSearchErr]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState('');
  const [msgType,      setMsgType]      = useState('');

  const [events,       setEvents]       = useState([]);
  const [summary,      setSummary]      = useState({ total:0, open:0, resolved:0, escalated:0, critical:0, major:0 });
  const [loading,      setLoading]      = useState(false);

  // Filters
  const [fStatus,   setFStatus]   = useState('');
  const [fSeverity, setFSeverity] = useState('');
  const [fStage,    setFStage]    = useState('');
  const [fStart,    setFStart]    = useState('');
  const [fEnd,      setFEnd]      = useState('');

  // Edit resolution modal
  const [editEvent, setEditEvent] = useState(null);
  const [editForm,  setEditForm]  = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 5000); };

  const loadEvents = useCallback(async () => {
    if (!labId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: 200 });
      if (fStatus)   params.set('status', fStatus);
      if (fSeverity) params.set('severity', fSeverity);
      if (fStage)    params.set('stage', fStage);
      if (fStart)    params.set('start_date', fStart);
      if (fEnd)      params.set('end_date', fEnd);
      const data = await apiFetch(`/api/v1/qa?${params}`);
      setEvents(data.events || []);
      setSummary(data.summary || {});
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, [labId, fStatus, fSeverity, fStage, fStart, fEnd]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleSearch = async () => {
    if (!form.accession_number.trim()) { setSearchErr('Enter accession number'); return; }
    try {
      setSearching(true); setSearchErr(''); setFoundOrder(null);
      const data = await apiFetch(`/api/v1/orders/lab/${labId}?accession=${encodeURIComponent(form.accession_number.trim())}`);
      const orders = data.orders || data || [];
      const order = Array.isArray(orders) ? (orders.find(o => o.order_number === form.accession_number.trim()) || orders[0]) : null;
      if (order) {
        setFoundOrder(order);
        setForm(f => ({ ...f, patient_name: order.patient_name || '', patient_uhid: order.uhid || order.patient_uhid || '' }));
      } else {
        setSearchErr('No order found for this accession number');
      }
    } catch (err) { setSearchErr(err.message); }
    finally { setSearching(false); }
  };

  const handleSave = async (andNotify = false) => {
    if (!form.accession_number.trim()) { showMsg('Accession / Order Number is required', 'error'); return; }
    if (!form.event_type) { showMsg('Event type is required', 'error'); return; }
    try {
      setSaving(true);
      await apiFetch('/api/v1/qa', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          order_id:   foundOrder?.id || null,
          order_number: foundOrder?.order_number || form.accession_number || null,
          patient_name: foundOrder?.patient_name || form.patient_name || null,
          patient_uhid: foundOrder?.uhid || foundOrder?.patient_uhid || form.patient_uhid || null,
          doctor_notified: andNotify || form.doctor_notified,
        }),
      });
      showMsg(`QA event recorded${andNotify ? ' — doctor notified' : ''}`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setFoundOrder(null);
      loadEvents();
    } catch (err) { showMsg(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleEditSave = async () => {
    try {
      setEditSaving(true);
      await apiFetch(`/api/v1/qa/${editEvent.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setEditEvent(null);
      loadEvents();
    } catch (err) { alert(err.message); }
    finally { setEditSaving(false); }
  };

  const sevCfg = SEVERITY_CONFIG[form.severity] || SEVERITY_CONFIG.MINOR;

  return (
    <div>
      {/* Header */}
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Non-Conformity</div>
          <div className={s.pageSubtitle}>Record and track QA events — NABH/CAP compliant</div>
        </div>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setShowForm(!showForm); setFoundOrder(null); setForm(EMPTY_FORM); }}>
          <Plus size={14} /> {showForm ? 'Cancel' : 'Add QA Event'}
        </button>
      </div>

      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`} style={{ marginBottom: 12 }}>{msg}</div>}

      {/* ── Add QA Event Form ── */}
      {showForm && (
        <div className={s.card} style={{ marginBottom: 16 }}>
          <div style={{ background: '#fef2f2', padding: '8px 16px', borderBottom: '1px solid #fecaca', fontWeight: 700, fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} /> Add QA Event / Non-Conformity
          </div>
          <div className={s.cardBody}>

            {/* Accession search with autocomplete */}
            <div className={s.field} style={{ marginBottom: 10 }}>
              <label className={s.label}>Accession / Order Number *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <OrderAutocomplete
                  labId={labId}
                  value={form.accession_number}
                  onChange={v => set('accession_number', v)}
                  onSelect={order => {
                    setFoundOrder(order);
                    setForm(f => ({ ...f, accession_number: order.order_number || '', patient_name: order.patient_name || '', patient_uhid: order.patient_uhid || order.uhid || '' }));
                    setSearchErr('');
                  }}
                  styles={s}
                />
                <button className={`${s.btn} ${s.btnSecondary}`} onClick={handleSearch} disabled={searching}>
                  <Search size={14} /> {searching ? '…' : 'Search'}
                </button>
              </div>
            </div>
            {searchErr && <div className={`${s.alert} ${s.alertError}`} style={{ marginBottom: 10, fontSize: 12 }}>{searchErr}</div>}

            {foundOrder && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>✓ Order Found</div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <span><strong>Patient:</strong> {foundOrder.patient_name || '—'}</span>
                  {(foundOrder.uhid || foundOrder.patient_uhid) && <span><strong>UHID:</strong> <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 5, fontWeight: 700 }}>{foundOrder.uhid || foundOrder.patient_uhid}</span></span>}
                  <span><strong>Order:</strong> {foundOrder.order_number || '—'}</span>
                  <span><strong>Sample:</strong> {foundOrder.sample_type || '—'}</span>
                  <span><strong>Status:</strong> {foundOrder.status}</span>
                </div>
              </div>
            )}

            {/* Row 1: Event Type + Stage */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className={s.field}>
                <label className={s.label}>QA Event Type *</label>
                <select className={s.select} value={form.event_type} onChange={e => set('event_type', e.target.value)}>
                  {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Stage of Non-Conformity</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Object.entries(STAGE_CONFIG).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set('stage', k)}
                      className={`${s.btn} ${s.btnSm}`}
                      style={{ flex: 1, fontSize: 11, fontWeight: 600,
                        background: form.stage === k ? '#1e40af' : 'white',
                        color: form.stage === k ? 'white' : '#1e40af',
                        border: '1.5px solid #1e40af', lineHeight: 1.3 }}>
                      {v.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2 }}>{STAGE_CONFIG[form.stage]?.sub}</div>
              </div>
            </div>

            {/* Row 2: Severity */}
            <div className={s.field} style={{ marginBottom: 12 }}>
              <label className={s.label}>Severity Level</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => set('severity', k)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      background: form.severity === k ? v.bg : 'white',
                      color: v.color,
                      border: `2px solid ${form.severity === k ? v.color : '#e2e8f0'}` }}>
                    {k}
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>{v.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Date+Time + Reported By */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className={s.field}>
                <label className={s.label}>Date &amp; Time of Event</label>
                <input className={s.input} type="datetime-local" value={form.event_datetime} onChange={e => set('event_datetime', e.target.value)} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Reported By</label>
                <input className={s.input} value={localStorage.getItem('user_email') || 'Lab Staff'} readOnly style={{ background: '#f8fafc', color: 'var(--color-text-2)' }} />
              </div>
            </div>

            {/* Row 4: Description */}
            <div className={s.field} style={{ marginBottom: 12 }}>
              <label className={s.label}>Description</label>
              <textarea className={s.input} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe the non-conformity in detail…" style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
            </div>

            {/* Row 5: Action Taken + Root Cause + Resolution Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className={s.field}>
                <label className={s.label}>Action Taken</label>
                <select className={s.select} value={form.action_taken} onChange={e => set('action_taken', e.target.value)}>
                  <option value="">— Select —</option>
                  {ACTIONS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Root Cause</label>
                <select className={s.select} value={form.root_cause} onChange={e => set('root_cause', e.target.value)}>
                  <option value="">— Select —</option>
                  {ROOT_CAUSES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Resolution Status</label>
                <select className={s.select} value={form.resolution_status} onChange={e => set('resolution_status', e.target.value)}>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="ESCALATED">Escalated</option>
                </select>
              </div>
            </div>

            {/* Row 6: Corrective Action */}
            <div className={s.field} style={{ marginBottom: 12 }}>
              <label className={s.label}>Corrective Action Notes</label>
              <textarea className={s.input} rows={2} value={form.corrective_action} onChange={e => set('corrective_action', e.target.value)} placeholder="What was done to fix / prevent recurrence?" style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
            </div>

            {/* Row 7: Flags */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                ['recollection_requested', 'Recollection Requested'],
                ['doctor_notified',        'Notify Doctor'],
                ['tat_impacted',           'TAT Impacted'],
              ].map(([k, label]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            {/* Actions */}
            <div className={s.formActions}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => { setShowForm(false); setFoundOrder(null); setForm(EMPTY_FORM); }}>
                <X size={14} /> Cancel
              </button>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => handleSave(true)} disabled={saving}
                style={{ color: '#6d28d9', borderColor: '#6d28d9' }}>
                {saving ? 'Saving…' : '📢 Save & Notify Doctor'}
              </button>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => handleSave(false)} disabled={saving}
                style={{ background: form.severity === 'CRITICAL' ? '#991b1b' : undefined }}>
                <Check size={14} /> {saving ? 'Saving…' : form.severity === 'CRITICAL' ? '🚨 Save Critical Event' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary bar ── */}
      <div className={s.card} style={{ marginBottom: 12 }}>
        <div className={s.cardBody} style={{ padding: '10px 16px' }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, alignItems: 'center' }}>
            <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} onClick={loadEvents} disabled={loading}><RefreshCw size={12} /></button>
            <span>Total: <strong>{summary.total || 0}</strong></span>
            <span style={{ color: '#991b1b' }}>Open: <strong>{summary.open || 0}</strong></span>
            <span style={{ color: '#166534' }}>Resolved: <strong>{summary.resolved || 0}</strong></span>
            <span style={{ color: '#6d28d9' }}>Escalated: <strong>{summary.escalated || 0}</strong></span>
            <span style={{ color: '#991b1b', fontWeight: 700 }}>Critical: <strong>{summary.critical || 0}</strong></span>
            <span style={{ color: '#b45309' }}>Major: <strong>{summary.major || 0}</strong></span>
          </div>
        </div>
      </div>

      {/* ── Filters — single row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <select className={s.select} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="ESCALATED">Escalated</option>
        </select>
        <select className={s.select} value={fSeverity} onChange={e => setFSeverity(e.target.value)}>
          <option value="">All Severities</option>
          <option value="MINOR">Minor</option>
          <option value="MAJOR">Major</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <select className={s.select} value={fStage} onChange={e => setFStage(e.target.value)}>
          <option value="">All Stages</option>
          <option value="PRE_ANALYTICAL">Pre-Analytical</option>
          <option value="ANALYTICAL">Analytical</option>
          <option value="POST_ANALYTICAL">Post-Analytical</option>
        </select>
        <input className={s.input} type="date" value={fStart} onChange={e => setFStart(e.target.value)} />
        <input className={s.input} type="date" value={fEnd}   onChange={e => setFEnd(e.target.value)} />
        <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`}
          onClick={() => { setFStatus(''); setFSeverity(''); setFStage(''); setFStart(''); setFEnd(''); }}
          style={{ opacity: (fStatus || fSeverity || fStage || fStart || fEnd) ? 1 : 0.35 }}>
          <X size={12} /> Clear
        </button>
      </div>

      {/* ── Events list ── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}><AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />QA Events</div>
          <span className={`${s.badge} ${s.badgeOrange}`}>{events.length}</span>
        </div>
        {loading ? (
          <div className={s.emptyState}><div className={s.emptyText}>Loading…</div></div>
        ) : events.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><AlertTriangle size={48} /></div>
            <div className={s.emptyText}>No QA events recorded</div>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  {['Date', 'Order / Accession', 'Patient', 'Event Type', 'Stage', 'Severity', 'Action Taken', 'Status', 'Reported By', ''].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {events.map(ev => {
                  const sev = SEVERITY_CONFIG[ev.severity] || SEVERITY_CONFIG.MINOR;
                  const st  = STATUS_COLORS[ev.resolution_status] || STATUS_COLORS.OPEN;
                  return (
                    <tr key={ev.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{ev.event_datetime ? new Date(ev.event_datetime).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : new Date(ev.created_at).toLocaleDateString('en-IN')}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ev.order_number || ev.accession_number || '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        {ev.patient_name || '—'}
                        {ev.patient_uhid && <div style={{ fontSize: 10, background: '#ede9fe', color: '#6d28d9', padding: '0 5px', borderRadius: 4, display: 'inline-block', marginLeft: 4, fontWeight: 700 }}>{ev.patient_uhid}</div>}
                      </td>
                      <td><span className={`${s.badge} ${s.badgeOrange}`} style={{ fontSize: 11 }}>{ev.event_type}</span></td>
                      <td style={{ fontSize: 11 }}>{STAGE_CONFIG[ev.stage]?.label || ev.stage}</td>
                      <td><span style={{ background: sev.bg, color: sev.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{ev.severity}</span></td>
                      <td style={{ fontSize: 12 }}>{ev.action_taken || '—'}</td>
                      <td><span style={{ background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{ev.resolution_status}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{ev.reported_by || '—'}</td>
                      <td>
                        <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} onClick={() => { setEditEvent(ev); setEditForm({ resolution_status: ev.resolution_status, corrective_action: ev.corrective_action || '', root_cause: ev.root_cause || '', action_taken: ev.action_taken || '', doctor_notified: ev.doctor_notified, recollection_requested: ev.recollection_requested }); }}
                          title="Update resolution">
                          ↺
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

      {/* ── Edit resolution modal ── */}
      {editEvent && (
        <div className={s.modalOverlay} onClick={() => setEditEvent(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className={s.modalHeader}>
              <div className={s.modalTitle}>Update Event Resolution</div>
              <button className={s.modalClose} onClick={() => setEditEvent(null)}><X size={16} /></button>
            </div>
            <div className={s.modalBody} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={s.field}>
                <label className={s.label}>Resolution Status</label>
                <select className={s.select} value={editForm.resolution_status} onChange={e => setEditForm(f => ({ ...f, resolution_status: e.target.value }))}>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="ESCALATED">Escalated</option>
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Action Taken</label>
                <select className={s.select} value={editForm.action_taken} onChange={e => setEditForm(f => ({ ...f, action_taken: e.target.value }))}>
                  <option value="">— Select —</option>
                  {ACTIONS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Root Cause</label>
                <select className={s.select} value={editForm.root_cause} onChange={e => setEditForm(f => ({ ...f, root_cause: e.target.value }))}>
                  <option value="">— Select —</option>
                  {ROOT_CAUSES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Corrective Action Notes</label>
                <textarea className={s.input} rows={3} value={editForm.corrective_action} onChange={e => setEditForm(f => ({ ...f, corrective_action: e.target.value }))} placeholder="What was done to fix / prevent recurrence?" style={{ fontFamily: 'inherit', fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.doctor_notified} onChange={e => setEditForm(f => ({ ...f, doctor_notified: e.target.checked }))} /> Doctor Notified
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.recollection_requested} onChange={e => setEditForm(f => ({ ...f, recollection_requested: e.target.checked }))} /> Recollection Requested
                </label>
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setEditEvent(null)}>Cancel</button>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NonConformityTab;
