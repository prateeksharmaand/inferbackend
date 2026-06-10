import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Download, RefreshCw, Settings2, Plus, ChevronDown, Eye, Pencil, Printer, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import CreateReceiptModal from '../components/CreateReceiptModal';
import ViewReceiptsModal from '../components/ViewReceiptsModal';
import styles from './Payments.module.css';

const PAYMODES  = ['All', 'Cash', 'UPI', 'Card', 'Net Banking', 'Cheque', 'Other'];
const STATUSES  = ['All', 'Paid', 'Partial', 'Unbilled', 'Due'];
const DATE_OPTS = ['Today', 'Yesterday', 'This Week', 'This Month', 'Custom'];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtCurrency(n) {
  const num = parseFloat(n) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function getDateRange(preset) {
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  if (preset === 'Today')      return { from: ymd(today),             to: ymd(today) };
  if (preset === 'Yesterday')  { const y = new Date(today); y.setDate(y.getDate()-1); return { from: ymd(y), to: ymd(y) }; }
  if (preset === 'This Week')  { const s = new Date(today); s.setDate(s.getDate() - s.getDay()); return { from: ymd(s), to: ymd(today) }; }
  if (preset === 'This Month') { const s = new Date(today.getFullYear(), today.getMonth(), 1); return { from: ymd(s), to: ymd(today) }; }
  return null;
}

function StatusBadge({ status }) {
  const map = {
    Paid:     { bg: '#dcfce7', color: '#16a34a' },
    Partial:  { bg: '#fef9c3', color: '#a16207' },
    Unbilled: { bg: '#f1f5f9', color: '#64748b' },
    Due:      { bg: '#fee2e2', color: '#dc2626' },
  };
  const s = map[status] || map.Unbilled;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {status || 'Unbilled'}
    </span>
  );
}

