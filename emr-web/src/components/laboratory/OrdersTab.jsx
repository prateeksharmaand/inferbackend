/**
 * OrdersTab - Create & Track Test Orders
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, ChevronRight, X, Clock, CheckCircle, FileText } from 'lucide-react';

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

const STATUS_NEXT = {
  PENDING: ['SCHEDULED', 'COLLECTED'],
  SCHEDULED: ['COLLECTED'],
  COLLECTED: ['PROCESSING'],
  PROCESSING: ['RESULTED'],
  RESULTED: ['REPORTED'],
  REPORTED: [],
};

const STATUS_TABS = ['ALL', 'PENDING', 'SCHEDULED', 'COLLECTED', 'PROCESSING', 'RESULTED', 'REPORTED'];

function statusBadgeClass(status, s) {
  const map = {
    PENDING: s.badgeGray,
    SCHEDULED: s.badgeBlue,
    COLLECTED: s.badgeOrange,
    PROCESSING: s.badgeYellow,
    RESULTED: s.badgeGreen,
    REPORTED: s.badgeTeal,
    CRITICAL: s.badgeRed,
  };
  return `${s.badge} ${map[status] || s.badgeGray}`;
}

function priorityBadgeClass(priority, s) {
  if (priority === 'STAT') return `${s.badge} ${s.badgeRed}`;
  if (priority === 'URGENT') return `${s.badge} ${s.badgeOrange}`;
  return `${s.badge} ${s.badgeGreen}`;
}

export function OrdersTab({ labId, styles: s }) {
  const [view, setView] = useState('list');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState('');

  const [form, setForm] = useState({
    patient_id: '', ordering_doctor_id: '', priority: 'ROUTINE',
    clinical_notes: '', scheduled_collection_time: '',
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
      const url = statusFilter === 'ALL'
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

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { if (view === 'create') fetchCatalogAndPanels(); }, [view, fetchCatalogAndPanels]);

  const handleFormChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const toggleTest = (id) => setSelectedTests((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  const togglePanel = (id) => setSelectedPanels((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!form.patient_id || !form.ordering_doctor_id) { setFormError('Patient ID and Doctor ID are required'); return; }
    try {
      setSubmitting(true); setFormError(''); setFormSuccess('');
      const payload = { ...form, lab_id: labId, test_ids: selectedTests, panel_ids: selectedPanels };
      const data = await apiFetch('/api/v1/orders', { method: 'POST', body: JSON.stringify(payload) });
      setFormSuccess(`Order ${data.order?.order_number || data.order_id || ''} created successfully!`);
      setForm({ patient_id: '', ordering_doctor_id: '', priority: 'ROUTINE', clinical_notes: '', scheduled_collection_time: '' });
      setSelectedTests([]); setSelectedPanels([]);
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
    setStatusNotes(''); setAdvanceError('');
  };

  const handleAdvanceStatus = async () => {
    if (!nextStatus) return;
    try {
      setAdvanceLoading(true); setAdvanceError('');
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
    setTimelineOrder(order); setTimeline([]); setTimelineLoading(true);
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
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Test Orders</div>
          <div className={s.pageSubtitle}>Create and track laboratory test orders</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchOrders}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setView(view === 'list' ? 'create' : 'list')}>
            <Plus size={14} /> {view === 'list' ? 'New Order' : 'Back to List'}
          </button>
        </div>
      </div>

      {view === 'create' && (
        <div className={s.card} style={{ marginBottom: 20 }}>
          <div className={s.cardHeader}><div className={s.cardTitle}>Create New Order</div></div>
          <div className={s.cardBody}>
            {formError && <div className={`${s.alert} ${s.alertError}`}>{formError}</div>}
            {formSuccess && <div className={`${s.alert} ${s.alertSuccess}`}>{formSuccess}</div>}
            <form onSubmit={handleCreateOrder}>
              <div className={s.formGrid3} style={{ marginBottom: 12 }}>
                <div className={s.field}>
                  <label className={s.label}>Patient ID *</label>
                  <input className={s.input} name="patient_id" value={form.patient_id} onChange={handleFormChange} placeholder="patient-123" disabled={submitting} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Ordering Doctor ID *</label>
                  <input className={s.input} name="ordering_doctor_id" value={form.ordering_doctor_id} onChange={handleFormChange} placeholder="doctor-456" disabled={submitting} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Priority</label>
                  <select className={s.select} name="priority" value={form.priority} onChange={handleFormChange} disabled={submitting}>
                    <option>ROUTINE</option><option>URGENT</option><option>STAT</option>
                  </select>
                </div>
              </div>
              <div className={s.formGrid} style={{ marginBottom: 12 }}>
                <div className={s.field}>
                  <label className={s.label}>Clinical Notes</label>
                  <textarea className={s.textarea} name="clinical_notes" value={form.clinical_notes} onChange={handleFormChange} placeholder="Clinical notes..." disabled={submitting} style={{ minHeight: 80 }} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Scheduled Collection</label>
                  <input className={s.input} type="datetime-local" name="scheduled_collection_time" value={form.scheduled_collection_time} onChange={handleFormChange} disabled={submitting} />
                </div>
              </div>

              {catalog.length > 0 && (
                <div className={s.field} style={{ marginBottom: 12 }}>
                  <label className={s.label}>Select Tests</label>
                  <div className={s.scrollBox}>
                    {Object.entries(catalogByCategory).map(([cat, tests]) => (
                      <div key={cat} style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-text-3)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat}</div>
                        {tests.map((t) => (
                          <label key={t.id} className={s.checkLabel}>
                            <input type="checkbox" checked={selectedTests.includes(t.id)} onChange={() => toggleTest(t.id)} disabled={submitting} />
                            {t.test_name} ({t.test_code})
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {panels.length > 0 && (
                <div className={s.field} style={{ marginBottom: 14 }}>
                  <label className={s.label}>Select Panels</label>
                  <div className={s.scrollBox}>
                    {panels.map((p) => (
                      <label key={p.id} className={s.checkLabel}>
                        <input type="checkbox" checked={selectedPanels.includes(p.id)} onChange={() => togglePanel(p.id)} disabled={submitting} />
                        {p.panel_name} ({p.panel_code})
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className={s.formActions}>
                <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={() => setView('list')}>Cancel</button>
                <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {view === 'list' && (
        <>
          <div className={s.filtersRow}>
            {STATUS_TABS.map((st) => (
              <button
                key={st}
                className={`${s.filterPill} ${statusFilter === st ? s.filterPillActive : ''}`}
                onClick={() => setStatusFilter(st)}
              >{st}</button>
            ))}
          </div>
          {ordersError && <div className={`${s.alert} ${s.alertError}`}>{ordersError}</div>}
          <div className={s.card}>
            {loadingOrders ? (
              <div className={s.emptyState}><div className={s.emptyText}>Loading orders...</div></div>
            ) : orders.length === 0 ? (
              <div className={s.emptyState}>
                <div className={s.emptyIcon}><ClipboardList size={48} /></div>
                <div className={s.emptyText}>No orders found</div>
              </div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      {['Order #', 'Patient', 'Priority', 'Items', 'Status', 'Created', 'Actions'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} style={{ cursor: 'pointer' }} onClick={() => openTimeline(order)}>
                        <td style={{ fontWeight: 600 }}>{order.order_number || order.id}</td>
                        <td>{order.patient_id}</td>
                        <td><span className={priorityBadgeClass(order.priority, s)}>{order.priority}</span></td>
                        <td>{((order.tests || []).length + (order.panels || []).length) || '—'}</td>
                        <td><span className={statusBadgeClass(order.status, s)}>{order.status}</span></td>
                        <td>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {(STATUS_NEXT[order.status] || []).length > 0 && (
                            <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => openAdvanceModal(order)}>
                              <ChevronRight size={13} /> Advance
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Advance Status Modal */}
      {advanceOrder && (
        <div className={s.modalOverlay} onClick={() => setAdvanceOrder(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div className={s.modalTitle}>Advance Order Status</div>
              <button className={s.modalClose} onClick={() => setAdvanceOrder(null)}><X size={18} /></button>
            </div>
            <div className={s.modalBody}>
              <p style={{ color: 'var(--color-text-2)', marginTop: 0, marginBottom: 16, fontSize: 13 }}>
                Order <strong>{advanceOrder.order_number || advanceOrder.id}</strong> · Current: <span className={statusBadgeClass(advanceOrder.status, s)}>{advanceOrder.status}</span>
              </p>
              {advanceError && <div className={`${s.alert} ${s.alertError}`}>{advanceError}</div>}
              <div className={s.field} style={{ marginBottom: 12 }}>
                <label className={s.label}>New Status</label>
                <select className={s.select} value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                  {(STATUS_NEXT[advanceOrder.status] || []).map((st) => <option key={st}>{st}</option>)}
                </select>
              </div>
              <div className={s.field} style={{ marginBottom: 4 }}>
                <label className={s.label}>Notes</label>
                <textarea className={s.textarea} value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} placeholder="Optional notes..." style={{ minHeight: 70 }} />
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setAdvanceOrder(null)}>Cancel</button>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleAdvanceStatus} disabled={advanceLoading}>
                {advanceLoading ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Modal */}
      {timelineOrder && (
        <div className={s.modalOverlay} onClick={() => setTimelineOrder(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div className={s.modalTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} /> Order Timeline
              </div>
              <button className={s.modalClose} onClick={() => setTimelineOrder(null)}><X size={18} /></button>
            </div>
            <div className={s.modalBody}>
              <p style={{ color: 'var(--color-text-2)', marginTop: 0, marginBottom: 16, fontSize: 13 }}>
                Order: <strong>{timelineOrder.order_number || timelineOrder.id}</strong>
              </p>
              {timelineLoading ? (
                <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
              ) : timeline.length === 0 ? (
                <div className={s.emptyState}><div className={s.emptyText}>No timeline events</div></div>
              ) : (
                <div className={s.timeline}>
                  {timeline.map((ev, i) => (
                    <div key={i} className={s.timelineItem}>
                      <div className={s.timelineDot}><CheckCircle size={14} /></div>
                      <div className={s.timelineContent}>
                        <div className={s.timelineTitle}>{ev.status || ev.event}</div>
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrdersTab;
