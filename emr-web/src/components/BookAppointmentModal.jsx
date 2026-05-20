import { useState, useEffect } from 'react';
import { api } from '../api/client';
import styles from './BookAppointmentModal.module.css';
import MedicalHistorySection from './MedicalHistorySection';

const CHANNELS = ['Walk in','Online appointment','Follow up','ABHA','Doctor','Patient requested','Staff','Offline'];

export default function BookAppointmentModal({ mode, onClose, prefill = {}, onCreated, registerOnly = false }) {
  const [queues,       setQueues]       = useState([]);
  const [doctors,      setDoctors]      = useState([]);
  const [saving,         setSaving]         = useState(false);
  const [generatingUhid, setGeneratingUhid] = useState(false);
  const [error,          setError]          = useState('');
  const [medicalHistory, setMedicalHistory] = useState([]);

  const [form, setForm] = useState({
    patient_name:    prefill.patient_name   || '',
    patient_mobile:  prefill.patient_mobile || '',
    patient_dob:     '',
    patient_gender:  'M',
    patient_abha:    prefill.patient_abha   || '',
    uhid:            '',
    queue_id:        '',
    doctor_id:       '',
    channel:         prefill.channel        || 'walk_in',
    visit_type:      'OPConsultation',
    appointment_date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
    appointment_time: '',
    notes:           '',
  });

  useEffect(() => {
    Promise.all([api.get('/queues'), api.get('/auth/doctors')])
      .then(([q, d]) => { setQueues(q); setDoctors(d); })
      .catch(() => {});
  }, []);

  const handleGenerateUhid = async () => {
    setGeneratingUhid(true);
    try {
      const { uhid } = await api.post('/settings/uhid/generate', {});
      set('uhid', uhid);
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingUhid(false);
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patient_name.trim()) return setError('Patient name is required');
    if (mode === 'checkin' && !form.queue_id) return setError('Please select a queue to check in');
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        queue_id:  form.queue_id  || undefined,
        doctor_id: form.doctor_id || undefined,
        status: mode === 'checkin' ? 'checked_in' : 'booked',
        medical_history: medicalHistory,
      };
      if (!registerOnly) {
        await api.post('/appointments', payload);
        window.dispatchEvent(new CustomEvent('appointment:created', { detail: { queue_id: form.queue_id } }));
      }
      if (onCreated) onCreated(form);
      else onClose();
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
              <label>UHID</label>
              <div className={styles.uhidRow}>
                <input
                  value={form.uhid}
                  onChange={e => set('uhid', e.target.value)}
                  placeholder="Auto-generate or type manually"
                  className={styles.uhidInput}
                  readOnly={!!form.uhid && !form.uhid_manual}
                />
                <button
                  type="button"
                  className={styles.uhidBtn}
                  onClick={handleGenerateUhid}
                  disabled={generatingUhid}
                >
                  {generatingUhid ? '…' : 'Generate UHID'}
                </button>
              </div>
            </div>
            <div className={styles.field}>
              <label>Channel</label>
              <select value={form.channel} onChange={e => set('channel', e.target.value)}>
                {CHANNELS.map(c => <option key={c} value={c.toLowerCase().replace(/ /g,'_')}>{c}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>
                Queue {mode === 'checkin' && <span className={styles.req}>*</span>}
              </label>
              <select
                value={form.queue_id}
                onChange={e => { set('queue_id', e.target.value); setError(''); }}
                style={mode === 'checkin' && !form.queue_id && error ? { borderColor: '#dc2626' } : {}}
              >
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

          {mode === 'checkin' && (
            <MedicalHistorySection value={medicalHistory} onChange={setMedicalHistory} />
          )}

          <div className={styles.field}>
            <label>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : registerOnly ? 'Continue to Booking →' : mode === 'checkin' ? 'Add & Check-In' : 'Book Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
