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

export function AnalyticsTab({ labId }) {
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
    // Dashboard
    setDashLoading(true);
    setDashError('');
    apiFetch(`/api/v1/analytics/dashboard?lab_id=${labId}&days=30`)
      .then((d) => setDashboard(d.dashboard || d))
      .catch((e) => setDashError(e.message))
      .finally(() => setDashLoading(false));

    // Volume
    setVolLoading(true);
    setVolError('');
    apiFetch(`/api/v1/analytics/test-volume?lab_id=${labId}&start_date=${startDate}&end_date=${endDate}`)
      .then((d) => setVolume(d.volume || d.tests || d || []))
      .catch((e) => setVolError(e.message))
      .finally(() => setVolLoading(false));

    // Turnaround
    setTatLoading(true);
    setTatError('');
    apiFetch(`/api/v1/analytics/turnaround?lab_id=${labId}`)
      .then((d) => setTurnaround(d.turnaround || d || []))
      .catch((e) => setTatError(e.message))
      .finally(() => setTatLoading(false));

    // Revenue
    setRevLoading(true);
    setRevError('');
    apiFetch(`/api/v1/analytics/revenue?lab_id=${labId}`)
      .then((d) => setRevenue(d.revenue || d))
      .catch((e) => setRevError(e.message))
      .finally(() => setRevLoading(false));

    // Compliance
    setCompLoading(true);
    setCompError('');
    apiFetch(`/api/v1/analytics/compliance?lab_id=${labId}`)
      .then((d) => setCompliance(d.compliance || d))
      .catch((e) => setCompError(e.message))
      .finally(() => setCompLoading(false));
  }, [labId, startDate, endDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const revenueByTest = revenue?.by_test || revenue?.tests || [];

  return (
    <div>
      {/* Header + Date Range */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, color: '#333', fontSize: 22 }}>Analytics Dashboard</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ ...s.label, display: 'block', marginBottom: 3 }}>From</label>
            <input type="date" style={s.inputSm} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ ...s.label, display: 'block', marginBottom: 3 }}>To</label>
            <input type="date" style={s.inputSm} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button style={s.btnPrimary} onClick={fetchAll}>
            <RefreshCw size={14} style={{ marginRight: 5 }} />Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {dashError && <div style={s.alertDanger}>{dashError}</div>}
      {(dashLoading && !dashboard) ? (
        <div style={s.empty}>Loading dashboard...</div>
      ) : dashboard ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard icon={<BarChart2 size={22} color="#007bff" />} label="Total Orders" value={dashboard.total_orders ?? dashboard.orders ?? '—'} color="#007bff" />
          <StatCard icon={<CheckCircle size={22} color="#28a745" />} label="Completed" value={dashboard.completed_orders ?? dashboard.completed ?? '—'} color="#28a745" />
          <StatCard icon={<XCircle size={22} color="#dc3545" />} label="Cancelled" value={dashboard.cancelled_orders ?? dashboard.cancelled ?? '—'} color="#dc3545" />
          <StatCard icon={<AlertCircle size={22} color="#ff6b35" />} label="Critical Values Today" value={dashboard.critical_values_today ?? dashboard.critical_today ?? '—'} color="#ff6b35" bg="#fff3e0" />
        </div>
      ) : null}

      {/* Test Volume Chart */}
      <div style={s.card}>
        <h3 style={{ marginTop: 0, color: '#444', display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={18} color="#007bff" />Test Volume
        </h3>
        {volError && <div style={s.alertDanger}>{volError}</div>}
        {volLoading ? (
          <div style={s.empty}>Loading...</div>
        ) : volume.length === 0 ? (
          <div style={s.empty}>No volume data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={volume} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="test_name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#007bff" radius={[3, 3, 0, 0]}>
                {volume.map((_, i) => (
                  <Cell key={i} fill={`hsl(${210 + i * 15}, 70%, 55%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Turnaround Table */}
      <div style={s.card}>
        <h3 style={{ marginTop: 0, color: '#444' }}>Turnaround Time (hours)</h3>
        {tatError && <div style={s.alertDanger}>{tatError}</div>}
        {tatLoading ? (
          <div style={s.empty}>Loading...</div>
        ) : turnaround.length === 0 ? (
          <div style={s.empty}>No turnaround data available</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr style={{ background: '#f5f6fa' }}>
                  {['Test Code', 'Avg Hours', 'Min', 'Max', 'Count'].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turnaround.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ ...s.td, fontWeight: 600, fontFamily: 'monospace' }}>{row.test_code}</td>
                    <td style={s.td}>{row.avg_hours != null ? parseFloat(row.avg_hours).toFixed(1) : '—'}</td>
                    <td style={s.td}>{row.min_hours != null ? parseFloat(row.min_hours).toFixed(1) : '—'}</td>
                    <td style={s.td}>{row.max_hours != null ? parseFloat(row.max_hours).toFixed(1) : '—'}</td>
                    <td style={s.td}>{row.count ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revenue */}
      <div style={s.card}>
        <h3 style={{ marginTop: 0, color: '#444' }}>Revenue</h3>
        {revError && <div style={s.alertDanger}>{revError}</div>}
        {revLoading ? (
          <div style={s.empty}>Loading...</div>
        ) : revenue ? (
          <>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#007bff', marginBottom: 16 }}>
              ₹{(revenue.total_revenue ?? revenue.total ?? 0).toLocaleString()}
              <span style={{ fontSize: 14, color: '#888', fontWeight: 400, marginLeft: 8 }}>total revenue</span>
            </div>
            {revenueByTest.length > 0 && (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revenueByTest} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="test_name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(val) => `₹${val}`} />
                  <Bar dataKey="revenue" fill="#28a745" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </>
        ) : (
          <div style={s.empty}>No revenue data available</div>
        )}
      </div>

      {/* Compliance */}
      <div style={s.card}>
        <h3 style={{ marginTop: 0, color: '#444' }}>Compliance</h3>
        {compError && <div style={s.alertDanger}>{compError}</div>}
        {compLoading ? (
          <div style={s.empty}>Loading...</div>
        ) : compliance ? (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <ComplianceStat label="Total Orders" value={compliance.total_orders ?? '—'} />
            <ComplianceStat label="Completed %" value={compliance.completion_rate != null ? `${parseFloat(compliance.completion_rate).toFixed(1)}%` : '—'} color="#28a745" />
            <ComplianceStat label="TAT Compliance %" value={compliance.tat_compliance_rate != null ? `${parseFloat(compliance.tat_compliance_rate).toFixed(1)}%` : '—'} color="#007bff" />
          </div>
        ) : (
          <div style={s.empty}>No compliance data available</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, bg }) {
  return (
    <div style={{ background: bg || 'white', border: '1px solid #e0e0e0', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: 30, fontWeight: 700, color }}>{value}</div>
        </div>
        <div style={{ opacity: 0.7 }}>{icon}</div>
      </div>
    </div>
  );
}

function ComplianceStat({ label, value, color = '#333' }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 120 }}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const s = {
  card: { background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 8, padding: 22, marginBottom: 20 },
  label: { fontWeight: 600, color: '#333', fontSize: 13 },
  inputSm: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, fontFamily: 'inherit' },
  btnPrimary: { padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 13, borderBottom: '2px solid #eee' },
  td: { padding: '10px 12px', color: '#333' },
  empty: { textAlign: 'center', padding: 32, color: '#999', fontSize: 15 },
  alertDanger: { background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
};

export default AnalyticsTab;
