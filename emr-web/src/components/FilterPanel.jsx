import { useEffect, useRef } from 'react';
import { Tag, CalendarClock, Wallet, Check } from 'lucide-react';
import styles from './FilterPanel.module.css';

export const DEFAULT_FILTERS = {
  tags:    'all',   // 'all' | 'no_tags'
  followup:'all',   // 'all' | 'added' | 'not_added'
  paid:    'all',   // 'all' | 'paid' | 'unpaid'
};

export function activeFilterCount(f) {
  return [f.tags !== 'all', f.followup !== 'all', f.paid !== 'all'].filter(Boolean).length;
}

const SECTIONS = [
  {
    key:   'tags',
    Icon:  Tag,
    label: 'Filter by Tags',
    opts:  [
      { value: 'all',     label: 'All Tags' },
      { value: 'no_tags', label: 'No Tags' },
    ],
  },
  {
    key:   'followup',
    Icon:  CalendarClock,
    label: 'Filter by Follow-up Date',
    opts:  [
      { value: 'all',       label: 'Show All' },
      { value: 'added',     label: 'Follow Up Added' },
      { value: 'not_added', label: 'Follow Up Not Added' },
    ],
  },
  {
    key:   'paid',
    Icon:  Wallet,
    label: 'Filter by Paid Status',
    opts:  [
      { value: 'all',    label: 'Show All' },
      { value: 'paid',   label: 'Show All Paid' },
      { value: 'unpaid', label: 'Show All Unpaid' },
    ],
  },
];

export default function FilterPanel({ filters, onChange, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const set = (key, value) => onChange({ ...filters, [key]: value });
  const reset = () => onChange({ ...DEFAULT_FILTERS });
  const count = activeFilterCount(filters);

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

      {SECTIONS.map(({ key, Icon, label, opts }) => (
        <div key={key} className={styles.section}>
          <div className={styles.sectionLabel}>
            <Icon size={13} strokeWidth={2} />
            <span>{label}</span>
          </div>
          <div className={styles.opts}>
            {opts.map(o => {
              const active = filters[key] === o.value;
              return (
                <button
                  key={o.value}
                  className={`${styles.opt} ${active ? styles.optActive : ''}`}
                  onClick={() => set(key, o.value)}
                >
                  {active && <Check size={11} strokeWidth={3} className={styles.check} />}
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
