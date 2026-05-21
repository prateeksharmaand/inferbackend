import { useState, useEffect } from 'react';
import { X, Activity } from 'lucide-react';
import { api } from '../api/client';
import styles from './QuickVitalsModal.module.css';

const FIELDS = [
  ['bp_systolic',      'BP Systolic',     'mmHg'],
  ['bp_diastolic',     'BP Diastolic',    'mmHg'],
  ['pulse',            'Pulse',           'bpm' ],
  ['spo2',             'SpO₂',            '%'   ],
  ['temp',             'Temperature',     '°C'  ],
  ['respiratory_rate', 'Resp. Rate',      '/min'],
  ['height',           'Height',          'cm'  ],
  ['weight',           'Weight',          'kg'  ],
  ['bmi',              'BMI',             'kg/m²'],
];

const EMPTY = { bp_systolic:'', bp_diastolic:'', temp:'', spo2:'', pulse:'', respiratory_rate:'', height:'', weight:'', bmi:'' };

export default function QuickVitalsModal({ appt, onClose, onSaved }) {
  const [vitals,    setVitals]    = useState(EMPTY);
  const [encounter, setEncounter] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api.get(`/appointments/${appt.id}`).then(data => {
      if (data.vitals) setVitals(v => ({ ...v, ...data.vitals }));
      setEncounter(data);
    }).catch(() => {});
  }, [appt.id]);

  // Auto-BMI
  useEffect(() => {
    const h = parseFloat(vitals.height);
    const w = parseFloat(vitals.weight);
    if (h > 0 && w > 0) {
      setVitals(v => ({ ...v, bmi: (w / ((h / 100) ** 2)).toFixed(1) }));
    }
  }, [vitals.height, vitals.weight]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setVitals(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/appointments/${appt.id}/encounter`, {
        vitals,
        symptoms:             encounter?.symptoms             || [],
        diagnosis:            encounter?.diagnosis            || [],
        medications:          encounter?.medications          || [],
        lab_investigations:   encounter?.lab_investigations   || [],
        lab_results:          encounter?.lab_results          || [],
        examination_findings: encounter?.examination_findings || '',
        notes:                encounter?.notes                || '',
        refer_to:             encounter?.refer_to             || '',
        next_visit_date:      encounter?.next_visit_date      || null,
        next_visit_notes:     encounter?.next_visit_notes     || '',
        advices:              encounter?.advices || encounter?.instructions || '',
        procedures:           encounter?.procedures           || [],
        custom_sections:      encounter?.custom_sections      || [],
        canvas_image:         encounter?.canvas_image         || null,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Activity size={16} strokeWidth={2} className={styles.headerIcon} />
            <div>
              <div className={styles.title}>Add Vitals</div>
              <div className={styles.sub}>{appt.patient_name}</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.grid}>
            {FIELDS.map(([key, label, unit]) => (
              <div key={key} className={styles.field}>
                <label className={styles.label}>
                  {label} <span className={styles.unit}>{unit}</span>
                </label>
                <input
                  type="number"
                  className={styles.input}
                  value={vitals[key] || ''}
                  readOnly={key === 'bmi'}
                  placeholder={key === 'bmi' ? 'auto' : '—'}
                  onChange={e => set(key, e.target.value)}
                  style={key === 'bmi' && vitals.bmi
                    ? { background: '#f0fdf4', color: '#065f46', fontWeight: 700 }
                    : undefined}
                />
              </div>
            ))}
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Vitals'}
          </button>
        </div>
      </div>
    </div>
  );
}
