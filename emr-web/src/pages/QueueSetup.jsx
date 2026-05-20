import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import styles from './QueueSetup.module.css';

const STEPS = ['Name', 'Filters', 'Quick Actions', 'Sort Order', 'Access', 'Review'];

const CHANNELS = ['ABHA','Doctor','Follow up','Offline','Online appointment','Patient requested','Staff','Walk in'];
const STATUSES  = ['Booked','Checked in','Ongoing','Completed','Cancelled','Rescheduled','Follow up or patient requested','Parked','No show','Aborted'];
const PAYMENTS  = ['Billed','Unbilled'];
const MODES     = ['In clinic','Tele'];

const ALL_ACTIONS = [
  'Visit Type','Payment Status','Assessment Status','Write Rx','Notes','Print Rx','Label','Exit',
  'Check In','Follow Up','Create ABHA','Past Visits','Add Vitals And Lab Results','Add Address',
  'Request Records','Request Payment','Archive Appointment','Create Certificate','Refer To Doctor',
  'Send Google Review Link','Mark No Show','Create Template','ABHA Id','Upload Medical Records',
  'Receipt','Order Medicine','Questionnaire','Assign Doctor','Reschedule Appointment',
  'Add Services To Appointment','Update Appointment Payment Status','Medical Record Document Type',
];

const SORT_OPTIONS = [
  { key: 'appointment_start',    label: 'Appointment start' },
  { key: 'appointment_checkin',  label: 'Appointment check-in' },
  { key: 'appointment_update',   label: 'Appointment update' },
  { key: 'token',                label: 'Token' },
  { key: 'appointment_complete', label: 'Appointment complete' },
];

const DEFAULT_ACTIONS = ['Visit Type','Payment Status','Assessment Status','Write Rx','Notes','Print Rx','Check In','Follow Up','Past Visits'];

export default function QueueSetup() {
  const navigate  = useNavigate();
  const [step,    setStep]    = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const [name,       setName]       = useState('');
  const [modes,      setModes]      = useState(['In clinic']);
  const [channels,   setChannels]   = useState([]);
  const [statuses,   setStatuses]   = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [actions,    setActions]    = useState(DEFAULT_ACTIONS);
  const [sortOrder,  setSortOrder]  = useState('appointment_start');

  const toggle = (arr, setArr, val) =>
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    return true;
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      await api.post('/queues', {
        name: name.trim(),
        mode: modes.map(m => m.toLowerCase().replace(' ', '_'))[0] || 'in_clinic',
        filters: { channels, statuses, payments, modes },
        quick_actions: actions,
        sort_order: sortOrder,
      });
      navigate('/queue');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.title}>Create Queue</h2>

        {/* Step indicator */}
        <div className={styles.stepper}>
          {STEPS.map((s, i) => (
            <div key={s} className={`${styles.stepItem} ${i <= step ? styles.stepDone : ''}`}>
              <div className={styles.stepDot}>{i < step ? '✓' : i + 1}</div>
              <span className={styles.stepLabel}>{s}</span>
              {i < STEPS.length - 1 && <div className={styles.stepLine} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className={styles.body}>
          {step === 0 && (
            <div className={styles.section}>
              <label className={styles.label}>Queue Name</label>
              <input
                className={styles.input} autoFocus
                placeholder="e.g. Morning OPD, Dr. Sharma's Queue"
                value={name} onChange={e => setName(e.target.value)}
              />
              <p className={styles.hint}>Give your queue a clear, recognizable name</p>
            </div>
          )}

          {step === 1 && (
            <div className={styles.section}>
              <p className={styles.groupLabel}>Mode</p>
              <div className={styles.chips}>{MODES.map(m => (
                <button key={m} className={`${styles.chip} ${modes.includes(m) ? styles.chipOn : ''}`}
                  onClick={() => toggle(modes, setModes, m)}>{m}</button>
              ))}</div>

              <p className={styles.groupLabel}>Appointment Channel</p>
              <div className={styles.chips}>{CHANNELS.map(c => (
                <button key={c} className={`${styles.chip} ${channels.includes(c) ? styles.chipOn : ''}`}
                  onClick={() => toggle(channels, setChannels, c)}>{c}</button>
              ))}</div>

              <p className={styles.groupLabel}>Appointment Status</p>
              <div className={styles.chips}>{STATUSES.map(s => (
                <button key={s} className={`${styles.chip} ${statuses.includes(s) ? styles.chipOn : ''}`}
                  onClick={() => toggle(statuses, setStatuses, s)}>{s}</button>
              ))}</div>

              <p className={styles.groupLabel}>Payment Status</p>
              <div className={styles.chips}>{PAYMENTS.map(p => (
                <button key={p} className={`${styles.chip} ${payments.includes(p) ? styles.chipOn : ''}`}
                  onClick={() => toggle(payments, setPayments, p)}>{p}</button>
              ))}</div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.section}>
              <p className={styles.hint}>Select quick actions for this queue</p>
              <div className={styles.chips}>{ALL_ACTIONS.map(a => (
                <button key={a} className={`${styles.chip} ${actions.includes(a) ? styles.chipOn : ''}`}
                  onClick={() => toggle(actions, setActions, a)}>{a}</button>
              ))}</div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.section}>
              {SORT_OPTIONS.map(o => (
                <label key={o.key} className={styles.radioRow}>
                  <input type="radio" name="sort" value={o.key}
                    checked={sortOrder === o.key}
                    onChange={() => setSortOrder(o.key)} />
                  {o.label}
                </label>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className={styles.section}>
              <p className={styles.hint}>Access control is managed at the clinic level. All staff with clinic access can see this queue.</p>
            </div>
          )}

          {step === 5 && (
            <div className={styles.section}>
              <div className={styles.review}>
                <div className={styles.reviewRow}><span>Name</span><strong>{name}</strong></div>
                <div className={styles.reviewRow}><span>Mode</span><strong>{modes.join(', ') || 'All'}</strong></div>
                <div className={styles.reviewRow}><span>Channels</span><strong>{channels.length ? channels.join(', ') : 'All'}</strong></div>
                <div className={styles.reviewRow}><span>Sort by</span><strong>{SORT_OPTIONS.find(o => o.key === sortOrder)?.label}</strong></div>
                <div className={styles.reviewRow}><span>Quick actions</span><strong>{actions.length}</strong></div>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {step > 0 && (
            <button className={styles.btnSecondary} onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          <button className={styles.btnCancel} onClick={() => navigate('/queue')}>Cancel</button>
          {step < STEPS.length - 1 ? (
            <button className={styles.btnPrimary} disabled={!canNext()} onClick={() => setStep(s => s + 1)}>
              Next
            </button>
          ) : (
            <button className={styles.btnPrimary} disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save Queue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
