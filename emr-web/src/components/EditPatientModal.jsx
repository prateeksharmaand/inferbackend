import { useState } from 'react';
import { UserCog, X, Check } from 'lucide-react';
import { api } from '../api/client';
import styles from './BookAppointmentModal.module.css';

const CHANNELS    = ['Walk in','Online appointment','Follow up','ABHA','Doctor','Patient requested','Staff','Offline'];
const VISIT_TYPES = ['OPConsultation','FollowUp','Emergency','Procedure','Vaccination'];

const MEDICAL_HISTORY = [
  { key: 'diabetes',       label: 'Diabetes',       group: 'Conditions' },
  { key: 'hypertension',   label: 'Hypertension',   group: 'Conditions' },
  { key: 'hypothyroidism', label: 'Hypothyroidism',  group: 'Conditions' },
  { key: 'alcohol',        label: 'Alcohol',         group: 'Habits' },
  { key: 'tobacco',        label: 'Tobacco',         group: 'Habits' },
  { key: 'smoking',        label: 'Smoking',         group: 'Habits' },
];

export default function EditPatientModal({ appt, onClose, onSaved }) {
  const [form, setForm] = useState({
    patient_name:   appt.patient_name   || '',
    patient_mobile: appt.patient_mobile || '',
    patient_dob:    appt.patient_dob    ? appt.patient_dob.slice(0, 10) : '',
    patient_gender: appt.patient_gender || 'M',
    patient_abha:   appt.patient_abha   || '',
    visit_type:     appt.visit_type     || 'OPConsultation',
    channel:        appt.channel        || 'walk_in',
    notes:          appt.notes          || '',
  });
  const [medicalHistory, setMedicalHistory] = useState(
    Array.isArray(appt.medical_history) ? appt.medical_history : []
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patient_name.trim()) return setError('Patient name is required');
    setSaving(true); setError('');
    try {
      const updated = await api.patch(`/appointments/${appt.id}/status`, { ...form, medical_history: medicalHistory });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 style={{ display:'flex', alignItems:'center', gap:8 }}>
            <UserCog size={17} strokeWidth={1.8} style={{ color:'var(--color-primary)' }} />
            Edit Patient Details
          </h3>
          <button className={styles.close} onClick={onClose}><X size={16} /></button>
        </div>

        <form className={styles.body} onSubmit={handleSubmit}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Patient Name *</label>
              <input required value={form.patient_name}
                onChange={e => set('patient_name', e.target.value)} placeholder="Full name" />
            </div>
            <div className={styles.field}>
              <label>Mobile</label>
              <input value={form.patient_mobile}
                onChange={e => set('patient_mobile', e.target.value)} placeholder="+91 9999999999" />
            </div>
            <div className={styles.field}>
              <label>Date of Birth</label>
              <input type="date" value={form.patient_dob}
                onChange={e => set('patient_dob', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Gender</label>
              <select value={form.patient_gender} onChange={e => set('patient_gender', e.target.value)}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>ABHA ID</label>
              <input value={form.patient_abha}
                onChange={e => set('patient_abha', e.target.value)} placeholder="12-3456-7890-1234" />
            </div>
            <div className={styles.field}>
              <label>Visit Type</label>
              <select value={form.visit_type} onChange={e => set('visit_type', e.target.value)}>
                {VISIT_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Channel</label>
              <select value={form.channel} onChange={e => set('channel', e.target.value)}>
                {CHANNELS.map(c => <option key={c} value={c.toLowerCase().replace(/ /g,'_')}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.medHistSection}>
            <div className={styles.medHistLabel}>Medical History</div>
            {['Conditions', 'Habits'].map(group => (
              <div key={group} className={styles.medHistGroup}>
                <span className={styles.medHistGroupName}>{group}</span>
                <div className={styles.medHistChips}>
                  {MEDICAL_HISTORY.filter(m => m.group === group).map(m => {
                    const active = medicalHistory.includes(m.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        className={`${styles.medChip} ${active ? styles.medChipActive : ''}`}
                        onClick={() => setMedicalHistory(prev =>
                          prev.includes(m.key) ? prev.filter(k => k !== m.key) : [...prev, m.key]
                        )}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.field}>
            <label>Notes</label>
            <textarea rows={2} value={form.notes}
              onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} style={{marginRight:4}} />Save Changes</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
