import { useState } from 'react';
import { X, Search, Check, Tag } from 'lucide-react';
import { api } from '../api/client';
import styles from './TagDialog.module.css';

const ATTR_TYPES = {
  1:  { label: 'Tags',                        multi: true  },
  2:  { label: 'Labels',                       multi: false },
  16: { label: 'Medical Record Document Type', multi: true  },
};

export default function TagDialog({ appt, clinicTags, onClose, onSaved }) {
  const [search,  setSearch]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [selected, setSelected] = useState(() => {
    if (!Array.isArray(appt.tags)) return [];
    return appt.tags.map(t => (typeof t === 'object' && t !== null) ? t.id : t);
  });

  const filtered = clinicTags.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.display_name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q);
  });

  const toggleTag = (tag) => {
    const isMulti = ATTR_TYPES[tag.attr_type]?.multi ?? true;
    setSelected(prev => {
      if (isMulti) {
        return prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id];
      }
      const sameType = clinicTags.filter(t => t.attr_type === tag.attr_type).map(t => t.id);
      const withoutType = prev.filter(id => !sameType.includes(id));
      return prev.includes(tag.id) ? withoutType : [...withoutType, tag.id];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/appointments/${appt.id}/status`, { tags: selected });
      onSaved(appt.id, selected);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const groups = Object.entries(ATTR_TYPES)
    .map(([typeId, meta]) => ({
      typeId: parseInt(typeId, 10),
      ...meta,
      items: filtered.filter(t => t.attr_type === parseInt(typeId, 10)),
    }))
    .filter(g => g.items.length > 0);

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Tag size={15} strokeWidth={1.8} />
            <div>
              <span className={styles.headerTitle}>Tags &amp; Labels</span>
              <span className={styles.headerSub}>{appt.patient_name} · #{appt.token_number}</span>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tags…"
            autoFocus
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Tag list */}
        <div className={styles.list}>
          {clinicTags.length === 0 && (
            <div className={styles.empty}>
              <Tag size={28} strokeWidth={1.2} style={{ opacity: .3 }} />
              <p>No custom attribute values yet.</p>
              <small>Go to Settings → Tags to create some.</small>
            </div>
          )}
          {clinicTags.length > 0 && groups.length === 0 && (
            <p className={styles.emptySearch}>No tags match "{search}"</p>
          )}
          {groups.map(group => (
            <div key={group.typeId} className={styles.group}>
              <div className={styles.groupLabel}>
                <span className={styles.groupName}>{group.label}</span>
                <span className={styles.groupBehavior}>{group.multi ? 'Multi-select' : 'Single-select'}</span>
              </div>
              {group.items.map(t => {
                const active = selected.includes(t.id);
                return (
                  <button
                    key={t.id}
                    className={`${styles.tagItem} ${active ? styles.tagItemActive : ''}`}
                    onClick={() => toggleTag(t)}
                  >
                    <span className={styles.tagDot} style={{ background: t.color }} />
                    <span className={styles.tagName}>{t.display_name}</span>
                    <span className={styles.tagCode}>{t.code}</span>
                    {active && <Check size={13} className={styles.checkIcon} style={{ color: t.color }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Selected summary */}
        {selected.length > 0 && (
          <div className={styles.summary}>
            {selected.map(id => {
              const t = clinicTags.find(x => x.id === id);
              if (!t) return null;
              return (
                <span key={id} className={styles.summaryChip}
                  style={{ background: t.color + '22', borderColor: t.color, color: t.color }}>
                  {t.display_name}
                  <button className={styles.summaryRemove} onClick={() => toggleTag(t)}>
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : `Save${selected.length ? ` (${selected.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
