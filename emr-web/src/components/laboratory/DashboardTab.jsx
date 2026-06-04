/**
 * DashboardTab - OpenELIS-inspired "Today's Status" dashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, FlaskConical } from 'lucide-react';

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

function FilterInput({ placeholder, value, onChange }) {
  return (
    <input
      style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '5px 8px', fontSize: 12, width: '100%', fontFamily: 'inherit', background: 'white' }}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function OrderTable({ orders, loading, onCollect, styles: s, showCollect }) {
  const [filters, setFilters] = useState({ uhid: '', patientName: '', source: '', section: '', sampleType: '', priority: '' });
  const setFilter = (key, val) => setFilters((p) => ({ ...p, [key]: val }));

  const filtered = orders.filter((o) => {
    const uid = (o.uhid || '').toLowerCase();
    const pname = (o.patient_name || '').toLowerCase();
    const src = (o.source || o.sample_source || '').toLowerCase();
    const sec = (o.section_name || o.department || '').toLowerCase();
    const st = (o.sample_type || '').toLowerCase();
    const pri = (o.priority || '').toLowerCase();
    return (
      uid.includes(filters.uhid.toLowerCase()) &&
      pname.includes(filters.patientName.toLowerCase()) &&
      src.includes(filters.source.toLowerCase()) &&
      sec.includes(filters.section.toLowerCase()) &&
      st.includes(filters.sampleType.toLowerCase()) &&
      pri.includes(filters.priority.toLowerCase())
    );
  });

  if (loading) return <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>;

  const cols = ['UHID', 'Patient Name', 'Source', 'Section Name', 'Sample Type', 'Priority', 'Total', 'Notes'];
  if (showCollect) cols.push('Action');

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>{cols.map((h) => <th key={h}>{h}</th>)}</tr>
          <tr style={{ background: '#f8fafc' }}>
            <th><FilterInput placeholder="Filter..." value={filters.uhid} onChange={(v) => setFilter('uhid', v)} /></th>
            <th><FilterInput placeholder="Filter..." value={filters.patientName} onChange={(v) => setFilter('patientName', v)} /></th>
            <th><FilterInput placeholder="Filter..." value={filters.source} onChange={(v) => setFilter('source', v)} /></th>
            <th><FilterInput placeholder="Filter..." value={filters.section} onChange={(v) => setFilter('section', v)} /></th>
            <th><FilterInput placeholder="Filter..." value={filters.sampleType} onChange={(v) => setFilter('sampleType', v)} /></th>
            <th><FilterInput placeholder="Filter..." value={filters.priority} onChange={(v) => setFilter('priority', v)} /></th>
            <th></th>
            <th></th>
            {showCollect && <th></th>}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-2)', fontSize: 13 }}>No records found</td></tr>
          ) : (
            filtered.map((o) => (
              <tr key={o.id}>
                <td>{o.uhid || '—'}</td>
                <td>{o.patient_name || o.patient?.name || '—'}</td>
                <td>{o.source || o.sample_source || '—'}</td>
                <td>{o.section_name || o.department || '—'}</td>
                <td>{o.sample_type || '—'}</td>
                <td>
                  <span className={`${s.badge} ${o.priority === 'URGENT' || o.priority === 'STAT' ? s.badgeRed : s.badgeGray}`}>
                    {o.priority || 'ROUTINE'}
                  </span>
                </td>
                <td>{o.total_tests || (o.items && o.items.length) || 1}</td>
                <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.notes || '—'}</td>
                {showCollect && (
                  <td>
                    <button className={`${s.btn} ${s.btnSuccess} ${s.btnSm}`} onClick={() => onCollect(o.id)}>
                      Collect
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardTab({ labId, styles: s }) {
  const [stats, setStats] = useState({ toCollect: 0, collected: 0, total: 0, awaitingTesting: 0, awaitingValidation: 0, completed: 0, totalPatients: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [collectedOrders, setCollectedOrders] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [collectedLoading, setCollectedLoading] = useState(false);
  const [pendingTab, setPendingTab] = useState('today');
  const [collectedTab, setCollectedTab] = useState('today');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 4000); };

  const loadStats = useCallback(async () => {
    if (!labId) return;
    try {
      setStatsLoading(true);
      const data = await apiFetch(`/api/v1/analytics/dashboard?lab_id=${labId}&days=1`);
      const orders = (data.dashboard && data.dashboard.orders) || data.orders || {};
      setStats({
        toCollect: (Number(orders.PENDING) || 0) + (Number(orders.SCHEDULED) || 0),
        collected: (Number(orders.COLLECTED) || 0) + (Number(orders.RECEIVED) || 0),
        total: Number(orders.total_orders) || 0,
        awaitingTesting: Number(orders.COLLECTED) || 0,
        awaitingValidation: Number(orders.PROCESSING) || 0,
        completed: (Number(orders.RESULTED) || 0) + (Number(orders.REPORTED) || 0),
        totalPatients: Number(orders.total_patients) || 0,
      });
    } catch {
      // non-critical
    } finally {
      setStatsLoading(false);
    }
  }, [labId]);

  const loadPending = useCallback(async () => {
    if (!labId) return;
    try {
      setPendingLoading(true);
      const data = await apiFetch(`/api/v1/orders/lab/${labId}?status=PENDING,SCHEDULED`);
      setPendingOrders(data.orders || data || []);
    } catch { setPendingOrders([]); } finally { setPendingLoading(false); }
  }, [labId]);

  const loadCollected = useCallback(async () => {
    if (!labId) return;
    try {
      setCollectedLoading(true);
      const data = await apiFetch(`/api/v1/orders/lab/${labId}?status=COLLECTED,PROCESSING`);
      setCollectedOrders(data.orders || data || []);
    } catch { setCollectedOrders([]); } finally { setCollectedLoading(false); }
  }, [labId]);

  const handleRefresh = () => { loadStats(); loadPending(); loadCollected(); };

  useEffect(() => { loadStats(); loadPending(); loadCollected(); }, [loadStats, loadPending, loadCollected]);

  const handleCollect = async (orderId) => {
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COLLECTED' }),
      });
      showMsg('Sample marked as collected');
      loadPending(); loadCollected(); loadStats();
    } catch (err) { showMsg(`Failed: ${err.message}`, 'error'); }
  };

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const filterToday = (orders) => {
    const todayDate = new Date().toDateString();
    return orders.filter((o) => {
      const d = o.created_at || o.order_date;
      return d ? new Date(d).toDateString() === todayDate : true;
    });
  };

  const pendingDisplay = pendingTab === 'today' ? filterToday(pendingOrders) : pendingOrders;
  const collectedDisplay = collectedTab === 'today' ? filterToday(collectedOrders) : collectedOrders;

  return (
    <div>
      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`}>{msg}</div>}

      {/* Today's status header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
          📅 Today's Status <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-2)', marginLeft: 6 }}>({todayStr})</span>
        </div>
        <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={handleRefresh} disabled={statsLoading}>
          <span className={statsLoading ? s.spinIcon : ''}><RefreshCw size={13} /></span> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'To Collect',          value: stats.toCollect,       accent: '#2563eb', bg: '#eff6ff',  icon: '🧪' },
          { label: 'Collected',           value: stats.collected,       accent: '#0891b2', bg: '#ecfeff',  icon: '✅' },
          { label: 'Total Orders',        value: stats.total,           accent: '#6d28d9', bg: '#f5f3ff',  icon: '📋' },
          { label: 'Awaiting Testing',    value: stats.awaitingTesting, accent: '#d97706', bg: '#fffbeb',  icon: '⏳' },
          { label: 'Awaiting Validation', value: stats.awaitingValidation, accent: '#7c3aed', bg: '#faf5ff', icon: '🔍' },
          { label: 'Completed',           value: stats.completed,       accent: '#059669', bg: '#f0fdf4',  icon: '🎯' },
          { label: 'Patients Today',      value: stats.totalPatients,   accent: '#dc2626', bg: '#fef2f2',  icon: '👤' },
        ].map(card => (
          <div key={card.label} style={{ background: card.bg, border: `1.5px solid ${card.accent}22`, borderRadius: 10, padding: '12px 10px', textAlign: 'center', borderTop: `3px solid ${card.accent}` }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{card.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: card.accent, lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left — Samples to Collect */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.cardTitle}><FlaskConical size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Samples to Collect</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['today', 'Today'], ['backlog', 'Backlog']].map(([t, label]) => (
                <button key={t} className={`${s.btn} ${s.btnSm} ${pendingTab === t ? s.btnPrimary : s.btnSecondary}`} onClick={() => setPendingTab(t)}>{label}</button>
              ))}
            </div>
          </div>
          <OrderTable orders={pendingDisplay} loading={pendingLoading} onCollect={handleCollect} styles={s} showCollect={true} />
        </div>

        {/* Right — Samples Collected */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.cardTitle}><FlaskConical size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Samples Collected</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['today', 'Today'], ['backlog', 'Backlog']].map(([t, label]) => (
                <button key={t} className={`${s.btn} ${s.btnSm} ${collectedTab === t ? s.btnPrimary : s.btnSecondary}`} onClick={() => setCollectedTab(t)}>{label}</button>
              ))}
            </div>
          </div>
          <OrderTable orders={collectedDisplay} loading={collectedLoading} onCollect={null} styles={s} showCollect={false} />
        </div>
      </div>
    </div>
  );
}

export default DashboardTab;
