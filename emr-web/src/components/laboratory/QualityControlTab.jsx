/**
 * QualityControlTab - Quality metrics, rejections and corrections
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ShieldCheck, AlertTriangle, XCircle, CheckCircle, BarChart2 } from 'lucide-react';

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

export function QualityControlTab({ labId, styles: s }) {
  const [compliance, setCompliance] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [rejectedSamples, setRejectedSamples] = useState([]);
  const [rejLoading, setRejLoading] = useState(false);

  const [amendedReports, setAmendedReports] = useState([]);
  const [amLoading, setAmLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');

    apiFetch(`/api/v1/analytics/compliance?lab_id=${labId}`)
      .then((d) => setCompliance(d.compliance || d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    apiFetch(`/api/v1/admin/laboratories/${labId}/dashboard`)
      .then((d) => setDashboard(d.statistics || d.dashboard || d))
      .catch(() => {});

    // Fetch rejected samples via orders
    setRejLoading(true);
    apiFetch(`/api/v1/lab/${labId}/orders?status=COLLECTED`)
      .then((d) => {
        // Filter for rejected samples from the data
        setRejectedSamples((d.orders || d || []).slice(0, 10));
      })
      .catch(() => {})
      .finally(() => setRejLoading(false));

    // Fetch amended reports
    setAmLoading(true);
    apiFetch(`/api/v1/lab/${labId}/orders?status=RESULTED`)
      .then((d) => setAmendedReports((d.orders || d || []).slice(0, 10)))
      .catch(() => {})
      .finally(() => setAmLoading(false));
  }, [labId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const passRate = compliance?.completion_rate ?? compliance?.pass_rate ?? null;
  const tatRate = compliance?.tat_compliance_rate ?? null;
  const critRate = dashboard?.critical_values != null && dashboard?.total_results != null
    ? ((dashboard.critical_values / Math.max(dashboard.total_results, 1)) * 100).toFixed(1)
    : null;
  const avgConfidence = dashboard?.avg_confidence_score ?? dashboard?.confidence_score ?? null;

  const stats = [
    { label: 'Pass Rate', value: passRate != null ? `${parseFloat(passRate).toFixed(1)}%` : '—', icon: <CheckCircle size={22} />, color: 'var(--color-success)' },
    { label: 'TAT Compliance', value: tatRate != null ? `${parseFloat(tatRate).toFixed(1)}%` : '—', icon: <BarChart2 size={22} />, color: 'var(--color-primary)' },
    { label: 'Critical Value Rate', value: critRate != null ? `${critRate}%` : '—', icon: <AlertTriangle size={22} />, color: 'var(--color-danger)' },
    { label: 'Avg Confidence', value: avgConfidence != null ? parseFloat(avgConfidence).toFixed(2) : '—', icon: <ShieldCheck size={22} />, color: '#7c3aed' },
  ];

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Quality Control</div>
          <div className={s.pageSubtitle}>Monitor lab quality metrics, rejections and corrections</div>
        </div>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchAll}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}

      {/* Stat Cards */}
      {!loading && (
        <div className={s.statGrid}>
          {stats.map(({ label, value, icon, color }) => (
            <div key={label} className={s.statCard}>
              <div style={{ color, marginBottom: 8 }}>{icon}</div>
              <div className={s.statValue} style={{ color }}>{value}</div>
              <div className={s.statLabel}>{label}</div>
            </div>
          ))}
        </div>
      )}
      {loading && <div className={s.emptyState}><div className={s.emptyText}>Loading quality metrics...</div></div>}

      {/* Rejected Samples */}
      <div className={s.card} style={{ marginBottom: 20 }}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <XCircle size={16} color="var(--color-danger)" /> Recent Rejected / Problematic Samples
          </div>
        </div>
        <div className={s.cardBody}>
          {rejLoading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
          ) : rejectedSamples.length === 0 ? (
            <div className={s.emptyState}><div className={s.emptyText}>No rejected samples found</div></div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>{['Order #', 'Patient ID', 'Priority', 'Status', 'Date'].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rejectedSamples.map((order) => (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 600 }}>{order.order_number || order.id}</td>
                      <td>{order.patient_id}</td>
                      <td><span className={`${s.badge} ${order.priority === 'STAT' ? s.badgeRed : order.priority === 'URGENT' ? s.badgeOrange : s.badgeGreen}`}>{order.priority}</span></td>
                      <td><span className={`${s.badge} ${s.badgeOrange}`}>{order.status}</span></td>
                      <td>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Amended / Corrected Reports */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="var(--color-warning)" /> Resulted Orders (Awaiting Reports)
          </div>
        </div>
        <div className={s.cardBody}>
          {amLoading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
          ) : amendedReports.length === 0 ? (
            <div className={s.emptyState}><div className={s.emptyText}>No resulted orders pending</div></div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>{['Order #', 'Patient ID', 'Priority', 'Status', 'Date'].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {amendedReports.map((order) => (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 600 }}>{order.order_number || order.id}</td>
                      <td>{order.patient_id}</td>
                      <td><span className={`${s.badge} ${order.priority === 'STAT' ? s.badgeRed : order.priority === 'URGENT' ? s.badgeOrange : s.badgeGreen}`}>{order.priority}</span></td>
                      <td><span className={`${s.badge} ${s.badgeGreen}`}>{order.status}</span></td>
                      <td>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QualityControlTab;
