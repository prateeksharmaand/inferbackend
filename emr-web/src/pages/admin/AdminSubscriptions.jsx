import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/adminClient';
import styles from './AdminSubscriptions.module.css';

const CYCLES = [
  { key: 'monthly', label: '1 Month' },
  { key: 'yearly',  label: '1 Year'  },
  { key: '2year',   label: '2 Years' },
  { key: '3year',   label: '3 Years' },
];

const CYCLE_MONTHS = { monthly: 1, yearly: 12, '2year': 24, '3year': 36 };

const STATUS_COLOR = {
  active: '#16a34a', expired: '#dc2626', cancelled: '#64748b',
  trial: '#2563eb', past_due: '#d97706',
};

function fmt(paise) {
  return '₹' + (paise / 100).toLocaleString('en-IN');
}

// ── Create Subscription Modal ─────────────────────────────────────────────────
function CreateModal({ onClose, onCreated }) {
  const [catalog, setCatalog] = useState(null);
  const [cycle, setCycle]     = useState('yearly');
  const [clinicId, setClinicId] = useState('');
  const [seats, setSeats]     = useState({});   // { key: qty }
  const [addons, setAddons]   = useState({});   // { key: qty }
  const [expires, setExpires] = useState('');
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminApi.getCatalog().then(setCatalog).catch(console.error);
  }, []);

  const priceKey = { monthly: 'price_monthly', yearly: 'price_yearly', '2year': 'price_2year', '3year': 'price_3year' }[cycle];
  const months   = CYCLE_MONTHS[cycle];

  function seatTotal() {
    if (!catalog) return 0;
    return catalog.seats.reduce((sum, s) => sum + (seats[s.key] || 0) * s[priceKey] * months, 0);
  }

  function addonTotal() {
    if (!catalog) return 0;
    return catalog.addons.reduce((sum, a) => sum + (addons[a.key] || 0) * a[priceKey] * months, 0);
  }

  const subtotal = seatTotal() + addonTotal();
  const gst      = Math.round(subtotal * 0.18);
  const total    = subtotal + gst;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clinicId) return toast.error('Select a clinic');
    const seatList  = Object.entries(seats).filter(([,q]) => q > 0).map(([key, quantity]) => ({ key, quantity }));
    const addonList = Object.entries(addons).filter(([,q]) => q > 0).map(([key, quantity]) => ({ key, quantity }));
    if (!seatList.length && !addonList.length) return toast.error('Add at least one seat or add-on');

    setLoading(true);
    try {
      await adminApi.createSubscription({
        clinic_id: parseInt(clinicId),
        billing_cycle: cycle,
        status: 'active',
        expires_at: expires || undefined,
        notes: notes || undefined,
        seats: seatList,
        addons: addonList,
      });
      toast.success('Subscription created');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function qty(map, setMap, key, delta) {
    setMap(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }));
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>New Subscription</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Clinic + cycle */}
          <div className={styles.topRow}>
            <label className={styles.fieldLabel}>Clinic
              <select
                className={styles.input}
                value={clinicId}
                onChange={e => setClinicId(e.target.value)}
                required
              >
                <option value="">Select clinic…</option>
                {catalog?.clinics.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <div className={styles.cycleTabs}>
              {CYCLES.map(c => (
                <button
                  key={c.key}
                  type="button"
                  className={`${styles.cycleTab} ${cycle === c.key ? styles.cycleActive : ''}`}
                  onClick={() => setCycle(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Seats */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Plans & Seats</div>
            {catalog?.seats.map(s => (
              <div key={s.key} className={styles.itemRow}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemName}>{s.display_name}</div>
                  <div className={styles.itemPrice}>{fmt(s[priceKey])}/seat/month · {CYCLES.find(c=>c.key===cycle)?.label}</div>
                </div>
                <div className={styles.qtyControl}>
                  <button type="button" className={styles.qtyBtn} onClick={() => qty(seats, setSeats, s.key, -1)}>−</button>
                  <span className={styles.qtyNum}>{seats[s.key] || 0}</span>
                  <button type="button" className={styles.qtyBtn} onClick={() => qty(seats, setSeats, s.key, 1)}>+</button>
                </div>
                {(seats[s.key] || 0) > 0 && (
                  <div className={styles.itemSubtotal}>
                    {fmt(s[priceKey] * (seats[s.key] || 0) * months)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add-ons */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Add-ons</div>
            {catalog?.addons.map(a => (
              <div key={a.key} className={styles.itemRow}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemName}>{a.display_name}</div>
                  <div className={styles.itemPrice}>{fmt(a[priceKey])}/seat/month</div>
                </div>
                <div className={styles.qtyControl}>
                  <button type="button" className={styles.qtyBtn} onClick={() => qty(addons, setAddons, a.key, -1)}>−</button>
                  <span className={styles.qtyNum}>{addons[a.key] || 0}</span>
                  <button type="button" className={styles.qtyBtn} onClick={() => qty(addons, setAddons, a.key, 1)}>+</button>
                </div>
                {(addons[a.key] || 0) > 0 && (
                  <div className={styles.itemSubtotal}>
                    {fmt(a[priceKey] * (addons[a.key] || 0) * months)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Optional fields */}
          <div className={styles.optRow}>
            <label className={styles.fieldLabel}>Expiry Date
              <input type="date" className={styles.input} value={expires} onChange={e => setExpires(e.target.value)} />
            </label>
            <label className={styles.fieldLabel}>Notes
              <input className={styles.input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…" />
            </label>
          </div>

          {/* Summary */}
          <div className={styles.summary}>
            <div className={styles.summaryRow}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className={styles.summaryRow}><span>GST (18%)</span><span>{fmt(gst)}</span></div>
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Total ({CYCLES.find(c=>c.key===cycle)?.label})</span>
              <span>{fmt(total)}</span>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={loading || !clinicId}>
              {loading ? 'Creating…' : `Create · ${fmt(total)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Subscription Modal ───────────────────────────────────────────────────
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
      await adminApi.updateSubscription(sub.clinic_id, { ...form, expires_at: form.expires_at || undefined });
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
      <div className={styles.modal} style={{ maxWidth: 480 }}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Edit — {sub.clinic_name}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.editForm}>
          <div className={styles.optRow}>
            <label className={styles.fieldLabel}>Plan
              <select className={styles.input} value={form.plan_key} onChange={e => set('plan_key', e.target.value)}>
                <option value="base">Base (Free)</option>
                <option value="pro">Infer Pro</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>Status
              <select className={styles.input} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
                <option value="past_due">Past Due</option>
              </select>
            </label>
          </div>
          <div className={styles.optRow}>
            <label className={styles.fieldLabel}>Billing Cycle
              <select className={styles.input} value={form.billing_cycle} onChange={e => set('billing_cycle', e.target.value)}>
                <option value="free">Free</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="2year">2 Year</option>
                <option value="3year">3 Year</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>Expires At
              <input type="date" className={styles.input} value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
            </label>
          </div>
          <label className={styles.fieldLabel}>Notes
            <textarea rows={2} className={styles.input} value={form.notes} onChange={e => set('notes', e.target.value)} />
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminSubscriptions() {
  const [subs, setSubs]           = useState([]);
  const [statusFilter, setStatus] = useState('');
  const [planFilter, setPlan]     = useState('');
  const [editing, setEditing]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);

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
        <button className={styles.newBtn} onClick={() => setShowCreate(true)}>+ New Subscription</button>
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
              <th>Status</th>
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
                <td><span className={styles.planBadge}>{s.plan_name}</span></td>
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
                  {s.expires_at ? new Date(s.expires_at).toLocaleDateString('en-IN') : '—'}
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

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
      {editing    && <EditModal  sub={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
