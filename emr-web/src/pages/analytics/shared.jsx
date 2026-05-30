// Shared chart utilities and theme
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import s from './Dashboard.module.css';

export const C = ['#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0e7490','#be185d','#64748b','#ea580c','#65a30d'];

export function KpiCard({ label, value, sub, icon: Icon, color = '#2563eb' }) {
  return (
    <div className={s.kpi}>
      <div className={s.kpiIcon} style={{ background: color + '18', color }}>{Icon && <Icon size={18} strokeWidth={1.8} />}</div>
      <div>
        <div className={s.kpiValue}>{value ?? '—'}</div>
        <div className={s.kpiLabel}>{label}</div>
        {sub && <div className={s.kpiSub}>{sub}</div>}
      </div>
    </div>
  );
}

export function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`${s.chartCard} ${className}`}>
      <div className={s.chartTitle}>{title}</div>
      <div className={s.chartBody}>{children}</div>
    </div>
  );
}

export function DateFilter({ from, to, onFrom, onTo, onApply }) {
  return (
    <div className={s.dateFilter}>
      <input type="date" className={s.dateInput} value={from} onChange={e => onFrom(e.target.value)} />
      <span className={s.dateSep}>–</span>
      <input type="date" className={s.dateInput} value={to}   onChange={e => onTo(e.target.value)} />
      <button className={s.applyBtn} onClick={onApply}>Apply</button>
    </div>
  );
}

export function Spinner() {
  return <div className={s.spinner} />;
}

export function Empty({ msg = 'No data for this period' }) {
  return <div className={s.empty}>{msg}</div>;
}

export function fmtAmt(n) {
  return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
export function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
export function todayStr() { return new Date().toISOString().slice(0, 10); }

export function useDashboard(path, defaultFrom, defaultTo) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(defaultFrom);
  const [to,      setTo]      = useState(defaultTo);
  const [applied, setApplied] = useState({ from: defaultFrom, to: defaultTo });

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ from: applied.from, to: applied.to });
    api.get(`${path}?${p}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [path, applied]);

  useEffect(() => { load(); }, [load]);

  const apply = () => setApplied({ from, to });

  return { data, loading, from, to, setFrom, setTo, apply, reload: load };
}
