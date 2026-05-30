import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api } from '../../api/client';
import { ChartCard, Spinner, Empty, C, daysAgo, todayStr } from './shared';
import s from './Dashboard.module.css';

const TIP = ({ active, payload, label }) => active && payload?.length ? (
  <div className={s.tooltip}><b>{label}</b>{payload.map(p => <div key={p.name}>{p.name}: {p.value}</div>)}</div>
) : null;

const TABS = [
  { id: 'symptoms', label: 'Symptoms' },
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'labtest', label: 'Lab Tests' },
  { id: 'procedure', label: 'Procedures' },
  { id: 'vitals', label: 'Vitals Trend' },
  { id: 'medications', label: 'Medications' },
  { id: 'assessments',  label: 'Assessments' },
  { id: 'vaccinations', label: 'Vaccinations' },
];

export default function PrescriptionAnalytics() {
  const [tab,     setTab]     = useState('symptoms');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(daysAgo(30));
  const [to,      setTo]      = useState(todayStr());

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/analytics/prescriptions?from=${from}&to=${to}&tab=${tab}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [from, to, tab]);

  useEffect(() => { load(); }, [load]);

  const renderContent = () => {
    if (loading) return <Spinner />;
    if (!data?.data) return <Empty />;

    const d = data.data;

    // Symptoms, Diagnosis, Lab Tests, Procedures, Medications — bar charts
    if (['symptoms', 'diagnosis', 'labtest', 'procedure', 'medications'].includes(tab)) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={d.slice(0, 15)} layout="vertical" margin={{ left: 140, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
            <Tooltip content={<TIP />} />
            <Bar dataKey="value" name="Count" fill={C[0]} radius={[0,4,4,0]}>
              {d.slice(0, 15).map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    // Vitals trend — line chart
    if (tab === 'vitals') {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={d} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<TIP />} />
            <Legend iconSize={10} />
            {d[0]?.systolic && <Line type="monotone" dataKey="systolic" name="Systolic" stroke={C[0]} strokeWidth={2} dot={false} />}
            {d[0]?.diastolic && <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke={C[1]} strokeWidth={2} dot={false} />}
            {d[0]?.pulse && <Line type="monotone" dataKey="pulse" name="Pulse" stroke={C[2]} strokeWidth={2} dot={false} />}
            {d[0]?.temp && <Line type="monotone" dataKey="temp" name="Temp" stroke={C[3]} strokeWidth={2} dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    // Assessments — summary cards
    if (tab === 'assessments') {
      return (
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', padding: '20px 0' }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 700, color: C[0] }}>{d.total_encounters || 0}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Total Encounters</div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 700, color: C[1] }}>{d.with_exam || 0}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>With Examination Findings</div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 700, color: C[2] }}>{d.with_complaint || 0}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>With Chief Complaint</div>
          </div>
        </div>
      );
    }

    // Vaccinations — 3 charts
    if (tab === 'vaccinations') {
      const { topGiven = [], statusBreakdown = [], monthlyTrend = [] } = d;
      const totalGiven  = statusBreakdown.find(s => s.name === 'Given')?.value || 0;
      const totalLogged = statusBreakdown.reduce((s, r) => s + r.value, 0);

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* KPI row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Logged', value: totalLogged, color: C[0] },
              { label: 'Given',        value: totalGiven,  color: '#16a34a' },
              { label: 'Due',          value: statusBreakdown.find(s => s.name === 'Due')?.value || 0, color: '#2563eb' },
              { label: 'Missed / Refused', value: (statusBreakdown.find(s => s.name === 'Missed')?.value || 0) + (statusBreakdown.find(s => s.name === 'Patient Refused')?.value || 0), color: '#dc2626' },
            ].map(k => (
              <div key={k.label} className={s.kpi} style={{ flex: 1, minWidth: 120 }}>
                <div className={s.kpiValue} style={{ color: k.color }}>{k.value}</div>
                <div className={s.kpiLabel}>{k.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
            {/* Top 15 given vaccines */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.3px' }}>Top Vaccines Given</div>
              {topGiven.length === 0
                ? <Empty />
                : <ResponsiveContainer width="100%" height={Math.max(topGiven.length * 28, 180)}>
                    <BarChart data={topGiven} layout="vertical" margin={{ left: 150, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={148} />
                      <Tooltip content={<TIP />} />
                      <Bar dataKey="value" name="Given" fill="#16a34a" radius={[0,4,4,0]}>
                        {topGiven.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
              }
            </div>

            {/* Status breakdown donut */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.3px' }}>Status Breakdown</div>
              {statusBreakdown.length === 0
                ? <Empty />
                : <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                          dataKey="value" nameKey="name" paddingAngle={3}>
                          {statusBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      {statusBreakdown.map(s => (
                        <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, color: '#64748b' }}>{s.name}</span>
                          <span style={{ fontWeight: 700, color: s.color }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
              }
            </div>
          </div>

          {/* Monthly trend */}
          {monthlyTrend.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.3px' }}>Monthly Vaccination Trend</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyTrend} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<TIP />} />
                  <Line type="monotone" dataKey="given" name="Vaccines Given" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      );
    }

    return <Empty />;
  };

  return (
    <div className={s.dash}>
      <div className={s.filterBar}>
        <input type="date" className={s.dateInput} value={from} onChange={e => setFrom(e.target.value)} />
        <span className={s.dateSep}>–</span>
        <input type="date" className={s.dateInput} value={to}   onChange={e => setTo(e.target.value)} />
        <button className={s.applyBtn} onClick={load}>Apply</button>
      </div>

      {/* Sub-tabs */}
      <div className={s.subTabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${s.subTab} ${tab === t.id ? s.subTabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <ChartCard title={TABS.find(t => t.id === tab)?.label || 'Prescription Data'} className={s.chartFull}>
        {renderContent()}
      </ChartCard>
    </div>
  );
}
