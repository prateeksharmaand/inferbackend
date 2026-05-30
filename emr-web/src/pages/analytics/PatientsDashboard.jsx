import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Users, UserCheck, UserX, Activity } from 'lucide-react';
import { api } from '../../api/client';
import { KpiCard, ChartCard, DateFilter, Spinner, Empty, C, daysAgo, todayStr } from './shared';
import s from './Dashboard.module.css';

const TIP = ({ active, payload, label }) => active && payload?.length ? (
  <div className={s.tooltip}><b>{label}</b>{payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</div>)}</div>
) : null;

export default function PatientsDashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(daysAgo(90));
  const [to,      setTo]      = useState(todayStr());

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/analytics/patients?from=${from}&to=${to}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const kpi = data?.kpi || {};
  const monthly = data?.monthly_patients || [];
  const pieData = monthly.length
    ? [
        { name: 'New Patients',       value: monthly.reduce((s, m) => s + (m.new || 0), 0) },
        { name: 'Returning Patients', value: monthly.reduce((s, m) => s + (m.returning || 0), 0) },
      ]
    : [];

  return (
    <div className={s.dash}>
      {data && (
        <div className={s.kpiRow}>
          <KpiCard icon={Users}     label="Patient Database"    value={kpi.total_patients?.toLocaleString('en-IN')} color="#2563eb" sub="Unique patients" />
          <KpiCard icon={Activity}  label="Total Visits"        value={kpi.total_visits?.toLocaleString('en-IN')}   color="#7c3aed" />
          <KpiCard icon={UserCheck} label="Active (last 90d)"  value={(kpi.total_patients - kpi.churned_patients)?.toLocaleString('en-IN')} color="#16a34a" />
          <KpiCard icon={UserX}     label="Churned (>90 days)" value={kpi.churned_patients?.toLocaleString('en-IN')} color="#dc2626" sub="No visit in 90+ days" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <DateFilter from={from} to={to} onFrom={setFrom} onTo={setTo} onApply={load} />
      </div>

      {loading ? <Spinner /> : !data ? <Empty /> : <>

        <div className={s.chartGrid}>
          {/* Monthly new vs returning */}
          <ChartCard title="New Patients vs Old Patients (Monthly)" className={s.chartFull}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<TIP />} />
                <Legend iconSize={10} />
                <Bar dataKey="new"       name="New Patients"       fill={C[0]} radius={[3,3,0,0]} />
                <Bar dataKey="returning" name="Returning Patients" fill={C[1]} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Patient status pie */}
          <ChartCard title="Patient Status: New vs Returning">
            {!pieData.some(d => d.value) ? <Empty /> :
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
                    {pieData.map((_, i) => <Cell key={i} fill={[C[0], C[1]][i]} />)}
                  </Pie>
                  <Tooltip content={<TIP />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>}
          </ChartCard>

          {/* Wait & consultation time trend */}
          <ChartCard title="Patient Waiting & Consultation Time (min/week)">
            {!(data.wait_consult_trend?.length) ? <Empty /> :
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.wait_consult_trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<TIP />} />
                  <Legend iconSize={10} />
                  <Line type="monotone" dataKey="avg_wait"    name="Avg Wait (min)"        stroke={C[2]} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avg_consult" name="Avg Consult (min)"      stroke={C[3]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>}
          </ChartCard>

          {/* Referred To */}
          <ChartCard title="Referred To – Rx Referrals (Top 10)">
            {!(data.referred_to?.length) ? <Empty msg="No referrals recorded" /> :
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.referred_to.slice(0,10)} layout="vertical" margin={{ left: 120, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip content={<TIP />} />
                  <Bar dataKey="value" name="Referrals" fill={C[4]} radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>}
          </ChartCard>

          {/* Patient churn card */}
          <ChartCard title="Patient Churn Analysis" className={s.chartFull}>
            <div style={{ display: 'flex', gap: 32, padding: '12px 0', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#dc2626' }}>{kpi.churned_patients?.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Patients with no visit in 90+ days</div>
              </div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#2563eb' }}>{kpi.total_patients?.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Total unique patients</div>
              </div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#16a34a' }}>
                  {kpi.total_patients ? Math.round(((kpi.total_patients - kpi.churned_patients) / kpi.total_patients) * 100) : 0}%
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Retention rate</div>
              </div>
            </div>
          </ChartCard>
        </div>
      </>}
    </div>
  );
}
