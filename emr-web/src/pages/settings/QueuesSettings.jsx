import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Check, X, LayoutList, Info } from 'lucide-react';
import { api } from '../../api/client';
import styles from './ServicesSettings.module.css';
import qs from './QueuesSettings.module.css';

const MODE_LABELS = { in_clinic: 'In Clinic', tele: 'Tele', in_clinic_tele: 'Both' };
const SORT_LABELS = {
  appointment_start:    'Start Time',
  appointment_checkin:  'Check-In',
  appointment_update:   'Last Update',
  token:                'Token #',
  appointment_complete: 'Completed',
};

// ── Edit modal ────────────────────────────────────────────────────────────
function EditQueueModal({ queue, doctors, onSave, onClose }) {
  const [form, setForm] = useState({
    name:      queue.name      || '',
    mode:      queue.mode      || 'in_clinic',
    doctor_id: queue.doctor_id || '',
    sort_order: queue.sort_order || 'token',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Queue name is required');
    setSaving(true); setError('');
    try { await onSave({ ...form, doctor_id: form.doctor_id || null }); }
    catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>Edit Queue</span>
          <button className={styles.modalClose} onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalBody}>

          <div className={styles.field}>
            <label>Queue Name <span className={styles.req}>*</span></label>
            <input className={styles.input} value={form.name} autoFocus
              onChange={e => set('name', e.target.value)} placeholder="e.g. Morning OPD" />
          </div>

          <div className={styles.field}>
            <label>Mode</label>
            <select className={`${styles.input} ${qs.select}`} value={form.mode} onChange={e => set('mode', e.target.value)}>
              <option value="in_clinic">In Clinic</option>
              <option value="tele">Tele Consultation</option>
              <option value="in_clinic_tele">Both (In Clinic + Tele)</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>Assigned Doctor (optional)</label>
            <select className={`${styles.input} ${qs.select}`} value={form.doctor_id} onChange={e => set('doctor_id', e.target.value)}>
              <option value="">— All / Unassigned —</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name}{d.specialization ? ` · ${d.specialization}` : ''}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label>Default Sort Order</label>
            <select className={`${styles.input} ${qs.select}`} value={form.sort_order} onChange={e => set('sort_order', e.target.value)}>
              {Object.entries(SORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} /> Save Changes</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function QueuesSettings() {
  const navigate  = useNavigate();
  const [queues,   setQueues]   = useState([]);
  const [doctors,  setDoctors]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editQ,    setEditQ]    = useState(null);

  useEffect(() => {
    Promise.all([api.get('/queues'), api.get('/auth/doctors')])
      .then(([q, d]) => { setQueues(q || []); setDoctors(d || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleEdit = async (form) => {
    const updated = await api.patch(`/queues/${editQ.id}`, form);
    setQueues(qs => qs.map(x => x.id === updated.id ? { ...x, ...updated } : x));
    setEditQ(null);
  };

  const toggleActive = async (q) => {
    await api.patch(`/queues/${q.id}`, { is_active: !q.is_active });
    setQueues(qs => qs.map(x => x.id === q.id ? { ...x, is_active: !x.is_active } : x));
  };

  const handleDelete = async (q) => {
    if (!window.confirm(`Delete queue "${q.name}"? This cannot be undone.`)) return;
    await api.delete(`/queues/${q.id}`);
    setQueues(qs => qs.filter(x => x.id !== q.id));
  };

  return (
    <div className={styles.wrap}>

      {/* ── Info banner ── */}
      <div className={qs.infoBanner}>
        <Info size={14} className={qs.infoIcon} />
        Queues are <strong>permanent</strong> — they carry over every day automatically. Create once, use forever.
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <span className={qs.count}>{queues.length} queue{queues.length !== 1 ? 's' : ''}</span>
        <div style={{ flex: 1 }} />
        <button className={styles.btnCreate} onClick={() => navigate('/queue/setup')}>
          <Plus size={14} strokeWidth={2.5} /> New Queue
        </button>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <p className={styles.emptyText}>Loading…</p>
      ) : queues.length === 0 ? (
        <div className={styles.emptyState}>
          <LayoutList size={40} strokeWidth={1.2} className={styles.emptyIcon} />
          <p>No queues yet. Create your first queue to start seeing patients.</p>
          <button className={styles.btnCreate} style={{ marginTop: 12 }} onClick={() => navigate('/queue/setup')}>
            <Plus size={14} /> Create Queue
          </button>
        </div>
      ) : (
        <div className={styles.table}>
          <div className={`${styles.tableHead} ${qs.grid}`}>
            <span>Queue Name</span>
            <span>Mode</span>
            <span>Doctor</span>
            <span>Sort By</span>
            <span>Status</span>
            <span></span>
          </div>
          {queues.map(q => (
            <div key={q.id} className={`${styles.tableRow} ${qs.grid}`}>

              {/* Name */}
              <div className={qs.nameCell}>
                <span className={qs.queueName}>{q.name}</span>
                {q.today_count > 0 && (
                  <span className={qs.todayBadge}>{q.today_count} today</span>
                )}
              </div>

              {/* Mode */}
              <span className={qs.modeBadge} data-mode={q.mode}>
                {MODE_LABELS[q.mode] || q.mode || 'In Clinic'}
              </span>

              {/* Doctor */}
              <span className={qs.doctorCell}>
                {q.doctor_name || <span style={{ color: 'var(--color-text-3)' }}>All doctors</span>}
              </span>

              {/* Sort */}
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
                {SORT_LABELS[q.sort_order] || q.sort_order || '—'}
              </span>

              {/* Active toggle */}
              <span>
                <button
                  className={`${styles.badge} ${q.is_active ? styles.badgeActive : styles.badgeInactive}`}
                  onClick={() => toggleActive(q)}
                  title="Click to toggle"
                >
                  {q.is_active ? 'Active' : 'Inactive'}
                </button>
              </span>

              {/* Actions */}
              <span className={styles.rowActions}>
                <button className={styles.iconBtn} onClick={() => setEditQ(q)} title="Edit">
                  <Pencil size={13} />
                </button>
                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => handleDelete(q)} title="Delete">
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {editQ && (
        <EditQueueModal queue={editQ} doctors={doctors} onSave={handleEdit} onClose={() => setEditQ(null)} />
      )}
    </div>
  );
}
