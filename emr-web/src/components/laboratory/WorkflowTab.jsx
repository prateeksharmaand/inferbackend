/**
 * WorkflowTab - Kanban-style order workflow board
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronRight } from 'lucide-react';

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

const COLUMNS = ['PENDING', 'COLLECTED', 'PROCESSING', 'REPORTED'];
const STATUS_NEXT = {
  PENDING: 'COLLECTED',
  COLLECTED: 'PROCESSING',
  PROCESSING: 'RESULTED',
  RESULTED: 'REPORTED',
};

const COL_STYLE = {
  PENDING:    { header: 'var(--color-text-3)', dot: '#94a3b8' },
  COLLECTED:  { header: '#9a3412', dot: '#f97316' },
  PROCESSING: { header: '#92400e', dot: '#f59e0b' },
  REPORTED:   { header: '#134e4a', dot: '#14b8a6' },
};

function priorityBadge(priority, s) {
  if (priority === 'STAT') return `${s.badge} ${s.badgeRed}`;
  if (priority === 'URGENT') return `${s.badge} ${s.badgeOrange}`;
  return `${s.badge} ${s.badgeGreen}`;
}

export function WorkflowTab({ labId, styles: s }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [advancingId, setAdvancingId] = useState(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const data = await apiFetch(`/api/v1/lab/${labId}/orders`);
      setOrders(data.orders || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [labId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleAdvance = async (order, e) => {
    e.stopPropagation();
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    try {
      setAdvancingId(order.id);
      await apiFetch(`/api/v1/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      fetchOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdvancingId(null);
    }
  };

  // Group by status, including RESULTED in PROCESSING column
  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col] = orders.filter((o) => {
      if (col === 'PROCESSING') return o.status === 'PROCESSING' || o.status === 'RESULTED';
      return o.status === col;
    });
    return acc;
  }, {});

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Workflow Board</div>
          <div className={s.pageSubtitle}>Drag-free Kanban view of active orders by status</div>
        </div>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchOrders}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}

      {loading ? (
        <div className={s.emptyState}><div className={s.emptyText}>Loading orders...</div></div>
      ) : (
        <div className={s.kanbanBoard}>
          {COLUMNS.map((col) => {
            const colOrders = grouped[col] || [];
            const style = COL_STYLE[col];
            return (
              <div key={col} className={s.kanbanCol}>
                <div className={s.kanbanColHeader} style={{ color: style.header }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: style.dot, display: 'inline-block' }} />
                    {col}
                  </span>
                  <span className={s.kanbanColCount}>{colOrders.length}</span>
                </div>
                {colOrders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--color-text-3)', fontSize: 12 }}>
                    No orders
                  </div>
                ) : colOrders.map((order) => (
                  <div key={order.id} className={s.kanbanCard}>
                    <div className={s.kanbanCardNum}>{order.order_number || order.id}</div>
                    <div className={s.kanbanCardSub}>Patient: {order.patient_id}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span className={priorityBadge(order.priority, s)}>{order.priority}</span>
                      {STATUS_NEXT[order.status] && (
                        <button
                          className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                          onClick={(e) => handleAdvance(order, e)}
                          disabled={advancingId === order.id}
                          title={`Advance to ${STATUS_NEXT[order.status]}`}
                        >
                          <ChevronRight size={12} />
                          {advancingId === order.id ? '...' : STATUS_NEXT[order.status]}
                        </button>
                      )}
                    </div>
                    {order.created_at && (
                      <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 4 }}>
                        {new Date(order.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkflowTab;
