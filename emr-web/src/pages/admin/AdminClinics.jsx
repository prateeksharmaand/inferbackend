import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/adminClient';
import styles from './AdminClinics.module.css';

const STATUS_COLOR = { active: '#10b981', suspended: '#f59e0b', trial: '#3b82f6' };

function Badge({ status }) {
  return (
    <span className={styles.badge} style={{ background: STATUS_COLOR[status] + '22', color: STATUS_COLOR[status] }}>
      {status}
    </span>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    clinic_name: '', address: '', phone: '', email: '',
    owner_name: '', owner_email: '', owner_password: '',
    plan_key: 'base', trial_days: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, trial_days: form.trial_days ? parseInt(form.trial_days) : undefined };
      const res = await adminApi.createClinic(payload);
      setResult(res);
      onCreated();
      toast.success('Clinic created successfully');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <h2 className={styles.modalTitle}>Clinic Created</h2>
          <p className={styles.credNote}>Share these credentials with the clinic owner:</p>
          <div className={styles.credBox}>
            <div><span>Login URL</span> <code>/opd/login</code></div>
            <div><span>Email</span> <code>{result.owner_email}</code></div>
            <div><span>Password</span> <code>{result.owner_password}</code></div>
          </div>
          <button className={styles.btnPrimary} onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Create New Clinic</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <fieldset className={styles.fieldset}>
            <legend>Clinic Info</legend>
            <div className={styles.row}>
              <label>Clinic Name *
                <input required value={form.clinic_name} onChange={e => set('clinic_name', e.target.value)} />
              </label>
              <label>Email
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </label>
            </div>
            <div className={styles.row}>
              <label>Phone
                <input value={form.phone} onChange={e => set('phone', e.target.value)} />
              </label>
              <label>Address
                <input value={form.address} onChange={e => set('address', e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>Owner / Admin Account</legend>
            <div className={styles.row}>
              <label>Owner Name
                <input value={form.owner_name} onChange={e => set('owner_name', e.target.value)} />
              </label>
              <label>Owner Email *
                <input type="email" required value={form.owner_email} onChange={e => set('owner_email', e.target.value)} />
              </label>
            </div>
            <label>Temporary Password *
              <input required value={form.owner_password} onChange={e => set('owner_password', e.target.value)} placeholder="min 8 chars" />
            </label>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>Subscription</legend>
            <div className={styles.row}>
              <label>Plan
                <select value={form.plan_key} onChange={e => set('plan_key', e.target.value)}>
                  <option value="base">Base (Free)</option>
                  <option value="pro">Infer Pro</option>
                </select>
              </label>
              <label>Trial Days
                <input type="number" min="0" value={form.trial_days} onChange={e => set('trial_days', e.target.value)} placeholder="optional" />
              </label>
            </div>
          </fieldset>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Creating…' : 'Create Clinic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminClinics() {
  const [clinics, setClinics]     = useState([]);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const load = useCallback(() => {
    const params = {};
    if (search)       params.search = search;
    if (statusFilter) params.status = statusFilter;
    adminApi.listClinics(params).then(setClinics).catch(console.error);
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchParams.get('new') === '1') setShowCreate(true);
  }, [searchParams]);

  async function handleSuspend(id) {
    if (!confirm('Suspend this clinic? They will lose access.')) return;
    await adminApi.suspendClinic(id);
    toast.success('Clinic suspended');
    load();
  }

  async function handleActivate(id) {
    await adminApi.activateClinic(id);
    toast.success('Clinic activated');
    load();
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Clinics</h1>
        <button className={styles.newBtn} onClick={() => setShowCreate(true)}>+ New Clinic</button>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={styles.select} value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="trial">Trial</option>
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Clinic</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Patients</th>
              <th>Doctors</th>
              <th>Subscription</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clinics.map(c => (
              <tr key={c.id}>
                <td>
                  <div className={styles.clinicName}>{c.name}</div>
                  <div className={styles.clinicEmail}>{c.email || '—'}</div>
                </td>
                <td><Badge status={c.status || 'active'} /></td>
                <td><Badge status={c.plan_key || 'base'} /></td>
                <td>{c.patient_count}</td>
                <td>{c.doctor_count}</td>
                <td>
                  <div className={styles.subStatus}>{c.sub_status}</div>
                  {c.expires_at && (
                    <div className={styles.expiry}>
                      Expires {new Date(c.expires_at).toLocaleDateString('en-IN')}
                    </div>
                  )}
                </td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.linkBtn} onClick={() => navigate(`/admin/clinics/${c.id}`)}>
                      View
                    </button>
                    {c.status !== 'suspended'
                      ? <button className={styles.warnBtn} onClick={() => handleSuspend(c.id)}>Suspend</button>
                      : <button className={styles.linkBtn} onClick={() => handleActivate(c.id)}>Activate</button>
                    }
                  </div>
                </td>
              </tr>
            ))}
            {clinics.length === 0 && (
              <tr><td colSpan={7} className={styles.empty}>No clinics found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
