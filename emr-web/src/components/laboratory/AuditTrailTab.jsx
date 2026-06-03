/**
 * AuditTrailTab - Audit log viewer for lab events
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, ScrollText } from 'lucide-react';

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

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

export function AuditTrailTab({ labId, styles: s }) {
  const today = new Date();
  const prior7 = new Date(today);
  prior7.setDate(today.getDate() - 7);

  const [startDate, setStartDate] = useState(toDateStr(prior7));
  const [endDate, setEndDate] = useState(toDateStr(today));

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true); setError('');

    // Fetch dashboard for summary
    apiFetch(`/api/v1/admin/laboratories/${labId}/dashboard`)
      .then((d) => setSummary(d.statistics || d.dashboard || d))
      .catch(() => {});

    // Fetch orders as workflow events for audit trail
    try {
      const [pendingData, allData] = await Promise.all([
        apiFetch(`/api/v1/lab/${labId}/orders`).catch(() => ({ orders: [] })),
        apiFetch(`/api/v1/analytics/dashboard?lab_id=${labId}&days=30`).catch(() => ({})),
      ]);

      const orders = pendingData.orders || pendingData || [];
      // Build audit events from orders
      const auditEvents = orders.flatMap((order) => {
        const events = [];
        if (order.created_at) {
          events.push({
            id: `create-${order.id}`,
            timestamp: order.created_at,
            action: 'ORDER_CREATED',
            entity: `Order ${order.order_number || order.id}`,
            entity_type: 'ORDER',
            performed_by: order.ordering_doctor_id || 'System',
            details: `Priority: ${order.priority}, Patient: ${order.patient_id}`,
          });
        }
        if (order.updated_at && order.updated_at !== order.created_at) {
          events.push({
            id: `update-${order.id}`,
            timestamp: order.updated_at,
            action: `STATUS_CHANGED_TO_${order.status}`,
            entity: `Order ${order.order_number || order.id}`,
            entity_type: 'ORDER',
            performed_by: 'Lab Staff',
            details: `Current status: ${order.status}`,
          });
        }
        return events;
      });

      // Sort by timestamp descending
      auditEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setEvents(auditEvents);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [labId, startDate, endDate]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const ACTION_BADGE = (action, s) => {
    if (action.includes('CREATED')) return `${s.badge} ${s.badgeGreen}`;
    if (action.includes('REPORTED') || action.includes('RELEASED')) return `${s.badge} ${s.badgeTeal}`;
    if (action.includes('REJECTED') || action.includes('CANCELLED')) return `${s.badge} ${s.badgeRed}`;
    if (action.includes('CRITICAL')) return `${s.badge} ${s.badgeRed}`;
    return `${s.badge} ${s.badgeBlue}`;
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Audit Trail</div>
          <div className={s.pageSubtitle}>Complete log of lab workflow events and actions</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className={s.field}>
            <label className={s.label}>From</label>
            <input className={s.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 140 }} />
          </div>
          <div className={s.field}>
            <label className={s.label}>To</label>
            <input className={s.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 140 }} />
          </div>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={fetchAudit}>
            <Search size={14} /> Load
          </button>
          <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchAudit}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}

      {/* Summary stats */}
      {summary && (
        <div className={s.statGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
          {[
            { label: 'Total Results', value: summary.total_results ?? '—' },
            { label: 'Critical Values', value: summary.critical_values ?? '—' },
            { label: 'Pending Results', value: summary.pending ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className={s.statCard}>
              <div className={s.statValue}>{value}</div>
              <div className={s.statLabel}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ScrollText size={16} /> Event Log
          </div>
          <span className={`${s.badge} ${s.badgeGray}`}>{events.length} events</span>
        </div>
        {loading ? (
          <div className={s.emptyState}><div className={s.emptyText}>Loading audit events...</div></div>
        ) : events.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><ScrollText size={48} /></div>
            <div className={s.emptyText}>No audit events found for the selected date range</div>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>{['Timestamp', 'Action', 'Entity', 'Performed By', 'Details'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}
                    </td>
                    <td><span className={ACTION_BADGE(ev.action, s)}>{ev.action}</span></td>
                    <td style={{ fontWeight: 600 }}>{ev.entity}</td>
                    <td style={{ color: 'var(--color-text-2)' }}>{ev.performed_by || '—'}</td>
                    <td style={{ color: 'var(--color-text-2)', fontSize: 12 }}>{ev.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditTrailTab;
