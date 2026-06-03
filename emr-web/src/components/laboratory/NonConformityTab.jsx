/**
 * NonConformityTab - OpenELIS-inspired Add QA Event / Non-Conformity
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Search, AlertTriangle } from 'lucide-react';

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

const QA_EVENT_TYPES = [
  'Haemolysed',
  'Lipemic',
  'Insufficient Volume',
  'Wrong Container',
  'Mislabeled',
  'Other',
];

const sectionHeader = { background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 };

export function NonConformityTab({ labId, styles: s }) {
  const [accession, setAccession] = useState('');
  const [foundOrder, setFoundOrder] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [eventType, setEventType] = useState(QA_EVENT_TYPES[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [qaEvents, setQaEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 5000); };

  const loadQaEvents = useCallback(async () => {
    if (!labId) return;
    try {
      setEventsLoading(true);
      const data = await apiFetch(`/api/v1/orders/lab/${labId}?status=CANCELLED`);
      setQaEvents(data.orders || data || []);
    } catch {
      setQaEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [labId]);

  useEffect(() => { loadQaEvents(); }, [loadQaEvents]);

  const handleSearch = async () => {
    if (!accession.trim()) { setSearchError('Enter an accession number'); return; }
    try {
      setSearchLoading(true);
      setSearchError('');
      setFoundOrder(null);
      const data = await apiFetch(`/api/v1/orders/lab/${labId}?accession=${encodeURIComponent(accession.trim())}`);
      const orders = data.orders || data || [];
      const order = Array.isArray(orders)
        ? orders.find((o) => o.accession_number === accession.trim()) || orders[0]
        : orders;
      if (order) {
        setFoundOrder(order);
      } else {
        setSearchError('No order found for this accession number');
      }
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSave = async () => {
    if (!foundOrder) { showMsg('Search and select an order first', 'error'); return; }
    if (!description.trim()) { showMsg('Please enter a description', 'error'); return; }
    try {
      setSaving(true);
      // Record QA event by updating order status to CANCELLED with notes
      await apiFetch(`/api/v1/orders/${foundOrder.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'CANCELLED',
          notes: `QA Event: ${eventType} — ${description}`,
          qa_event_type: eventType,
        }),
      });
      showMsg('QA Event recorded successfully');
      setFoundOrder(null);
      setAccession('');
      setDescription('');
      setEventType(QA_EVENT_TYPES[0]);
      loadQaEvents();
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
          <div className={s.pageTitle}>Non Conformity</div>
          <div className={s.pageSubtitle}>Record QA events and sample non-conformities</div>
        </div>
      </div>

      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`}>{msg}</div>}

      {/* Add QA Event form */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div style={sectionHeader}>Add QA Event</div>
        <div className={s.cardBody}>
          {/* Accession search */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>ACCESSION NUMBER *</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className={s.input}
                style={{ maxWidth: 280 }}
                value={accession}
                onChange={(e) => setAccession(e.target.value)}
                placeholder="e.g. 03062026-123"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSearch} disabled={searchLoading}>
                <Search size={14} /> {searchLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
            {searchError && <div className={`${s.alert} ${s.alertError}`} style={{ marginTop: 8 }}>{searchError}</div>}
          </div>

          {/* Found order details */}
          {foundOrder && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: '#166534', marginBottom: 8, fontSize: 13 }}>Order Found</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>PATIENT</div>
                  <div>{foundOrder.patient_name || foundOrder.patient?.name || foundOrder.patient_id || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>ACCESSION #</div>
                  <div style={{ fontWeight: 600 }}>{foundOrder.accession_number || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>SAMPLE TYPE</div>
                  <div>{foundOrder.sample_type || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>TESTS</div>
                  <div>{foundOrder.test_name || (foundOrder.items && foundOrder.items.map((i) => i.test_name).join(', ')) || '—'}</div>
                </div>
              </div>
            </div>
          )}

          {/* QA Event fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 12 }}>
            <div className={s.field}>
              <label className={s.label}>QA Event Type</label>
              <select className={s.select} value={eventType} onChange={(e) => setEventType(e.target.value)}>
                {QA_EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Description</label>
              <textarea
                className={s.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the non-conformity..."
                style={{ minHeight: 70 }}
              />
            </div>
          </div>

          <div className={s.formActions}>
            <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => { setFoundOrder(null); setAccession(''); setDescription(''); }}>Cancel</button>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSave} disabled={saving || !foundOrder}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* QA Events list */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}><AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />QA Events List</div>
          <span className={`${s.badge} ${s.badgeOrange}`}>{qaEvents.length} events</span>
        </div>
        {eventsLoading ? (
          <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
        ) : qaEvents.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><AlertTriangle size={48} /></div>
            <div className={s.emptyText}>No QA events recorded</div>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>{['Accession #', 'Patient', 'Sample Type', 'Event Type', 'Date', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {qaEvents.map((ev) => {
                  const notes = ev.notes || '';
                  const evType = notes.includes('QA Event:') ? notes.split('QA Event:')[1]?.split('—')[0]?.trim() : '—';
                  return (
                    <tr key={ev.id}>
                      <td style={{ fontWeight: 600 }}>{ev.accession_number || ev.id}</td>
                      <td>{ev.patient_name || ev.patient?.name || ev.patient_id || '—'}</td>
                      <td>{ev.sample_type || '—'}</td>
                      <td><span className={`${s.badge} ${s.badgeOrange}`}>{evType}</span></td>
                      <td>{ev.updated_at ? new Date(ev.updated_at).toLocaleDateString() : ev.created_at ? new Date(ev.created_at).toLocaleDateString() : '—'}</td>
                      <td><span className={`${s.badge} ${s.badgeRed}`}>{ev.status || 'CANCELLED'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default NonConformityTab;
