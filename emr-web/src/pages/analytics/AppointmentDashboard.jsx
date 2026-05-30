import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Calendar, Clock, Users, CheckCircle } from 'lucide-react';
import { api } from '../../api/client';
import { KpiCard, ChartCard, DateFilter, Spinner, Empty, C, daysAgo, todayStr, fmtAmt } from './shared';
import s from './Dashboard.module.css';

const TIP = ({ active, payload, label }) => active && payload?.length ? (
  <div className={s.tooltip}><b>{label}</b>{payload.map(p => <div key={p.name}>{p.name}: {p.value}</div>)}</div>
) : null;

export default function AppointmentDashboard({ doctors = [] }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(daysAgo(30));
  const [to,      setTo]      = useState(todayStr());
  const [docId,   setDocId]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    if (docId) p.set('doctor_id', docId);
    api.get(`/analytics/appointments?${p}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [from, to, docId]);

  useEffect(() => { load(); }, [load]);

  const kpi = data?.kpi || {};

  return (
    <div className={s.dash}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <DateFilter from={from} to={to} onFrom={setFrom} onTo={setTo} onApply={load} />
        <select className={s.dateInput} value={docId} onChange={e => setDocId(e.target.value)}>
          <option value="">All Doctors</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : !data ? <Empty /> : <>
        {/* KPIs */}
        <div className={s.kpiRow}>
          <KpiCard icon={Calendar}     label="Total Appointments"              value={kpi.total}           color="#2563eb" />
          <KpiCard icon={Clock}        label="Avg Waiting Time (min)"          value={kpi.avg_wait_min || '—'}    color="#d97706" sub="Scheduled → Check-in" />
          <KpiCard icon={Clock}        label="Avg Consultation Time (min)"     value={kpi.avg_consult_min || '—'} color="#7c3aed" sub="Check-in → Completed" />
          <KpiCard icon={CheckCircle}  label="Completed"                       value={kpi.completed}       color="#16a34a" />
          <KpiCard icon={Users}        label="Cancelled / No Show"             value={kpi.cancelled}       color="#dc2626" />
        </div>

        <div className={s.chartGrid}>
          {/* Weekly trend */}
          <ChartCard title="Weekly Appointments & Rx Trend" className={s.chartFull}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.weekly_trend || []} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<TIP />} />
                <Legend iconSize={10} />
                <Line type="monotone" dataKey="appointments" name="Appointments" stroke={C[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="rx"           name="Prescriptions" stroke={C[1]} strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Status distribution */}
          <ChartCard title="Status Distribution – Appointments">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.status_dist || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
                  {(data.status_dist || []).map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                </Pie>
                <Tooltip content={<TIP />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Channel distribution */}
          <ChartCard title="Channel Type Distribution">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.channel_dist || []} layout="vertical" margin={{ left: 60, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                <Tooltip content={<TIP />} />
                <Bar dataKey="value" name="Appointments" radius={[0,4,4,0]}>
                  {(data.channel_dist || []).map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* New vs Old patient */}
          <ChartCard title="Appointment Types (New vs Returning Patient)">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.new_vs_old || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}>
                  {(data.new_vs_old || []).map((_, i) => <Cell key={i} fill={[C[0], C[1]][i % 2]} />)}
                </Pie>
                <Tooltip content={<TIP />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Tool usage */}
          <ChartCard title="Tool Usage – Prescriptions">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.tool_usage || []} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<TIP />} />
                <Bar dataKey="value" name="Count" radius={[4,4,0,0]}>
                  {(data.tool_usage || []).map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Next 30 days */}
          <ChartCard title="Next 30 Days – Scheduled Appointments">
            {!(data.next_30_days?.length) ? <Empty msg="No upcoming appointments booked" /> :
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.next_30_days || []} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<TIP />} />
                  <Bar dataKey="count" name="Booked" fill={C[0]} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>}
          </ChartCard>

          {/* Daily appointment report table */}
          <ChartCard title="Appointment Report" className={s.chartFull}>
            <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
              <table className={s.dataTable}>
                <thead><tr><th>Date</th><th>Total</th><th>Completed</th><th>Cancelled</th><th>Completion %</th></tr></thead>
                <tbody>
                  {(data.daily_report || []).map(r => (
                    <tr key={r.date}>
                      <td>{r.date}</td>
                      <td><b>{r.total}</b></td>
                      <td style={{ color: '#16a34a' }}>{r.completed}</td>
                      <td style={{ color: '#dc2626' }}>{r.cancelled}</td>
                      <td>{r.total > 0 ? Math.round((r.completed / r.total) * 100) + '%' : '—'}</td>
                    </tr>
                  ))}
                  {!(data.daily_report?.length) && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>No data</td></tr>}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      </>}
    </div>
  );
}
