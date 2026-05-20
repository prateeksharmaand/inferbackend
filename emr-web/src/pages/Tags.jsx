import { useState, useEffect } from 'react';
import { Tag, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { api } from '../api/client';
import styles from './Tags.module.css';

const PRESET_COLORS = [
  '#7c3aed','#2563eb','#0891b2','#16a34a','#ca8a04',
  '#ea580c','#dc2626','#db2777','#64748b','#1e293b',
];

function TagRow({ tag, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({ code: tag.code, display_name: tag.display_name, color: tag.color });
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(tag.id, form); setEditing(false); }
    finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className={styles.rowEdit}>
        <input className={styles.input} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="Code" />
        <input className={styles.input} value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Display Name" />
        <div className={styles.colorRow}>
          {PRESET_COLORS.map(c => (
            <button key={c} className={`${styles.colorDot} ${form.color === c ? styles.colorDotActive : ''}`}
              style={{ background: c }} onClick={() => setForm(f => ({ ...f, color: c }))} />
          ))}
        </div>
        <div className={styles.rowActions}>
          <button className={styles.btnSave} onClick={handleSave} disabled={saving}><Check size={14} /> Save</button>
          <button className={styles.btnCancel} onClick={() => setEditing(false)}><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <span className={styles.chip} style={{ background: tag.color + '22', borderColor: tag.color, color: tag.color }}>
        <span className={styles.chipDot} style={{ background: tag.color }} />
        {tag.display_name}
      </span>
      <span className={styles.code}>{tag.code}</span>
      <span className={styles.attr}>Tags : Multi-select</span>
      <div className={styles.rowActions}>
        <button className={styles.iconBtn} onClick={() => setEditing(true)} title="Edit"><Pencil size={13} /></button>
        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(tag.id)} title="Delete"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

export default function Tags() {
  const [tags,    setTags]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form,    setForm]    = useState({ code: '', display_name: '', color: '#7c3aed' });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const load = () => {
    setLoading(true);
    api.get('/tags').then(setTags).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.display_name.trim()) return setError('Code and Display Name are required');
    setSaving(true); setError('');
    try {
      await api.post('/tags', form);
      setForm({ code: '', display_name: '', color: '#7c3aed' });
      setShowNew(false);
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id, data) => {
    await api.patch(`/tags/${id}`, data);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this tag?')) return;
    await api.delete(`/tags/${id}`);
    load();
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Tag size={20} strokeWidth={1.8} className={styles.headerIcon} />
          <div>
            <h1 className={styles.title}>Custom Attribute Values</h1>
            <p className={styles.sub}>Tags help you identify, categorize, and manage bookings more efficiently.</p>
          </div>
        </div>
        <button className={styles.newBtn} onClick={() => setShowNew(v => !v)}>
          <Plus size={15} strokeWidth={2.5} /> Create Tag
        </button>
      </div>

      {/* Create form */}
      {showNew && (
        <form className={styles.createCard} onSubmit={handleCreate}>
          <h3 className={styles.createTitle}>New Tag</h3>
          <div className={styles.createGrid}>
            <div className={styles.field}>
              <label>Code <span className={styles.req}>*</span></label>
              <input className={styles.input} placeholder="e.g. VIP, FOLLOW_UP" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div className={styles.field}>
              <label>Display Name <span className={styles.req}>*</span></label>
              <input className={styles.input} placeholder="e.g. VIP Patient" value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
            </div>
            <div className={styles.field}>
              <label>Custom Attribute</label>
              <input className={styles.input} value="Tags : Multi-select" readOnly />
            </div>
            <div className={styles.field}>
              <label>Color</label>
              <div className={styles.colorRow}>
                {PRESET_COLORS.map(c => (
                  <button type="button" key={c}
                    className={`${styles.colorDot} ${form.color === c ? styles.colorDotActive : ''}`}
                    style={{ background: c }} onClick={() => setForm(f => ({ ...f, color: c }))} />
                ))}
                <span className={styles.colorPreview} style={{ background: form.color }}>Preview</span>
              </div>
            </div>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.createActions}>
            <button type="button" className={styles.btnCancel} onClick={() => { setShowNew(false); setError(''); }}>Cancel</button>
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} /> Save</>}
            </button>
          </div>
        </form>
      )}

      {/* Tags table */}
      <div className={styles.table}>
        <div className={styles.tableHead}>
          <span>Tag</span><span>Code</span><span>Custom Attribute</span><span></span>
        </div>
        {loading && <p className={styles.empty}>Loading…</p>}
        {!loading && tags.length === 0 && (
          <div className={styles.emptyState}>
            <Tag size={36} strokeWidth={1.2} className={styles.emptyIcon} />
            <p>No tags yet</p>
            <small>Click "Create Tag" to add your first tag.</small>
          </div>
        )}
        {tags.map(t => (
          <TagRow key={t.id} tag={t} onSave={handleUpdate} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
