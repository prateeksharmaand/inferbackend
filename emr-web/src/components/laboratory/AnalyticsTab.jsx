/**
 * AnalyticsTab - Lab Analytics Dashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, AlertCircle, CheckCircle, XCircle, BarChart2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';

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

export function AnalyticsTab({ labId, styles: s }) {
  const today = new Date();
  const prior30 = new Date(today);
  prior30.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState(toDateStr(prior30));
  const [endDate, setEndDate] = useState(toDateStr(today));

  const [dashboard, setDashboard] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState('');

  const [volume, setVolume] = useState([]);
  const [volLoading, setVolLoading] = useState(false);
  const [volError, setVolError] = useState('');

  const [turnaround, setTurnaround] = useState([]);
  const [tatLoading, setTatLoading] = useState(false);
  const [tatError, setTatError] = useState('');

  const [revenue, setRevenue] = useState(null);
  const [revLoading, setRevLoading] = useState(false);
  const [revError, setRevError] = useState('');

  const [compliance, setCompliance] = useState(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState('');

  const fetchAll = useCallback(async () => {
    setDashLoading(true); setDashError('');
    apiFetch(`/api/v1/analytics/dashboard?lab_id=${labId}&days=30`)
      .then((d) => setDashboard(d.dashboard || d))
      .catch((e) => setDashError(e.message))
      .finally(() => setDashLoading(false));

    setVolLoading(true); setVolError('');
    apiFetch(`/api/v1/analytics/test-volume?lab_id=${labId}&start_date=${startDate}&end_date=${endDate}`)
      .then((d) => setVolume(Array.isArray(d.data) ? d.data : d.volume || d.tests || []))
      .catch((e) => setVolError(e.message))
      .finally(() => setVolLoading(false));

    setTatLoading(true); setTatError('');
    apiFetch(`/api/v1/analytics/turnaround?lab_id=${labId}&start_date=${startDate}&end_date=${endDate}`)
      .then((d) => setTurnaround(Array.isArray(d.data) ? d.data : d.turnaround || []))
      .catch((e) => setTatError(e.message))
      .finally(() => setTatLoading(false));

    setRevLoading(true); setRevError('');
    apiFetch(`/api/v1/analytics/revenue?lab_id=${labId}&start_date=${startDate}&end_date=${endDate}`)
      .then((d) => setRevenue(d.data || d.revenue || d))
      .catch((e) => setRevError(e.message))
      .finally(() => setRevLoading(false));

    setCompLoading(true); setCompError('');
    apiFetch(`/api/v1/analytics/compliance?lab_id=${labId}&start_date=${startDate}&end_date=${endDate}`)
      .then((d) => setCompliance(d.data || d.compliance || d))
      .catch((e) => setCompError(e.message))
      .finally(() => setCompLoading(false));
  }, [labId, startDate, endDate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const revenueByTest = revenue?.by_test || revenue?.tests || [];

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Analytics Dashboard</div>
          <div className={s.pageSubtitle}>Lab performance metrics and insights</div>
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
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={fetchAll}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {dashError && <div className={`${s.alert} ${s.alertError}`}>{dashError}</div>}
      {!dashLoading && dashboard && (() => {
        // getDashboard returns { orders: { total_orders, completed_orders, ... }, turnaround, critical_values, revenue }
        const ord = dashboard.orders || dashboard;
        const cv  = dashboard.critical_values || {};
        const rev = dashboard.revenue || {};
        const tat = dashboard.turnaround || {};
        return (
          <div className={s.statGrid}>
            <div className={s.statCard}>
              <div className={s.statIcon}><BarChart2 size={24} color="var(--color-primary)" /></div>
              <div className={s.statValue}>{Number(ord.total_orders ?? 0)}</div>
              <div className={s.statLabel}>Total Orders (30d)</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statIcon}><CheckCircle size={24} color="var(--color-success)" /></div>
              <div className={s.statValue}>{Number(ord.completed_orders ?? 0)}</div>
              <div className={s.statLabel}>Completed</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statIcon}><XCircle size={24} color="var(--color-danger)" /></div>
              <div className={s.statValue}>{Number(ord.cancelled_orders ?? 0)}</div>
              <div className={s.statLabel}>Cancelled</div>
            </div>
            <div className={s.statCard} style={{ borderLeft: '3px solid var(--color-danger)' }}>
              <div className={s.statIcon}><AlertCircle size={24} color="var(--color-danger)" /></div>
              <div className={s.statValue} style={{ color: 'var(--color-danger)' }}>{Number(cv.critical_count ?? 0)}</div>
              <div className={s.statLabel}>Critical Values</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statIcon}><BarChart2 size={24} color="#6d28d9" /></div>
              <div className={s.statValue}>₹{Number(rev.total_revenue ?? 0).toLocaleString()}</div>
              <div className={s.statLabel}>Revenue (30d)</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statIcon}><TrendingUp size={24} color="#0891b2" /></div>
              <div className={s.statValue}>{tat.avg_tat_hours != null ? parseFloat(tat.avg_tat_hours).toFixed(1) + 'h' : '—'}</div>
              <div className={s.statLabel}>Avg TAT</div>
            </div>
          </div>
        );
      })()}
      {dashLoading && <div className={s.emptyState}><div className={s.emptyText}>Loading dashboard...</div></div>}

      {/* Test Volume */}
      <div className={s.card} style={{ marginBottom: 20 }}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} /> Test Volume
          </div>
        </div>
        <div className={s.cardBody}>
          {volError && <div className={`${s.alert} ${s.alertError}`}>{volError}</div>}
          {volLoading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
          ) : volume.length === 0 ? (
            <div className={s.emptyState}><div className={s.emptyText}>No volume data available</div></div>
          ) : (
            <div className={s.chartWrap}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={volume} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="test_name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="order_count" name="Orders" fill="var(--color-primary)" radius={[3, 3, 0, 0]}>
                    {volume.map((_, i) => <Cell key={i} fill={`hsl(${220 + i * 15}, 70%, 55%)`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Turnaround */}
      <div className={s.card} style={{ marginBottom: 20 }}>
        <div className={s.cardHeader}><div className={s.cardTitle}>Turnaround Time (hours)</div></div>
        <div className={s.cardBody}>
          {tatError && <div className={`${s.alert} ${s.alertError}`}>{tatError}</div>}
          {tatLoading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
          ) : turnaround.length === 0 ? (
            <div className={s.emptyState}><div className={s.emptyText}>No turnaround data available</div></div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>{['Test', 'Avg Hours', 'Min', 'Max', 'Samples'].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {turnaround.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{row.test_name || row.test_code}</td>
                      <td>{row.avg_hours != null ? parseFloat(row.avg_hours).toFixed(1) : '—'}</td>
                      <td>{row.min_hours != null ? parseFloat(row.min_hours).toFixed(1) : '—'}</td>
                      <td>{row.max_hours != null ? parseFloat(row.max_hours).toFixed(1) : '—'}</td>
                      <td>{row.sample_count ?? row.count ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Revenue */}
      <div className={s.card} style={{ marginBottom: 20 }}>
        <div className={s.cardHeader}><div className={s.cardTitle}>Revenue</div></div>
        <div className={s.cardBody}>
          {revError && <div className={`${s.alert} ${s.alertError}`}>{revError}</div>}
          {revLoading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
          ) : revenue ? (
            <>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-primary)', marginBottom: 16 }}>
                ₹{(revenue.total_revenue ?? revenue.total ?? 0).toLocaleString()}
                <span style={{ fontSize: 13, color: 'var(--color-text-2)', fontWeight: 400, marginLeft: 8 }}>total revenue</span>
              </div>
              {revenueByTest.length > 0 && (
                <div className={s.chartWrap}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={revenueByTest} margin={{ bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="test_name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(val) => `₹${val}`} />
                      <Bar dataKey="revenue" fill="var(--color-success)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <div className={s.emptyState}><div className={s.emptyText}>No revenue data available</div></div>
          )}
        </div>
      </div>

      {/* Compliance */}
      <div className={s.card} style={{ marginBottom: 20 }}>
        <div className={s.cardHeader}><div className={s.cardTitle}>Compliance</div></div>
        <div className={s.cardBody}>
          {compError && <div className={`${s.alert} ${s.alertError}`}>{compError}</div>}
          {compLoading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
          ) : compliance ? (
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Orders', value: compliance.total_orders ?? '—', color: 'var(--color-text)' },
                { label: 'Completion Rate', value: compliance.completion_rate != null ? `${parseFloat(compliance.completion_rate).toFixed(1)}%` : '—', color: 'var(--color-success)' },
                { label: 'TAT Compliance', value: compliance.tat_compliance_rate != null ? `${parseFloat(compliance.tat_compliance_rate).toFixed(1)}%` : '—', color: 'var(--color-primary)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: 'center', minWidth: 120 }}>
                  <div className={s.statLabel}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.emptyState}><div className={s.emptyText}>No compliance data available</div></div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnalyticsTab;
