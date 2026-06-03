/**
 * EditSampleTab - OpenELIS-inspired Edit Sample form
 */

import React, { useState } from 'react';
import { Search } from 'lucide-react';

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

const SAMPLE_TYPES = ['BLOOD', 'URINE', 'STOOL', 'TISSUE', 'SWAB', 'CSF', 'SERUM', 'PLASMA', 'OTHER'];
const ORDER_STATUSES = ['PENDING', 'SCHEDULED', 'COLLECTED', 'RECEIVED', 'PROCESSING', 'REPORTED', 'CANCELLED'];
const sectionHeader = { background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 };

export function EditSampleTab({ labId, styles: s }) {
  const [accessionSearch, setAccessionSearch] = useState('');
  const [patientSearch, setPatientSearch] = useState({ firstName: '', middleName: '', lastName: '', patientId: '' });

  const [foundOrder, setFoundOrder] = useState(null);
  const [foundSamples, setFoundSamples] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [editForm, setEditForm] = useState({ sample_type: '', status: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 5000); };

  const handleAccessionSearch = async () => {
    if (!accessionSearch.trim()) { setSearchError('Enter an accession number'); return; }
    try {
      setSearchLoading(true);
      setSearchError('');
      setFoundOrder(null);
      setFoundSamples([]);
      const data = await apiFetch(`/api/v1/orders/lab/${labId}?accession=${encodeURIComponent(accessionSearch.trim())}`);
      const orders = data.orders || data || [];
      const order = Array.isArray(orders) ? orders.find((o) => o.accession_number === accessionSearch.trim()) || orders[0] : orders;
      if (order) {
        setFoundOrder(order);
        setEditForm({
          sample_type: order.sample_type || '',
          status: order.status || '',
          notes: order.notes || '',
        });
        // Load samples for this order
        try {
          const sampData = await apiFetch(`/api/v1/samples?order_id=${order.id}`);
          setFoundSamples(sampData.samples || sampData || []);
        } catch { setFoundSamples([]); }
      } else {
        setSearchError('No order found for this accession number');
      }
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePatientSearch = async () => {
    const q = patientSearch.patientId || `${patientSearch.firstName} ${patientSearch.lastName}`.trim();
    if (!q) { setSearchError('Enter search criteria'); return; }
    try {
      setSearchLoading(true);
      setSearchError('');
      const data = await apiFetch(`/api/v1/patients/search?q=${encodeURIComponent(q)}`);
      const patient = data.patient || (Array.isArray(data) ? data[0] : null);
      if (patient) {
        const ordData = await apiFetch(`/api/v1/orders/lab/${labId}?patient_id=${patient.id || patient.patient_id}`);
        const orders = ordData.orders || ordData || [];
        const order = Array.isArray(orders) ? orders[0] : orders;
        if (order) {
          setFoundOrder(order);
          setEditForm({ sample_type: order.sample_type || '', status: order.status || '', notes: order.notes || '' });
        } else {
          setSearchError('No orders found for this patient');
        }
      } else {
        setSearchError('Patient not found');
      }
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSave = async () => {
    if (!foundOrder) return;
    try {
      setSaving(true);
      await apiFetch(`/api/v1/orders/${foundOrder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sample_type: editForm.sample_type,
          status: editForm.status,
          notes: editForm.notes,
        }),
      });
      // Update samples if any
      for (const sample of foundSamples) {
        if (editForm.sample_type) {
          await apiFetch(`/api/v1/samples/${sample.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ sample_type: editForm.sample_type, status: editForm.status }),
          }).catch(() => {});
        }
      }
      showMsg('Sample updated successfully');
    } catch (err) {
      showMsg(`Failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Edit Sample</div>
          <div className={s.pageSubtitle}>Search and modify existing samples and orders</div>
        </div>
      </div>

      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`}>{msg}</div>}

      {/* Search section */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div style={sectionHeader}>Search</div>
        <div className={s.cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Left: Accession search */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>BY ACCESSION NUMBER</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className={s.input}
                  value={accessionSearch}
                  onChange={(e) => setAccessionSearch(e.target.value)}
                  placeholder="e.g. 03062026-123"
                  onKeyDown={(e) => e.key === 'Enter' && handleAccessionSearch()}
                />
                <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleAccessionSearch} disabled={searchLoading}>
                  <Search size={14} /> Search
                </button>
              </div>
              <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={handleAccessionSearch} disabled={searchLoading || !accessionSearch}>
                Get Tests For Accession Number
              </button>
            </div>

            {/* Right: Patient search */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>BY PATIENT</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input className={s.input} value={patientSearch.firstName} onChange={(e) => setPatientSearch((p) => ({ ...p, firstName: e.target.value }))} placeholder="First Name" />
                <input className={s.input} value={patientSearch.middleName} onChange={(e) => setPatientSearch((p) => ({ ...p, middleName: e.target.value }))} placeholder="Middle Name" />
                <input className={s.input} value={patientSearch.lastName} onChange={(e) => setPatientSearch((p) => ({ ...p, lastName: e.target.value }))} placeholder="Last Name" />
                <input className={s.input} value={patientSearch.patientId} onChange={(e) => setPatientSearch((p) => ({ ...p, patientId: e.target.value }))} placeholder="Patient ID" onKeyDown={(e) => e.key === 'Enter' && handlePatientSearch()} />
              </div>
              <button className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} onClick={handlePatientSearch} disabled={searchLoading}>
                <Search size={13} /> Search Patient
              </button>
            </div>
          </div>

          {searchError && <div className={`${s.alert} ${s.alertError}`} style={{ marginTop: 12 }}>{searchError}</div>}
        </div>
      </div>

      {/* Edit form — shown when order found */}
      {foundOrder && (
        <div className={s.card}>
          <div style={sectionHeader}>Order Details — {foundOrder.accession_number || foundOrder.id}</div>
          <div className={s.cardBody}>
            {/* Read-only info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16, padding: '12px', background: '#f8fafc', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 2 }}>PATIENT ID</div>
                <div style={{ fontSize: 13 }}>{foundOrder.patient_id || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 2 }}>PATIENT NAME</div>
                <div style={{ fontSize: 13 }}>{foundOrder.patient_name || foundOrder.patient?.name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 2 }}>ORDER DATE</div>
                <div style={{ fontSize: 13 }}>{foundOrder.created_at ? new Date(foundOrder.created_at).toLocaleDateString() : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 2 }}>ACCESSION #</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{foundOrder.accession_number || '—'}</div>
              </div>
            </div>

            {/* Samples list */}
            {foundSamples.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>ASSOCIATED SAMPLES</div>
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>{['Sample ID', 'Type', 'Status', 'Collection Date'].map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {foundSamples.map((sample) => (
                        <tr key={sample.id}>
                          <td>{sample.id}</td>
                          <td>{sample.sample_type || '—'}</td>
                          <td><span className={`${s.badge} ${s.badgeBlue}`}>{sample.status || '—'}</span></td>
                          <td>{sample.collected_at ? new Date(sample.collected_at).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Editable fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className={s.field}>
                <label className={s.label}>Sample Type</label>
                <select className={s.select} value={editForm.sample_type} onChange={(e) => setEditForm((p) => ({ ...p, sample_type: e.target.value }))}>
                  <option value="">— Select —</option>
                  {SAMPLE_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Status</label>
                <select className={s.select} value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="">— Select —</option>
                  {ORDER_STATUSES.map((st) => <option key={st}>{st}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Notes</label>
                <input className={s.input} value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Additional notes..." />
              </div>
            </div>

            <div className={s.formActions}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => { setFoundOrder(null); setFoundSamples([]); }}>Cancel</button>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {!foundOrder && !searchError && (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><Search size={48} /></div>
          <div className={s.emptyText}>Search by accession number or patient to edit a sample</div>
        </div>
      )}
    </div>
  );
}

export default EditSampleTab;
