import { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Pencil, Trash2, Check, Users, Shield, Mail, Activity,
  Copy, Search, ChevronDown, ChevronUp, Link2, RefreshCw, Eye, EyeOff,
} from 'lucide-react';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import s from './StaffManagement.module.css';

// ── Permission groups definition ──────────────────────────────────────────────

const PERM_GROUPS = [
  { key: 'dashboard', label: 'Dashboard', perms: [
    { key: 'dashboard.view',      label: 'View Dashboard' },
    { key: 'dashboard.revenue',   label: 'View Revenue' },
    { key: 'dashboard.analytics', label: 'View Analytics' },
  ]},
  { key: 'patients', label: 'Patient Management', perms: [
    { key: 'patients.view',   label: 'View Patients' },
    { key: 'patients.add',    label: 'Add Patient' },
    { key: 'patients.edit',   label: 'Edit Patient' },
    { key: 'patients.delete', label: 'Delete Patient' },
    { key: 'patients.export', label: 'Export Patient Data' },
  ]},
  { key: 'appointments', label: 'Appointments', perms: [
    { key: 'appointments.view',        label: 'View Appointments' },
    { key: 'appointments.create',      label: 'Create Appointment' },
    { key: 'appointments.edit',        label: 'Edit Appointment' },
    { key: 'appointments.cancel',      label: 'Cancel Appointment' },
    { key: 'appointments.reschedule',  label: 'Reschedule Appointment' },
  ]},
  { key: 'consultations', label: 'Consultations / EMR', perms: [
    { key: 'consultations.view',   label: 'View Consultations' },
    { key: 'consultations.create', label: 'Create Consultation' },
    { key: 'consultations.edit',   label: 'Edit Consultation' },
    { key: 'prescriptions.print',  label: 'Print Prescription' },
  ]},
  { key: 'inferpad', label: 'InferPad', perms: [
    { key: 'inferpad.view',   label: 'View InferPad' },
    { key: 'inferpad.create', label: 'Create Notes' },
    { key: 'inferpad.edit',   label: 'Edit Notes' },
    { key: 'inferpad.delete', label: 'Delete Notes' },
    { key: 'inferpad.share',  label: 'Share Notes' },
  ]},
  { key: 'assessments', label: 'Assessments', perms: [
    { key: 'assessments.view',   label: 'View Assessments' },
    { key: 'assessments.create', label: 'Create Assessment' },
    { key: 'assessments.edit',   label: 'Edit Assessment' },
    { key: 'assessments.delete', label: 'Delete Assessment' },
  ]},
  { key: 'billing', label: 'Billing', perms: [
    { key: 'billing.view',    label: 'View Billing' },
    { key: 'billing.create',  label: 'Create Invoice' },
    { key: 'billing.edit',    label: 'Edit Invoice' },
    { key: 'billing.refund',  label: 'Process Refund' },
    { key: 'billing.reports', label: 'Billing Reports' },
  ]},
  { key: 'abdm', label: 'ABDM / Health Records', perms: [
    { key: 'abdm.abha_linking',   label: 'ABHA Linking' },
    { key: 'abdm.health_records', label: 'Health Records Access' },
    { key: 'abdm.consent',        label: 'Consent Management' },
    { key: 'abdm.hip',            label: 'HIP Features' },
    { key: 'abdm.hiu',            label: 'HIU Features' },
  ]},
  { key: 'lab', label: 'Laboratory', perms: [
    { key: 'lab.view', label: 'View Lab Results' },
    { key: 'lab.edit', label: 'Edit Lab Data' },
  ]},
  { key: 'ai', label: 'AI & InferAssist', perms: [
    { key: 'consultations.create', label: 'Use InferAssist (AI)' },
    { key: 'inferassist.use',      label: 'Open InferAssist Panel' },
    { key: 'inferassist.scribe',   label: 'Voice Scribe (AI Transcription)' },
    { key: 'inferassist.docassist',label: 'Document AI Assistant' },
    { key: 'inferassist.summary',  label: 'AI Lab Summary' },
  ]},
  { key: 'settings', label: 'Settings Access', perms: [
    { key: 'settings.clinic',        label: 'Clinic Settings' },
    { key: 'settings.staff',         label: 'Staff Management' },
    { key: 'settings.subscription',  label: 'Subscription' },
    { key: 'settings.integrations',  label: 'Integrations' },
  ]},
];

