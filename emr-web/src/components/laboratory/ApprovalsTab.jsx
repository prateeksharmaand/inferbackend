/**
 * ApprovalsTab - Pending approvals for resulted orders
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Check, CheckSquare } from 'lucide-react';

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

export function ApprovalsTab({ labId, styles: s }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchPendingApprovals = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const data = await apiFetch(`/api/v1/lab/${labId}/orders?status=RESULTED`);
      setOrders(data.orders || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [labId]);

  useEffect(() => { fetchPendingApprovals(); }, [fetchPendingApprovals]);

  const handleApprove = async (order) => {
    try {
      setApprovingId(order.id);
      // Advance status from RESULTED to REPORTED (approve/release)
      await apiFetch(`/api/v1/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'REPORTED', notes: 'Approved and released by lab staff' }),
      });
      setSuccessMsg(`Order ${order.order_number || order.id} approved and reported.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchPendingApprovals();
    } catch (err) {
      setError(err.message);
    } finally {
      setApprovingId(null);
    }
  };

  const pendingCount = orders.length;

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Approvals
            {pendingCount > 0 && <span className={`${s.badge} ${s.badgeYellow}`}>{pendingCount} pending</span>}
          </div>
          <div className={s.pageSubtitle}>Orders with results ready for approval and release</div>
        </div>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchPendingApprovals}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}
      {successMsg && <div className={`${s.alert} ${s.alertSuccess}`}>{successMsg}</div>}

      {loading ? (
        <div className={s.emptyState}><div className={s.emptyText}>Loading pending approvals...</div></div>
      ) : orders.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><CheckSquare size={48} /></div>
          <div className={s.emptyText}>No orders pending approval</div>
        </div>
      ) : (
        <div className={s.card}>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  {['Order #', 'Patient ID', 'Doctor ID', 'Priority', 'Status', 'Created', 'Action'].map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 600 }}>{order.order_number || order.id}</td>
                    <td>{order.patient_id}</td>
                    <td>{order.ordering_doctor_id || order.doctor_id || '—'}</td>
                    <td>
                      <span className={`${s.badge} ${order.priority === 'STAT' ? s.badgeRed : order.priority === 'URGENT' ? s.badgeOrange : s.badgeGreen}`}>
                        {order.priority}
                      </span>
                    </td>
                    <td><span className={`${s.badge} ${s.badgeGreen}`}>{order.status}</span></td>
                    <td>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <button
                        className={`${s.btn} ${s.btnSuccess} ${s.btnSm}`}
                        onClick={() => handleApprove(order)}
                        disabled={approvingId === order.id}
                      >
                        <Check size={13} />
                        {approvingId === order.id ? 'Approving...' : 'Approve & Release'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApprovalsTab;
