/**
 * TrendsTab - Historical trend analysis with recharts
 */

import React, { useState } from 'react';
import { Search, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, ReferenceBand,
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

export function TrendsTab({ labId, styles: s }) {
  const [patientId, setPatientId] = useState('');
  const [testCode, setTestCode] = useState('');
  const [months, setMonths] = useState('6');
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTrends = async () => {
    if (!patientId || !testCode) { setError('Patient ID and Test Code are required'); return; }
    try {
      setLoading(true); setError('');
      const data = await apiFetch(
        `/api/v1/patients/${patientId}/trends/${testCode}?months=${months}`
      );
      setTrendData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const chartData = trendData?.results?.map((r) => ({
    date: new Date(r.result_date || r.created_at).toLocaleDateString(),
    value: parseFloat(r.result_value),
  })) || [];

  const refLow = trendData?.reference_range_low != null ? parseFloat(trendData.reference_range_low) : null;
  const refHigh = trendData?.reference_range_high != null ? parseFloat(trendData.reference_range_high) : null;

  const values = chartData.map((d) => d.value).filter((v) => !isNaN(v));
  const minVal = values.length ? Math.min(...values) : null;
  const maxVal = values.length ? Math.max(...values) : null;
  const avgVal = values.length ? (values.reduce((a, b) => a + b, 0) / values.length) : null;

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Trend Analysis</div>
          <div className={s.pageSubtitle}>Historical test result trends with reference range visualization</div>
        </div>
      </div>

      <div className={s.card} style={{ marginBottom: 20 }}>
        <div className={s.cardHeader}><div className={s.cardTitle}>Search Parameters</div></div>
        <div className={s.cardBody}>
          {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className={s.field} style={{ flex: 1, minWidth: 160 }}>
              <label className={s.label}>Patient ID *</label>
              <input className={s.input} value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="patient-123" onKeyDown={(e) => e.key === 'Enter' && fetchTrends()} />
            </div>
            <div className={s.field} style={{ flex: 1, minWidth: 160 }}>
              <label className={s.label}>Test Code *</label>
              <input className={s.input} value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="HB, GLUCOSE, TSH..." onKeyDown={(e) => e.key === 'Enter' && fetchTrends()} />
            </div>
            <div className={s.field} style={{ minWidth: 120 }}>
              <label className={s.label}>Time Period</label>
              <select className={s.select} value={months} onChange={(e) => setMonths(e.target.value)}>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
                <option value="24">24 months</option>
              </select>
            </div>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={fetchTrends} disabled={loading}>
              <Search size={14} /> {loading ? 'Loading...' : 'Load Trends'}
            </button>
          </div>
        </div>
      </div>

      {loading && <div className={s.emptyState}><div className={s.emptyText}>Fetching trend data...</div></div>}

      {trendData && chartData.length > 0 && (
        <>
          {/* Summary stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Minimum', value: minVal != null ? `${minVal.toFixed(2)} ${trendData.unit || ''}` : '—', color: 'var(--color-primary)' },
              { label: 'Maximum', value: maxVal != null ? `${maxVal.toFixed(2)} ${trendData.unit || ''}` : '—', color: 'var(--color-danger)' },
              { label: 'Average', value: avgVal != null ? `${avgVal.toFixed(2)} ${trendData.unit || ''}` : '—', color: 'var(--color-success)' },
            ].map(({ label, value, color }) => (
              <div key={label} className={s.statCard}>
                <div className={s.statValue} style={{ color, fontSize: 22 }}>{value}</div>
                <div className={s.statLabel}>{label} ({chartData.length} data points)</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} />
                {testCode.toUpperCase()} — {trendData.test_name || testCode} ({trendData.unit || ''})
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
                Ref Range: {refLow ?? '?'} – {refHigh ?? '?'} {trendData.unit || ''}
              </span>
            </div>
            <div className={s.cardBody}>
              <div className={s.chartWrap}>
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={chartData} margin={{ top: 10, right: 40, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
                      formatter={(val) => [`${val} ${trendData.unit || ''}`, trendData.test_name || testCode]}
                    />
                    <Legend />
                    {refHigh != null && (
                      <ReferenceLine
                        y={refHigh}
                        stroke="#dc2626"
                        strokeDasharray="6 3"
                        label={{ value: `High: ${refHigh}`, position: 'right', fontSize: 11, fill: '#dc2626' }}
                      />
                    )}
                    {refLow != null && (
                      <ReferenceLine
                        y={refLow}
                        stroke="#2563eb"
                        strokeDasharray="6 3"
                        label={{ value: `Low: ${refLow}`, position: 'right', fontSize: 11, fill: '#2563eb' }}
                      />
                    )}
                    {avgVal != null && (
                      <ReferenceLine
                        y={avgVal}
                        stroke="#16a34a"
                        strokeDasharray="3 3"
                        label={{ value: `Avg: ${avgVal.toFixed(2)}`, position: 'right', fontSize: 10, fill: '#16a34a' }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const isCritical = (refHigh != null && payload.value > refHigh) || (refLow != null && payload.value < refLow);
                        return (
                          <circle
                            key={`dot-${cx}-${cy}`}
                            cx={cx}
                            cy={cy}
                            r={isCritical ? 6 : 4}
                            fill={isCritical ? '#dc2626' : 'var(--color-primary)'}
                            stroke="white"
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={{ r: 7 }}
                      name={trendData.test_name || testCode}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Raw data table */}
          <div className={s.card} style={{ marginTop: 16 }}>
            <div className={s.cardHeader}><div className={s.cardTitle}>Raw Data</div></div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>{['Date', 'Value', 'Unit', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {trendData.results.map((r, i) => {
                    const val = parseFloat(r.result_value);
                    const isCritical = (refHigh != null && val > refHigh) || (refLow != null && val < refLow);
                    return (
                      <tr key={i} className={isCritical ? s.criticalRow : ''}>
                        <td>{new Date(r.result_date || r.created_at).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 700 }}>{r.result_value}</td>
                        <td>{trendData.unit || r.unit || '—'}</td>
                        <td>
                          {isCritical
                            ? <span className={`${s.badge} ${s.criticalBadge}`}>CRITICAL</span>
                            : <span className={`${s.badge} ${s.badgeGreen}`}>NORMAL</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {trendData && chartData.length === 0 && !loading && (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><TrendingUp size={48} /></div>
          <div className={s.emptyText}>No trend data found for the selected test and time range</div>
        </div>
      )}

      {!trendData && !loading && (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><TrendingUp size={48} /></div>
          <div className={s.emptyText}>Enter a Patient ID and Test Code to view trends</div>
        </div>
      )}
    </div>
  );
}

export default TrendsTab;
