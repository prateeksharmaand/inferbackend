/**
 * AnalyticsTab - Full 10-section lab analytics
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { RefreshCw, Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` });
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...opts });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || 'Request failed');
  return d;
}

const PALETTE = ['#6366f1','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];

const NAV = [
  { id: 'overview',      icon: '🏠', label: 'Overview'         },
  { id: 'tat',           icon: '⏱',  label: 'TAT Analysis'     },
  { id: 'volume',        icon: '🧪',  label: 'Test Volume'      },
  { id: 'revenue',       icon: '💰',  label: 'Revenue'          },
  { id: 'clinical',      icon: '🦠',  label: 'Clinical Insights'},
  { id: 'demographics',  icon: '👥',  label: 'Demographics'     },
  { id: 'quality',       icon: '⚠️',  label: 'Quality (NC+QC)'  },
  { id: 'staff',         icon: '👨‍🔬', label: 'Staff Performance'},
  { id: 'instruments',   icon: '🔬',  label: 'Instruments'      },
  { id: 'reports',       icon: '📋',  label: 'Custom Reports'   },
];

function StatCard({ icon, value, label, accent = '#6366f1', sub }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: `3px solid ${accent}`, borderRadius: 10, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, children, action }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        {action}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function Empty({ text = 'No data for this period' }) {
  return <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>{text}</div>;
}

function Loading() {
  return <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>Loading…</div>;
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function Overview({ labId, range }) {
  const [dash,  setDash]  = useState(null);
  const [vol,   setVol]   = useState([]);
  const [rev,   setRev]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/v1/analytics/dashboard?lab_id=${labId}&days=1`).catch(() => null),
      apiFetch(`/api/v1/analytics/test-volume?lab_id=${labId}&start_date=${range.start}&end_date=${range.end}`).catch(() => null),
      apiFetch(`/api/v1/analytics/revenue?lab_id=${labId}&start_date=${range.start}&end_date=${range.end}`).catch(() => null),
    ]).then(([d, v, r]) => {
      setDash(d?.dashboard || null);
      setVol(Array.isArray(v?.data) ? v.data.slice(0, 10) : []);
      setRev(r?.data || null);
    }).finally(() => setLoading(false));
  }, [labId, range.start, range.end]);

  if (loading) return <Loading />;
  const ord = dash?.orders || {};

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="🧪" value={Number(ord.total_orders ?? 0)} label="Today's Samples" accent="#2563eb" />
        <StatCard icon="⏳" value={Number(ord.PENDING ?? 0) + Number(ord.COLLECTED ?? 0)} label="Pending Results" accent="#d97706" />
        <StatCard icon="🚨" value={Number(ord.CRITICAL ?? 0) || '—'} label="Critical Values" accent="#dc2626" />
        <StatCard icon="✅" value={Number(ord.REPORTED ?? 0) + Number(ord.RESULTED ?? 0)} label="Completed Today" accent="#059669" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <SectionCard title="Top 10 Tests (Period)">
          {vol.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={vol} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="test_name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="order_count" fill="#6366f1" radius={[0, 3, 3, 0]}>
                  {vol.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Revenue Overview">
          {!rev ? <Empty /> : (
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#059669', marginBottom: 8 }}>
                ₹{Number(rev.summary?.total_revenue ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Total for period</div>
              {rev.daily?.length > 0 && (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={rev.daily}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={v => `₹${Number(v).toLocaleString('en-IN')}`} />
                    <Line type="monotone" dataKey="daily_revenue" stroke="#059669" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── TAT ANALYSIS ────────────────────────────────────────────────────────────
function TATAnalysis({ labId, range }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/v1/analytics/turnaround?lab_id=${labId}&start_date=${range.start}&end_date=${range.end}`)
      .then(d => setData(Array.isArray(d.data) ? d.data : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [labId, range.start, range.end]);

  if (loading) return <Loading />;
  if (data.length === 0) return <Empty />;

  const avgTat = data.reduce((s, r) => s + parseFloat(r.avg_hours || 0), 0) / data.length;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="⏱" value={avgTat.toFixed(1) + 'h'} label="Overall Avg TAT" accent="#6366f1" />
        <StatCard icon="🚀" value={Math.min(...data.map(r => parseFloat(r.min_hours || 999))).toFixed(1) + 'h'} label="Best TAT" accent="#059669" />
        <StatCard icon="🐢" value={Math.max(...data.map(r => parseFloat(r.max_hours || 0))).toFixed(1) + 'h'} label="Worst TAT" accent="#dc2626" />
      </div>

      <SectionCard title="Average TAT by Test">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.slice(0, 15)} margin={{ bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="test_name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
            <Tooltip formatter={v => `${parseFloat(v).toFixed(1)}h`} />
            <Bar dataKey="avg_hours" name="Avg TAT (h)" fill="#6366f1" radius={[3,3,0,0]}>
              {data.slice(0,15).map((r, i) => {
                const h = parseFloat(r.avg_hours || 0);
                return <Cell key={i} fill={h > 24 ? '#ef4444' : h > 8 ? '#f59e0b' : '#10b981'} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="TAT Detail Table">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f8fafc', fontSize: 11, textTransform: 'uppercase', color: '#64748b' }}>
              {['Test', 'Samples', 'Avg (h)', 'Min (h)', 'Max (h)', 'Median (h)', 'Status'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.map((r, i) => {
                const avg = parseFloat(r.avg_hours || 0);
                const status = avg > 24 ? { label: 'Breach', color: '#dc2626', bg: '#fee2e2' } : avg > 8 ? { label: 'Warning', color: '#d97706', bg: '#fffbeb' } : { label: 'On Time', color: '#059669', bg: '#f0fdf4' };
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.test_name}</td>
                    <td style={{ padding: '8px 12px' }}>{r.sample_count}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: avg > 24 ? '#dc2626' : avg > 8 ? '#d97706' : '#059669' }}>{avg.toFixed(1)}</td>
                    <td style={{ padding: '8px 12px' }}>{parseFloat(r.min_hours || 0).toFixed(1)}</td>
                    <td style={{ padding: '8px 12px' }}>{parseFloat(r.max_hours || 0).toFixed(1)}</td>
                    <td style={{ padding: '8px 12px' }}>{r.median_hours ? parseFloat(r.median_hours).toFixed(1) : '—'}</td>
                    <td style={{ padding: '8px 12px' }}><span style={{ background: status.bg, color: status.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── TEST VOLUME ─────────────────────────────────────────────────────────────
function TestVolume({ labId, range }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/v1/analytics/test-volume?lab_id=${labId}&start_date=${range.start}&end_date=${range.end}`)
      .then(d => setData(Array.isArray(d.data) ? d.data : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [labId, range.start, range.end]);

  if (loading) return <Loading />;
  const total = data.reduce((s, r) => s + parseInt(r.order_count || 0), 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="📋" value={total} label="Total Tests Ordered" accent="#6366f1" />
        <StatCard icon="🏆" value={data[0]?.test_name || '—'} label="Most Ordered Test" accent="#f59e0b" sub={data[0] ? `${data[0].order_count} orders` : ''} />
        <StatCard icon="🧬" value={data.length} label="Unique Tests" accent="#10b981" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="Top 15 Tests by Volume">
          {data.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.slice(0, 15)} layout="vertical" margin={{ left: 100 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="test_name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="order_count" name="Orders" fill="#6366f1" radius={[0,3,3,0]}>
                  {data.slice(0,15).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Volume Share (Top 10)">
          {data.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.slice(0,10)} dataKey="order_count" nameKey="test_name" cx="50%" cy="50%" outerRadius={110} label={({ name, percent }) => `${name.slice(0,10)} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {data.slice(0,10).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Full Test Volume List">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f8fafc', fontSize: 11, textTransform: 'uppercase', color: '#64748b' }}>
              {['#', 'Test', 'Code', 'Orders', 'Resulted', 'Completion %'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.map((r, i) => {
                const pct = r.order_count > 0 ? Math.round((parseInt(r.resulted_count || 0) / parseInt(r.order_count)) * 100) : 0;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 12px', color: '#94a3b8', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.test_name}</td>
                    <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 11 }}>{r.test_code}</td>
                    <td style={{ padding: '7px 12px', fontWeight: 700 }}>{r.order_count}</td>
                    <td style={{ padding: '7px 12px' }}>{r.resulted_count || 0}</td>
                    <td style={{ padding: '7px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, minWidth: 30 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── REVENUE ─────────────────────────────────────────────────────────────────
function Revenue({ labId, range }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/v1/analytics/revenue?lab_id=${labId}&start_date=${range.start}&end_date=${range.end}`)
      .then(d => setData(d.data || d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [labId, range.start, range.end]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  const summary = data.summary || {};
  const daily   = data.daily   || [];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="💰" value={`₹${Number(summary.total_revenue || 0).toLocaleString('en-IN')}`} label="Total Revenue" accent="#059669" />
        <StatCard icon="📦" value={summary.billed_orders ?? '—'} label="Billed Orders" accent="#6366f1" />
        <StatCard icon="📊" value={summary.avg_order_value ? `₹${Number(summary.avg_order_value).toFixed(0)}` : '—'} label="Avg Order Value" accent="#f59e0b" />
      </div>

      {daily.length > 0 && (
        <SectionCard title="Daily Revenue Trend">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => `₹${Number(v).toLocaleString('en-IN')}`} />
              <Line type="monotone" dataKey="daily_revenue" name="Revenue" stroke="#059669" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="orders" name="Orders" stroke="#6366f1" strokeWidth={1.5} dot={false} yAxisId="right" />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {daily.length > 0 && (
        <SectionCard title="Daily Revenue Table">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc', fontSize: 11, textTransform: 'uppercase', color: '#64748b' }}>
                {['Date', 'Revenue', 'Orders'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {daily.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 12px' }}>{r.date}</td>
                    <td style={{ padding: '7px 12px', fontWeight: 700, color: '#059669' }}>₹{Number(r.daily_revenue).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '7px 12px' }}>{r.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── CLINICAL INSIGHTS ───────────────────────────────────────────────────────
function Clinical({ labId, range }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const days = Math.ceil((new Date(range.end) - new Date(range.start)) / 86400000) || 30;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/v1/analytics/clinical?lab_id=${labId}&days=${days}`)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [labId, days]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  const abnormal  = data.abnormal  || [];
  const criticals = data.criticals || [];
  const trends    = data.trends    || [];

  return (
    <div>
      <SectionCard title="Abnormal Result Rate by Test (min 5 results)">
        {abnormal.length === 0 ? <Empty /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc', fontSize: 11, textTransform: 'uppercase', color: '#64748b' }}>
                {['Test', 'Total', 'High', 'Low', 'Critical', 'Abnormal %'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {abnormal.map((r, i) => {
                  const abnPct = r.total > 0 ? (((parseInt(r.high_count || 0) + parseInt(r.low_count || 0)) / parseInt(r.total)) * 100).toFixed(1) : 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.test_name}</td>
                      <td style={{ padding: '7px 12px' }}>{r.total}</td>
                      <td style={{ padding: '7px 12px', color: '#b45309', fontWeight: 600 }}>{r.high_count} <span style={{ fontSize: 10 }}>▲</span></td>
                      <td style={{ padding: '7px 12px', color: '#1e40af', fontWeight: 600 }}>{r.low_count} <span style={{ fontSize: 10 }}>▼</span></td>
                      <td style={{ padding: '7px 12px', color: '#dc2626', fontWeight: 700 }}>{r.critical_count}</td>
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{ background: abnPct > 30 ? '#fee2e2' : abnPct > 15 ? '#fff7ed' : '#f0fdf4', color: abnPct > 30 ? '#dc2626' : abnPct > 15 ? '#d97706' : '#059669', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{abnPct}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="Critical Value Frequency">
          {criticals.length === 0 ? <Empty text="No critical values recorded" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={criticals} layout="vertical" margin={{ left: 100 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="test_name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="cnt" name="Critical Values" fill="#ef4444" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Disease Trends (Infectious)">
          {trends.length === 0 ? <Empty text="No infectious disease tests in this period" /> : (
            <div>
              {trends.map((r, i) => {
                const rate = r.tested > 0 ? ((parseInt(r.positive) / parseInt(r.tested)) * 100).toFixed(1) : 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <div style={{ flex: 1, fontWeight: 600 }}>{r.test_name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{r.tested} tested</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: rate > 20 ? '#dc2626' : '#d97706' }}>{r.positive} positive ({rate}%)</div>
                    {rate > 20 ? <TrendingUp size={14} color="#dc2626" /> : rate > 5 ? <Minus size={14} color="#d97706" /> : <TrendingDown size={14} color="#059669" />}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── DEMOGRAPHICS ─────────────────────────────────────────────────────────────
function Demographics({ labId, range }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const days = Math.ceil((new Date(range.end) - new Date(range.start)) / 86400000) || 30;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/v1/analytics/demographics?lab_id=${labId}&days=${days}`)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [labId, days]);

  if (loading) return <Loading />;
  const age    = data?.age    || [];
  const gender = data?.gender || [];
  const source = data?.source || [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <SectionCard title="Age Distribution">
        {age.length === 0 ? <Empty text="Age data requires DOB in appointments" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={age}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="age_group" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="cnt" name="Patients" fill="#6366f1" radius={[3,3,0,0]}>
                {age.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <SectionCard title="Gender Distribution">
        {gender.length === 0 ? <Empty text="Gender data requires patient records" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={gender} dataKey="cnt" nameKey="gender" cx="50%" cy="50%" outerRadius={90} label={({ gender: g, percent }) => `${g} ${(percent*100).toFixed(0)}%`}>
                {gender.map((_, i) => <Cell key={i} fill={['#6366f1','#ec4899','#94a3b8'][i] || PALETTE[i]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <SectionCard title="Sample Source Distribution">
        {source.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={source}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="source" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="cnt" name="Orders" fill="#f59e0b" radius={[3,3,0,0]}>
                {source.map((_, i) => <Cell key={i} fill={PALETTE[(i+2) % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <SectionCard title="Insights">
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
          {age.length > 0 && (() => {
            const top = [...age].sort((a,b) => parseInt(b.cnt) - parseInt(a.cnt))[0];
            return <div>📊 Largest age group: <strong>{top.age_group}</strong> ({top.cnt} patients)</div>;
          })()}
          {gender.length > 0 && (() => {
            const top = [...gender].sort((a,b) => parseInt(b.cnt) - parseInt(a.cnt))[0];
            return <div>👤 Predominant gender: <strong>{top.gender}</strong></div>;
          })()}
          {source.length > 0 && (() => {
            const top = source[0];
            return <div>🏥 Top source: <strong>{top.source?.trim() || 'Unknown'}</strong> ({top.cnt} orders)</div>;
          })()}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── QUALITY ─────────────────────────────────────────────────────────────────
function Quality({ labId, range }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const days = Math.ceil((new Date(range.end) - new Date(range.start)) / 86400000) || 30;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/v1/analytics/quality?lab_id=${labId}&days=${days}`)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [labId, days]);

  if (loading) return <Loading />;

  const byType     = data?.by_type     || [];
  const byStage    = data?.by_stage    || [];
  const bySeverity = data?.by_severity || [];
  const trend      = data?.trend       || [];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="⚠️" value={data?.total_nc ?? 0}         label="Total NC Events" accent="#f59e0b" />
        <StatCard icon="📦" value={data?.total_orders ?? 0}     label="Total Orders" accent="#6366f1" />
        <StatCard icon="📉" value={`${data?.rejection_rate ?? '0.00'}%`} label="Rejection Rate" accent={parseFloat(data?.rejection_rate ?? 0) > 3 ? '#dc2626' : '#059669'} sub={parseFloat(data?.rejection_rate ?? 0) > 3 ? 'Above 3% target' : 'Within target'} />
        <StatCard icon="✅" value={byType.find(r => r.resolution_status === 'RESOLVED')?.cnt ?? '—'} label="Resolved" accent="#059669" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <SectionCard title="NC by Event Type">
          {byType.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byType} layout="vertical" margin={{ left: 120 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="event_type" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="cnt" name="Events" fill="#f59e0b" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="NC by Stage">
          {byStage.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byStage} dataKey="cnt" nameKey="stage" cx="50%" cy="50%" outerRadius={80} label={({ stage, cnt }) => `${stage?.replace('_', ' ')}: ${cnt}`}>
                  {byStage.map((_, i) => <Cell key={i} fill={['#f59e0b','#6366f1','#10b981'][i] || PALETTE[i]} />)}
                </Pie>
                <Tooltip />
                <Legend formatter={v => v.replace('_', ' ')} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="NC by Severity">
          {bySeverity.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bySeverity.map((r, i) => {
                const color = r.severity === 'CRITICAL' ? '#dc2626' : r.severity === 'MAJOR' ? '#d97706' : '#059669';
                const total = bySeverity.reduce((s, x) => s + parseInt(x.cnt), 0);
                const pct   = total > 0 ? Math.round((parseInt(r.cnt) / total) * 100) : 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 70, fontSize: 12, fontWeight: 700, color }}>{r.severity}</span>
                    <div style={{ flex: 1, height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 5 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 50, textAlign: 'right' }}>{r.cnt} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="NC Trend (Weekly)">
          {trend.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="cnt" name="NC Events" stroke="#f59e0b" strokeWidth={2} dot={true} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── PLACEHOLDER SECTIONS ────────────────────────────────────────────────────
function Placeholder({ title, description, items }) {
  return (
    <div>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
        ⚠️ <strong>{title}</strong> requires additional data collection. {description}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {items.map((item, i) => (
          <SectionCard key={i} title={item.title}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{item.desc}</div>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

// ─── CUSTOM REPORTS ───────────────────────────────────────────────────────────
function CustomReports({ labId }) {
  const REPORTS = [
    { id: 'workload',     label: '📋 Daily Workload Summary',      url: (l, s, e) => `/api/v1/orders/lab/${l}?start_date=${s}&end_date=${e}` },
    { id: 'tat_breach',   label: '⏱ TAT Breach Report',           url: (l, s, e) => `/api/v1/analytics/turnaround?lab_id=${l}&start_date=${s}&end_date=${e}` },
    { id: 'nc_summary',   label: '⚠️ Non-Conformity Summary',      url: (l, s, e) => `/api/v1/qa?start_date=${s}&end_date=${e}` },
    { id: 'revenue_rpt',  label: '💰 Revenue Report',              url: (l, s, e) => `/api/v1/analytics/revenue?lab_id=${l}&start_date=${s}&end_date=${e}` },
    { id: 'critical_log', label: '🚨 Critical Values Log',         url: (l, s, e) => `/api/v1/analytics/critical-values?lab_id=${l}&days=30` },
    { id: 'compliance',   label: '📊 Compliance Report (NABH)',    url: (l, s, e) => `/api/v1/analytics/compliance?lab_id=${l}&start_date=${s}&end_date=${e}` },
  ];
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const download = async (report) => {
    try {
      const data = await apiFetch(report.url(labId, startDate, endDate));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href = url; a.download = `${report.id}_${startDate}_${endDate}.json`; a.click();
    } catch (err) { alert('Export failed: ' + err.message); }
  };

  return (
    <div>
      <div className="card" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Date Range</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
          <span style={{ color: '#94a3b8' }}>to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {REPORTS.map(r => (
          <div key={r.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</span>
            <button onClick={() => download(r)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              <Download size={13} /> Export JSON
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function AnalyticsTab({ labId, styles: s }) {
  const [section, setSection] = useState('overview');
  const today  = new Date().toISOString().split('T')[0];
  const prior30 = (() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().split('T')[0]; })();
  const [startDate, setStartDate] = useState(prior30);
  const [endDate,   setEndDate]   = useState(today);
  const range = { start: startDate, end: endDate };

  const renderSection = () => {
    switch (section) {
      case 'overview':     return <Overview     labId={labId} range={range} />;
      case 'tat':          return <TATAnalysis  labId={labId} range={range} />;
      case 'volume':       return <TestVolume   labId={labId} range={range} />;
      case 'revenue':      return <Revenue      labId={labId} range={range} />;
      case 'clinical':     return <Clinical     labId={labId} range={range} />;
      case 'demographics': return <Demographics labId={labId} range={range} />;
      case 'quality':      return <Quality      labId={labId} range={range} />;
      case 'staff':        return <Placeholder title="Staff Performance" description="Requires technician login tracking and result entry attribution."
        items={[
          { icon: '⚗️', title: 'Tests per Technician',  desc: 'Tracks result entries per staff member per shift' },
          { icon: '🩸', title: 'Phlebotomist NC Rate',  desc: 'NC events attributed to collector (from NC module)' },
          { icon: '👨‍⚕️', title: 'Pathologist Workload', desc: 'Reports validated per day by senior staff' },
          { icon: '⏱', title: 'Result Entry Speed',    desc: 'Time between collection and result entry per technician' },
        ]} />;
      case 'instruments': return <Placeholder title="Instrument Analytics" description="Requires instrument data to be logged via the Results tab or direct instrument interface."
        items={[
          { icon: '🔬', title: 'Analyzer Utilization', desc: 'Tests run per instrument per day' },
          { icon: '🧪', title: 'QC Trend (Levey-Jennings)', desc: 'QC pass/fail trends per parameter' },
          { icon: '⏸', title: 'Downtime Log',         desc: 'Instrument unavailability events' },
          { icon: '💧', title: 'Reagent Consumption',  desc: 'Reagent usage and reorder alerts' },
        ]} />;
      case 'reports': return <CustomReports labId={labId} />;
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 60px)', margin: '-24px' }}>
      {/* Left nav */}
      <div style={{ width: 200, flexShrink: 0, background: '#1e293b', paddingTop: 12 }}>
        <div style={{ padding: '8px 16px 12px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Analytics</div>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setSection(n.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 16px', background: section === n.id ? '#334155' : 'none', color: section === n.id ? 'white' : '#94a3b8', border: 'none', borderLeft: `3px solid ${section === n.id ? '#6366f1' : 'transparent'}`, cursor: 'pointer', fontSize: 12, fontWeight: section === n.id ? 600 : 400, textAlign: 'left', transition: 'all 0.1s' }}>
            <span>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', background: '#f8fafc', minWidth: 0 }}>
        {/* Date range + section title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>
            {NAV.find(n => n.id === section)?.icon} {NAV.find(n => n.id === section)?.label}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Period:</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: 'white' }} />
            <span style={{ color: '#94a3b8' }}>→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: 'white' }} />
          </div>
        </div>

        {renderSection()}
      </div>
    </div>
  );
}

export default AnalyticsTab;
