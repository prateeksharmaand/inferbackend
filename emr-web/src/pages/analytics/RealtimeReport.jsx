import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { IndianRupee, Receipt, Users, Tag } from 'lucide-react';
import { api } from '../../api/client';
import { KpiCard, ChartCard, DateFilter, Spinner, Empty, C, todayStr, daysAgo, fmtAmt } from './shared';
import s from './Dashboard.module.css';

const TIP = ({ active, payload, label }) => active && payload?.length ? (
  <div className={s.tooltip}><b>{label}</b>{payload.map(p => <div key={p.name}>{p.name}: {typeof p.value === 'number' && p.value > 100 ? fmtAmt(p.value) : p.value}</div>)}</div>
) : null;

export default function RealtimeReport({ doctors = [] }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(todayStr());
  const [to,      setTo]      = useState(todayStr());
  const [docId,   setDocId]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    if (docId) p.set('doctor_id', docId);
    api.get(`/analytics/realtime?${p}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [from, to, docId]);

  useEffect(() => { load(); }, [load]);

  const kpi = data?.kpi || {};

  return (
    <div className={s.dash}>
      {data && (
        <div className={s.kpiRow}>
          <KpiCard icon={IndianRupee} label="Total Amount Collected"  value={fmtAmt(kpi.total_collected)} color="#16a34a" />
          <KpiCard icon={Tag}         label="Total Discount Given"    value={fmtAmt(kpi.total_discount)}  color="#d97706" />
          <KpiCard icon={Receipt}     label="Receipts Issued"         value={kpi.receipt_count}           color="#2563eb" />
          <KpiCard icon={Users}       label="Patients Billed"         value={kpi.patient_count}           color="#7c3aed" />
        </div>
      )}

      <div className={s.filterBar}>
        <DateFilter from={from} to={to} onFrom={setFrom} onTo={setTo} onApply={load} />
        <select className={s.dateInput} value={docId} onChange={e => setDocId(e.target.value)}>
          <option value="">All Doctors</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : !data ? <Empty /> : <>

        <div className={s.chartGrid}>
          {/* Paymode distribution */}
          <ChartCard title="Paymode Wise Payment – Real Time">
            {!(data.paymode_dist?.length) ? <Empty msg="No payment data" /> :
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.paymode_dist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={35}>
                    {data.paymode_dist.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                  </Pie>
                  <Tooltip content={<TIP />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>}
          </ChartCard>

          {/* Daily payments */}
          <ChartCard title="Daily Payments – Real Time">
            {!(data.daily_trend?.length) ? <Empty msg="No payment data" /> :
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.daily_trend} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'k'} />
                  <Tooltip content={<TIP />} />
                  <Bar dataKey="amount" name="Amount (₹)" fill={C[1]} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>}
          </ChartCard>

          {/* Service wise revenue */}
          <ChartCard title="Service Wise Revenue – Real Time" className={s.chartFull}>
            {!(data.service_wise?.length) ? <Empty msg="No service data" /> :
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.service_wise.slice(0,15)} layout="vertical" margin={{ left: 160, right: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'k'} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                  <Tooltip content={<TIP />} />
                  <Bar dataKey="value" name="Revenue (₹)" fill={C[0]} radius={[0,4,4,0]}>
                    {data.service_wise.slice(0,15).map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
          </ChartCard>

          {/* Patient-level FD */}
          <ChartCard title="Patient Level Financial Detail – Real Time" className={s.chartFull}>
            <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
              <table className={s.dataTable}>
                <thead>
                  <tr>
                    <th>Patient</th><th>UHID</th><th>Receipts</th>
                    <th>Paid</th><th>Discount</th><th>Last Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.patient_level || []).map((r, i) => (
                    <tr key={i}>
                      <td><b>{r.patient_name}</b></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#2563eb' }}>{r.uhid || '—'}</td>
                      <td>{r.receipts}</td>
                      <td style={{ fontWeight: 600, color: '#16a34a' }}>{fmtAmt(r.total_paid)}</td>
                      <td style={{ color: '#d97706' }}>{fmtAmt(r.total_discount)}</td>
                      <td style={{ fontSize: 11, color: '#64748b' }}>{r.last_payment}</td>
                    </tr>
                  ))}
                  {!(data.patient_level?.length) && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>No data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      </>}
    </div>
  );
}
