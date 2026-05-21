import { useEffect, useRef, useState } from 'react';
import { Tag, CalendarClock, Wallet, Check, Search, X } from 'lucide-react';
import styles from './FilterPanel.module.css';

export const DEFAULT_FILTERS = {
  tags:    'all',   // 'all' | 'no_tags' | 'tag:<id>'
  followup:'all',   // 'all' | 'added' | 'not_added'
  paid:    'all',   // 'all' | 'paid' | 'unpaid'
};

export function activeFilterCount(f) {
  return [f.tags !== 'all', f.followup !== 'all', f.paid !== 'all'].filter(Boolean).length;
}

export default function FilterPanel({ filters, onChange, onClose, clinicTags = [] }) {
  const ref        = useRef(null);
  const [tagSearch, setTagSearch] = useState('');

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  // Clamp max-height to available space below the panel's top edge
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const available = window.innerHeight - rect.top - 8;
    ref.current.style.maxHeight = `${Math.min(480, available)}px`;
  }, []);

  const set   = (key, value) => onChange({ ...filters, [key]: value });
  const reset = () => onChange({ ...DEFAULT_FILTERS });
  const count = activeFilterCount(filters);

  const filteredTags = clinicTags.filter(t => {
    if (!tagSearch.trim()) return true;
    const q = tagSearch.toLowerCase();
    return t.display_name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q);
  });

  const activeTagId = filters.tags?.startsWith?.('tag:')
    ? parseInt(filters.tags.slice(4), 10)
    : null;

  return (
    <div ref={ref} className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Filters</span>
        {count > 0 && (
          <button className={styles.resetBtn} onClick={reset}>
            Clear all ({count})
          </button>
        )}
      </div>

      {/* ── Tags section ── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>
          <Tag size={13} strokeWidth={2} />
          <span>Filter by Tags</span>
        </div>

        {/* Static options */}
        <div className={styles.opts}>
          {[
            { value: 'all',     label: 'All Tags' },
            { value: 'no_tags', label: 'No Tags'  },
          ].map(o => {
            const active = filters.tags === o.value;
            return (
              <button
                key={o.value}
                className={`${styles.opt} ${active ? styles.optActive : ''}`}
                onClick={() => set('tags', o.value)}
              >
                {active && <Check size={11} strokeWidth={3} className={styles.check} />}
                {o.label}
              </button>
            );
          })}
        </div>

        {/* Search + specific tag picker */}
        {clinicTags.length > 0 && (
          <div className={styles.tagSearch}>
            <div className={styles.tagSearchInput}>
              <Search size={12} className={styles.tagSearchIcon} />
              <input
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                placeholder="Search tag…"
                className={styles.tagSearchField}
              />
              {tagSearch && (
                <button className={styles.tagSearchClear} onClick={() => setTagSearch('')}>
                  <X size={10} />
                </button>
              )}
            </div>

            {(tagSearch.trim() || activeTagId) && <div className={styles.tagList}>
              {filteredTags.length === 0 && (
                <span className={styles.tagEmpty}>No tags match</span>
              )}
              {filteredTags.map(t => {
                const active = activeTagId === t.id;
                return (
                  <button
                    key={t.id}
                    className={`${styles.tagOpt} ${active ? styles.tagOptActive : ''}`}
                    style={active ? { background: t.color + '20', borderColor: t.color, color: t.color } : {}}
                    onClick={() => set('tags', active ? 'all' : `tag:${t.id}`)}
                  >
                    <span className={styles.tagDot} style={{ background: t.color }} />
                    <span className={styles.tagOptLabel}>{t.display_name}</span>
                    {active && <Check size={11} strokeWidth={3} style={{ color: t.color, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>}
          </div>
        )}
      </div>

      {/* ── Follow-up section ── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>
          <CalendarClock size={13} strokeWidth={2} />
          <span>Filter by Follow-up Date</span>
        </div>
        <div className={styles.opts}>
          {[
            { value: 'all',       label: 'Show All' },
            { value: 'added',     label: 'Follow Up Added' },
            { value: 'not_added', label: 'Follow Up Not Added' },
          ].map(o => {
            const active = filters.followup === o.value;
            return (
              <button
                key={o.value}
                className={`${styles.opt} ${active ? styles.optActive : ''}`}
                onClick={() => set('followup', o.value)}
              >
                {active && <Check size={11} strokeWidth={3} className={styles.check} />}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Paid status section ── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>
          <Wallet size={13} strokeWidth={2} />
          <span>Filter by Paid Status</span>
        </div>
        <div className={styles.opts}>
          {[
            { value: 'all',    label: 'Show All' },
            { value: 'paid',   label: 'Show All Paid' },
            { value: 'unpaid', label: 'Show All Unpaid' },
          ].map(o => {
            const active = filters.paid === o.value;
            return (
              <button
                key={o.value}
                className={`${styles.opt} ${active ? styles.optActive : ''}`}
                onClick={() => set('paid', o.value)}
              >
                {active && <Check size={11} strokeWidth={3} className={styles.check} />}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
