import { useState, useEffect } from 'react';
import { Plus, X, Pencil, Trash2, Check, FlaskConical } from 'lucide-react';
import { api } from '../../api/client';
import styles from './ServicesSettings.module.css';
import ls from './LabStaffSettings.module.css';

const LAB_ROLES = ['LAB_TECHNICIAN', 'LAB_ADMIN', 'LAB_DIRECTOR'];
const LAB_TYPES = ['CLINICAL', 'DIAGNOSTIC', 'REFERENCE', 'NABL', 'POCT'];

const EMPTY_FORM = {
  name: '', email: '', password: '',
  lab_role: 'LAB_TECHNICIAN',
  facility_name: '', lab_type: 'DIAGNOSTIC',
  phone: '', city: '',
};

function LabStaffModal({ staff, onSave, onClose }) {
  const [form, setForm]     = useState(staff ? { ...staff, password: '' } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const isEdit = !!staff;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())          return setError('Name is required');
    if (!form.email.trim())         return setError('Email is required');
    if (!isEdit && !form.password)  return setError('Password is required');
    if (!form.facility_name.trim()) return setError('Facility name is required');
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>{isEdit ? 'Edit Lab Staff' : 'Add Lab Staff'}</span>
          <button className={styles.modalClose} onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalBody}>
          {/* Name + Email */}
          <div className={ls.row2}>
            <div className={styles.field}>
              <label>Full Name <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Rahul Sharma"
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label>Email <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="staff@lab.com"
              />
            </div>
          </div>

          {/* Password */}
          <div className={styles.field}>
            <label>
              {isEdit ? 'New Password' : 'Password'}{' '}
              {!isEdit && <span className={styles.req}>*</span>}
            </label>
            <input
              className={styles.input}
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={isEdit ? 'Leave blank to keep current' : 'Min 8 characters'}
            />
          </div>

          {/* Role */}
          <div className={styles.field}>
            <label>Role <span className={styles.req}>*</span></label>
            <select className={styles.input} value={form.lab_role} onChange={e => set('lab_role', e.target.value)}>
              {LAB_ROLES.map(r => (
                <option key={r} value={r}>{r.replace('LAB_', '').replace('_', ' ')}</option>
              ))}
            </select>
            <span className={ls.hint}>
              Technician: upload only · Admin: full lab access · Director: admin + audit
            </span>
          </div>

          {/* Facility + Lab Type */}
          <div className={ls.row2}>
            <div className={styles.field}>
              <label>Laboratory / Facility Name <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                value={form.facility_name}
                onChange={e => set('facility_name', e.target.value)}
                placeholder="Apollo Diagnostics"
              />
            </div>
            <div className={styles.field}>
              <label>Lab Type <span className={styles.req}>*</span></label>
              <select className={styles.input} value={form.lab_type} onChange={e => set('lab_type', e.target.value)}>
                {LAB_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Phone + City */}
          <div className={ls.row2}>
            <div className={styles.field}>
              <label>Phone</label>
              <input
                className={styles.input}
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+91 9999999999"
              />
            </div>
            <div className={styles.field}>
              <label>City</label>
              <input
                className={styles.input}
                value={form.city}
                onChange={e => set('city', e.target.value)}
                placeholder="Bangalore"
              />
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} /> {isEdit ? 'Save Changes' : 'Add Staff'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LabStaffSettings() {
  const [staff,      setStaff]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editStaff,  setEditStaff]  = useState(null);

  const load = async () => {
    setLoading(true);
    try { setStaff(await api.get('/labs/staff')); }
    catch { setStaff([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (form) => {
    const created = await api.post('/labs/staff', {
      name:          form.name,
      email:         form.email,
      password:      form.password,
      lab_role:      form.lab_role,
      facility_name: form.facility_name,
      lab_type:      form.lab_type,
      phone:         form.phone,
      city:          form.city,
    });
    setStaff(s => [...s, created].sort((a, b) => a.name.localeCompare(b.name)));
    setShowModal(false);
  };

  const handleEdit = async (form) => {
    const payload = {
      name:          form.name,
      email:         form.email,
      lab_role:      form.lab_role,
      facility_name: form.facility_name,
      lab_type:      form.lab_type,
      phone:         form.phone,
      city:          form.city,
    };
    if (form.password) payload.password = form.password;
    const updated = await api.patch(`/labs/staff/${editStaff.id}`, payload);
    setStaff(s => s.map(x => x.id === updated.id ? updated : x));
    setEditStaff(null);
  };

  const handleDelete = async (member) => {
    if (!window.confirm(`Remove ${member.name}? This cannot be undone.`)) return;
    await api.delete(`/labs/staff/${member.id}`);
    setStaff(s => s.filter(x => x.id !== member.id));
  };

  const toggleActive = async (member) => {
    const updated = await api.patch(`/labs/staff/${member.id}`, { is_active: !member.is_active });
    setStaff(s => s.map(x => x.id === updated.id ? updated : x));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={ls.count}>{staff.length} lab staff member{staff.length !== 1 ? 's' : ''}</span>
        <div style={{ flex: 1 }} />
        <button className={styles.btnCreate} onClick={() => setShowModal(true)}>
          <Plus size={14} strokeWidth={2.5} /> Add Lab Staff
        </button>
      </div>

      {loading ? (
        <p className={styles.emptyText}>Loading…</p>
      ) : staff.length === 0 ? (
        <div className={styles.emptyState}>
          <FlaskConical size={36} strokeWidth={1.2} className={styles.emptyIcon} />
          <p>No lab staff yet. Add your first lab staff member.</p>
          <p className={ls.emptyHint}>
            Lab staff can log in at{' '}
            <a href="/opd/lab-login" target="_blank" rel="noreferrer">
              /opd/lab-login
            </a>{' '}
            to upload test results.
          </p>
        </div>
      ) : (
        <div className={styles.table}>
          <div className={ls.tableHead}>
            <span>Name</span>
            <span>Role</span>
            <span>Facility</span>
            <span>Email</span>
            <span>Status</span>
            <span></span>
          </div>
          {staff.map(member => (
            <div key={member.id} className={ls.tableRow}>
              <div>
                <div className={ls.name}>{member.name}</div>
                {member.city && <div className={ls.sub}>{member.city}</div>}
              </div>
              <div>
                <span className={`${ls.roleBadge} ${ls[`role_${member.lab_role}`]}`}>
                  {member.lab_role?.replace('LAB_', '').replace('_', ' ')}
                </span>
              </div>
              <div>
                <div className={ls.facility}>{member.facility_name}</div>
                <div className={ls.sub}>{member.lab_type}</div>
              </div>
              <span className={ls.email}>{member.email}</span>
              <span>
                <button
                  className={`${styles.badge} ${member.is_active ? styles.badgeActive : styles.badgeInactive}`}
                  onClick={() => toggleActive(member)}
                  title="Click to toggle"
                >
                  {member.is_active ? 'Active' : 'Inactive'}
                </button>
              </span>
              <span className={styles.rowActions}>
                <button className={styles.iconBtn} onClick={() => setEditStaff(member)} title="Edit">
                  <Pencil size={13} />
                </button>
                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => handleDelete(member)} title="Remove">
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={ls.loginInfo}>
        <FlaskConical size={14} strokeWidth={1.8} />
        <span>
          Lab staff login URL:{' '}
          <a href="/opd/lab-login" target="_blank" rel="noreferrer">
            https://opd.inferapp.online/opd/lab-login
          </a>
        </span>
      </div>

      {showModal  && <LabStaffModal onSave={handleAdd} onClose={() => setShowModal(false)} />}
      {editStaff  && <LabStaffModal staff={editStaff} onSave={handleEdit} onClose={() => setEditStaff(null)} />}
    </div>
  );
}
