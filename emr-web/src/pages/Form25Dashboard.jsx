import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  Download, Search, X, ChevronLeft, ChevronRight,
  FileText, IndianRupee, TrendingUp, CalendarDays, Info,
} from 'lucide-react';
import styles from './Analytics.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────
function today()    { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function fyStart() {
  const now = new Date();
  const yr  = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${yr}-04-01`;
}
function fmt(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}-${m}-${y}`;
}
function fmtAmt(n) {
  return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const QUICK_RANGES = [
  { label: 'Last 7 days',   from: () => daysAgo(7),  to: today },
  { label: 'Last 30 days',  from: () => daysAgo(30), to: today },
  { label: 'Last 3 months', from: () => daysAgo(90), to: today },
  { label: 'This FY',       from: fyStart,            to: today },
];

// ── CSV export ────────────────────────────────────────────────────────────
function exportCsv(records, clinicName) {
  const header = ['S.No','Appt Date','Receipt Date','Doctor Name','Clinic Name',
                  'Receipt No.','Patient Name','Nature of Services','Amount (₹)','Pay Mode','Remarks'];
  const rows = records.map((r, i) => [
    i + 1, fmt(r.appointment_date), fmt(r.receipt_date),
    r.doctor_name || '', clinicName || r.clinic_name || '',
    r.receipt_number, r.patient_name,
    `"${(r.service_name || '').replace(/"/g, '""')}"`,
    parseFloat(r.amount_collected || 0).toFixed(2),
    r.paymode || '',
    `"${(r.remarks || 'N/A').replace(/"/g, '""')}"`,
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Form25_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── Summary cards ─────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryIcon} style={{ background: color + '18', color }}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div>
        <div className={styles.summaryValue}>{value}</div>
        <div className={styles.summaryLabel}>{label}</div>
        {sub && <div className={styles.summarySub}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useAuth();

  const [from,     setFrom]     = useState(daysAgo(30));
  const [to,       setTo]       = useState(today());
  const [doctorId, setDoctorId] = useState('');
  const [search,   setSearch]   = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page,     setPage]     = useState(1);
  const LIMIT = 50;

  const [doctors,  setDoctors]  = useState([]);
  const [data,     setData]     = useState(null);
  const [summary,  setSummary]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [allRows,  setAllRows]  = useState([]); // for CSV — fetches all

  const debounceRef = useRef(null);

  // Load doctors once
  useEffect(() => {
    api.get('/auth/doctors').then(setDoctors).catch(() => {});
    api.get('/analytics/form25/summary').then(setSummary).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ from, to, page, limit: LIMIT });
    if (doctorId) params.set('doctor_id', doctorId);
    if (search)   params.set('search', search);
    api.get(`/analytics/form25?${params}`)
      .then(d => { setData(d); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [from, to, doctorId, search, page]);

  useEffect(() => { load(); }, [load]);

  const handleSearchChange = (val) => {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val); setPage(1); }, 350);
  };

  const handleExport = async () => {
    const params = new URLSearchParams({ from, to, page: 1, limit: 9999 });
    if (doctorId) params.set('doctor_id', doctorId);
    if (search)   params.set('search', search);
    const d = await api.get(`/analytics/form25?${params}`).catch(() => null);
    if (d?.records) exportCsv(d.records, user?.clinic_name);
  };

  const applyQuick = (range) => {
    setFrom(range.from()); setTo(range.to()); setPage(1);
  };

  const records    = data?.records || [];
  const total      = data?.total   || 0;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Infer OPD</h1>
          <p className={styles.sub}>{user?.clinic_name}</p>
        </div>
        <button className={styles.exportBtn} onClick={handleExport} disabled={!total}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* ── FY Summary cards ── */}
      {summary && (
        <div className={styles.summaryRow}>
          <SummaryCard icon={IndianRupee} label="Collected This FY"
            value={fmtAmt(summary.fy_total)} color="#16a34a"
            sub={`Since ${fmt(summary.fy_start)}`} />
          <SummaryCard icon={FileText} label="Receipts This FY"
            value={summary.months.reduce((s, m) => s + parseInt(m.receipt_count, 10), 0)}
            color="#2563eb" sub="Total billing transactions" />
          {data && (
            <SummaryCard icon={TrendingUp} label="Collected (filtered)"
              value={fmtAmt(data.total_collected)} color="#7c3aed"
              sub={`${total} receipts · ${fmt(from)} – ${fmt(to)}`} />
          )}
        </div>
      )}

      {/* ── Info banner ── */}
      <div className={styles.infoBanner}>
        <Info size={14} className={styles.infoIcon} />
        <span>
          <strong>Form 25</strong> — Daily Case Register required under Income Tax Rules 2026, Rule 6F
          for medical practitioners with gross receipts &gt; ₹1,50,000 in any of the last 3 FYs.
          Keep this report ready in case requested by the Assessing Officer.
        </span>
      </div>

      {/* ── Filters ── */}
      <div className={styles.filterBar}>
        {/* Quick ranges */}
        <div className={styles.quickRanges}>
          {QUICK_RANGES.map(r => (
            <button key={r.label}
              className={`${styles.quickBtn} ${from === r.from() && to === r.to() ? styles.quickBtnActive : ''}`}
              onClick={() => applyQuick(r)}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className={styles.dateRange}>
          <CalendarDays size={14} className={styles.dateIcon} />
          <input type="date" className={styles.dateInput} value={from} max={to}
            onChange={e => { setFrom(e.target.value); setPage(1); }} />
          <span className={styles.dateSep}>–</span>
          <input type="date" className={styles.dateInput} value={to} min={from}
            onChange={e => { setTo(e.target.value); setPage(1); }} />
        </div>

        {/* Doctor filter */}
        <select className={styles.filterSelect}
          value={doctorId} onChange={e => { setDoctorId(e.target.value); setPage(1); }}>
          <option value="">All Doctors</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* ── Form 25 table section ── */}
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <div className={styles.tableHeaderRight}>
            <div className={styles.searchBox}>
              <Search size={13} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder={`${total} records…`}
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
              />
              {searchInput && (
                <button className={styles.searchClear} onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thSno}>S.No</th>
                <th>Appt Date</th>
                <th>Receipt Date</th>
                <th>Doctor Name</th>
                <th>Clinic Name</th>
                <th>Receipt Number</th>
                <th>Patient Name</th>
                <th className={styles.thService}>Nature of Services</th>
                <th className={styles.thAmt}>Amount Collected</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className={styles.loadingCell}>Loading…</td></tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={10} className={styles.emptyCell}>
                    No records found for the selected period.
                  </td>
                </tr>
              )}
              {!loading && records.map((r, i) => (
                <tr key={r.receipt_id} className={styles.row}>
                  <td className={styles.tdSno}>{(page - 1) * LIMIT + i + 1}</td>
                  <td className={styles.tdDate}>{fmt(r.appointment_date)}</td>
                  <td className={styles.tdDate}>{fmt(r.receipt_date)}</td>
                  <td className={styles.tdDoctor}>{r.doctor_name || '—'}</td>
                  <td>{r.clinic_name}</td>
                  <td className={styles.tdReceipt}>{r.receipt_number}</td>
                  <td className={styles.tdPatient}>{r.patient_name}</td>
                  <td className={styles.tdService}>{r.service_name || 'Consultation'}</td>
                  <td className={styles.tdAmt}>{fmtAmt(r.amount_collected)}</td>
                  <td className={styles.tdRemarks}>{r.remarks || <span className={styles.na}>N/A</span>}</td>
                </tr>
              ))}
            </tbody>
            {!loading && records.length > 0 && (
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={8} className={styles.totalLabel}>Total (this page)</td>
                  <td className={styles.tdAmt}>
                    {fmtAmt(records.reduce((s, r) => s + parseFloat(r.amount_collected || 0), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <span className={styles.pgInfo}>
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} records
            </span>
            <div className={styles.pgBtns}>
              <button className={styles.pgBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span className={styles.pgCurrent}>Page {page} of {totalPages}</span>
              <button className={styles.pgBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
