/**
 * WorkflowTab - Drag-and-drop Kanban workflow board
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Clock, AlertTriangle } from 'lucide-react';

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

const COLUMNS = [
  { id: 'PENDING',    label: 'Pending',     dot: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
  { id: 'COLLECTED',  label: 'Collected',   dot: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  { id: 'PROCESSING', label: 'Processing',  dot: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  { id: 'RESULTED',   label: 'Resulted',    dot: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'REPORTED',   label: 'Reported',    dot: '#10b981', bg: '#f0fdf4', border: '#a7f3d0' },
];

// Which statuses are valid drop targets for each column
const DROP_MAP = {
  PENDING:    'PENDING',
  COLLECTED:  'COLLECTED',
  PROCESSING: 'PROCESSING',
  RESULTED:   'RESULTED',
  REPORTED:   'REPORTED',
};

// Allowed forward transitions
const ALLOWED = {
  PENDING:    ['COLLECTED', 'CANCELLED'],
  COLLECTED:  ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['RESULTED',   'CANCELLED'],
  RESULTED:   ['REPORTED'],
  REPORTED:   [],
};

function canDrop(fromStatus, toStatus) {
  if (fromStatus === toStatus) return false;
  return ALLOWED[fromStatus]?.includes(toStatus) || false;
}

function tatLabel(order) {
  const base = order.collected_at || order.created_at;
  if (!base) return null;
  const elapsed = (Date.now() - new Date(base).getTime()) / 3600000;
  if (elapsed < 1)   return { label: `${Math.round(elapsed * 60)}m`, color: '#166534' };
  if (elapsed < 4)   return { label: `${elapsed.toFixed(1)}h`,       color: '#92400e' };
  return                   { label: `${elapsed.toFixed(1)}h`,       color: '#991b1b' };
}

function computeAge(dob) {
  if (!dob) return null;
  const y = new Date().getFullYear() - new Date(dob).getFullYear();
  return y > 0 ? `${y}y` : null;
}

export function WorkflowTab({ labId, styles: s }) {
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [dragOver,   setDragOver]   = useState(null); // column id being hovered
  const [draggingId, setDraggingId] = useState(null);
  const dragCounters = useRef({});

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const data = await apiFetch(`/api/v1/orders/lab/${labId}`);
      setOrders(data.orders || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [labId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const onDragStart = (e, order) => {
    e.dataTransfer.setData('orderId', order.id);
    e.dataTransfer.setData('fromStatus', order.status);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(order.id);
  };

  const onDragEnd = () => setDraggingId(null);

  const makeColHandlers = (colId) => {
    if (!dragCounters.current[colId]) dragCounters.current[colId] = 0;
    return {
      onDragOver:  (e) => e.preventDefault(),
      onDragEnter: (e) => {
        e.preventDefault();
        dragCounters.current[colId]++;
        setDragOver(colId);
      },
      onDragLeave: () => {
        dragCounters.current[colId]--;
        if (dragCounters.current[colId] <= 0) {
          dragCounters.current[colId] = 0;
          setDragOver(null);
        }
      },
      onDrop: async (e) => {
        e.preventDefault();
        dragCounters.current[colId] = 0;
        setDragOver(null);
        const orderId   = e.dataTransfer.getData('orderId');
        const fromStatus = e.dataTransfer.getData('fromStatus');
        const toStatus  = DROP_MAP[colId];
        if (!orderId || !canDrop(fromStatus, toStatus)) return;
        try {
          // Optimistic update
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: toStatus } : o));
          await apiFetch(`/api/v1/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: toStatus }),
          });
        } catch (err) {
          setError(err.message);
          fetchOrders(); // revert on error
        }
      },
    };
  };

  // Group orders by status
  const grouped = {};
  COLUMNS.forEach(col => { grouped[col.id] = []; });
  orders.forEach(o => {
    if (grouped[o.status]) grouped[o.status].push(o);
  });

  // Sort each column: STAT first, then by created_at
  COLUMNS.forEach(col => {
    grouped[col.id].sort((a, b) => {
      const prio = { STAT: 0, URGENT: 1, ROUTINE: 2 };
      const pa = prio[a.priority] ?? 2, pb = prio[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  });

  const draggingOrder = orders.find(o => o.id === draggingId);

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Workflow Board</div>
          <div className={s.pageSubtitle}>Drag cards between columns to advance order status</div>
        </div>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchOrders} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className={`${s.alert} ${s.alertError}`} style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className={s.emptyState}><div className={s.emptyText}>Loading…</div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 10, alignItems: 'start' }}>
          {COLUMNS.map(col => {
            const colOrders = grouped[col.id] || [];
            const handlers  = makeColHandlers(col.id);
            const isOver    = dragOver === col.id;
            const canAccept = draggingOrder ? canDrop(draggingOrder.status, col.id) : false;

            return (
              <div key={col.id}
                {...handlers}
                style={{
                  background: isOver && canAccept ? col.bg : '#f8fafc',
                  border: `2px solid ${isOver && canAccept ? col.dot : isOver ? '#e2e8f0' : '#e2e8f0'}`,
                  borderRadius: 10,
                  minHeight: 200,
                  transition: 'border-color 0.15s, background 0.15s',
                  opacity: draggingId && !canAccept && col.id !== (draggingOrder?.status) ? 0.5 : 1,
                }}>
                {/* Column header */}
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${col.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: col.bg, borderRadius: '8px 8px 0 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#334155' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, display: 'inline-block', flexShrink: 0 }} />
                    {col.label}
                  </div>
                  <span style={{ background: col.dot, color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{colOrders.length}</span>
                </div>

                {/* Drop hint */}
                {isOver && canAccept && (
                  <div style={{ margin: 8, padding: '8px', background: col.bg, border: `2px dashed ${col.dot}`, borderRadius: 8, fontSize: 12, color: col.dot, fontWeight: 600, textAlign: 'center' }}>
                    Drop to move → {col.label}
                  </div>
                )}

                {/* Cards */}
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {colOrders.length === 0 && !isOver && (
                    <div style={{ textAlign: 'center', padding: 16, color: '#cbd5e1', fontSize: 12 }}>
                      Empty
                    </div>
                  )}
                  {colOrders.map(order => {
                    const isStat   = order.priority === 'STAT';
                    const isUrgent = order.priority === 'URGENT';
                    const tat      = tatLabel(order);
                    const age      = computeAge(order.patient_dob);
                    const isDragging = draggingId === order.id;

                    return (
                      <div
                        key={order.id}
                        draggable
                        onDragStart={e => onDragStart(e, order)}
                        onDragEnd={onDragEnd}
                        style={{
                          background: 'white',
                          border: `1px solid ${isStat ? '#fecaca' : isUrgent ? '#fed7aa' : '#e2e8f0'}`,
                          borderLeft: `4px solid ${isStat ? '#ef4444' : isUrgent ? '#f97316' : col.dot}`,
                          borderRadius: 8,
                          padding: '10px 10px 8px',
                          cursor: 'grab',
                          opacity: isDragging ? 0.4 : 1,
                          boxShadow: isDragging ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                          transition: 'opacity 0.15s, box-shadow 0.15s',
                          userSelect: 'none',
                        }}
                      >
                        {/* Order number */}
                        <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                          {order.order_number}
                        </div>

                        {/* Patient */}
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>
                          {order.patient_name || '—'}
                          {age && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4, fontWeight: 400 }}>{age}</span>}
                        </div>

                        {order.patient_uhid && (
                          <div style={{ marginBottom: 4 }}>
                            <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '0 5px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                              {order.patient_uhid}
                            </span>
                          </div>
                        )}

                        {/* Sample type */}
                        {order.sample_type && (
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{order.sample_type}</div>
                        )}

                        {/* Footer: priority + TAT */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                          <span style={{
                            background: isStat ? '#fee2e2' : isUrgent ? '#fff7ed' : '#f1f5f9',
                            color: isStat ? '#991b1b' : isUrgent ? '#b45309' : '#64748b',
                            padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                          }}>
                            {order.priority || 'ROUTINE'}{isStat ? ' 🔴' : ''}
                          </span>
                          {tat && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: tat.color, fontWeight: 600 }}>
                              <Clock size={10} /> {tat.label}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 14, display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>↔ Drag a card to advance its status</span>
        <span>🔴 STAT — sorted to top</span>
        <span><Clock size={10} style={{ verticalAlign: 'middle' }} /> TAT elapsed since collection</span>
      </div>
    </div>
  );
}

export default WorkflowTab;
