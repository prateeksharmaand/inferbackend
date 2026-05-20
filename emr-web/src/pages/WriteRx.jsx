import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import styles from './WriteRx.module.css';

export default function WriteRx() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [appt,    setAppt]    = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const [form, setForm] = useState({
    chief_complaint: '',
    symptoms:        [],
    symptomInput:    '',
    diagnosis:       [],
    diagInput:       '',
    medications:     [],
    instructions:    '',
    next_visit_date: '',
    next_visit_notes:'',
    vitals: { bp_systolic:'', bp_diastolic:'', pulse:'', spo2:'', temp:'', weight:'', height:'' },
  });

  useEffect(() => {
    if (appointmentId === 'new') return;
    api.get(`/appointments/${appointmentId}`).then(data => {
      setAppt(data);
      if (data.chief_complaint) setForm(f => ({ ...f, chief_complaint: data.chief_complaint }));
      if (data.diagnosis)       setForm(f => ({ ...f, diagnosis: data.diagnosis }));
      if (data.medications)     setForm(f => ({ ...f, medications: data.medications }));
      if (data.instructions)    setForm(f => ({ ...f, instructions: data.instructions }));
      if (data.next_visit_date) setForm(f => ({ ...f, next_visit_date: data.next_visit_date?.slice(0,10) }));
      if (data.vitals)          setForm(f => ({ ...f, vitals: { ...f.vitals, ...data.vitals } }));
    }).catch(() => {});
  }, [appointmentId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setVital = (k, v) => setForm(f => ({ ...f, vitals: { ...f.vitals, [k]: v } }));

  const addSymptom = () => {
    if (!form.symptomInput.trim()) return;
    set('symptoms', [...form.symptoms, form.symptomInput.trim()]);
    set('symptomInput', '');
  };

  const addDiag = () => {
    if (!form.diagInput.trim()) return;
    set('diagnosis', [...form.diagnosis, { display: form.diagInput.trim(), code: '', system: 'http://snomed.info/sct', status: 'active' }]);
    set('diagInput', '');
  };

  const addMed = () => {
    set('medications', [...form.medications, { name: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  };
  const updateMed = (i, k, v) => {
    const meds = [...form.medications];
    meds[i] = { ...meds[i], [k]: v };
    set('medications', meds);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/appointments/${appointmentId}/encounter`, {
        chief_complaint:  form.chief_complaint,
        symptoms:         form.symptoms,
        diagnosis:        form.diagnosis,
        medications:      form.medications,
        instructions:     form.instructions,
        next_visit_date:  form.next_visit_date || null,
        next_visit_notes: form.next_visit_notes,
        vitals:           form.vitals,
      });
      navigate('/queue');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <button className={styles.back} onClick={() => navigate('/queue')}>← Queue</button>
        <h2>{appt ? `${appt.patient_name} — Write Rx` : 'Write Rx'}</h2>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save & Complete'}
        </button>
      </div>

      <div className={styles.body}>
        {/* Vitals */}
        <section className={styles.section}>
          <h3>Vitals</h3>
          <div className={styles.vitalsGrid}>
            {[
              ['bp_systolic','BP Systolic','mmHg'],['bp_diastolic','BP Diastolic','mmHg'],
              ['pulse','Pulse','bpm'],['spo2','SpO₂','%'],['temp','Temp','°C'],
              ['weight','Weight','kg'],['height','Height','cm'],
            ].map(([k, label, unit]) => (
              <div key={k} className={styles.vitalField}>
                <label>{label} <span className={styles.unit}>{unit}</span></label>
                <input type="number" value={form.vitals[k]} onChange={e => setVital(k, e.target.value)} />
              </div>
            ))}
          </div>
        </section>

        {/* Chief Complaint */}
        <section className={styles.section}>
          <h3>Chief Complaint</h3>
          <textarea rows={2} value={form.chief_complaint}
            onChange={e => set('chief_complaint', e.target.value)}
            placeholder="Patient's main complaint…" />
        </section>

        {/* Symptoms */}
        <section className={styles.section}>
          <h3>Symptoms</h3>
          <div className={styles.chips}>
            {form.symptoms.map((s, i) => (
              <span key={i} className={styles.chip}>
                {s} <button onClick={() => set('symptoms', form.symptoms.filter((_,j) => j !== i))}>✕</button>
              </span>
            ))}
          </div>
          <div className={styles.addRow}>
            <input placeholder="Add symptom…" value={form.symptomInput}
              onChange={e => set('symptomInput', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSymptom())} />
            <button onClick={addSymptom}>Add</button>
          </div>
        </section>

        {/* Diagnosis */}
        <section className={styles.section}>
          <h3>Diagnosis</h3>
          <div className={styles.chips}>
            {form.diagnosis.map((d, i) => (
              <span key={i} className={styles.chip}>
                {d.display} <button onClick={() => set('diagnosis', form.diagnosis.filter((_,j) => j !== i))}>✕</button>
              </span>
            ))}
          </div>
          <div className={styles.addRow}>
            <input placeholder="Add diagnosis…" value={form.diagInput}
              onChange={e => set('diagInput', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDiag())} />
            <button onClick={addDiag}>Add</button>
          </div>
        </section>

        {/* Medications */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h3>Medications</h3>
            <button className={styles.addMedBtn} onClick={addMed}>+ Add Medicine</button>
          </div>
          {form.medications.map((m, i) => (
            <div key={i} className={styles.medRow}>
              <input placeholder="Medicine name" value={m.name} onChange={e => updateMed(i,'name',e.target.value)} />
              <input placeholder="Dosage (e.g. 500mg)" value={m.dosage} onChange={e => updateMed(i,'dosage',e.target.value)} />
              <input placeholder="Frequency (e.g. TDS)" value={m.frequency} onChange={e => updateMed(i,'frequency',e.target.value)} />
              <input placeholder="Duration (e.g. 5 days)" value={m.duration} onChange={e => updateMed(i,'duration',e.target.value)} />
              <button className={styles.removeMed} onClick={() => set('medications', form.medications.filter((_,j) => j !== i))}>✕</button>
            </div>
          ))}
        </section>

        {/* Instructions */}
        <section className={styles.section}>
          <h3>Instructions</h3>
          <textarea rows={3} value={form.instructions}
            onChange={e => set('instructions', e.target.value)}
            placeholder="Patient instructions, lifestyle advice…" />
        </section>

        {/* Next Visit */}
        <section className={styles.section}>
          <h3>Next Visit</h3>
          <div className={styles.nextVisit}>
            <div className={styles.field}>
              <label>Date</label>
              <input type="date" value={form.next_visit_date} onChange={e => set('next_visit_date', e.target.value)} />
            </div>
            <div className={styles.field} style={{ flex: 2 }}>
              <label>Notes</label>
              <input placeholder="e.g. Review blood reports" value={form.next_visit_notes}
                onChange={e => set('next_visit_notes', e.target.value)} />
            </div>
          </div>
        </section>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
