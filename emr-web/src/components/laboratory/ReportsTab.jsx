/**
 * ReportsTab - Generate, Approve & Release Lab Reports + Trend Viewer
 */

import React, { useState, useCallback } from 'react';
import { Plus, Search, Download, Check, RefreshCw, X, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
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

const STATUS_COLORS = {
  DRAFT: '#6c757d',
  PENDING_APPROVAL: '#ffc107',
  APPROVED: '#007bff',
  RELEASED: '#28a745',
};

export function ReportsTab({ labId }) {
  const [activeSection, setActiveSection] = useState('list'); // 'list' | 'create' | 'trends'

  // Create form
  const [form, setForm] = useState({
    order_id: '',
    patient_id: '',
    doctor_id: '',
    report_type: 'FINAL',
    clinical_notes: '',
    observations: '',
    recommendations: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Reports list
  const [searchPatientId, setSearchPatientId] = useState('');
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');

  // Action feedback
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState('');

  // Trends
  const [trendPatientId, setTrendPatientId] = useState('');
  const [trendTestCode, setTrendTestCode] = useState('');
  const [trendMonths, setTrendMonths] = useState('6');
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');

  const handleFormChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleCreateReport = async (e) => {
    e.preventDefault();
    if (!form.order_id || !form.patient_id) {
      setCreateError('Order ID and Patient ID are required');
      return;
    }
    try {
      setCreating(true);
      setCreateError('');
      setCreateSuccess('');
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

  const fetchReports = async () => {
    if (!searchPatientId) return;
    try {
      setReportsLoading(true);
      setReportsError('');
      setActionError('');
      const data = await apiFetch(`/api/v1/patients/${searchPatientId}/reports`);
      setReports(data.reports || data || []);
    } catch (err) {
      setReportsError(err.message);
    } finally {
      setReportsLoading(false);
    }
  };

  const handleAction = async (report, action) => {
    const endpoint = `/api/v1/reports/${report.id}/${action}`;
    try {
      setActionLoading((p) => ({ ...p, [report.id + action]: true }));
      setActionError('');
      await apiFetch(endpoint, { method: 'POST' });
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

  const fetchTrends = async () => {
    if (!trendPatientId || !trendTestCode) {
      setTrendError('Patient ID and Test Code are required');
      return;
    }
    try {
      setTrendLoading(true);
      setTrendError('');
      const data = await apiFetch(
        `/api/v1/patients/${trendPatientId}/trends/${trendTestCode}?months=${trendMonths}`
      );
      setTrendData(data);
    } catch (err) {
      setTrendError(err.message);
    } finally {
      setTrendLoading(false);
    }
  };

  const chartData = trendData?.results?.map((r) => ({
    date: new Date(r.result_date || r.created_at).toLocaleDateString(),
    value: parseFloat(r.result_value),
  })) || [];

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', color: '#333', fontSize: 22 }}>Lab Reports</h2>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #eee', paddingBottom: 10 }}>
        {[['list', 'Reports List'], ['create', 'Create Report'], ['trends', 'Trend Viewer']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveSection(key)} style={{
            padding: '7px 18px', borderRadius: 4, border: '1px solid',
            borderColor: activeSection === key ? '#007bff' : '#ddd',
            background: activeSection === key ? '#e9f4ff' : 'white',
            color: activeSection === key ? '#007bff' : '#555',
            cursor: 'pointer', fontWeight: activeSection === key ? 600 : 400, fontSize: 14,
          }}>{label}</button>
        ))}
      </div>

      {/* Create Report */}
      {activeSection === 'create' && (
        <div style={s.card}>
          <h3 style={{ marginTop: 0, color: '#444' }}>Create New Report</h3>
          {createError && <div style={s.alertDanger}>{createError}</div>}
          {createSuccess && <div style={s.alertSuccess}>{createSuccess}</div>}
          <form onSubmit={handleCreateReport}>
            <div style={s.row}>
              <div style={s.fg}>
                <label style={s.label}>Order ID *</label>
                <input style={s.input} name="order_id" value={form.order_id} onChange={handleFormChange} placeholder="ORD-123" disabled={creating} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Patient ID *</label>
                <input style={s.input} name="patient_id" value={form.patient_id} onChange={handleFormChange} placeholder="patient-456" disabled={creating} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Ordering Doctor ID</label>
                <input style={s.input} name="doctor_id" value={form.doctor_id} onChange={handleFormChange} placeholder="doctor-789" disabled={creating} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Report Type</label>
                <select style={s.input} name="report_type" value={form.report_type} onChange={handleFormChange} disabled={creating}>
                  <option>PRELIMINARY</option>
                  <option>FINAL</option>
                  <option>AMENDED</option>
                </select>
              </div>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Clinical Notes</label>
              <textarea style={{ ...s.input, height: 70, resize: 'vertical' }} name="clinical_notes" value={form.clinical_notes} onChange={handleFormChange} placeholder="Clinical context..." disabled={creating} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Observations</label>
              <textarea style={{ ...s.input, height: 80, resize: 'vertical' }} name="observations" value={form.observations} onChange={handleFormChange} placeholder="Lab findings and observations..." disabled={creating} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Recommendations</label>
              <textarea style={{ ...s.input, height: 70, resize: 'vertical' }} name="recommendations" value={form.recommendations} onChange={handleFormChange} placeholder="Clinical recommendations..." disabled={creating} />
            </div>
            <button type="submit" style={{ ...s.btnPrimary, width: '100%', justifyContent: 'center', padding: 11 }} disabled={creating}>
              {creating ? 'Creating...' : 'Create Report'}
            </button>
          </form>
        </div>
      )}

      {/* Reports List */}
      {activeSection === 'list' && (
        <div>
          <div style={s.card}>
            <label style={s.label}>Patient ID</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={s.input} value={searchPatientId} onChange={(e) => setSearchPatientId(e.target.value)} placeholder="patient-123" onKeyDown={(e) => e.key === 'Enter' && fetchReports()} />
              <button style={s.btnPrimary} onClick={fetchReports}><Search size={15} style={{ marginRight: 5 }} />Search</button>
            </div>
          </div>
          {actionError && <div style={s.alertDanger}>{actionError}</div>}
          {reportsError && <div style={s.alertDanger}>{reportsError}</div>}
          {reportsLoading ? (
            <div style={s.empty}>Loading reports...</div>
          ) : reports.length === 0 && searchPatientId ? (
            <div style={s.empty}>No reports found for this patient</div>
          ) : reports.length === 0 ? (
            <div style={s.empty}>Enter a Patient ID above to load reports</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr style={{ background: '#f5f6fa' }}>
                    {['Report #', 'Type', 'Status', 'Created', 'Actions'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{report.report_number || report.id}</td>
                      <td style={s.td}>{report.report_type}</td>
                      <td style={s.td}>
                        <span style={{
                          padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                          background: (STATUS_COLORS[report.status] || '#888') + '22',
                          color: STATUS_COLORS[report.status] || '#888',
                          border: `1px solid ${STATUS_COLORS[report.status] || '#888'}`,
                        }}>{report.status}</span>
                      </td>
                      <td style={s.td}>{report.created_at ? new Date(report.created_at).toLocaleDateString() : '—'}</td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {(report.status === 'DRAFT' || report.status === 'PENDING_APPROVAL') && (
                            <button
                              style={{ ...s.btnSmall, background: '#e9f4ff', color: '#007bff', borderColor: '#b3d9ff' }}
                              disabled={actionLoading[report.id + 'approve']}
                              onClick={() => handleAction(report, 'approve')}
                            >
                              <Check size={13} style={{ marginRight: 3 }} />
                              {actionLoading[report.id + 'approve'] ? '...' : 'Approve'}
                            </button>
                          )}
                          {report.status === 'APPROVED' && (
                            <button
                              style={{ ...s.btnSmall, background: '#e8f5e9', color: '#2e7d32', borderColor: '#a5d6a7' }}
                              disabled={actionLoading[report.id + 'release']}
                              onClick={() => handleAction(report, 'release')}
                            >
                              <Check size={13} style={{ marginRight: 3 }} />
                              {actionLoading[report.id + 'release'] ? '...' : 'Release'}
                            </button>
                          )}
                          <button
                            style={{ ...s.btnSmall, background: '#f5f5f5', color: '#555', borderColor: '#ddd' }}
                            onClick={() => handleDownloadPDF(report)}
                          >
                            <Download size={13} style={{ marginRight: 3 }} />PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Trend Viewer */}
      {activeSection === 'trends' && (
        <div>
          <div style={s.card}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={20} color="#007bff" />Result Trends
            </h3>
            {trendError && <div style={s.alertDanger}>{trendError}</div>}
            <div style={s.row}>
              <div style={s.fg}>
                <label style={s.label}>Patient ID</label>
                <input style={s.input} value={trendPatientId} onChange={(e) => setTrendPatientId(e.target.value)} placeholder="patient-123" />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Test Code</label>
                <input style={s.input} value={trendTestCode} onChange={(e) => setTrendTestCode(e.target.value)} placeholder="HB, GLUCOSE, TSH..." />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Months</label>
                <select style={s.input} value={trendMonths} onChange={(e) => setTrendMonths(e.target.value)}>
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </select>
              </div>
              <div style={{ alignSelf: 'flex-end', marginBottom: 12 }}>
                <button style={s.btnPrimary} onClick={fetchTrends} disabled={trendLoading}>
                  <Search size={14} style={{ marginRight: 5 }} />
                  {trendLoading ? 'Loading...' : 'Load Trends'}
                </button>
              </div>
            </div>
          </div>

          {trendData && chartData.length > 0 && (
            <div style={s.card}>
              <h4 style={{ marginTop: 0, color: '#444' }}>
                {trendTestCode} — {trendData.test_name || ''} ({trendData.unit || ''})
              </h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {trendData.reference_range_high && (
                    <ReferenceLine y={parseFloat(trendData.reference_range_high)} stroke="#e53935" strokeDasharray="5 5" label={{ value: `High: ${trendData.reference_range_high}`, position: 'right', fontSize: 11, fill: '#e53935' }} />
                  )}
                  {trendData.reference_range_low && (
                    <ReferenceLine y={parseFloat(trendData.reference_range_low)} stroke="#1565c0" strokeDasharray="5 5" label={{ value: `Low: ${trendData.reference_range_low}`, position: 'right', fontSize: 11, fill: '#1565c0' }} />
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#007bff"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#007bff' }}
                    activeDot={{ r: 6 }}
                    name={trendData.test_name || trendTestCode}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 12, color: '#888', marginTop: 8, textAlign: 'center' }}>
                Reference Range: {trendData.reference_range_low || '?'} – {trendData.reference_range_high || '?'} {trendData.unit || ''}
              </div>
            </div>
          )}
          {trendData && chartData.length === 0 && !trendLoading && (
            <div style={s.empty}>No trend data found for the selected test and time range</div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  card: { background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 8, padding: 22, marginBottom: 20 },
  row: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 4 },
  fg: { flex: 1, minWidth: 160, marginBottom: 12 },
  formGroup: { marginBottom: 14 },
  label: { display: 'block', marginBottom: 4, fontWeight: 600, color: '#333', fontSize: 14 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' },
  btnPrimary: { padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 },
  btnSmall: { padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', border: '1px solid' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 13, borderBottom: '2px solid #eee' },
  td: { padding: '10px 12px', color: '#333' },
  empty: { textAlign: 'center', padding: 40, color: '#999', fontSize: 15 },
  alertDanger: { background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  alertSuccess: { background: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
};

export default ReportsTab;
