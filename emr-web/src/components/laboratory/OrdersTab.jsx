/**
 * OrdersTab - Create & Track Test Orders
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  ChevronRight,
  X,
  Clock,
  CheckCircle,
  FileText,
} from 'lucide-react';

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
  PENDING: '#6c757d',
  SCHEDULED: '#007bff',
  COLLECTED: '#fd7e14',
  PROCESSING: '#ffc107',
  RESULTED: '#28a745',
  REPORTED: '#17a2b8',
};

const STATUS_NEXT = {
  PENDING: ['SCHEDULED', 'COLLECTED'],
  SCHEDULED: ['COLLECTED'],
  COLLECTED: ['PROCESSING'],
  PROCESSING: ['RESULTED'],
  RESULTED: ['REPORTED'],
  REPORTED: [],
};

const STATUS_TABS = ['ALL', 'PENDING', 'SCHEDULED', 'COLLECTED', 'PROCESSING', 'RESULTED', 'REPORTED'];

export function OrdersTab({ labId }) {
  const [view, setView] = useState('list');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState('');

  const [form, setForm] = useState({
    patient_id: '',
    ordering_doctor_id: '',
    priority: 'ROUTINE',
    clinical_notes: '',
    scheduled_collection_time: '',
  });
  const [catalog, setCatalog] = useState([]);
  const [panels, setPanels] = useState([]);
  const [selectedTests, setSelectedTests] = useState([]);
  const [selectedPanels, setSelectedPanels] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const [advanceOrder, setAdvanceOrder] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [advanceError, setAdvanceError] = useState('');

  const [timelineOrder, setTimelineOrder] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      setOrdersError('');
      const url =
        statusFilter === 'ALL'
          ? `/api/v1/lab/${labId}/orders`
          : `/api/v1/lab/${labId}/orders?status=${statusFilter}`;
      const data = await apiFetch(url);
      setOrders(data.orders || data || []);
    } catch (err) {
      setOrdersError(err.message);
    } finally {
      setLoadingOrders(false);
    }
  }, [labId, statusFilter]);

  const fetchCatalogAndPanels = useCallback(async () => {
    try {
      const [catData, panData] = await Promise.all([
        apiFetch(`/api/v1/catalog?lab_id=${labId}`),
        apiFetch(`/api/v1/panels?lab_id=${labId}`),
      ]);
      setCatalog(catData.tests || catData || []);
      setPanels(panData.panels || panData || []);
    } catch (err) {
      console.error('Error loading catalog/panels:', err);
    }
  }, [labId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (view === 'create') fetchCatalogAndPanels();
  }, [view, fetchCatalogAndPanels]);

  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleTest = (id) => {
    setSelectedTests((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const togglePanel = (id) => {
    setSelectedPanels((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!form.patient_id || !form.ordering_doctor_id) {
      setFormError('Patient ID and Doctor ID are required');
      return;
    }
    try {
      setSubmitting(true);
      setFormError('');
      setFormSuccess('');
      const payload = { ...form, lab_id: labId, test_ids: selectedTests, panel_ids: selectedPanels };
      const data = await apiFetch('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setFormSuccess(`Order ${data.order?.order_number || data.order_id || ''} created successfully!`);
      setForm({ patient_id: '', ordering_doctor_id: '', priority: 'ROUTINE', clinical_notes: '', scheduled_collection_time: '' });
      setSelectedTests([]);
      setSelectedPanels([]);
      fetchOrders();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openAdvanceModal = (order) => {
    setAdvanceOrder(order);
    const nexts = STATUS_NEXT[order.status] || [];
    setNextStatus(nexts[0] || '');
    setStatusNotes('');
    setAdvanceError('');
  };

  const handleAdvanceStatus = async () => {
    if (!nextStatus) return;
    try {
      setAdvanceLoading(true);
      setAdvanceError('');
      await apiFetch(`/api/v1/orders/${advanceOrder.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, notes: statusNotes }),
      });
      setAdvanceOrder(null);
      fetchOrders();
    } catch (err) {
      setAdvanceError(err.message);
    } finally {
      setAdvanceLoading(false);
    }
  };

  const openTimeline = async (order) => {
    setTimelineOrder(order);
    setTimeline([]);
    setTimelineLoading(true);
    try {
      const data = await apiFetch(`/api/v1/orders/${order.id}/timeline`);
      setTimeline(data.timeline || data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const catalogByCategory = catalog.reduce((acc, test) => {
    const cat = test.category || 'OTHER';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(test);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#333', fontSize: 22 }}>Test Orders</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={fetchOrders} style={s.btnSecondary}>
            <RefreshCw size={15} style={{ marginRight: 5 }} />Refresh
          </button>
          <button onClick={() => setView(view === 'list' ? 'create' : 'list')} style={s.btnPrimary}>
            <Plus size={15} style={{ marginRight: 5 }} />
            {view === 'list' ? 'New Order' : 'Back to List'}
          </button>
        </div>
      </div>

      {view === 'create' && (
        <div style={s.card}>
          <h3 style={{ marginTop: 0, color: '#444' }}>Create New Order</h3>
          {formError && <div style={s.alertDanger}>{formError}</div>}
          {formSuccess && <div style={s.alertSuccess}>{formSuccess}</div>}
          <form onSubmit={handleCreateOrder}>
            <div style={s.row}>
              <div style={s.fg}>
                <label style={s.label}>Patient ID *</label>
                <input style={s.input} name="patient_id" value={form.patient_id} onChange={handleFormChange} placeholder="patient-123" disabled={submitting} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Ordering Doctor ID *</label>
                <input style={s.input} name="ordering_doctor_id" value={form.ordering_doctor_id} onChange={handleFormChange} placeholder="doctor-456" disabled={submitting} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Priority</label>
                <select style={s.input} name="priority" value={form.priority} onChange={handleFormChange} disabled={submitting}>
                  <option>ROUTINE</option>
                  <option>URGENT</option>
                  <option>STAT</option>
                </select>
              </div>
            </div>
            <div style={s.row}>
              <div style={{ ...s.fg, flex: 2 }}>
                <label style={s.label}>Clinical Notes</label>
                <textarea style={{ ...s.input, height: 80, resize: 'vertical' }} name="clinical_notes" value={form.clinical_notes} onChange={handleFormChange} placeholder="Clinical notes..." disabled={submitting} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Scheduled Collection</label>
                <input style={s.input} type="datetime-local" name="scheduled_collection_time" value={form.scheduled_collection_time} onChange={handleFormChange} disabled={submitting} />
              </div>
            </div>

            {catalog.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={s.label}>Select Tests</label>
                <div style={s.scrollBox}>
                  {Object.entries(catalogByCategory).map(([cat, tests]) => (
                    <div key={cat} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, color: '#555', fontSize: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat}</div>
                      {tests.map((t) => (
                        <label key={t.id} style={s.checkLabel}>
                          <input type="checkbox" checked={selectedTests.includes(t.id)} onChange={() => toggleTest(t.id)} disabled={submitting} style={{ marginRight: 6 }} />
                          {t.test_name} ({t.test_code})
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {panels.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={s.label}>Select Panels</label>
                <div style={s.scrollBox}>
                  {panels.map((p) => (
                    <label key={p.id} style={s.checkLabel}>
                      <input type="checkbox" checked={selectedPanels.includes(p.id)} onChange={() => togglePanel(p.id)} disabled={submitting} style={{ marginRight: 6 }} />
                      {p.panel_name} ({p.panel_code})
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" style={{ ...s.btnPrimary, width: '100%', padding: '11px', justifyContent: 'center' }} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Order'}
            </button>
          </form>
        </div>
      )}

      {view === 'list' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {STATUS_TABS.map((st) => (
              <button key={st} onClick={() => setStatusFilter(st)} style={{
                padding: '5px 14px', borderRadius: 16, border: '1px solid',
                borderColor: statusFilter === st ? '#007bff' : '#ddd',
                background: statusFilter === st ? '#007bff' : 'white',
                color: statusFilter === st ? 'white' : '#555',
                cursor: 'pointer', fontSize: 13, fontWeight: 500,
              }}>{st}</button>
            ))}
          </div>
          {ordersError && <div style={s.alertDanger}>{ordersError}</div>}
          {loadingOrders ? (
            <div style={s.empty}>Loading orders...</div>
          ) : orders.length === 0 ? (
            <div style={s.empty}>No orders found</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr style={{ background: '#f5f6fa' }}>
                    {['Order #', 'Patient', 'Priority', 'Items', 'Status', 'Created', 'Actions'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => openTimeline(order)}>
                      <td style={s.td}>{order.order_number || order.id}</td>
                      <td style={s.td}>{order.patient_id}</td>
                      <td style={s.td}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                          background: order.priority === 'STAT' ? '#ffe0e0' : order.priority === 'URGENT' ? '#fff3cd' : '#e8f5e9',
                          color: order.priority === 'STAT' ? '#c62828' : order.priority === 'URGENT' ? '#e65100' : '#2e7d32',
                        }}>{order.priority}</span>
                      </td>
                      <td style={s.td}>{((order.tests || []).length + (order.panels || []).length) || '—'}</td>
                      <td style={s.td}>
                        <span style={{
                          padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                          background: (STATUS_COLORS[order.status] || '#888') + '22',
                          color: STATUS_COLORS[order.status] || '#888',
                          border: `1px solid ${STATUS_COLORS[order.status] || '#888'}`,
                        }}>{order.status}</span>
                      </td>
                      <td style={s.td}>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                      <td style={s.td} onClick={(e) => e.stopPropagation()}>
                        {(STATUS_NEXT[order.status] || []).length > 0 && (
                          <button style={s.btnSmall} onClick={() => openAdvanceModal(order)}>
                            <ChevronRight size={13} style={{ marginRight: 3 }} />Advance
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Advance Status Modal */}
      {advanceOrder && (
        <div style={s.overlay} onClick={() => setAdvanceOrder(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Advance Order Status</h3>
              <button onClick={() => setAdvanceOrder(null)} style={s.iconBtn}><X size={18} /></button>
            </div>
            <p style={{ color: '#666', margin: '0 0 14px' }}>
              Order <strong>{advanceOrder.order_number || advanceOrder.id}</strong> · Current: <strong>{advanceOrder.status}</strong>
            </p>
            {advanceError && <div style={s.alertDanger}>{advanceError}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={s.label}>New Status</label>
              <select style={s.input} value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                {(STATUS_NEXT[advanceOrder.status] || []).map((st) => <option key={st}>{st}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Notes</label>
              <textarea style={{ ...s.input, height: 70, resize: 'vertical' }} value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
            <button style={{ ...s.btnPrimary, width: '100%', justifyContent: 'center' }} onClick={handleAdvanceStatus} disabled={advanceLoading}>
              {advanceLoading ? 'Updating...' : 'Update Status'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline Drawer */}
      {timelineOrder && (
        <div style={s.overlay} onClick={() => setTimelineOrder(null)}>
          <div style={{ ...s.modal, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} color="#007bff" />Order Timeline
              </h3>
              <button onClick={() => setTimelineOrder(null)} style={s.iconBtn}><X size={18} /></button>
            </div>
            <p style={{ color: '#666', margin: '0 0 16px' }}>Order: <strong>{timelineOrder.order_number || timelineOrder.id}</strong></p>
            {timelineLoading ? (
              <p style={{ color: '#666' }}>Loading...</p>
            ) : timeline.length === 0 ? (
              <p style={{ color: '#999' }}>No timeline events</p>
            ) : (
              timeline.map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: STATUS_COLORS[ev.status] || '#007bff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircle size={14} color="white" />
                    </div>
                    {i < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: '#e0e0e0', minHeight: 12 }} />}
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontWeight: 600, color: '#333' }}>{ev.status || ev.event}</div>
                    {ev.notes && <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{ev.notes}</div>}
                    <div style={{ color: '#999', fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} />{ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}{ev.created_by ? ` · ${ev.created_by}` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  card: { background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 8, padding: 24, marginBottom: 24 },
  row: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 4 },
  fg: { flex: 1, minWidth: 180, marginBottom: 12 },
  label: { display: 'block', marginBottom: 4, fontWeight: 600, color: '#333', fontSize: 14 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' },
  scrollBox: { border: '1px solid #ddd', borderRadius: 6, padding: 10, maxHeight: 200, overflowY: 'auto', background: 'white' },
  checkLabel: { display: 'block', padding: '3px 0', fontSize: 14, color: '#333', cursor: 'pointer' },
  btnPrimary: { padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 },
  btnSecondary: { padding: '8px 16px', background: 'white', color: '#555', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 },
  btnSmall: { padding: '4px 10px', background: '#e9f0ff', color: '#007bff', border: '1px solid #b3cfff', borderRadius: 4, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 4, display: 'flex', alignItems: 'center' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 13, borderBottom: '2px solid #eee' },
  td: { padding: '10px 12px', color: '#333' },
  empty: { textAlign: 'center', padding: 40, color: '#999', fontSize: 15 },
  alertDanger: { background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  alertSuccess: { background: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', borderRadius: 4, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: 'white', borderRadius: 8, padding: 28, width: '90%', maxWidth: 560, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxHeight: '85vh', overflowY: 'auto' },
};

export default OrdersTab;