export default function Payments() {
  const { user } = useAuth();
  const [receipts,    setReceipts]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [search,      setSearch]      = useState('');
  const [paymode,     setPaymode]     = useState('All');
  const [statusFlt,   setStatusFlt]   = useState('All');
  const [datePreset,  setDatePreset]  = useState('Today');
  const [customFrom,  setCustomFrom]  = useState('');
  const [customTo,    setCustomTo]    = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [viewAppt,    setViewAppt]    = useState(null);
  const [paymodeOpen, setPaymodeOpen] = useState(false);
  const [statusOpen,  setStatusOpen]  = useState(false);
  const [dateOpen,    setDateOpen]    = useState(false);
  const paymodeRef = useRef(null);
  const statusRef  = useRef(null);
  const dateRef    = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const h = (e) => {
      if (paymodeRef.current && !paymodeRef.current.contains(e.target)) setPaymodeOpen(false);
      if (statusRef.current  && !statusRef.current.contains(e.target))  setStatusOpen(false);
      if (dateRef.current    && !dateRef.current.contains(e.target))     setDateOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get('/receipts');
      setReceipts(rows || []);
      setLastUpdated(new Date());
    } catch { setReceipts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  // Filter
  const dateRange = datePreset === 'Custom' ? { from: customFrom, to: customTo } : getDateRange(datePreset);

  const filtered = receipts.filter(r => {
    if (search) {
      const q = search.toLowerCase();
      if (!(r.patient_name?.toLowerCase().includes(q) || r.phone?.includes(q) || r.uhid?.toLowerCase().includes(q))) return false;
    }
    if (paymode !== 'All' && r.paymode !== paymode) return false;
    if (statusFlt !== 'All' && r.payment_status !== statusFlt) return false;
    if (dateRange?.from && r.created_at) {
      const d = r.created_at.slice(0, 10);
      if (d < dateRange.from || d > dateRange.to) return false;
    }
    return true;
  });

  // Summary stats
  const total          = filtered.reduce((s, r) => s + (parseFloat(r.grand_total) || 0), 0);
  const paid           = filtered.filter(r => r.payment_status === 'Paid').reduce((s, r) => s + (parseFloat(r.grand_total) || 0), 0);
  const pending        = filtered.filter(r => ['Due','Partial'].includes(r.payment_status)).reduce((s, r) => s + (parseFloat(r.grand_total) || 0), 0);
  const unbilledCount  = filtered.filter(r => r.payment_status === 'Unbilled').length;

  // CSV export
  const downloadCSV = () => {
    const headers = ['S.No', 'Date', 'Patient', 'UHID', 'Phone', 'Service', 'Amount', 'Paymode', 'Status'];
    const rows = filtered.map((r, i) => [
      i + 1, fmtDate(r.created_at), r.patient_name || '', r.uhid || '', r.phone || '',
      (r.items || []).map(it => it.service_name).join('; '),
      r.grand_total || 0, r.paymode || '', r.payment_status || '',
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `payments_${datePreset.toLowerCase().replace(/ /g,'_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const fmtLastUpdated = lastUpdated
    ? lastUpdated.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <h1 className={styles.title}>Payments</h1>
        <div className={styles.headerRight}>
          {/* Date preset */}
          <div className={styles.dropdown} ref={dateRef}>
            <button className={styles.dropBtn} onClick={() => setDateOpen(v => !v)}>
              {datePreset} <ChevronDown size={13} strokeWidth={2} />
            </button>
            {dateOpen && (
              <ul className={styles.dropMenu}>
                {DATE_OPTS.map(d => (
                  <li key={d} className={d === datePreset ? styles.dropItemActive : styles.dropItem}
                    onClick={() => { setDatePreset(d); setDateOpen(false); }}>
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Custom date range */}
          {datePreset === 'Custom' && (
            <div className={styles.dateRange}>
              <input type="date" className={styles.dateInput} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span style={{ color: 'var(--color-text-2)', fontSize: 12 }}>→</span>
              <input type="date" className={styles.dateInput} value={customTo}   onChange={e => setCustomTo(e.target.value)} />
            </div>
          )}

          <button className={styles.addBtn} onClick={() => setShowCreate(true)}>
            <Plus size={14} strokeWidth={2.5} /> New Receipt
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className={styles.cards}>
        {[
          { label: 'Total',            value: fmtCurrency(total),        active: true  },
          { label: 'Unbilled Visits',  value: unbilledCount || '—',      active: false },
          { label: 'Pending Payment',  value: pending ? fmtCurrency(pending) : '—', active: false },
          { label: 'Paid',             value: paid ? fmtCurrency(paid)   : '—', active: false },
        ].map((c, i) => (
          <div key={i} className={`${styles.card} ${c.active ? styles.cardActive : ''}`}>
            <div className={styles.cardLabel}>{c.label}</div>
            <div className={styles.cardValue}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} strokeWidth={2} />
          <input
            className={styles.search}
            placeholder="Search by Phone / Name / UHID"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className={styles.searchClear} onClick={() => setSearch('')}><X size={12} /></button>}
        </div>

        <span className={styles.lastUpdated}>
          Last Updated: {fmtLastUpdated}
          <button className={styles.refreshBtn} onClick={fetchReceipts} disabled={loading} title="Refresh">
            <RefreshCw size={13} strokeWidth={2} className={loading ? styles.spin : ''} />
          </button>
        </span>

        {/* Paymode filter */}
        <div className={styles.dropdown} ref={paymodeRef}>
          <button className={styles.dropBtn} onClick={() => setPaymodeOpen(v => !v)}>
            {paymode === 'All' ? 'Paymode' : paymode} <ChevronDown size={13} strokeWidth={2} />
          </button>
          {paymodeOpen && (
            <ul className={styles.dropMenu}>
              {PAYMODES.map(p => (
                <li key={p} className={p === paymode ? styles.dropItemActive : styles.dropItem}
                  onClick={() => { setPaymode(p); setPaymodeOpen(false); }}>
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Status filter */}
        <div className={styles.dropdown} ref={statusRef}>
          <button className={styles.dropBtn} onClick={() => setStatusOpen(v => !v)}>
            {statusFlt === 'All' ? 'Status' : statusFlt} <ChevronDown size={13} strokeWidth={2} />
          </button>
          {statusOpen && (
            <ul className={styles.dropMenu}>
              {STATUSES.map(s => (
                <li key={s} className={s === statusFlt ? styles.dropItemActive : styles.dropItem}
                  onClick={() => { setStatusFlt(s); setStatusOpen(false); }}>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button className={styles.iconBtn} title="Column settings"><Settings2 size={15} strokeWidth={2} /></button>
        <button className={styles.downloadBtn} onClick={downloadCSV}><Download size={13} strokeWidth={2} /> Download Report</button>
      </div>

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>S.NO</th>
              <th className={styles.th}>PATIENT DETAILS</th>
              <th className={styles.th}>CONTACT NUMBER</th>
              <th className={styles.th}>SERVICE</th>
              <th className={styles.th}>AMOUNT</th>
              <th className={styles.th}>PAYMODE</th>
              <th className={styles.th}>STATUS</th>
              <th className={styles.th}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  <div className={styles.emptyIcon}>
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="15.5" cy="15" r="1.5"/></svg>
                  </div>
                  <div className={styles.emptyTitle}>There are no payments to show for the filters applied.</div>
                  <div className={styles.emptySub}>Add a new transaction or change filters to view payments.</div>
                </td>
              </tr>
            ) : filtered.map((r, i) => {
              const services = (r.items || []).map(it => it.service_name).filter(Boolean).join(', ') || '—';
              return (
                <tr key={r.id} className={styles.tr}>
                  <td className={styles.td}>{i + 1}</td>
                  <td className={styles.td}>
                    <div className={styles.patientName}>{r.patient_name || '—'}</div>
                    <div className={styles.patientMeta}>{r.uhid ? `UHID: ${r.uhid}` : ''} {fmtDate(r.created_at)}</div>
                  </td>
                  <td className={styles.td}>{r.phone || '—'}</td>
                  <td className={styles.td} style={{ maxWidth: 180 }}>
                    <div className={styles.serviceCell}>{services}</div>
                  </td>
                  <td className={styles.td}><strong>{fmtCurrency(r.grand_total)}</strong></td>
                  <td className={styles.td}>{r.paymode || '—'}</td>
                  <td className={styles.td}><StatusBadge status={r.payment_status} /></td>
                  <td className={styles.td}>
                    <div className={styles.actions}>
                      <button className={styles.actionBtn} title="View" onClick={() => setViewAppt({ id: r.appointment_id })}>
                        <Eye size={14} strokeWidth={2} />
                      </button>
                      <button className={styles.actionBtn} title="Edit" onClick={() => setViewAppt({ id: r.appointment_id })}>
                        <Pencil size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Row count */}
      {filtered.length > 0 && (
        <div className={styles.footer}>
          Showing {filtered.length} receipt{filtered.length !== 1 ? 's' : ''}
          {search || paymode !== 'All' || statusFlt !== 'All' ? ` (filtered)` : ''}
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <CreateReceiptModal
          appt={null}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); fetchReceipts(); }}
        />
      )}
      {viewAppt && (
        <ViewReceiptsModal
          appt={viewAppt}
          onClose={() => setViewAppt(null)}
        />
      )}
    </div>
  );
}
