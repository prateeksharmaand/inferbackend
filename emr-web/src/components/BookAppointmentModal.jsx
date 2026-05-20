import { useState, useEffect } from 'react';
import { api } from '../api/client';
import styles from './BookAppointmentModal.module.css';

const CHANNELS = ['Walk in','Online appointment','Follow up','ABHA','Doctor','Patient requested','Staff','Offline'];

const ATTR_TYPES = {
  1:  { label: 'Tags',                        multi: true  },
  2:  { label: 'Labels',                       multi: false },
  16: { label: 'Medical Record Document Type', multi: true  },
};

export default function BookAppointmentModal({ mode, onClose, prefill = {} }) {
  const [queues,      setQueues]      = useState([]);
  const [doctors,     setDoctors]     = useState([]);
  const [clinicTags,  setClinicTags]  = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  const [form, setForm] = useState({
    patient_name:    prefill.patient_name   || '',
    patient_mobile:  prefill.patient_mobile || '',
    patient_dob:     '',
    patient_gender:  'M',
    patient_abha:    prefill.patient_abha   || '',
    queue_id:        '',
    doctor_id:       '',
    channel:         prefill.channel        || 'walk_in',
    visit_type:      'OPConsultation',
    appointment_date: new Date().toISOString().slice(0,10),
    appointment_time: '',
    notes:           '',
  });

  useEffect(() => {
    Promise.all([api.get('/queues'), api.get('/auth/doctors'), api.get('/tags')])
      .then(([q, d, t]) => { setQueues(q); setDoctors(d); setClinicTags(t); })
      .catch(() => {});
  }, []);

  const toggleTag = (tag) => {
    const isMulti = ATTR_TYPES[tag.attr_type]?.multi ?? true;
    setSelectedTags(prev => {
      if (isMulti) {
        return prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id];
      }
      // Single-select: deselect others of same type, toggle this one
      const sameType = clinicTags.filter(t => t.attr_type === tag.attr_type).map(t => t.id);
      const withoutType = prev.filter(id => !sameType.includes(id));
      return prev.includes(tag.id) ? withoutType : [...withoutType, tag.id];
    });
  };

  // Group tags by attr_type for display
  const tagGroups = Object.entries(ATTR_TYPES)
    .map(([typeId, meta]) => ({
      typeId: parseInt(typeId, 10),
      ...meta,
      items: clinicTags.filter(t => t.attr_type === parseInt(typeId, 10)),
    }))
    .filter(g => g.items.length > 0);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patient_name.trim()) return setError('Patient name is required');
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        queue_id:  form.queue_id  || undefined,
        doctor_id: form.doctor_id || undefined,
        status: mode === 'checkin' ? 'checked_in' : 'booked',
        tags: selectedTags,
      };
      await api.post('/appointments', payload);
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
          <h3>{mode === 'checkin' ? 'Add Patient & Check-In' : 'Book Appointment'}</h3>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <form className={styles.body} onSubmit={handleSubmit}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Patient Name *</label>
              <input required value={form.patient_name} onChange={e => set('patient_name', e.target.value)} placeholder="Full name" />
            </div>
            <div className={styles.field}>
              <label>Mobile</label>
              <input value={form.patient_mobile} onChange={e => set('patient_mobile', e.target.value)} placeholder="+91 9999999999" />
            </div>
            <div className={styles.field}>
              <label>Date of Birth</label>
              <input type="date" value={form.patient_dob} onChange={e => set('patient_dob', e.target.value)} />
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
              <input value={form.patient_abha} onChange={e => set('patient_abha', e.target.value)} placeholder="12-3456-7890-1234" />
            </div>
            <div className={styles.field}>
              <label>Channel</label>
              <select value={form.channel} onChange={e => set('channel', e.target.value)}>
                {CHANNELS.map(c => <option key={c} value={c.toLowerCase().replace(/ /g,'_')}>{c}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Queue</label>
              <select value={form.queue_id} onChange={e => set('queue_id', e.target.value)}>
                <option value="">— Select queue —</option>
                {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Doctor</label>
              <select value={form.doctor_id} onChange={e => set('doctor_id', e.target.value)}>
                <option value="">— Select doctor —</option>
                {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Date</label>
              <input type="date" value={form.appointment_date} onChange={e => set('appointment_date', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Time</label>
              <input type="time" value={form.appointment_time} onChange={e => set('appointment_time', e.target.value)} />
            </div>
          </div>

          {tagGroups.length > 0 && (
            <div className={styles.attrSection}>
              {tagGroups.map(group => (
                <div key={group.typeId} className={styles.field}>
                  <label>
                    {group.label}
                    <span className={styles.attrBehavior}>{group.multi ? 'Multi-select' : 'Single-select'}</span>
                  </label>
                  <div className={styles.tagChips}>
                    {group.items.map(t => {
                      const active = selectedTags.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`${styles.tagChip} ${active ? styles.tagChipActive : ''}`}
                          style={active ? { background: t.color, borderColor: t.color, color: '#fff' }
                                        : { borderColor: t.color, color: t.color }}
                          onClick={() => toggleTag(t)}
                        >
                          {t.display_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.field}>
            <label>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : mode === 'checkin' ? 'Add & Check-In' : 'Book Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
