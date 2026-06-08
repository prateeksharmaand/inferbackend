import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/adminClient';
import styles from './AdminSubscriptions.module.css';

const STATUS_COLOR = {
  active: '#10b981', expired: '#f87171', cancelled: '#64748b', trial: '#3b82f6', past_due: '#f59e0b',
};

function EditModal({ sub, onClose, onSaved }) {
  const [form, setForm] = useState({
    plan_key:      sub.plan_key || 'base',
    status:        sub.sub_status || 'active',
    billing_cycle: sub.billing_cycle || 'free',
    expires_at:    sub.expires_at ? sub.expires_at.slice(0, 10) : '',
    notes:         sub.notes || '',
  });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await adminApi.updateSubscription(sub.clinic_id, {
        ...form,
        expires_at: form.expires_at || undefined,
      });
      toast.success('Subscription updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Edit Subscription — {sub.clinic_name}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.row}>
            <label>Plan
              <select value={form.plan_key} onChange={e => set('plan_key', e.target.value)}>
                <option value="base">Base (Free)</option>
                <option value="pro">Infer Pro</option>
              </select>
            </label>
            <label>Status
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
                <option value="past_due">Past Due</option>
              </select>
            </label>
          </div>
          <div className={styles.row}>
            <label>Billing Cycle
              <select value={form.billing_cycle} onChange={e => set('billing_cycle', e.target.value)}>
                <option value="free">Free</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="2year">2 Year</option>
                <option value="3year">3 Year</option>
              </select>
            </label>
            <label>Expires At
              <input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
            </label>
          </div>
          <label>Notes
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Internal notes…"
            />
          </label>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminSubscriptions() {
  const [subs, setSubs]       = useState([]);
  const [statusFilter, setStatus] = useState('');
  const [planFilter, setPlan] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (planFilter)   params.plan   = planFilter;
    adminApi.listSubscriptions(params).then(setSubs).catch(console.error);
  }, [statusFilter, planFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Subscriptions</h1>
      </div>

      <div className={styles.filters}>
        <select className={styles.select} value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className={styles.select} value={planFilter} onChange={e => setPlan(e.target.value)}>
          <option value="">All plans</option>
          <option value="base">Base</option>
          <option value="pro">Pro</option>
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Clinic</th>
              <th>Plan</th>
              <th>Sub Status</th>
              <th>Billing Cycle</th>
              <th>Expires</th>
              <th>Payment ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subs.map(s => (
              <tr key={s.id}>
                <td>
                  <div className={styles.name}>{s.clinic_name}</div>
                  <div className={styles.email}>{s.clinic_email || '—'}</div>
                </td>
                <td>
                  <span className={styles.planBadge}>{s.plan_name}</span>
                </td>
                <td>
                  <span className={styles.badge} style={{
                    background: (STATUS_COLOR[s.sub_status] || '#64748b') + '22',
                    color: STATUS_COLOR[s.sub_status] || '#64748b',
                  }}>
                    {s.sub_status}
                  </span>
                </td>
                <td className={styles.muted}>{s.billing_cycle}</td>
                <td className={styles.muted}>
                  {s.expires_at
                    ? new Date(s.expires_at).toLocaleDateString('en-IN')
                    : '—'}
                </td>
                <td>
                  {s.razorpay_payment_id
                    ? <code className={styles.code}>{s.razorpay_payment_id.slice(0, 16)}…</code>
                    : <span className={styles.muted}>—</span>}
                </td>
                <td>
                  <button className={styles.editBtn} onClick={() => setEditing(s)}>Edit</button>
                </td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr><td colSpan={7} className={styles.empty}>No subscriptions found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal sub={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}
