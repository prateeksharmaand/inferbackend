/**
 * ReportsTab - OpenELIS-style Reports with left submenu
 */

import React, { useState } from 'react';
import { Search, FileText, BarChart2, AlertTriangle, ScrollText } from 'lucide-react';

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

const LAB_SECTIONS = [
  'Serology Department',
  'Histopathology Department',
  'Microbiology Department',
  'Pathology Department',
  'Biochemistry Department',
  'Haematology Lab Department',
];

const SUBMENU = [
  { id: 'test-status', label: 'Test Status by Patient', group: 'Status Reports', icon: <FileText size={13} /> },
  { id: 'all-tests-summary', label: 'All Tests Summary', group: 'Aggregate Reports', icon: <BarChart2 size={13} /> },
  { id: 'nonconformity-date', label: 'Non-Conformity by Date', group: 'Non-conformity', icon: <AlertTriangle size={13} /> },
  { id: 'nonconformity-section', label: 'Non-Conformity by Section', group: 'Non-conformity', icon: <AlertTriangle size={13} /> },
  { id: 'audit-trail', label: 'Audit Trail', group: 'Audit Trail', icon: <ScrollText size={13} /> },
];

function TestStatusByPatient({ labId, styles: s }) {
  const [patientId, setPatientId] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!patientId.trim()) { setError('Enter a Patient ID'); return; }
    try {
      setLoading(true); setError(''); setSearched(true);
      const data = await apiFetch(`/api/v1/lab/${labId}/orders?patient_id=${encodeURIComponent(patientId.trim())}`);
      setOrders(data.orders || data || []);
    } catch (err) { setError(err.message); setOrders([]); } finally { setLoading(false); }
  };

  return (
    <div>
      <div className={s.pageHeader}><div><div className={s.pageTitle}>Test Status by Patient</div></div></div>
      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardBody}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className={s.field} style={{ flex: 1 }}>
              <label className={s.label}>Patient ID</label>
              <input className={s.input} value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="patient-123" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            </div>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSearch} disabled={loading}><Search size={14} /> {loading ? 'Searching...' : 'Search'}</button>
          </div>
        </div>
      </div>
      <div className={s.card}>
        {!searched ? (
          <div className={s.emptyState}><div className={s.emptyText}>Enter a patient ID to view test status</div></div>
        ) : loading ? (
          <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
        ) : orders.length === 0 ? (
          <div className={s.emptyState}><div className={s.emptyIcon}><FileText size={48} /></div><div className={s.emptyText}>No orders found for this patient</div></div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>{['Order ID', 'Accession #', 'Test Name', 'Status', 'Date', 'Result'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.id}</td>
                    <td style={{ fontWeight: 600 }}>{o.accession_number || '—'}</td>
                    <td>{o.test_name || '—'}</td>
                    <td><span className={`${s.badge} ${o.status === 'REPORTED' ? s.badgeGreen : o.status === 'PROCESSING' ? s.badgeBlue : s.badgeGray}`}>{o.status}</span></td>
                    <td>{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
                    <td>{o.result_value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AllTestsSummary({ labId, styles: s }) {
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    try {
      setLoading(true); setError('');
      const res = await apiFetch(`/api/v1/analytics/test-volume?lab_id=${labId}&start_date=${startDate}&end_date=${endDate}`);
      setData(res.tests || res.data || (Array.isArray(res) ? res : []));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <div className={s.pageHeader}><div><div className={s.pageTitle}>All Tests Summary</div></div></div>
      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardBody}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className={s.field}><label className={s.label}>Start Date</label><input className={s.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className={s.field}><label className={s.label}>End Date</label><input className={s.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleGenerate} disabled={loading}><BarChart2 size={14} /> {loading ? 'Generating...' : 'Generate'}</button>
          </div>
        </div>
      </div>
      <div className={s.card}>
        {data.length === 0 ? (
          <div className={s.emptyState}><div className={s.emptyText}>Select a date range and click Generate</div></div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>{['Test Name', 'Total Ordered', 'Completed', 'Pending', 'Critical Count'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.test_name || row.name || '—'}</td>
                    <td>{row.total_ordered || row.total || 0}</td>
                    <td><span className={`${s.badge} ${s.badgeGreen}`}>{row.completed || 0}</span></td>
                    <td><span className={`${s.badge} ${s.badgeYellow}`}>{row.pending || 0}</span></td>
                    <td>{row.critical_count > 0 ? <span className={`${s.badge} ${s.badgeRed}`}>{row.critical_count}</span> : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NonConformityByDate({ labId, styles: s }) {
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    try {
      setLoading(true); setError('');
      const res = await apiFetch(`/api/v1/lab/${labId}/orders?status=CANCELLED`);
      const cancelled = res.orders || res || [];
      const grouped = {};
      cancelled.forEach((o) => {
        const d = o.updated_at || o.created_at;
        const date = d ? new Date(d).toLocaleDateString() : 'Unknown';
        const notes = o.notes || '';
        const reason = notes.includes('QA Event:') ? notes.split('QA Event:')[1]?.split('—')[0]?.trim() : 'Non-conformity';
        const sampleType = o.sample_type || 'Unknown';
        const key = `${date}||${sampleType}||${reason}`;
        grouped[key] = (grouped[key] || 0) + 1;
      });
      setData(Object.entries(grouped).map(([k, count]) => {
        const [date, sampleType, reason] = k.split('||');
        return { date, sampleType, reason, count };
      }));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <div className={s.pageHeader}><div><div className={s.pageTitle}>Non-Conformity by Date</div></div></div>
      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardBody}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className={s.field}><label className={s.label}>Start Date</label><input className={s.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className={s.field}><label className={s.label}>End Date</label><input className={s.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleGenerate} disabled={loading}><AlertTriangle size={14} /> {loading ? 'Generating...' : 'Generate'}</button>
          </div>
        </div>
      </div>
      <div className={s.card}>
        {data.length === 0 ? (
          <div className={s.emptyState}><div className={s.emptyText}>Click Generate to view non-conformity data</div></div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>{['Date', 'Sample Type', 'Reason', 'Count'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    <td>{row.date}</td>
                    <td>{row.sampleType}</td>
                    <td><span className={`${s.badge} ${s.badgeOrange}`}>{row.reason}</span></td>
                    <td><strong>{row.count}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NonConformityBySection({ labId, styles: s }) {
  const [section, setSection] = useState(LAB_SECTIONS[0]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    try {
      setLoading(true); setError('');
      const res = await apiFetch(`/api/v1/lab/${labId}/orders?status=CANCELLED`);
      const cancelled = res.orders || res || [];
      const grouped = {};
      let total = 0;
      cancelled.forEach((o) => {
        const orderSection = o.department || o.section_name || '';
        if (section && !orderSection.toLowerCase().includes(section.toLowerCase().split(' ')[0])) return;
        const notes = o.notes || '';
        const reason = notes.includes('QA Event:') ? notes.split('QA Event:')[1]?.split('—')[0]?.trim() : 'Non-conformity';
        grouped[reason] = (grouped[reason] || 0) + 1;
        total++;
      });
      setData(Object.entries(grouped).map(([reason, count]) => ({
        section, reason, count,
        pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0',
      })));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <div className={s.pageHeader}><div><div className={s.pageTitle}>Non-Conformity by Section and Reason</div></div></div>
      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardBody}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className={s.field} style={{ minWidth: 280 }}>
              <label className={s.label}>Section</label>
              <select className={s.select} value={section} onChange={(e) => setSection(e.target.value)}>
                {LAB_SECTIONS.map((sec) => <option key={sec}>{sec}</option>)}
              </select>
            </div>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleGenerate} disabled={loading}><AlertTriangle size={14} /> {loading ? 'Generating...' : 'Generate'}</button>
          </div>
        </div>
      </div>
      <div className={s.card}>
        {data.length === 0 ? (
          <div className={s.emptyState}><div className={s.emptyText}>Select a section and click Generate</div></div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>{['Section', 'Reason', 'Count', '% of Total'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    <td>{row.section}</td>
                    <td><span className={`${s.badge} ${s.badgeOrange}`}>{row.reason}</span></td>
                    <td><strong>{row.count}</strong></td>
                    <td>{row.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditTrailReport({ labId, styles: s }) {
  const [accession, setAccession] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleView = async () => {
    if (!accession.trim()) { setError('Enter an accession number'); return; }
    try {
      setLoading(true); setError('');
      const data = await apiFetch(`/api/v1/lab/${labId}/orders?accession=${encodeURIComponent(accession.trim())}`);
      const orders = data.orders || (Array.isArray(data) ? data : []);
      const found = orders.find((o) => o.accession_number === accession.trim()) || orders[0];
      if (!found) { setError('No order found for this accession number'); setLoading(false); return; }
      setOrder(found);
      const timelineData = await apiFetch(`/api/v1/orders/${found.id}/timeline`);
      setTimeline(timelineData.timeline || timelineData.events || (Array.isArray(timelineData) ? timelineData : []));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <div className={s.pageHeader}><div><div className={s.pageTitle}>Audit Trail</div></div></div>
      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardBody}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className={s.field} style={{ flex: 1 }}>
              <label className={s.label}>Accession Number</label>
              <input className={s.input} value={accession} onChange={(e) => setAccession(e.target.value)} placeholder="e.g. 03062026-123" onKeyDown={(e) => e.key === 'Enter' && handleView()} />
            </div>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleView} disabled={loading}><ScrollText size={14} /> {loading ? 'Loading...' : 'View'}</button>
          </div>
        </div>
      </div>

      {order && (
        <div className={s.card} style={{ marginBottom: 16 }}>
          <div className={s.cardHeader}><div className={s.cardTitle}>Order: {order.accession_number || order.id}</div></div>
          <div className={s.cardBody}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 13 }}>
              <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)' }}>PATIENT</div><div>{order.patient_name || order.patient_id || '—'}</div></div>
              <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)' }}>TEST</div><div>{order.test_name || '—'}</div></div>
              <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)' }}>STATUS</div><div><span className={`${s.badge} ${s.badgeBlue}`}>{order.status}</span></div></div>
              <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)' }}>DATE</div><div>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</div></div>
            </div>
          </div>
        </div>
      )}

      {timeline.length > 0 && (
        <div className={s.card}>
          <div className={s.cardHeader}><div className={s.cardTitle}>Event Timeline</div></div>
          <div className={s.cardBody}>
            <div className={s.timeline}>
              {timeline.map((event, i) => (
                <div key={i} className={s.timelineItem}>
                  <div className={s.timelineDot}>{i + 1}</div>
                  <div className={s.timelineContent}>
                    <div className={s.timelineTitle}>{event.action || event.status || event.event || '—'}</div>
                    <div className={s.timelineSub}>{event.description || event.notes || event.details || '—'}</div>
                    <div className={s.timelineTime}>{event.timestamp || event.created_at ? new Date(event.timestamp || event.created_at).toLocaleString() : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!order && !error && (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><ScrollText size={48} /></div>
          <div className={s.emptyText}>Enter an accession number and click View</div>
        </div>
      )}
    </div>
  );
}

export function ReportsTab({ labId, styles: s }) {
  const [activeReport, setActiveReport] = useState('test-status');

  const groups = [...new Set(SUBMENU.map((i) => i.group))];

  const renderContent = () => {
    switch (activeReport) {
      case 'test-status': return <TestStatusByPatient labId={labId} styles={s} />;
      case 'all-tests-summary': return <AllTestsSummary labId={labId} styles={s} />;
      case 'nonconformity-date': return <NonConformityByDate labId={labId} styles={s} />;
      case 'nonconformity-section': return <NonConformityBySection labId={labId} styles={s} />;
      case 'audit-trail': return <AuditTrailReport labId={labId} styles={s} />;
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 120px)', margin: '-24px' }}>
      {/* Left submenu */}
      <div style={{ width: 220, flexShrink: 0, background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)', paddingTop: 8 }}>
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: 8 }}>
            <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {group}
            </div>
            {SUBMENU.filter((item) => item.group === group).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveReport(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 16px',
                  background: activeReport === item.id ? '#eff6ff' : 'none',
                  color: activeReport === item.id ? 'var(--color-primary)' : 'var(--color-text)',
                  border: 'none', borderLeft: activeReport === item.id ? '3px solid var(--color-primary)' : '3px solid transparent',
                  cursor: 'pointer', fontSize: 13, fontWeight: activeReport === item.id ? 600 : 400,
                  textAlign: 'left',
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {renderContent()}
      </div>
    </div>
  );
}

export default ReportsTab;
