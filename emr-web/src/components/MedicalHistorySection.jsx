import { Check } from 'lucide-react';
import styles from './MedicalHistorySection.module.css';

const CONDITIONS = [
  { key: 'diabetes',       label: 'Diabetes' },
  { key: 'hypertension',   label: 'Hypertension' },
  { key: 'hypothyroidism', label: 'Hypothyroidism' },
];
const HABITS = [
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'tobacco', label: 'Tobacco' },
  { key: 'smoking', label: 'Smoking' },
];
const FREQUENCIES = ['Daily', 'Weekly', 'Occasionally', 'Rarely'];

// Normalize legacy string[] → object[]
export function normalizeMedHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => typeof item === 'string' ? { key: item } : item);
}

export default function MedicalHistorySection({ value = [], onChange }) {
  const isActive  = (key) => value.some(m => m.key === key);
  const getItem   = (key) => value.find(m => m.key === key) || {};

  const toggleItem = (key) => {
    onChange(
      isActive(key)
        ? value.filter(m => m.key !== key)
        : [...value, { key }]
    );
  };

  const updateField = (key, field, val) => {
    onChange(value.map(m => m.key === key ? { ...m, [field]: val } : m));
  };

  return (
    <div className={styles.section}>
      <div className={styles.title}>Medical History</div>

      <div className={styles.twoCol}>
        {/* ── Conditions ── */}
        <div className={styles.group}>
          <span className={styles.groupLabel}>Conditions</span>
          <div className={styles.itemGrid}>
            {CONDITIONS.map(({ key, label }) => {
              const active = isActive(key);
              const item   = getItem(key);
              return (
                <div key={key} className={styles.cell}>
                  <button
                    type="button"
                    className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                    onClick={() => toggleItem(key)}
                  >
                    {active && <Check size={11} strokeWidth={3} className={styles.checkIcon} />}
                    {label}
                  </button>
                  {active && (
                    <input
                      type="text"
                      className={styles.sinceInput}
                      placeholder="since..."
                      value={item.since || ''}
                      onChange={e => updateField(key, 'since', e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Habits ── */}
        <div className={styles.group}>
          <span className={styles.groupLabel}>Habits</span>
          <div className={styles.itemGrid}>
            {HABITS.map(({ key, label }) => {
              const active = isActive(key);
              const item   = getItem(key);
              return (
                <div key={key} className={styles.cell}>
                  <button
                    type="button"
                    className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                    onClick={() => toggleItem(key)}
                  >
                    {active && <Check size={11} strokeWidth={3} className={styles.checkIcon} />}
                    {label}
                  </button>
                  {active && (
                    <div className={styles.freqPills}>
                      {FREQUENCIES.map(f => (
                        <button
                          key={f}
                          type="button"
                          className={`${styles.freqPill} ${item.frequency === f ? styles.freqPillActive : ''}`}
                          onClick={() => updateField(key, 'frequency', f === item.frequency ? undefined : f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
