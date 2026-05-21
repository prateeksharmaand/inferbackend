import { useState, useEffect } from 'react';
import { Plus, Search, X, Pencil, Trash2, Check, IndianRupee } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import styles from './ServicesSettings.module.css';

function ServiceModal({ service, onSave, onClose }) {
  const [form, setForm] = useState({ name: service?.name || '', price: service?.price ?? '' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Service name is required');
    if (form.price === '' || isNaN(parseFloat(form.price))) return setError('Valid price is required');
    setSaving(true); setError('');
    try {
      await onSave({ name: form.name.trim(), price: parseFloat(form.price) });
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>{service ? 'Edit Service' : 'Create New Service'}</span>
          <button className={styles.modalClose} onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalBody}>
          <div className={styles.field}>
            <label>Service Name <span className={styles.req}>*</span></label>
            <input
              className={styles.input}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Consultation, ECG, Blood Test"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label>Price (₹) <span className={styles.req}>*</span></label>
            <div className={styles.priceWrap}>
              <IndianRupee size={14} className={styles.priceIcon} />
              <input
                className={`${styles.input} ${styles.priceInput}`}
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} /> {service ? 'Save Changes' : 'Create Service'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ServicesSettings() {
  const { user } = useAuth();
  const [services,    setServices]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [activeFilter, setActiveFilter] = useState('all');   // 'all' | 'active' | 'inactive'
  const [showModal,   setShowModal]   = useState(false);
  const [editService, setEditService] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (activeFilter === 'active')   params.set('is_active', 'true');
      if (activeFilter === 'inactive') params.set('is_active', 'false');
      const rows = await api.get(`/services?${params}`);
      setServices(rows);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search, activeFilter]);

  const handleCreate = async (data) => {
    const created = await api.post('/services', data);
    setServices(s => [...s, created].sort((a, b) => a.name.localeCompare(b.name)));
    setShowModal(false);
  };

  const handleEdit = async (data) => {
    const updated = await api.patch(`/services/${editService.id}`, data);
    setServices(s => s.map(x => x.id === updated.id ? updated : x));
    setEditService(null);
  };

  const toggleActive = async (svc) => {
    const updated = await api.patch(`/services/${svc.id}`, { is_active: !svc.is_active });
    setServices(s => s.map(x => x.id === updated.id ? updated : x));
  };

  const handleDelete = async (svc) => {
    if (!window.confirm(`Delete "${svc.name}"?`)) return;
    await api.delete(`/services/${svc.id}`);
    setServices(s => s.filter(x => x.id !== svc.id));
  };

  return (
    <div className={styles.wrap}>

      {/* ── Toolbar ─────────────────────────────────── */}
      <div className={styles.toolbar}>

        {/* Active / Inactive filter */}
        <div className={styles.filterGroup}>
          {['all', 'active', 'inactive'].map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${activeFilter === f ? styles.filterBtnActive : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>

        {/* Clinic / hospital selector */}
        <select className={styles.clinicSelect}>
          <option value={user?.clinic_id}>{user?.clinic_name || 'My Clinic'}</option>
        </select>

        {/* Search */}
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search services…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Create button */}
        <button className={styles.btnCreate} onClick={() => setShowModal(true)}>
          <Plus size={14} strokeWidth={2.5} /> New Service
        </button>
      </div>

      {/* ── Service list ────────────────────────────── */}
      {loading ? (
        <p className={styles.emptyText}>Loading…</p>
      ) : services.length === 0 ? (
        <div className={styles.emptyState}>
          <IndianRupee size={36} strokeWidth={1.2} className={styles.emptyIcon} />
          <p>{search ? 'No services match your search.' : 'No services yet. Create your first service.'}</p>
        </div>
      ) : (
        <div className={styles.table}>
          <div className={styles.tableHead}>
            <span>Service Name</span>
            <span>Price</span>
            <span>Status</span>
            <span></span>
          </div>
          {services.map(svc => (
            <div key={svc.id} className={styles.tableRow}>
              <span className={styles.svcName}>{svc.name}</span>
              <span className={styles.svcPrice}>₹{parseFloat(svc.price).toFixed(2)}</span>
              <span>
                <button
                  className={`${styles.badge} ${svc.is_active ? styles.badgeActive : styles.badgeInactive}`}
                  onClick={() => toggleActive(svc)}
                  title="Click to toggle"
                >
                  {svc.is_active ? 'Active' : 'Inactive'}
                </button>
              </span>
              <span className={styles.rowActions}>
                <button className={styles.iconBtn} onClick={() => setEditService(svc)} title="Edit">
                  <Pencil size={13} />
                </button>
                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => handleDelete(svc)} title="Delete">
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────── */}
      {showModal && (
        <ServiceModal onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}
      {editService && (
        <ServiceModal service={editService} onSave={handleEdit} onClose={() => setEditService(null)} />
      )}
    </div>
  );
}
