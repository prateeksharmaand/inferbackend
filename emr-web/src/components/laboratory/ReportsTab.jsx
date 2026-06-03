/**
 * ReportsTab - Generate, Approve & Release Lab Reports
 */

import React, { useState, useCallback } from 'react';
import { Plus, Search, Download, Check, X, FileText } from 'lucide-react';

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

const REPORT_STATUS_BADGE = {
  DRAFT: 'badgeGray',
  PENDING_APPROVAL: 'badgeYellow',
  APPROVED: 'badgeBlue',
  RELEASED: 'badgeGreen',
};

export function ReportsTab({ labId, styles: s }) {
  const [activeSection, setActiveSection] = useState('list');

  const [form, setForm] = useState({
    order_id: '', patient_id: '', doctor_id: '',
    report_type: 'FINAL', clinical_notes: '', observations: '', recommendations: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [searchPatientId, setSearchPatientId] = useState('');
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');

  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState('');

  const handleFormChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleCreateReport = async (e) => {
    e.preventDefault();
    if (!form.order_id || !form.patient_id) { setCreateError('Order ID and Patient ID are required'); return; }
    try {
      setCreating(true); setCreateError(''); setCreateSuccess('');
      const data = await apiFetch('/api/v1/reports', {
        method: 'POST',
        body: JSON.stringify({ ...form, lab_id: labId }),
      });
      setCreateSuccess(`Report ${data.report?.report_number || data.report_id || ''} created!`);
      setForm({ order_id: '', patient_id: '', doctor_id: '', report_type: 'FINAL', clinical_notes: '', observations: '', recommendations: '' });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const fetchReports = useCallback(async () => {
    if (!searchPatientId) return;
    try {
      setReportsLoading(true); setReportsError(''); setActionError('');
      const data = await apiFetch(`/api/v1/patients/${searchPatientId}/reports`);
      setReports(data.reports || data || []);
    } catch (err) {
      setReportsError(err.message);
    } finally {
      setReportsLoading(false);
    }
  }, [searchPatientId]);

  const handleAction = async (report, action) => {
    try {
      setActionLoading((p) => ({ ...p, [report.id + action]: true }));
      setActionError('');
      await apiFetch(`/api/v1/reports/${report.id}/${action}`, { method: 'POST' });
      await fetchReports();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading((p) => ({ ...p, [report.id + action]: false }));
    }
  };

  const handleDownloadPDF = (report) => {
    const token = localStorage.getItem('auth_token');
    window.open(`/api/v1/reports/${report.id}/pdf?token=${token}`, '_blank');
  };

  const sections = [['list', 'Reports List'], ['create', 'Create Report']];

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Lab Reports</div>
          <div className={s.pageSubtitle}>Generate, approve and release laboratory reports</div>
        </div>
      </div>

      <div className={s.sectionTabs}>
        {sections.map(([key, label]) => (
          <button key={key} className={`${s.sectionTab} ${activeSection === key ? s.sectionTabActive : ''}`} onClick={() => setActiveSection(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Create Report */}
      {activeSection === 'create' && (
        <div className={s.card}>
          <div className={s.cardHeader}><div className={s.cardTitle}>Create New Report</div></div>
          <div className={s.cardBody}>
            {createError && <div className={`${s.alert} ${s.alertError}`}>{createError}</div>}
            {createSuccess && <div className={`${s.alert} ${s.alertSuccess}`}>{createSuccess}</div>}
            <form onSubmit={handleCreateReport}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className={s.field}>
                  <label className={s.label}>Order ID *</label>
                  <input className={s.input} name="order_id" value={form.order_id} onChange={handleFormChange} placeholder="ORD-123" disabled={creating} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Patient ID *</label>
                  <input className={s.input} name="patient_id" value={form.patient_id} onChange={handleFormChange} placeholder="patient-456" disabled={creating} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Ordering Doctor ID</label>
                  <input className={s.input} name="doctor_id" value={form.doctor_id} onChange={handleFormChange} placeholder="doctor-789" disabled={creating} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Report Type</label>
                  <select className={s.select} name="report_type" value={form.report_type} onChange={handleFormChange} disabled={creating}>
                    <option>PRELIMINARY</option><option>FINAL</option><option>AMENDED</option>
                  </select>
                </div>
              </div>
              <div className={s.field} style={{ marginBottom: 12 }}>
                <label className={s.label}>Clinical Notes</label>
                <textarea className={s.textarea} name="clinical_notes" value={form.clinical_notes} onChange={handleFormChange} placeholder="Clinical context..." disabled={creating} style={{ minHeight: 70 }} />
              </div>
              <div className={s.field} style={{ marginBottom: 12 }}>
                <label className={s.label}>Observations</label>
                <textarea className={s.textarea} name="observations" value={form.observations} onChange={handleFormChange} placeholder="Lab findings and observations..." disabled={creating} style={{ minHeight: 80 }} />
              </div>
              <div className={s.field} style={{ marginBottom: 14 }}>
                <label className={s.label}>Recommendations</label>
                <textarea className={s.textarea} name="recommendations" value={form.recommendations} onChange={handleFormChange} placeholder="Clinical recommendations..." disabled={creating} style={{ minHeight: 70 }} />
              </div>
              <div className={s.formActions}>
                <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={creating}>
                  <Plus size={14} /> {creating ? 'Creating...' : 'Create Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reports List */}
      {activeSection === 'list' && (
        <div>
          <div className={s.card} style={{ marginBottom: 16 }}>
            <div className={s.cardBody}>
              <div className={s.field}>
                <label className={s.label}>Patient ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className={s.input} value={searchPatientId} onChange={(e) => setSearchPatientId(e.target.value)} placeholder="patient-123" onKeyDown={(e) => e.key === 'Enter' && fetchReports()} />
                  <button className={`${s.btn} ${s.btnPrimary}`} onClick={fetchReports}><Search size={14} /> Search</button>
                </div>
              </div>
            </div>
          </div>

          {actionError && <div className={`${s.alert} ${s.alertError}`}>{actionError}</div>}
          {reportsError && <div className={`${s.alert} ${s.alertError}`}>{reportsError}</div>}

          <div className={s.card}>
            {reportsLoading ? (
              <div className={s.emptyState}><div className={s.emptyText}>Loading reports...</div></div>
            ) : reports.length === 0 && searchPatientId ? (
              <div className={s.emptyState}>
                <div className={s.emptyIcon}><FileText size={48} /></div>
                <div className={s.emptyText}>No reports found for this patient</div>
              </div>
            ) : reports.length === 0 ? (
              <div className={s.emptyState}>
                <div className={s.emptyIcon}><FileText size={48} /></div>
                <div className={s.emptyText}>Enter a Patient ID above to load reports</div>
              </div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>{['Report #', 'Type', 'Status', 'Created', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => {
                      const badgeKey = REPORT_STATUS_BADGE[report.status] || 'badgeGray';
                      return (
                        <tr key={report.id}>
                          <td style={{ fontWeight: 600 }}>{report.report_number || report.id}</td>
                          <td>{report.report_type}</td>
                          <td><span className={`${s.badge} ${s[badgeKey]}`}>{report.status}</span></td>
                          <td>{report.created_at ? new Date(report.created_at).toLocaleDateString() : '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {(report.status === 'DRAFT' || report.status === 'PENDING_APPROVAL') && (
                                <button
                                  className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                  disabled={actionLoading[report.id + 'approve']}
                                  onClick={() => handleAction(report, 'approve')}
                                >
                                  <Check size={12} /> {actionLoading[report.id + 'approve'] ? '...' : 'Approve'}
                                </button>
                              )}
                              {report.status === 'APPROVED' && (
                                <button
                                  className={`${s.btn} ${s.btnSuccess} ${s.btnSm}`}
                                  disabled={actionLoading[report.id + 'release']}
                                  onClick={() => handleAction(report, 'release')}
                                >
                                  <Check size={12} /> {actionLoading[report.id + 'release'] ? '...' : 'Release'}
                                </button>
                              )}
                              <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => handleDownloadPDF(report)}>
                                <Download size={12} /> PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsTab;