const SYSTEM_ROLES = ['admin', 'doctor', 'receptionist', 'nurse', 'billing', 'lab_technician', 'staff'];

function countPerms(perms) {
  if (!perms) return 0;
  if (perms.all) return '∞';
  return Object.values(perms).filter(Boolean).length;
}

// ── Role badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role, color }) {
  return (
    <span className={s.roleBadge} style={{ background: `${color || '#7c3aed'}22`, color: color || '#7c3aed', border: `1px solid ${color || '#7c3aed'}44` }}>
      {role}
    </span>
  );
}

// ── Permission toggle editor modal ────────────────────────────────────────────
function PermissionEditor({ role, onSave, onClose }) {
  const [perms, setPerms] = useState({ ...(role?.permissions || {}) });
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState(false);

  const toggle = (key) => setPerms(p => ({ ...p, [key]: !p[key] }));
  const toggleGroup = (group) => {
    const keys = group.perms.map(p => p.key);
    const allOn = keys.every(k => perms[k]);
    setPerms(p => {
      const next = { ...p };
      keys.forEach(k => { next[k] = !allOn; });
      return next;
    });
  };
  const toggleExpand = (k) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const filtered = search
    ? PERM_GROUPS.map(g => ({ ...g, perms: g.perms.filter(p => p.label.toLowerCase().includes(search.toLowerCase())) })).filter(g => g.perms.length)
    : PERM_GROUPS;

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(perms); onClose(); }
    catch (err) { toast.error(err.message); setSaving(false); }
  };

  const isAllAdmin = perms.all;

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.permModal}>
        <div className={s.permModalHeader}>
          <div>
            <div className={s.permModalTitle}>Edit Permissions — {role?.name}</div>
            <div className={s.permModalSub}>{countPerms(perms)} permissions enabled</div>
          </div>
          <button className={s.modalClose} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={s.permSearch}>
          <Search size={14} className={s.permSearchIcon} />
          <input
            className={s.permSearchInput}
            placeholder="Search permissions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {isAllAdmin && (
          <div className={s.allAdminBanner}>
            This role has <strong>full access</strong> to all features (admin level).
          </div>
        )}

        <div className={s.permGroups}>
          {filtered.map(group => {
            const keys = group.perms.map(p => p.key);
            const enabledCount = keys.filter(k => perms[k]).length;
            const allOn = keys.length > 0 && keys.every(k => perms[k]);
            const isOpen = expanded[group.key] !== false; // default open

            return (
              <div key={group.key} className={s.permGroup}>
                <div className={s.permGroupHeader} onClick={() => toggleExpand(group.key)}>
                  <div className={s.permGroupLeft}>
                    <button
                      className={`${s.groupToggle} ${allOn ? s.groupToggleOn : ''}`}
                      onClick={e => { e.stopPropagation(); toggleGroup(group); }}
                      title={allOn ? 'Disable all' : 'Enable all'}
                    >
                      {allOn ? <Check size={10} strokeWidth={3} /> : null}
                    </button>
                    <span className={s.permGroupLabel}>{group.label}</span>
                    <span className={s.permGroupCount}>{enabledCount}/{keys.length}</span>
                  </div>
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>

                {isOpen && (
                  <div className={s.permList}>
                    {group.perms.map(perm => (
                      <label key={perm.key} className={s.permRow}>
                        <input
                          type="checkbox"
                          className={s.permCheck}
                          checked={!!perms[perm.key]}
                          onChange={() => toggle(perm.key)}
                        />
                        <span className={s.permLabel}>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={s.permModalFooter}>
          <button className={s.btnCancel} onClick={onClose}>Cancel</button>
          <button className={s.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : <><Check size={14} /> Save Permissions</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Staff modal (add / edit) ──────────────────────────────────────────────────
const EMPTY_STAFF = { name: '', email: '', password: '', role: 'staff', mobile: '', employee_id: '', department: '', designation: '' };

function StaffModal({ member, roles, onSave, onClose }) {
  const [form, setForm] = useState(member ? { ...member, password: '' } : EMPTY_STAFF);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [showPw, setShowPw] = useState(false);
  const isEdit = !!member;

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
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <span>{isEdit ? 'Edit Staff Member' : 'Add Staff Member'}</span>
          <button className={s.modalClose} onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className={s.modalBody}>
          <div className={s.row2}>
            <div className={s.field}>
              <label>Full Name <span className={s.req}>*</span></label>
              <input className={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" autoFocus />
            </div>
            <div className={s.field}>
              <label>Email <span className={s.req}>*</span></label>
              <input className={s.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@clinic.com" />
            </div>
          </div>

          <div className={s.row2}>
            <div className={s.field}>
              <label>{isEdit ? 'New Password' : 'Password'} {!isEdit && <span className={s.req}>*</span>}</label>
              <div className={s.pwWrap}>
                <input
                  className={s.input}
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder={isEdit ? 'Leave blank to keep current' : 'Min 8 characters'}
                />
                <button type="button" className={s.pwToggle} onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className={s.field}>
              <label>Role</label>
              <select className={s.input} value={form.role} onChange={e => set('role', e.target.value)}>
                <optgroup label="System Roles">
                  {SYSTEM_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </optgroup>
                {roles.length > 0 && (
                  <optgroup label="Custom Roles">
                    {roles.map(r => <option key={r.id} value={r.slug}>{r.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          <div className={s.row2}>
            <div className={s.field}>
              <label>Mobile</label>
              <input className={s.input} value={form.mobile || ''} onChange={e => set('mobile', e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div className={s.field}>
              <label>Employee ID</label>
              <input className={s.input} value={form.employee_id || ''} onChange={e => set('employee_id', e.target.value)} placeholder="EMP-001" />
            </div>
          </div>

          <div className={s.row2}>
            <div className={s.field}>
              <label>Department</label>
              <input className={s.input} value={form.department || ''} onChange={e => set('department', e.target.value)} placeholder="Outpatient" />
            </div>
            <div className={s.field}>
              <label>Designation</label>
              <input className={s.input} value={form.designation || ''} onChange={e => set('designation', e.target.value)} placeholder="Senior Receptionist" />
            </div>
          </div>

          {error && <p className={s.error}>{error}</p>}
          <div className={s.modalFooter}>
            <button type="button" className={s.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={s.btnSave} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} /> {isEdit ? 'Save Changes' : 'Add Staff'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Staff Tab ─────────────────────────────────────────────────────────────────
function StaffTab({ roles }) {
  const [staff, setStaff]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMember, setEditMember] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStaff(await api.get('/staff')); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (form) => {
    const created = await api.post('/staff', form);
    setStaff(s => [...s, created].sort((a, b) => a.name.localeCompare(b.name)));
    setShowModal(false);
    toast.success('Staff member added');
  };

  const handleEdit = async (form) => {
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    const updated = await api.patch(`/staff/${editMember.id}`, payload);
    setStaff(s => s.map(x => x.id === updated.id ? updated : x));
    setEditMember(null);
    toast.success('Staff member updated');
  };

  const toggleActive = async (m) => {
    const updated = await api.patch(`/staff/${m.id}`, { is_active: !m.is_active });
    setStaff(s => s.map(x => x.id === updated.id ? updated : x));
  };

  const handleDelete = async (m) => {
    if (!window.confirm(`Remove ${m.name}? This cannot be undone.`)) return;
    await api.delete(`/staff/${m.id}`);
    setStaff(s => s.filter(x => x.id !== m.id));
    toast.success('Staff member removed');
  };

  const roleMap = Object.fromEntries(roles.map(r => [r.slug, r]));

  const filtered = staff.filter(m => {
    const q = search.toLowerCase();
    const matchQ = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.department || '').toLowerCase().includes(q);
    const matchR = !filterRole || m.role === filterRole;
    return matchQ && matchR;
  });

  return (
    <div className={s.tabContent}>
      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input className={s.searchInput} placeholder="Search by name, email, department…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className={s.searchClear} onClick={() => setSearch('')}><X size={13} /></button>}
        </div>
        <select className={s.roleFilter} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">All Roles</option>
          <optgroup label="System Roles">
            {SYSTEM_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </optgroup>
          {roles.length > 0 && (
            <optgroup label="Custom Roles">
              {roles.map(r => <option key={r.id} value={r.slug}>{r.name}</option>)}
            </optgroup>
          )}
        </select>
        <button className={s.btnCreate} onClick={() => setShowModal(true)}>
          <Plus size={14} strokeWidth={2.5} /> Add Staff
        </button>
      </div>

      {loading ? (
        <p className={s.emptyText}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className={s.emptyState}>
          <Users size={36} strokeWidth={1.2} className={s.emptyIcon} />
          <p>{staff.length === 0 ? 'No staff members yet. Add your first.' : 'No results match your filters.'}</p>
        </div>
      ) : (
        <div className={s.table}>
          <div className={s.staffHead}>
            <span>Name</span>
            <span>Role</span>
            <span>Email</span>
            <span>Department</span>
            <span>Status</span>
            <span></span>
          </div>
          {filtered.map(m => {
            const roleInfo = roleMap[m.role];
            return (
              <div key={m.id} className={s.staffRow}>
                <div>
                  <div className={s.staffName}>{m.name}</div>
                  {m.employee_id && <div className={s.staffSub}>{m.employee_id}</div>}
                </div>
                <RoleBadge role={roleInfo?.name || m.role} color={roleInfo?.color} />
                <span className={s.staffEmail}>{m.email}</span>
                <span className={s.staffDept}>{m.department || '—'}</span>
                <button
                  className={`${s.statusBadge} ${m.is_active ? s.statusActive : s.statusInactive}`}
                  onClick={() => toggleActive(m)}
                  title="Click to toggle"
                >
                  {m.is_active ? 'Active' : 'Inactive'}
                </button>
                <span className={s.rowActions}>
                  <button className={s.iconBtn} onClick={() => setEditMember(m)} title="Edit"><Pencil size={13} /></button>
                  <button className={`${s.iconBtn} ${s.iconBtnDanger}`} onClick={() => handleDelete(m)} title="Remove"><Trash2 size={13} /></button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showModal   && <StaffModal roles={roles} onSave={handleAdd}  onClose={() => setShowModal(false)} />}
      {editMember  && <StaffModal roles={roles} member={editMember} onSave={handleEdit} onClose={() => setEditMember(null)} />}
    </div>
  );
}

// ── Roles Tab ─────────────────────────────────────────────────────────────────
function RolesTab({ roles, setRoles }) {
  const [editRole, setEditRole]       = useState(null);
  const [creating, setCreating]       = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#7c3aed');

  const handleSavePerms = async (role, newPerms) => {
    const updated = await api.patch(`/staff/roles/${role.id}`, { permissions: newPerms });
    setRoles(r => r.map(x => x.id === updated.id ? { ...x, ...updated } : x));
    toast.success(`Permissions updated for ${role.name}`);
  };

  const handleClone = async (role) => {
    const cloned = await api.post(`/staff/roles/${role.id}/clone`);
    setRoles(r => [...r, cloned]);
    toast.success(`${role.name} cloned`);
  };

  const handleDelete = async (role) => {
    if (role.is_system) return toast.error('System roles cannot be deleted');
    if (!window.confirm(`Delete role "${role.name}"? Staff with this role will keep their current slug.`)) return;
    await api.delete(`/staff/roles/${role.id}`);
    setRoles(r => r.filter(x => x.id !== role.id));
    toast.success(`Role "${role.name}" deleted`);
  };

  const handleCreate = async () => {
    if (!newRoleName.trim()) return;
    const created = await api.post('/staff/roles', { name: newRoleName.trim(), color: newRoleColor });
    setRoles(r => [...r, created]);
    setCreating(false);
    setNewRoleName('');
    toast.success(`Role "${created.name}" created`);
  };

  return (
    <div className={s.tabContent}>
      <div className={s.toolbar}>
        <span className={s.countLabel}>{roles.length} role{roles.length !== 1 ? 's' : ''}</span>
        <div style={{ flex: 1 }} />
        <button className={s.btnCreate} onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={2.5} /> New Role
        </button>
      </div>

      {creating && (
        <div className={s.createRoleBar}>
          <input
            className={s.input}
            placeholder="Role name (e.g. Care Coordinator)"
            value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            autoFocus
          />
          <input type="color" className={s.colorPicker} value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)} title="Choose role color" />
          <button className={s.btnSave} onClick={handleCreate}><Check size={14} /> Create</button>
          <button className={s.btnCancel} onClick={() => setCreating(false)}><X size={14} /></button>
        </div>
      )}

      <div className={s.rolesGrid}>
        {roles.map(role => {
          const permCount = countPerms(role.permissions);
          return (
            <div key={role.id} className={s.roleCard} style={{ borderTop: `3px solid ${role.color || '#7c3aed'}` }}>
              <div className={s.roleCardHeader}>
                <div className={s.roleCardDot} style={{ background: role.color || '#7c3aed' }} />
                <div className={s.roleCardInfo}>
                  <div className={s.roleCardName}>{role.name}</div>
                  {role.is_system && <span className={s.systemBadge}>System</span>}
                </div>
              </div>
              <div className={s.roleCardStats}>
                <span>{role.user_count || 0} user{role.user_count !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{permCount} permission{permCount !== 1 ? 's' : ''}</span>
              </div>
              <div className={s.roleCardActions}>
                <button className={s.roleBtn} onClick={() => setEditRole(role)}>
                  <Pencil size={12} /> Edit Permissions
                </button>
                <button className={s.roleBtn} onClick={() => handleClone(role)} title="Clone role">
                  <Copy size={12} />
                </button>
                {!role.is_system && (
                  <button className={`${s.roleBtn} ${s.roleBtnDanger}`} onClick={() => handleDelete(role)} title="Delete">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editRole && (
        <PermissionEditor
          role={editRole}
          onSave={(perms) => handleSavePerms(editRole, perms)}
          onClose={() => setEditRole(null)}
        />
      )}
    </div>
  );
}

// ── Invitations Tab ───────────────────────────────────────────────────────────
function InvitationsTab({ roles }) {
  const [invites, setInvites]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'staff', role_id: '', department: '', designation: '' });
  const [saving, setSaving]     = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setInvites(await api.get('/staff/invitations')); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, role_id: form.role_id ? parseInt(form.role_id) : null };
      const inv = await api.post('/staff/invitations', payload);
      setInvites(i => [inv, ...i]);
      toast.success('Invitation created');
      setCreating(false);
      setForm({ email: '', name: '', role: 'staff', role_id: '', department: '', designation: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (inv) => {
    if (!window.confirm('Revoke this invitation?')) return;
    await api.delete(`/staff/invitations/${inv.id}`);
    setInvites(i => i.map(x => x.id === inv.id ? { ...x, status: 'revoked' } : x));
    toast.success('Invitation revoked');
  };

  const copyLink = async (inv) => {
    const base = window.location.origin;
    const url = `${base}/opd/invite/${inv.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusColor = { pending: '#16a34a', accepted: '#0284c7', expired: '#94a3b8', revoked: '#dc2626' };

  return (
    <div className={s.tabContent}>
      <div className={s.toolbar}>
        <span className={s.countLabel}>{invites.length} invitation{invites.length !== 1 ? 's' : ''}</span>
        <div style={{ flex: 1 }} />
        <button className={s.btnCreate} onClick={() => setCreating(v => !v)}>
          {creating ? <><X size={14} /> Cancel</> : <><Mail size={14} /> Create Invitation</>}
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className={s.inviteForm}>
          <div className={s.inviteFormTitle}>New Staff Invitation</div>
          <div className={s.row2}>
            <div className={s.field}>
              <label>Name (optional)</label>
              <input className={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Staff member's name" />
            </div>
            <div className={s.field}>
              <label>Email (optional)</label>
              <input className={s.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="staff@clinic.com" />
            </div>
          </div>
          <div className={s.row2}>
            <div className={s.field}>
              <label>Role</label>
              <select className={s.input} value={form.role} onChange={e => set('role', e.target.value)}>
                <optgroup label="System Roles">
                  {SYSTEM_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </optgroup>
                {roles.length > 0 && (
                  <optgroup label="Custom Roles">
                    {roles.map(r => <option key={r.id} value={r.slug}>{r.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div className={s.field}>
              <label>Department</label>
              <input className={s.input} value={form.department} onChange={e => set('department', e.target.value)} placeholder="Outpatient" />
            </div>
          </div>
          <div className={s.inviteFormFooter}>
            <button type="submit" className={s.btnSave} disabled={saving}>
              {saving ? 'Creating…' : <><Link2 size={14} /> Generate Invite Link</>}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className={s.emptyText}>Loading…</p>
      ) : invites.length === 0 ? (
        <div className={s.emptyState}>
          <Mail size={36} strokeWidth={1.2} className={s.emptyIcon} />
          <p>No invitations yet. Generate a link to onboard new staff.</p>
        </div>
      ) : (
        <div className={s.table}>
          <div className={s.inviteHead}>
            <span>Name / Email</span>
            <span>Role</span>
            <span>Status</span>
            <span>Expires</span>
            <span></span>
          </div>
          {invites.map(inv => (
            <div key={inv.id} className={s.inviteRow}>
              <div>
                <div className={s.staffName}>{inv.name || '—'}</div>
                <div className={s.staffEmail}>{inv.email || 'No email set'}</div>
              </div>
              <RoleBadge role={inv.role_name || inv.role} color={inv.role_color} />
              <span className={s.inviteStatus} style={{ color: statusColor[inv.status] || '#64748b' }}>
                {inv.status}
              </span>
              <span className={s.staffEmail}>{new Date(inv.expires_at).toLocaleDateString()}</span>
              <span className={s.rowActions}>
                {inv.status === 'pending' && (
                  <>
                    <button className={s.iconBtn} onClick={() => copyLink(inv)} title="Copy invite link">
                      {copiedId === inv.id ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <button className={`${s.iconBtn} ${s.iconBtnDanger}`} onClick={() => handleRevoke(inv)} title="Revoke">
                      <X size={13} />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────────────────────────
function ActivityTab() {
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [action, setAction]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo)   params.set('date_to', dateTo);
      if (action)   params.set('action', action);
      setLogs(await api.get(`/staff/activity-logs?${params}`));
    } catch {} finally { setLoading(false); }
  }, [dateFrom, dateTo, action]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={s.tabContent}>
      <div className={s.toolbar}>
        <input type="date" className={s.dateInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className={s.dateInput} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <div className={s.searchWrap} style={{ maxWidth: 220 }}>
          <Search size={14} className={s.searchIcon} />
          <input className={s.searchInput} placeholder="Filter by action…" value={action} onChange={e => setAction(e.target.value)} />
        </div>
        <button className={s.iconBtn} onClick={load} title="Refresh"><RefreshCw size={14} /></button>
      </div>

      {loading ? (
        <p className={s.emptyText}>Loading…</p>
      ) : logs.length === 0 ? (
        <div className={s.emptyState}>
          <Activity size={36} strokeWidth={1.2} className={s.emptyIcon} />
          <p>No activity logs found for the selected filters.</p>
        </div>
      ) : (
        <div className={s.table}>
          <div className={s.activityHead}>
            <span>Time</span>
            <span>Staff</span>
            <span>Action</span>
            <span>Resource</span>
            <span>IP</span>
          </div>
          {logs.map(log => (
            <div key={log.id} className={s.activityRow}>
              <span className={s.logTime}>{new Date(log.created_at).toLocaleString()}</span>
              <div>
                <div className={s.staffName} style={{ fontSize: 13 }}>{log.staff_email || '—'}</div>
                <div className={s.staffSub}>{log.staff_role || ''}</div>
              </div>
              <span className={s.logAction}>{log.action}</span>
              <span className={s.logResource}>{log.resource || '—'}{log.resource_id ? ` #${log.resource_id}` : ''}</span>
              <span className={s.staffEmail}>{log.ip_address || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main StaffManagement page ─────────────────────────────────────────────────
const TABS = [
  { key: 'staff',       Icon: Users,    label: 'Staff Members' },
  { key: 'roles',       Icon: Shield,   label: 'Roles & Permissions' },
  { key: 'invitations', Icon: Mail,     label: 'Invitations' },
  { key: 'activity',    Icon: Activity, label: 'Activity Logs' },
];

export default function StaffManagement() {
  const [tab, setTab]     = useState('staff');
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    api.get('/staff/roles').then(setRoles).catch(() => {});
  }, []);

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <Shield size={20} strokeWidth={1.8} className={s.headerIcon} />
        <div>
          <h2 className={s.pageTitle}>Staff & Access Management</h2>
          <p className={s.pageSub}>Manage team members, roles, permissions and invitations.</p>
        </div>
      </div>

      <div className={s.tabBar}>
        {TABS.map(({ key, Icon, label }) => (
          <button
            key={key}
            className={`${s.tabBtn} ${tab === key ? s.tabBtnActive : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={13} strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'staff'       && <StaffTab roles={roles} />}
      {tab === 'roles'       && <RolesTab roles={roles} setRoles={setRoles} />}
      {tab === 'invitations' && <InvitationsTab roles={roles} />}
      {tab === 'activity'    && <ActivityTab />}
    </div>
  );
}
