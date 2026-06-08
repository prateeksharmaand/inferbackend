import { useState, useEffect } from 'react';
import { Plus, X, Pencil, Trash2, Check, UserRound, Zap } from 'lucide-react';
import { api } from '../../api/client';
import UpgradeModal from '../../components/UpgradeModal';
import styles from './ServicesSettings.module.css';
import ds from './DoctorsSettings.module.css';

const EMPTY_FORM = { name: '', email: '', password: '', specialization: '', qualification: '', registration_no: '', google_review_link: '' };

function DoctorModal({ doctor, onSave, onClose }) {
  const [form, setForm]   = useState(doctor ? { ...doctor, password: '' } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const isEdit = !!doctor;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())  return setError('Name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (!isEdit && !form.password) return setError('Password is required');
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>{isEdit ? 'Edit Doctor' : 'Add Doctor'}</span>
          <button className={styles.modalClose} onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalBody}>
          <div className={ds.row2}>
            <div className={styles.field}>
              <label>Full Name <span className={styles.req}>*</span></label>
              <input className={styles.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Dr. Jane Smith" autoFocus />
            </div>
            <div className={styles.field}>
              <label>Email <span className={styles.req}>*</span></label>
              <input className={styles.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="doctor@clinic.com" />
            </div>
          </div>
          <div className={styles.field}>
            <label>{isEdit ? 'New Password' : 'Password'} {!isEdit && <span className={styles.req}>*</span>}</label>
            <input className={styles.input} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder={isEdit ? 'Leave blank to keep current' : 'Min 8 characters'} />
          </div>
          <div className={ds.row2}>
            <div className={styles.field}>
              <label>Specialization</label>
              <input className={styles.input} value={form.specialization} onChange={e => set('specialization', e.target.value)} placeholder="General Physician" />
            </div>
            <div className={styles.field}>
              <label>Qualification</label>
              <input className={styles.input} value={form.qualification} onChange={e => set('qualification', e.target.value)} placeholder="MBBS, MD" />
            </div>
          </div>
          <div className={styles.field}>
            <label>Registration No.</label>
            <input className={styles.input} value={form.registration_no} onChange={e => set('registration_no', e.target.value)} placeholder="MCI/State council registration" />
          </div>
          <div className={styles.field}>
            <label>Google Review Link</label>
            <input className={styles.input} type="url" value={form.google_review_link || ''} onChange={e => set('google_review_link', e.target.value)} placeholder="https://g.page/r/XXXXXXXX/review" />
            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Shared with patients after each visit via the "Send Google Review" button.</span>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} /> {isEdit ? 'Save Changes' : 'Add Doctor'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DoctorsSettings() {
  const [doctors,     setDoctors]     = useState([]);
  const [seatInfo,    setSeatInfo]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [editDoctor,  setEditDoctor]  = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [docs, seats] = await Promise.all([
        api.get('/auth/doctors'),
        api.get('/auth/seat-info'),
      ]);
      setDoctors(docs);
      setSeatInfo(seats);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (form) => {
    const payload = { name: form.name, email: form.email, password: form.password,
      specialization: form.specialization, qualification: form.qualification, registration_no: form.registration_no };
    const created = await api.post('/auth/add-doctor', payload);
    setDoctors(d => [...d, { ...created, is_active: true }].sort((a, b) => a.name.localeCompare(b.name)));
    setShowModal(false);
  };

  const handleEdit = async (form) => {
    const payload = { name: form.name, email: form.email, specialization: form.specialization,
      qualification: form.qualification, registration_no: form.registration_no };
    if (form.password) payload.password = form.password;
    const updated = await api.patch(`/auth/doctors/${editDoctor.id}`, payload);
    setDoctors(d => d.map(x => x.id === updated.id ? updated : x));
    setEditDoctor(null);
  };

  const toggleActive = async (doc) => {
    const updated = await api.patch(`/auth/doctors/${doc.id}`, { is_active: !doc.is_active });
    setDoctors(d => d.map(x => x.id === updated.id ? updated : x));
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Remove Dr. ${doc.name}? This cannot be undone.`)) return;
    await api.delete(`/auth/doctors/${doc.id}`);
    setDoctors(d => d.filter(x => x.id !== doc.id));
  };

  const seatsAvailable = seatInfo
    ? (seatInfo.unlimited || seatInfo.available > 0)
    : true; // allow while loading

  const pct = seatInfo && !seatInfo.unlimited && seatInfo.limit > 0
    ? Math.min(100, Math.round((seatInfo.used / seatInfo.limit) * 100))
    : 0;
  const barColor = pct >= 100 ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-warning)' : 'var(--color-primary)';

  return (
    <div className={styles.wrap}>

      <div className={styles.toolbar}>
        <span className={ds.count}>{doctors.length} doctor{doctors.length !== 1 ? 's' : ''}</span>
        <div style={{ flex: 1 }} />
        {seatsAvailable ? (
          <button className={styles.btnCreate} onClick={() => setShowModal(true)}>
            <Plus size={14} strokeWidth={2.5} /> Add Doctor
          </button>
        ) : (
          <button className={ds.upgradeBtn} onClick={() => setShowUpgrade(true)}>
            <Zap size={13} strokeWidth={2.5} /> Upgrade Now
          </button>
        )}
      </div>

      {seatInfo && (
        <div className={ds.seatBar}>
          <div className={ds.seatBarTop}>
            <span className={ds.seatBarLabel}>
              <strong>{seatInfo.plan_name}</strong>
              {' · '}
              {seatInfo.unlimited
                ? 'Unlimited doctor seats'
                : `${seatInfo.used} of ${seatInfo.limit} seat${seatInfo.limit !== 1 ? 's' : ''} used`}
            </span>
            {!seatInfo.unlimited && (
              <span className={ds.seatBarRight}>
                {seatInfo.available > 0
                  ? <span className={ds.available}>{seatInfo.available} available</span>
                  : <span className={ds.full}>No seats available — upgrade to add more</span>}
              </span>
            )}
          </div>
          {!seatInfo.unlimited && (
            <div className={ds.progressTrack}>
              <div className={ds.progressFill} style={{ width: `${pct}%`, background: barColor }} />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className={styles.emptyText}>Loading…</p>
      ) : doctors.length === 0 ? (
        <div className={styles.emptyState}>
          <UserRound size={36} strokeWidth={1.2} className={styles.emptyIcon} />
          <p>No doctors yet. Add your first doctor.</p>
        </div>
      ) : (
        <div className={styles.table}>
          <div className={ds.tableHead}>
            <span>Name</span>
            <span>Specialization</span>
            <span>Email</span>
            <span>Status</span>
            <span></span>
          </div>
          {doctors.map(doc => (
            <div key={doc.id} className={ds.tableRow}>
              <div>
                <div className={ds.docName}>{doc.name}</div>
                {doc.qualification && <div className={ds.docSub}>{doc.qualification}{doc.registration_no ? ` · ${doc.registration_no}` : ''}</div>}
              </div>
              <span className={ds.docSpec}>{doc.specialization || '—'}</span>
              <span className={ds.docEmail}>{doc.email}</span>
              <span>
                <button
                  className={`${styles.badge} ${doc.is_active ? styles.badgeActive : styles.badgeInactive}`}
                  onClick={() => toggleActive(doc)}
                  title="Click to toggle"
                >
                  {doc.is_active ? 'Active' : 'Inactive'}
                </button>
              </span>
              <span className={styles.rowActions}>
                <button className={styles.iconBtn} onClick={() => setEditDoctor(doc)} title="Edit"><Pencil size={13} /></button>
                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => handleDelete(doc)} title="Remove"><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
        </div>
      )}

      {showModal   && <DoctorModal onSave={handleAdd}  onClose={() => setShowModal(false)} />}
      {editDoctor  && <DoctorModal doctor={editDoctor} onSave={handleEdit} onClose={() => setEditDoctor(null)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
