import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Video, Building2, Calendar, Search, ChevronDown, Check } from 'lucide-react';
import { api } from '../api/client';
import styles from './BookSlotModal.module.css';

const DURATIONS = [5, 7, 10, 15, 20, 25, 30, 45, 60];
const WORK_START = 9 * 60;   // 9:00 AM
const WORK_END   = 20 * 60;  // 8:00 PM

function pad(n) { return String(n).padStart(2, '0'); }

function minsToLabel(t) {
  const h = Math.floor(t / 60);
  const m = t % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${pad(m)} ${ampm}`;
}

function minsToValue(t) {
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

function generateSlots(durationMins, takenSet) {
  const slots = [];
  for (let t = WORK_START; t + durationMins <= WORK_END; t += durationMins) {
    const value = minsToValue(t);
    slots.push({ label: minsToLabel(t), value, taken: takenSet.has(value) });
  }
  return slots;
}

function dateLabel(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function localDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
}

export default function BookSlotModal({ prefill = {}, onClose, onBooked }) {
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);

  const DATE_PILLS = [
    { label: 'Today',    date: today },
    { label: 'Tomorrow', date: tomorrow },
    { label: dayAfter.toLocaleDateString('en-IN', { weekday: 'long' }), date: dayAfter },
    { label: 'Custom',   date: null },
  ];

  // Patient
  const [patient,    setPatient]    = useState(
    prefill.patient_name ? { id: prefill.patient_id || null, name: prefill.patient_name, mobile: prefill.patient_mobile || '', abha_number: prefill.patient_abha || '', gender: prefill.patient_gender || '', dob: prefill.patient_dob || '' } : null
  );
  const [patientDob, setPatientDob] = useState(prefill.patient_dob || '');
  const [changingPt, setChangingPt] = useState(!prefill.patient_name);
  const [ptQuery,    setPtQuery]    = useState('');
  const [ptResults,  setPtResults]  = useState([]);
  const [ptSearching,setPtSearching]= useState(false);
  const ptDebounce  = useRef(null);

  // Form
  const [mode,         setMode]         = useState('in_clinic');
  const [selectedDate, setSelectedDate] = useState(today);
  const [customDate,   setCustomDate]   = useState('');
  const [showCustom,   setShowCustom]   = useState(false);
  const [duration,     setDuration]     = useState(15);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slots,        setSlots]        = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [queues,       setQueues]       = useState([]);
  const [doctors,      setDoctors]      = useState([]);
  const [queueId,      setQueueId]      = useState('');
  const [doctorId,     setDoctorId]     = useState('');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    Promise.all([api.get('/queues'), api.get('/auth/doctors')])
      .then(([q, d]) => {
        setQueues(q);
        setDoctors(d);
        if (q.length) setQueueId(String(q[0].id));
      }).catch(() => {});
  }, []);

  // Load slots whenever date / duration / queue changes
  const loadSlots = useCallback(() => {
    setSelectedSlot(null);
    setLoadingSlots(true);
    const dateStr = localDate(selectedDate);
    const params  = `date=${dateStr}${queueId ? `&queue_id=${queueId}` : ''}`;
    api.get(`/appointments?${params}`)
      .then(data => {
        const all   = [...(data.booked || []), ...(data.my_opd || []), ...(data.completed || [])];
        const taken = new Set(all.map(a => a.appointment_time).filter(Boolean).map(t => t.slice(0, 5)));
        setSlots(generateSlots(duration, taken));
      })
      .catch(() => setSlots(generateSlots(duration, new Set())))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, duration, queueId]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  // Patient search
  const doPatientSearch = useCallback((q) => {
    if (q.trim().length < 2) { setPtResults([]); return; }
    setPtSearching(true);
    api.get(`/patients?q=${encodeURIComponent(q.trim())}`)
      .then(rows => setPtResults(rows || []))
      .catch(() => setPtResults([]))
      .finally(() => setPtSearching(false));
  }, []);

  const handlePtQuery = (e) => {
    setPtQuery(e.target.value);
    clearTimeout(ptDebounce.current);
    ptDebounce.current = setTimeout(() => doPatientSearch(e.target.value), 300);
  };

  const selectPatient = (p) => {
    setPatient(p);
    setPatientDob(p.dob || '');
    setChangingPt(false);
    setPtQuery('');
    setPtResults([]);
  };

  const handleDatePill = (pill) => {
    if (!pill.date) { setShowCustom(true); return; }
    setShowCustom(false);
    setSelectedDate(pill.date);
  };

  const handleCustomDate = (e) => {
    setCustomDate(e.target.value);
    if (e.target.value) {
      const d = new Date(e.target.value);
      d.setHours(0, 0, 0, 0);
      setSelectedDate(d);
      setShowCustom(false);
    }
  };

  const activeDatePill = () => {
    if (showCustom) return null;
    return DATE_PILLS.find(p => p.date && p.date.toDateString() === selectedDate.toDateString());
  };

  const handleBook = async () => {
    if (!patient?.name) return setError('Please select a patient');
    if (!queueId)       return setError('Please select a queue');
    if (!selectedSlot)  return setError('Please select a time slot');
    setSaving(true); setError('');
    try {
      const effectiveDob = patientDob || patient.dob || '';
      await api.post('/appointments', {
        patient_name:    patient.name,
        patient_mobile:  patient.mobile || '',
        patient_abha:    patient.abha_number || patient.abha_address || '',
        patient_gender:  patient.gender || '',
        patient_dob:     effectiveDob,
        emr_patient_id:  patient.id || undefined,
        queue_id:        queueId,
        doctor_id:       doctorId || undefined,
        appointment_date: localDate(selectedDate),
        appointment_time: selectedSlot,
        visit_type:      mode === 'tele' ? 'TeleConsultation' : 'OPConsultation',
        channel:         mode === 'tele' ? 'tele_consultation' : 'walk_in',
        status:          'booked',
      });
      // If DOB was entered and patient exists in DB, save it for ABDM linking
      if (effectiveDob && patient.id) {
        api.patch(`/patients/${patient.id}`, { dob: effectiveDob }).catch(() => {});
      }
      window.dispatchEvent(new CustomEvent('appointment:created'));
      if (onBooked) onBooked();
      else onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const activePill = activeDatePill();

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
          <h2 className={styles.title}>Book Appointment</h2>
        </div>

        <div className={styles.body}>

          {/* ── Patient strip ── */}
          {!changingPt && patient ? (
            <div className={styles.patientStrip}>
              <div className={styles.patientAvatar}>{patient.name[0]?.toUpperCase()}</div>
              <div className={styles.patientInfo}>
                <span className={styles.patientName}>{patient.name}</span>
                <span className={styles.patientMeta}>
                  {[patient.uhid, patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : patient.gender, patient.dob ? `${getAge(patient.dob)}Y` : null, patient.mobile].filter(Boolean).join(' • ')}
                </span>
              </div>
              <button className={styles.changeBtn} onClick={() => { setChangingPt(true); setPtQuery(''); }}>
                Change Patient
              </button>
            </div>
          ) : (
            <div className={styles.ptSearch}>
              <Search size={14} className={styles.ptSearchIcon} />
              <input
                autoFocus
                className={styles.ptSearchInput}
                placeholder="Search patient by name, mobile, ABHA…"
                value={ptQuery}
                onChange={handlePtQuery}
              />
              {patient && <button className={styles.ptCancelBtn} onClick={() => setChangingPt(false)}><X size={13} /></button>}
              {(ptResults.length > 0 || ptSearching || ptQuery.length >= 2) && (
                <div className={styles.ptDropdown}>
                  {ptSearching && <div className={styles.ptHint}>Searching…</div>}
                  {ptResults.map(p => (
                    <button key={p.id} className={styles.ptResult} onClick={() => selectPatient(p)}>
                      <span className={styles.ptAvatar2}>{p.name[0].toUpperCase()}</span>
                      <div>
                        <div className={styles.ptName}>{p.name}</div>
                        <div className={styles.ptMeta}>{[p.uhid, p.mobile, p.gender === 'M' ? 'Male' : 'Female', p.dob ? `${getAge(p.dob)}Y` : null].filter(Boolean).join(' • ')}</div>
                      </div>
                    </button>
                  ))}
                  {!ptSearching && ptQuery.trim().length >= 2 && (
                    <button className={styles.ptResult} onClick={() => selectPatient({ name: ptQuery.trim(), mobile: '', gender: '' })}>
                      <span className={styles.ptAvatar2}>+</span>
                      <div>
                        <div className={styles.ptName}>Add "{ptQuery.trim()}" as new patient</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── DOB field — shown when patient has no DOB (required for ABDM care context linking) ── */}
          {patient && !changingPt && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>
                Date of Birth
                {!patient.dob && <span style={{ color: '#ef4444', marginLeft: 4, fontSize: 11 }}>* Required for ABDM linking</span>}
              </label>
              <input
                type="date"
                value={patientDob}
                onChange={e => setPatientDob(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${!patientDob && !patient.dob ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              {patientDob && (
                <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 3 }}>
                  Year of birth: {new Date(patientDob).getFullYear()} — will be saved to patient record
                </div>
              )}
            </div>
          )}

          {/* ── Mode + Slot Type row ── */}
          <div className={styles.modeRow}>
            <div className={styles.modeGroup}>
              <span className={styles.sectionLabel}>Select Mode</span>
              <div className={styles.modeBtns}>
                <button
                  className={`${styles.modeBtn} ${mode === 'in_clinic' ? styles.modeBtnActive : ''}`}
                  onClick={() => setMode('in_clinic')}
                >
                  <Building2 size={14} strokeWidth={1.8} /> In-Clinic
                </button>
                <button
                  className={`${styles.modeBtn} ${mode === 'tele' ? styles.modeBtnActive : ''}`}
                  onClick={() => setMode('tele')}
                >
                  <Video size={14} strokeWidth={1.8} /> Tele-Consultation
                </button>
              </div>
            </div>
            <div className={styles.slotTypeWrap}>
              <span className={styles.sectionLabel}>Slot Type</span>
              <div className={styles.slotTypeSelect}>
                <span>Flexible Time Slots</span>
                <ChevronDown size={13} />
              </div>
            </div>
          </div>

          {/* ── Date ── */}
          <div>
            <span className={styles.sectionLabel}>Select Date</span>
            <div className={styles.datePills}>
              {DATE_PILLS.map((pill, i) => {
                const isActive = pill.date
                  ? activePill?.label === pill.label
                  : showCustom;
                return (
                  <button
                    key={i}
                    className={`${styles.datePill} ${isActive ? styles.datePillActive : ''}`}
                    onClick={() => handleDatePill(pill)}
                  >
                    {pill.label === 'Custom'
                      ? <><Calendar size={13} /> Custom</>
                      : pill.label}
                  </button>
                );
              })}
            </div>
            {showCustom && (
              <input
                type="date"
                className={styles.customDateInput}
                value={customDate}
                min={localDate(new Date())}
                onChange={handleCustomDate}
                autoFocus
              />
            )}
            {!showCustom && activePill && (
              <span className={styles.dateDisplay}>{dateLabel(selectedDate)}</span>
            )}
          </div>

          {/* ── Queue + Doctor row ── */}
          <div className={styles.queueRow}>
            <div className={styles.fieldInline}>
              <label>Queue <span className={styles.req}>*</span></label>
              <select className={styles.selectInline} value={queueId} onChange={e => setQueueId(e.target.value)}
                style={!queueId && error ? { borderColor: '#dc2626' } : {}}>
                <option value="">— Select —</option>
                {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
            <div className={styles.fieldInline}>
              <label>Doctor</label>
              <select className={styles.selectInline} value={doctorId} onChange={e => setDoctorId(e.target.value)}>
                <option value="">Any doctor</option>
                {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Duration ── */}
          <div>
            <span className={styles.sectionLabel}>Visit Duration</span>
            <div className={styles.durationPills}>
              {DURATIONS.map(d => (
                <button
                  key={d}
                  className={`${styles.durationPill} ${duration === d ? styles.durationPillActive : ''}`}
                  onClick={() => setDuration(d)}
                >
                  {d}m
                </button>
              ))}
            </div>
          </div>

          {/* ── Slot grid ── */}
          <div>
            <span className={styles.sectionLabel}>Select Slot</span>
            {loadingSlots ? (
              <div className={styles.slotLoading}><div className={styles.spinner} /></div>
            ) : (
              <div className={styles.slotGrid}>
                {slots.map(s => (
                  <button
                    key={s.value}
                    disabled={s.taken}
                    className={`${styles.slot} ${s.taken ? styles.slotTaken : ''} ${selectedSlot === s.value ? styles.slotActive : ''}`}
                    onClick={() => !s.taken && setSelectedSlot(s.value)}
                  >
                    {selectedSlot === s.value && <Check size={11} strokeWidth={3} />}
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          <button className={styles.btnClose} onClick={onClose}>Close</button>
          <button className={styles.btnBook} onClick={handleBook} disabled={saving}>
            {saving ? 'Booking…' : 'Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}
