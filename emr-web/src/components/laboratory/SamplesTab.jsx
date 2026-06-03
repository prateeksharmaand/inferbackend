/**
 * SamplesTab - Register Samples & Custody Chain
 */

import React, { useState, useCallback } from 'react';
import { Plus, Search, RefreshCw, X, Copy, Check, AlertTriangle, Clock } from 'lucide-react';

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

const SPECIMEN_TYPES = ['BLOOD', 'URINE', 'STOOL', 'TISSUE', 'SWAB', 'CSF', 'OTHER'];
const CUSTODY_ACTIONS = ['COLLECTED', 'TRANSPORTED', 'RECEIVED', 'PROCESSED', 'STORED'];

export function SamplesTab({ labId }) {
  const [activeSection, setActiveSection] = useState('register'); // 'register' | 'list' | 'custody'

  // Register form
  const [regForm, setRegForm] = useState({
    order_id: '',
    patient_id: '',
    specimen_type: 'BLOOD',
    collection_method: '',
    collection_site: '',
    volume_ml: '',
    container_type: '',
    notes: '',
  });
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState(null); // { sample_id, barcode }
  const [copied, setCopied] = useState(false);

  // Samples list
  const [searchOrderId, setSearchOrderId] = useState('');
  const [searchSampleId, setSearchSampleId] = useState('');
  const [samples, setSamples] = useState([]);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samplesError, setSamplesError] = useState('');

  // Status update
  const [statusSample, setStatusSample] = useState(null);
  const [newSampleStatus, setNewSampleStatus] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Reject
  const [rejectSample, setRejectSample] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // Custody
  const [custodySampleId, setCustodySampleId] = useState('');
  const [custodyEvents, setCustodyEvents] = useState([]);
  const [custodyLoading, setCustodyLoading] = useState(false);
  const [custodyError, setCustodyError] = useState('');
  const [custodyForm, setCustodyForm] = useState({ action: 'COLLECTED', location: '', notes: '' });
  const [custodySubmitting, setCustodySubmitting] = useState(false);
  const [custodyFormError, setCustodyFormError] = useState('');
  const [custodyFormSuccess, setCustodyFormSuccess] = useState('');

  const handleRegFormChange = (e) => {
    setRegForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleRegisterSample = async (e) => {
    e.preventDefault();
    if (!regForm.order_id || !regForm.patient_id) {
      setRegError('Order ID and Patient ID are required');
      return;
    }
    try {
      setRegLoading(true);
      setRegError('');
      setRegSuccess(null);
      const data = await apiFetch('/api/v1/samples', {
        method: 'POST',
        body: JSON.stringify({ ...regForm, lab_id: labId }),
      });
      setRegSuccess(data.sample || data);
      setRegForm({ order_id: '', patient_id: '', specimen_type: 'BLOOD', collection_method: '', collection_site: '', volume_ml: '', container_type: '', notes: '' });
    } catch (err) {
      setRegError(err.message);
    } finally {
      setRegLoading(false);
    }
  };

  const handleCopyId = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const fetchSamplesByOrder = async () => {
    if (!searchOrderId) return;
    try {
      setSamplesLoading(true);
      setSamplesError('');
      const data = await apiFetch(`/api/v1/orders/${searchOrderId}/samples`);
      setSamples(data.samples || data || []);
    } catch (err) {
      setSamplesError(err.message);
    } finally {
      setSamplesLoading(false);
    }
  };

  const fetchSampleById = async () => {
    if (!searchSampleId) return;
    try {
      setSamplesLoading(true);
      setSamplesError('');
      const data = await apiFetch(`/api/v1/samples/${searchSampleId}`);
      setSamples(data.sample ? [data.sample] : data ? [data] : []);
    } catch (err) {
      setSamplesError(err.message);
    } finally {
      setSamplesLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!newSampleStatus) return;
    try {
      setStatusLoading(true);
      setStatusError('');
      await apiFetch(`/api/v1/samples/${statusSample.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newSampleStatus }),
      });
      setStatusSample(null);
      if (searchOrderId) fetchSamplesByOrder();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason) {
      setRejectError('Rejection reason is required');
      return;
    }
    try {
      setRejectLoading(true);
      setRejectError('');
      await apiFetch(`/api/v1/samples/${rejectSample.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });
      setRejectSample(null);
      if (searchOrderId) fetchSamplesByOrder();
    } catch (err) {
      setRejectError(err.message);
    } finally {
      setRejectLoading(false);
    }
  };

  const fetchCustody = async () => {
    if (!custodySampleId) return;
    try {
      setCustodyLoading(true);
      setCustodyError('');
      const data = await apiFetch(`/api/v1/samples/${custodySampleId}/custody`);
      setCustodyEvents(data.custody_chain || data.custody || data || []);
    } catch (err) {
      setCustodyError(err.message);
    } finally {
      setCustodyLoading(false);
    }
  };

  const handleAddCustodyEvent = async (e) => {
    e.preventDefault();
    if (!custodySampleId) {
      setCustodyFormError('Enter a Sample ID first');
      return;
    }
    try {
      setCustodySubmitting(true);
      setCustodyFormError('');
      setCustodyFormSuccess('');
      await apiFetch(`/api/v1/samples/${custodySampleId}/custody`, {
        method: 'POST',
        body: JSON.stringify(custodyForm),
      });
      setCustodyFormSuccess('Custody event added');
      setCustodyForm({ action: 'COLLECTED', location: '', notes: '' });
      fetchCustody();
    } catch (err) {
      setCustodyFormError(err.message);
    } finally {
      setCustodySubmitting(false);
    }
  };

  const SAMPLE_STATUSES = ['COLLECTED', 'RECEIVED', 'PROCESSING', 'COMPLETED', 'REJECTED'];

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', color: '#333', fontSize: 22 }}>Sample Management</h2>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #eee', paddingBottom: 10 }}>
        {[['register', 'Register Sample'], ['list', 'Sample List'], ['custody', 'Custody Chain']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveSection(key)} style={{
            padding: '7px 18px', borderRadius: 4, border: '1px solid',
            borderColor: activeSection === key ? '#007bff' : '#ddd',
            background: activeSection === key ? '#e9f4ff' : 'white',
            color: activeSection === key ? '#007bff' : '#555',
            cursor: 'pointer', fontWeight: activeSection === key ? 600 : 400, fontSize: 14,
          }}>{label}</button>
        ))}
      </div>

      {/* Register Sample */}
      {activeSection === 'register' && (
        <div style={s.card}>
          <h3 style={{ marginTop: 0, color: '#444' }}>Register New Sample</h3>
          {regError && <div style={s.alertDanger}>{regError}</div>}
          {regSuccess && (
            <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 6, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: '#2e7d32', marginBottom: 6 }}>Sample Registered Successfully</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 15, color: '#333' }}>
                  ID: <strong>{regSuccess.sample_id || regSuccess.id}</strong>
                </span>
                <button onClick={() => handleCopyId(regSuccess.sample_id || regSuccess.id)} style={{ ...s.btnSmall, background: copied ? '#c8e6c9' : '#e9f0ff' }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              {regSuccess.barcode && (
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#555' }}>Barcode: {regSuccess.barcode}</div>
              )}
            </div>
          )}
          <form onSubmit={handleRegisterSample}>
            <div style={s.row}>
              <div style={s.fg}>
                <label style={s.label}>Order ID *</label>
                <input style={s.input} name="order_id" value={regForm.order_id} onChange={handleRegFormChange} placeholder="ORD-123" disabled={regLoading} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Patient ID *</label>
                <input style={s.input} name="patient_id" value={regForm.patient_id} onChange={handleRegFormChange} placeholder="patient-456" disabled={regLoading} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Specimen Type</label>
                <select style={s.input} name="specimen_type" value={regForm.specimen_type} onChange={handleRegFormChange} disabled={regLoading}>
                  {SPECIMEN_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={s.row}>
              <div style={s.fg}>
                <label style={s.label}>Collection Method</label>
                <input style={s.input} name="collection_method" value={regForm.collection_method} onChange={handleRegFormChange} placeholder="Venipuncture" disabled={regLoading} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Collection Site</label>
                <input style={s.input} name="collection_site" value={regForm.collection_site} onChange={handleRegFormChange} placeholder="Left arm" disabled={regLoading} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Volume (ml)</label>
                <input style={s.input} type="number" step="0.1" name="volume_ml" value={regForm.volume_ml} onChange={handleRegFormChange} placeholder="5.0" disabled={regLoading} />
              </div>
            </div>
            <div style={s.row}>
              <div style={s.fg}>
                <label style={s.label}>Container Type</label>
                <input style={s.input} name="container_type" value={regForm.container_type} onChange={handleRegFormChange} placeholder="EDTA tube" disabled={regLoading} />
              </div>
              <div style={{ ...s.fg, flex: 2 }}>
                <label style={s.label}>Notes</label>
                <textarea style={{ ...s.input, height: 68, resize: 'vertical' }} name="notes" value={regForm.notes} onChange={handleRegFormChange} placeholder="Additional notes..." disabled={regLoading} />
              </div>
            </div>
            <button type="submit" style={{ ...s.btnPrimary, width: '100%', justifyContent: 'center', padding: 11 }} disabled={regLoading}>
              {regLoading ? 'Registering...' : 'Register Sample'}
            </button>
          </form>
        </div>
      )}

      {/* Sample List */}
      {activeSection === 'list' && (
        <div>
          <div style={s.card}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={s.label}>Search by Order ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={s.input} value={searchOrderId} onChange={(e) => setSearchOrderId(e.target.value)} placeholder="ORD-123" onKeyDown={(e) => e.key === 'Enter' && fetchSamplesByOrder()} />
                  <button style={s.btnPrimary} onClick={fetchSamplesByOrder}><Search size={15} /></button>
                </div>
              </div>
              <div style={{ color: '#999', alignSelf: 'center', paddingBottom: 2 }}>or</div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={s.label}>Search by Sample ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={s.input} value={searchSampleId} onChange={(e) => setSearchSampleId(e.target.value)} placeholder="SAM-123" onKeyDown={(e) => e.key === 'Enter' && fetchSampleById()} />
                  <button style={s.btnPrimary} onClick={fetchSampleById}><Search size={15} /></button>
                </div>
              </div>
            </div>
          </div>

          {samplesError && <div style={s.alertDanger}>{samplesError}</div>}
          {samplesLoading ? (
            <div style={s.empty}>Loading samples...</div>
          ) : samples.length === 0 ? (
            <div style={s.empty}>No samples found. Search by Order ID or Sample ID above.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr style={{ background: '#f5f6fa' }}>
                    {['Sample ID', 'Specimen', 'Status', 'Collected At', 'Actions'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {samples.map((sample) => (
                    <tr key={sample.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 600 }}>{sample.sample_id || sample.id}</td>
                      <td style={s.td}>{sample.specimen_type}</td>
                      <td style={s.td}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                          background: sample.status === 'REJECTED' ? '#ffeaea' : sample.status === 'COMPLETED' ? '#e8f5e9' : '#fff3e0',
                          color: sample.status === 'REJECTED' ? '#c62828' : sample.status === 'COMPLETED' ? '#2e7d32' : '#e65100',
                        }}>{sample.status}</span>
                      </td>
                      <td style={s.td}>{sample.collected_at ? new Date(sample.collected_at).toLocaleString() : '—'}</td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button style={s.btnSmall} onClick={() => { setStatusSample(sample); setNewSampleStatus(SAMPLE_STATUSES[0]); setStatusError(''); }}>
                            Update Status
                          </button>
                          <button style={{ ...s.btnSmall, background: '#ffeaea', color: '#c62828', borderColor: '#ffcdd2' }} onClick={() => { setRejectSample(sample); setRejectReason(''); setRejectError(''); }}>
                            <AlertTriangle size={12} style={{ marginRight: 3 }} />Reject
                          </button>
                          <button style={{ ...s.btnSmall, background: '#f3f0ff', color: '#5c35cc', borderColor: '#d1c4e9' }} onClick={() => { setCustodySampleId(sample.sample_id || sample.id); setActiveSection('custody'); fetchCustody(); }}>
                            View Custody
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

      {/* Custody Chain */}
      {activeSection === 'custody' && (
        <div>
          <div style={s.card}>
            <h3 style={{ marginTop: 0 }}>Add Custody Event</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Sample ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={s.input} value={custodySampleId} onChange={(e) => setCustodySampleId(e.target.value)} placeholder="SAM-123" />
                  <button style={s.btnSecondary} onClick={fetchCustody}><Search size={15} /></button>
                </div>
              </div>
            </div>
            {custodyFormError && <div style={s.alertDanger}>{custodyFormError}</div>}
            {custodyFormSuccess && <div style={s.alertSuccess}>{custodyFormSuccess}</div>}
            <form onSubmit={handleAddCustodyEvent}>
              <div style={s.row}>
                <div style={s.fg}>
                  <label style={s.label}>Action</label>
                  <select style={s.input} value={custodyForm.action} onChange={(e) => setCustodyForm((p) => ({ ...p, action: e.target.value }))} disabled={custodySubmitting}>
                    {CUSTODY_ACTIONS.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Location</label>
                  <input style={s.input} value={custodyForm.location} onChange={(e) => setCustodyForm((p) => ({ ...p, location: e.target.value }))} placeholder="Lab Room A" disabled={custodySubmitting} />
                </div>
                <div style={{ ...s.fg, flex: 2 }}>
                  <label style={s.label}>Notes</label>
                  <input style={s.input} value={custodyForm.notes} onChange={(e) => setCustodyForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" disabled={custodySubmitting} />
                </div>
              </div>
              <button type="submit" style={s.btnPrimary} disabled={custodySubmitting}>
                <Plus size={14} style={{ marginRight: 4 }} />
                {custodySubmitting ? 'Adding...' : 'Add Event'}
              </button>
            </form>
          </div>

          {custodyError && <div style={s.alertDanger}>{custodyError}</div>}
          {custodyLoading ? (
            <div style={s.empty}>Loading custody chain...</div>
          ) : custodySampleId && custodyEvents.length === 0 ? (
            <div style={s.empty}>No custody events found</div>
          ) : custodyEvents.length > 0 ? (
            <div style={s.card}>
              <h3 style={{ marginTop: 0, color: '#444' }}>Custody Chain — {custodySampleId}</h3>
              {custodyEvents.map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#007bff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={13} color="white" />
                    </div>
                    {i < custodyEvents.length - 1 && <div style={{ width: 2, flex: 1, background: '#ddd', minHeight: 14 }} />}
                  </div>
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontWeight: 600, color: '#333' }}>{ev.action || ev.event}</div>
                    {ev.location && <div style={{ color: '#555', fontSize: 13, marginTop: 1 }}>📍 {ev.location}</div>}
                    {ev.notes && <div style={{ color: '#777', fontSize: 13, marginTop: 1 }}>{ev.notes}</div>}
                    <div style={{ color: '#999', fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} />{ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}{ev.created_by ? ` · ${ev.created_by}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Update Status Modal */}
      {statusSample && (
        <div style={s.overlay} onClick={() => setStatusSample(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Update Sample Status</h3>
              <button onClick={() => setStatusSample(null)} style={s.iconBtn}><X size={18} /></button>
            </div>
            <p style={{ color: '#666', margin: '0 0 14px' }}>Sample: <strong>{statusSample.sample_id || statusSample.id}</strong></p>
            {statusError && <div style={s.alertDanger}>{statusError}</div>}
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>New Status</label>
              <select style={s.input} value={newSampleStatus} onChange={(e) => setNewSampleStatus(e.target.value)}>
                {SAMPLE_STATUSES.map((st) => <option key={st}>{st}</option>)}
              </select>
            </div>
            <button style={{ ...s.btnPrimary, width: '100%', justifyContent: 'center' }} onClick={handleUpdateStatus} disabled={statusLoading}>
              {statusLoading ? 'Updating...' : 'Update Status'}
            </button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectSample && (
        <div style={s.overlay} onClick={() => setRejectSample(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: '#c62828' }}>
                <AlertTriangle size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Reject Sample
              </h3>
              <button onClick={() => setRejectSample(null)} style={s.iconBtn}><X size={18} /></button>
            </div>
            <p style={{ color: '#666', margin: '0 0 14px' }}>Sample: <strong>{rejectSample.sample_id || rejectSample.id}</strong></p>
            {rejectError && <div style={s.alertDanger}>{rejectError}</div>}
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Rejection Reason *</label>
              <textarea style={{ ...s.input, height: 80, resize: 'vertical' }} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Hemolysis, insufficient volume, wrong container..." />
            </div>
            <button style={{ ...s.btnPrimary, width: '100%', justifyContent: 'center', background: '#c62828' }} onClick={handleReject} disabled={rejectLoading}>
              {rejectLoading ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  card: { background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 8, padding: 22, marginBottom: 20 },
  row: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 4 },
  fg: { flex: 1, minWidth: 160, marginBottom: 12 },
  label: { display: 'block', marginBottom: 4, fontWeight: 600, color: '#333', fontSize: 14 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' },
  btnPrimary: { padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 },
  btnSecondary: { padding: '8px 14px', background: 'white', color: '#555', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 },
  btnSmall: { padding: '4px 10px', background: '#e9f0ff', color: '#007bff', border: '1px solid #b3cfff', borderRadius: 4, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 4, display: 'flex', alignItems: 'center' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 13, borderBottom: '2px solid #eee' },
  td: { padding: '10px 12px', color: '#333' },
  empty: { textAlign: 'center', padding: 40, color: '#999', fontSize: 15 },
  alertDanger: { background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  alertSuccess: { background: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: 'white', borderRadius: 8, padding: 28, width: '90%', maxWidth: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxHeight: '85vh', overflowY: 'auto' },
};

export default SamplesTab;
