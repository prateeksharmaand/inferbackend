/**
 * SamplesTab - Register Samples & Custody Chain
 */

import React, { useState, useCallback } from 'react';
import { Plus, Search, X, Copy, Check, AlertTriangle, Clock, FlaskConical } from 'lucide-react';

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
const SAMPLE_STATUSES = ['COLLECTED', 'RECEIVED', 'PROCESSING', 'COMPLETED', 'REJECTED'];

function sampleStatusBadgeClass(status, s) {
  if (status === 'REJECTED') return `${s.badge} ${s.badgeRed}`;
  if (status === 'COMPLETED') return `${s.badge} ${s.badgeGreen}`;
  if (status === 'PROCESSING') return `${s.badge} ${s.badgeYellow}`;
  if (status === 'RECEIVED') return `${s.badge} ${s.badgeBlue}`;
  return `${s.badge} ${s.badgeGray}`;
}

export function SamplesTab({ labId, styles: s }) {
  const [activeSection, setActiveSection] = useState('register');

  const [regForm, setRegForm] = useState({
    order_id: '', patient_id: '', specimen_type: 'BLOOD',
    collection_method: '', collection_site: '', volume_ml: '',
    container_type: '', notes: '',
  });
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState(null);
  const [copied, setCopied] = useState(false);

  const [searchOrderId, setSearchOrderId] = useState('');
  const [searchSampleId, setSearchSampleId] = useState('');
  const [samples, setSamples] = useState([]);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samplesError, setSamplesError] = useState('');

  const [statusSample, setStatusSample] = useState(null);
  const [newSampleStatus, setNewSampleStatus] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');

  const [rejectSample, setRejectSample] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState('');

  const [custodySampleId, setCustodySampleId] = useState('');
  const [custodyEvents, setCustodyEvents] = useState([]);
  const [custodyLoading, setCustodyLoading] = useState(false);
  const [custodyError, setCustodyError] = useState('');
  const [custodyForm, setCustodyForm] = useState({ action: 'COLLECTED', location: '', notes: '' });
  const [custodySubmitting, setCustodySubmitting] = useState(false);
  const [custodyFormError, setCustodyFormError] = useState('');
  const [custodyFormSuccess, setCustodyFormSuccess] = useState('');

  const handleRegFormChange = (e) => setRegForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleRegisterSample = async (e) => {
    e.preventDefault();
    if (!regForm.order_id || !regForm.patient_id) { setRegError('Order ID and Patient ID are required'); return; }
    try {
      setRegLoading(true); setRegError(''); setRegSuccess(null);
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
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const fetchSamplesByOrder = async () => {
    if (!searchOrderId) return;
    try {
      setSamplesLoading(true); setSamplesError('');
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
      setSamplesLoading(true); setSamplesError('');
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
      setStatusLoading(true); setStatusError('');
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
    if (!rejectReason) { setRejectError('Rejection reason is required'); return; }
    try {
      setRejectLoading(true); setRejectError('');
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

  const fetchCustody = useCallback(async () => {
    if (!custodySampleId) return;
    try {
      setCustodyLoading(true); setCustodyError('');
      const data = await apiFetch(`/api/v1/samples/${custodySampleId}/custody`);
      setCustodyEvents(data.custody_chain || data.custody || data || []);
    } catch (err) {
      setCustodyError(err.message);
    } finally {
      setCustodyLoading(false);
    }
  }, [custodySampleId]);

  const handleAddCustodyEvent = async (e) => {
    e.preventDefault();
    if (!custodySampleId) { setCustodyFormError('Enter a Sample ID first'); return; }
    try {
      setCustodySubmitting(true); setCustodyFormError(''); setCustodyFormSuccess('');
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

  const sections = [['register', 'Register Sample'], ['list', 'Sample List'], ['custody', 'Custody Chain']];

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Sample Management</div>
          <div className={s.pageSubtitle}>Register samples and track chain of custody</div>
        </div>
      </div>

      <div className={s.sectionTabs}>
        {sections.map(([key, label]) => (
          <button key={key} className={`${s.sectionTab} ${activeSection === key ? s.sectionTabActive : ''}`} onClick={() => setActiveSection(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Register Sample */}
      {activeSection === 'register' && (
        <div className={s.card}>
          <div className={s.cardHeader}><div className={s.cardTitle}>Register New Sample</div></div>
          <div className={s.cardBody}>
            {regError && <div className={`${s.alert} ${s.alertError}`}>{regError}</div>}
            {regSuccess && (
              <div className={`${s.alert} ${s.alertSuccess}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <strong>Sample Registered:</strong>{' '}
                  <span style={{ fontFamily: 'monospace' }}>{regSuccess.sample_id || regSuccess.id}</span>
                  {regSuccess.barcode && <span style={{ marginLeft: 12, color: 'var(--color-text-2)' }}>Barcode: {regSuccess.barcode}</span>}
                </div>
                <button className={s.copyBtn} onClick={() => handleCopyId(regSuccess.sample_id || regSuccess.id)}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy ID'}
                </button>
              </div>
            )}
            <form onSubmit={handleRegisterSample}>
              <div className={s.formGrid3} style={{ marginBottom: 12 }}>
                <div className={s.field}>
                  <label className={s.label}>Order ID *</label>
                  <input className={s.input} name="order_id" value={regForm.order_id} onChange={handleRegFormChange} placeholder="ORD-123" disabled={regLoading} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Patient ID *</label>
                  <input className={s.input} name="patient_id" value={regForm.patient_id} onChange={handleRegFormChange} placeholder="patient-456" disabled={regLoading} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Specimen Type</label>
                  <select className={s.select} name="specimen_type" value={regForm.specimen_type} onChange={handleRegFormChange} disabled={regLoading}>
                    {SPECIMEN_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className={s.formGrid3} style={{ marginBottom: 12 }}>
                <div className={s.field}>
                  <label className={s.label}>Collection Method</label>
                  <input className={s.input} name="collection_method" value={regForm.collection_method} onChange={handleRegFormChange} placeholder="Venipuncture" disabled={regLoading} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Collection Site</label>
                  <input className={s.input} name="collection_site" value={regForm.collection_site} onChange={handleRegFormChange} placeholder="Left arm" disabled={regLoading} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Volume (ml)</label>
                  <input className={s.input} type="number" step="0.1" name="volume_ml" value={regForm.volume_ml} onChange={handleRegFormChange} placeholder="5.0" disabled={regLoading} />
                </div>
              </div>
              <div className={s.formGrid} style={{ marginBottom: 14 }}>
                <div className={s.field}>
                  <label className={s.label}>Container Type</label>
                  <input className={s.input} name="container_type" value={regForm.container_type} onChange={handleRegFormChange} placeholder="EDTA tube" disabled={regLoading} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Notes</label>
                  <textarea className={s.textarea} name="notes" value={regForm.notes} onChange={handleRegFormChange} placeholder="Additional notes..." disabled={regLoading} style={{ minHeight: 68 }} />
                </div>
              </div>
              <div className={s.formActions}>
                <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={regLoading}>
                  <Plus size={14} /> {regLoading ? 'Registering...' : 'Register Sample'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sample List */}
      {activeSection === 'list' && (
        <div>
          <div className={s.card} style={{ marginBottom: 16 }}>
            <div className={s.cardBody}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className={s.field} style={{ flex: 1, minWidth: 200 }}>
                  <label className={s.label}>Search by Order ID</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className={s.input} value={searchOrderId} onChange={(e) => setSearchOrderId(e.target.value)} placeholder="ORD-123" onKeyDown={(e) => e.key === 'Enter' && fetchSamplesByOrder()} />
                    <button className={`${s.btn} ${s.btnPrimary}`} onClick={fetchSamplesByOrder}><Search size={14} /></button>
                  </div>
                </div>
                <div style={{ color: 'var(--color-text-3)', paddingBottom: 2 }}>or</div>
                <div className={s.field} style={{ flex: 1, minWidth: 200 }}>
                  <label className={s.label}>Search by Sample ID</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className={s.input} value={searchSampleId} onChange={(e) => setSearchSampleId(e.target.value)} placeholder="SAM-123" onKeyDown={(e) => e.key === 'Enter' && fetchSampleById()} />
                    <button className={`${s.btn} ${s.btnPrimary}`} onClick={fetchSampleById}><Search size={14} /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {samplesError && <div className={`${s.alert} ${s.alertError}`}>{samplesError}</div>}
          <div className={s.card}>
            {samplesLoading ? (
              <div className={s.emptyState}><div className={s.emptyText}>Loading samples...</div></div>
            ) : samples.length === 0 ? (
              <div className={s.emptyState}>
                <div className={s.emptyIcon}><FlaskConical size={48} /></div>
                <div className={s.emptyText}>No samples found. Search by Order ID or Sample ID above.</div>
              </div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>{['Sample ID', 'Specimen', 'Status', 'Collected At', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {samples.map((sample) => (
                      <tr key={sample.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sample.sample_id || sample.id}</td>
                        <td>{sample.specimen_type}</td>
                        <td><span className={sampleStatusBadgeClass(sample.status, s)}>{sample.status}</span></td>
                        <td>{sample.collected_at ? new Date(sample.collected_at).toLocaleString() : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => { setStatusSample(sample); setNewSampleStatus(SAMPLE_STATUSES[0]); setStatusError(''); }}>
                              Update Status
                            </button>
                            <button className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={() => { setRejectSample(sample); setRejectReason(''); setRejectError(''); }}>
                              <AlertTriangle size={12} /> Reject
                            </button>
                            <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => { setCustodySampleId(sample.sample_id || sample.id); setActiveSection('custody'); }}>
                              Custody
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
        </div>
      )}

      {/* Custody Chain */}
      {activeSection === 'custody' && (
        <div>
          <div className={s.card} style={{ marginBottom: 16 }}>
            <div className={s.cardHeader}><div className={s.cardTitle}>Add Custody Event</div></div>
            <div className={s.cardBody}>
              <div className={s.field} style={{ marginBottom: 16 }}>
                <label className={s.label}>Sample ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className={s.input} value={custodySampleId} onChange={(e) => setCustodySampleId(e.target.value)} placeholder="SAM-123" />
                  <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchCustody}><Search size={14} /></button>
                </div>
              </div>
              {custodyFormError && <div className={`${s.alert} ${s.alertError}`}>{custodyFormError}</div>}
              {custodyFormSuccess && <div className={`${s.alert} ${s.alertSuccess}`}>{custodyFormSuccess}</div>}
              <form onSubmit={handleAddCustodyEvent}>
                <div className={s.formGrid3} style={{ marginBottom: 14 }}>
                  <div className={s.field}>
                    <label className={s.label}>Action</label>
                    <select className={s.select} value={custodyForm.action} onChange={(e) => setCustodyForm((p) => ({ ...p, action: e.target.value }))} disabled={custodySubmitting}>
                      {CUSTODY_ACTIONS.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>Location</label>
                    <input className={s.input} value={custodyForm.location} onChange={(e) => setCustodyForm((p) => ({ ...p, location: e.target.value }))} placeholder="Lab Room A" disabled={custodySubmitting} />
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>Notes</label>
                    <input className={s.input} value={custodyForm.notes} onChange={(e) => setCustodyForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" disabled={custodySubmitting} />
                  </div>
                </div>
                <div className={s.formActions}>
                  <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={custodySubmitting}>
                    <Plus size={14} /> {custodySubmitting ? 'Adding...' : 'Add Event'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {custodyError && <div className={`${s.alert} ${s.alertError}`}>{custodyError}</div>}
          {custodyLoading ? (
            <div className={s.emptyState}><div className={s.emptyText}>Loading custody chain...</div></div>
          ) : custodyEvents.length > 0 ? (
            <div className={s.card}>
              <div className={s.cardHeader}><div className={s.cardTitle}>Custody Chain — {custodySampleId}</div></div>
              <div className={s.cardBody}>
                <div className={s.timeline}>
                  {custodyEvents.map((ev, i) => (
                    <div key={i} className={s.timelineItem}>
                      <div className={s.timelineDot}><Check size={13} /></div>
                      <div className={s.timelineContent}>
                        <div className={s.timelineTitle}>{ev.action || ev.event}</div>
                        {ev.location && <div className={s.timelineSub}>Location: {ev.location}</div>}
                        {ev.notes && <div className={s.timelineSub}>{ev.notes}</div>}
                        <div className={s.timelineTime} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} />
                          {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
                          {ev.created_by ? ` · ${ev.created_by}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : custodySampleId ? (
            <div className={s.emptyState}><div className={s.emptyText}>No custody events found</div></div>
          ) : null}
        </div>
      )}

      {/* Update Status Modal */}
      {statusSample && (
        <div className={s.modalOverlay} onClick={() => setStatusSample(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div className={s.modalTitle}>Update Sample Status</div>
              <button className={s.modalClose} onClick={() => setStatusSample(null)}><X size={18} /></button>
            </div>
            <div className={s.modalBody}>
              <p style={{ color: 'var(--color-text-2)', marginTop: 0, marginBottom: 14, fontSize: 13 }}>
                Sample: <strong>{statusSample.sample_id || statusSample.id}</strong>
              </p>
              {statusError && <div className={`${s.alert} ${s.alertError}`}>{statusError}</div>}
              <div className={s.field}>
                <label className={s.label}>New Status</label>
                <select className={s.select} value={newSampleStatus} onChange={(e) => setNewSampleStatus(e.target.value)}>
                  {SAMPLE_STATUSES.map((st) => <option key={st}>{st}</option>)}
                </select>
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setStatusSample(null)}>Cancel</button>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleUpdateStatus} disabled={statusLoading}>
                {statusLoading ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectSample && (
        <div className={s.modalOverlay} onClick={() => setRejectSample(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div className={s.modalTitle} style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} /> Reject Sample
              </div>
              <button className={s.modalClose} onClick={() => setRejectSample(null)}><X size={18} /></button>
            </div>
            <div className={s.modalBody}>
              <p style={{ color: 'var(--color-text-2)', marginTop: 0, marginBottom: 14, fontSize: 13 }}>
                Sample: <strong>{rejectSample.sample_id || rejectSample.id}</strong>
              </p>
              {rejectError && <div className={`${s.alert} ${s.alertError}`}>{rejectError}</div>}
              <div className={s.field}>
                <label className={s.label}>Rejection Reason *</label>
                <textarea className={s.textarea} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Hemolysis, insufficient volume, wrong container..." style={{ minHeight: 80 }} />
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setRejectSample(null)}>Cancel</button>
              <button className={`${s.btn} ${s.btnDanger}`} onClick={handleReject} disabled={rejectLoading}>
                {rejectLoading ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SamplesTab;
