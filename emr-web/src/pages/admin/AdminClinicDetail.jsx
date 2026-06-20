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

const ABDM_STATUS_COLOR = {
  ACTIVE: '#16a34a', CONFIGURED: '#2563eb',
  NOT_CONFIGURED: '#64748b', INACTIVE: '#d97706',
};

export default function AdminClinicDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [clinic, setClinic]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems]     = useState([]);

  const [abdmForm, setAbdmForm] = useState({ hip_id: '', hip_name: '', hiu_id: '', hiu_name: '', abdm_enabled: false });
  const [abdmSaving, setAbdmSaving] = useState(false);
  const [abdmEdit, setAbdmEdit] = useState(false);

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

  useEffect(() => {
    load();
  }, [id]);

  // Sync ABDM form when clinic data loads
  useEffect(() => {
    if (clinic) {
      setAbdmForm({
        hip_id:      clinic.hip_id      || '',
        hip_name:    clinic.hip_name    || '',
        hiu_id:      clinic.hiu_id      || '',
        hiu_name:    clinic.hiu_name    || '',
        abdm_enabled: !!clinic.abdm_enabled,
      });
    }
  }, [clinic]);

  async function handleAbdmSave() {
    setAbdmSaving(true);
    try {
      const payload = {
        hip_id:      abdmForm.hip_id.trim()   || null,
        hip_name:    abdmForm.hip_name.trim()  || null,
        hiu_id:      abdmForm.hiu_id.trim()   || null,
        hiu_name:    abdmForm.hiu_name.trim()  || null,
        abdm_enabled: abdmForm.abdm_enabled,
      };
      await adminApi.updateClinicAbdm(id, payload);
      toast.success('ABDM configuration saved');
      setAbdmEdit(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAbdmSaving(false);
    }
  }

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

        {/* ABDM Configuration */}
        <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
          <div className={styles.cardTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>ABDM Configuration</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {!abdmEdit && (
                <button className={styles.primaryBtn} onClick={() => setAbdmEdit(true)}>Edit</button>
              )}
            </div>
          </div>

          {!abdmEdit ? (
            /* Read-only view */
            <div className={styles.infoTable}>
              <div className={styles.infoRow}>
                <span>ABDM Enabled</span>
                <Badge
                  text={clinic.abdm_enabled ? 'Enabled' : 'Disabled'}
                  color={clinic.abdm_enabled ? '#16a34a' : '#64748b'}
                />
              </div>
              <div className={styles.infoRow}>
                <span>Status</span>
                <Badge
                  text={clinic.abdm_status || 'NOT_CONFIGURED'}
                  color={ABDM_STATUS_COLOR[clinic.abdm_status] || '#64748b'}
                />
              </div>
              <div className={styles.infoRow}>
                <span>HIP ID</span>
                <code className={styles.code}>{clinic.hip_id || '—'}</code>
              </div>
              <div className={styles.infoRow}>
                <span>HIP Name</span>
                <strong>{clinic.hip_name || '—'}</strong>
              </div>
              <div className={styles.infoRow}>
                <span>HIU ID</span>
                <code className={styles.code}>{clinic.hiu_id || '—'}</code>
              </div>
              <div className={styles.infoRow}>
                <span>HIU Name</span>
                <strong>{clinic.hiu_name || '—'}</strong>
              </div>
              {clinic.abdm_last_synced_at && (
                <div className={styles.infoRow}>
                  <span>Last Synced</span>
                  <strong>{new Date(clinic.abdm_last_synced_at).toLocaleString('en-IN')}</strong>
                </div>
              )}
            </div>
          ) : (
            /* Edit form */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <label className={styles.fieldLabel}>
                HIP ID
                <input
                  className={styles.input}
                  placeholder="e.g. noushealthhip"
                  value={abdmForm.hip_id}
                  onChange={e => setAbdmForm(f => ({ ...f, hip_id: e.target.value }))}
                />
                <span className={styles.hint}>Must match the service ID registered in ABDM bridge</span>
              </label>

              <label className={styles.fieldLabel}>
                HIP Name
                <input
                  className={styles.input}
                  placeholder="e.g. Nous Health HIP"
                  value={abdmForm.hip_name}
                  onChange={e => setAbdmForm(f => ({ ...f, hip_name: e.target.value }))}
                />
              </label>

              <label className={styles.fieldLabel}>
                HIU ID
                <input
                  className={styles.input}
                  placeholder="e.g. noushealthhiu"
                  value={abdmForm.hiu_id}
                  onChange={e => setAbdmForm(f => ({ ...f, hiu_id: e.target.value }))}
                />
                <span className={styles.hint}>HIU ID for consent requests (can be same as HIP ID)</span>
              </label>

              <label className={styles.fieldLabel}>
                HIU Name
                <input
                  className={styles.input}
                  placeholder="e.g. Nous Health HIU"
                  value={abdmForm.hiu_name}
                  onChange={e => setAbdmForm(f => ({ ...f, hiu_name: e.target.value }))}
                />
              </label>

              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={abdmForm.abdm_enabled}
                  onChange={e => setAbdmForm(f => ({ ...f, abdm_enabled: e.target.checked }))}
                />
                <span>Enable ABDM for this clinic</span>
              </label>

              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className={styles.backBtn} onClick={() => setAbdmEdit(false)}>Cancel</button>
                <button className={styles.primaryBtn} onClick={handleAbdmSave} disabled={abdmSaving}>
                  {abdmSaving ? 'Saving…' : 'Save ABDM Config'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
