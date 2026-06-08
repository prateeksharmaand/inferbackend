import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/adminClient';
import styles from './AdminClinicDetail.module.css';

const STATUS_COLOR = { active: '#16a34a', suspended: '#d97706', trial: '#2563eb' };

function Badge({ text, color }) {
  return (
    <span className={styles.badge} style={{ background: (color || '#64748b') + '22', color: color || '#64748b' }}>
      {text}
    </span>
  );
}

export default function AdminClinicDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [clinic, setClinic]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems]     = useState([]);

  async function load() {
    try {
      const [c, i] = await Promise.all([
        adminApi.getClinic(id),
        adminApi.getSubscriptionItems(id).catch(() => []),
      ]);
      setClinic(c);
      setItems(i);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSuspend() {
    if (!confirm('Suspend this clinic? They will lose access.')) return;
    await adminApi.suspendClinic(id);
    toast.success('Clinic suspended');
    load();
  }

  async function handleActivate() {
    await adminApi.activateClinic(id);
    toast.success('Clinic activated');
    load();
  }

  if (loading) return <div className={styles.loading}>Loading…</div>;
  if (!clinic)  return <div className={styles.loading}>Clinic not found.</div>;

  const status = clinic.status || 'active';

  return (
    <div>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/admin/clinics')}>← Clinics</button>
          <div>
            <h1 className={styles.title}>{clinic.name}</h1>
            <div className={styles.meta}>
              {clinic.email && <span>{clinic.email}</span>}
              {clinic.phone && <span>· {clinic.phone}</span>}
              {clinic.address && <span>· {clinic.address}</span>}
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Badge text={status} color={STATUS_COLOR[status]} />
          {status !== 'suspended'
            ? <button className={styles.warnBtn} onClick={handleSuspend}>Suspend</button>
            : <button className={styles.primaryBtn} onClick={handleActivate}>Activate</button>
          }
        </div>
      </div>

      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{clinic.patient_count ?? 0}</div>
          <div className={styles.statLbl}>Patients</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{clinic.appt_count ?? 0}</div>
          <div className={styles.statLbl}>Appointments</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{clinic.doctors?.length ?? 0}</div>
          <div className={styles.statLbl}>Doctors</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{clinic.staff?.length ?? 0}</div>
          <div className={styles.statLbl}>Staff</div>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Subscription */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Subscription</div>
          <div className={styles.infoTable}>
            <div className={styles.infoRow}><span>Plan</span><strong>{clinic.plan_name || clinic.plan_key || '—'}</strong></div>
            <div className={styles.infoRow}><span>Status</span><strong>{clinic.sub_status || '—'}</strong></div>
            <div className={styles.infoRow}><span>Billing</span><strong>{clinic.billing_cycle || '—'}</strong></div>
            <div className={styles.infoRow}>
              <span>Expires</span>
              <strong>{clinic.expires_at ? new Date(clinic.expires_at).toLocaleDateString('en-IN') : 'No expiry'}</strong>
            </div>
            {clinic.razorpay_payment_id && (
              <div className={styles.infoRow}>
                <span>Payment ID</span>
                <code className={styles.code}>{clinic.razorpay_payment_id}</code>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <>
              <div className={styles.subSection}>Seat & Add-on Items</div>
              <table className={styles.itemsTable}>
                <thead>
                  <tr><th>Item</th><th>Type</th><th>Qty</th><th>Unit Price</th></tr>
                </thead>
                <tbody>
                  {items.map(i => (
                    <tr key={i.id}>
                      <td>{i.display_name}</td>
                      <td><Badge text={i.item_type} /></td>
                      <td>{i.quantity}</td>
                      <td>₹{(i.unit_price_paise / 100).toLocaleString('en-IN')}/mo</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <button
            className={styles.linkBtn}
            onClick={() => navigate('/admin/subscriptions')}
          >
            Manage subscription →
          </button>
        </div>

        {/* Doctors */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Doctors ({clinic.doctors?.length ?? 0})</div>
          {clinic.doctors?.length > 0 ? (
            <table className={styles.peopleTable}>
              <thead><tr><th>Name</th><th>Specialization</th><th>Status</th></tr></thead>
              <tbody>
                {clinic.doctors.map(d => (
                  <tr key={d.id}>
                    <td>
                      <div className={styles.personName}>{d.name}</div>
                      <div className={styles.personEmail}>{d.email}</div>
                    </td>
                    <td className={styles.muted}>{d.specialization || '—'}</td>
                    <td>
                      <Badge
                        text={d.is_active ? 'active' : 'inactive'}
                        color={d.is_active ? '#16a34a' : '#64748b'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className={styles.empty}>No doctors added yet.</p>}
        </div>

        {/* Staff */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Staff ({clinic.staff?.length ?? 0})</div>
          {clinic.staff?.length > 0 ? (
            <table className={styles.peopleTable}>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {clinic.staff.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div className={styles.personName}>{s.name}</div>
                      <div className={styles.personEmail}>{s.email}</div>
                    </td>
                    <td className={styles.muted}>{s.role}</td>
                    <td>
                      <Badge
                        text={s.is_active ? 'active' : 'inactive'}
                        color={s.is_active ? '#16a34a' : '#64748b'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className={styles.empty}>No staff added yet.</p>}
        </div>

        {/* Notes */}
        {clinic.notes && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Notes</div>
            <p className={styles.notes}>{clinic.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
