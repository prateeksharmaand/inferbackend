import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, LayoutTemplate, Settings2,
  Printer, Eye, Trash2, SlidersHorizontal, CheckCircle, X, Plus,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ConfigureInferPadModal from '../components/ConfigureInferPadModal';
import styles from './WriteRx.module.css';

const TABS = ['Overview', 'InferPad', 'Canvas', 'Medical Records'];

const EMPTY_FORM = {
  vitals: { bp_systolic: '', bp_diastolic: '', pulse: '', spo2: '', temp: '', weight: '', height: '' },
  symptoms: [],         symptomInput: '',
  diagnosis: [],        diagInput: '',
  medications: [],
  lab_investigations: [], labInput: '',
  lab_results: [],
  examination_findings: '',
  notes: '',
  refer_to: '',
  next_visit_date: '',
  next_visit_notes: '',
  advices: '',
  procedures: [],       procInput: '',
};

// ── Prescription preview / print modal ──────────────────────────────────────
function PrescriptionPreview({ form, appt, user, rxImages = {}, onClose, onPrint }) {
  return (
    <div className={styles.previewOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.previewModal}>
        <div className={styles.previewToolbar}>
          <span className={styles.previewTitle}>Prescription Preview</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.previewPrintBtn} onClick={onPrint}>
              <Printer size={13} strokeWidth={2} /> Print
            </button>
            <button className={styles.previewCloseBtn} onClick={onClose}><X size={15} /></button>
          </div>
        </div>
        <div className={styles.previewBody}>
          <div className={styles.rxPaper} id="rx-print-area">
            {/* Header */}
            {rxImages.headerImg ? (
              <div className={styles.rxPaperImgBlock}>
                <img src={rxImages.headerImg} alt="Header" className={styles.rxPaperImg} />
              </div>
            ) : (
              <div className={styles.rxPaperHeader}>
                <div className={styles.rxPaperClinic}>{user?.clinic_name || 'Clinic'}</div>
                {user?.clinic_address && <div className={styles.rxPaperAddr}>{user.clinic_address}</div>}
                {user?.clinic_phone   && <div className={styles.rxPaperAddr}>{user.clinic_phone}</div>}
              </div>
            )}

            {/* Patient row */}
            <div className={styles.rxPaperPatient}>
              <span><b>Patient:</b> {appt?.patient_name || '—'}</span>
              <span><b>Date:</b> {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {appt?.uhid && <span><b>UHID:</b> {appt.uhid}</span>}
              {appt?.patient_mobile && <span><b>Mob:</b> {appt.patient_mobile}</span>}
              {appt?.patient_gender && <span>{appt.patient_gender === 'M' ? 'Male' : 'Female'}</span>}
              {appt?.doctor_name && <span><b>Dr.</b> {appt.doctor_name}</span>}
            </div>
            <hr className={styles.rxPaperRule} />

            <div className={styles.rxPaperBody}>
              {/* Vitals */}
              {Object.values(form.vitals).some(Boolean) && (
                <PrintSection title="Vitals">
                  <div className={styles.printVitalRow}>
                    {[['bp_systolic','BP Sys','mmHg'],['bp_diastolic','BP Dia','mmHg'],
                      ['pulse','Pulse','bpm'],['spo2','SpO₂','%'],
                      ['temp','Temp','°C'],['weight','Weight','kg'],['height','Height','cm'],
                    ].filter(([k]) => form.vitals[k]).map(([k, label, unit]) => (
                      <span key={k} className={styles.printVitalChip}>{label}: <b>{form.vitals[k]}</b> {unit}</span>
                    ))}
                  </div>
                </PrintSection>
              )}

              {/* Medical History */}
              {appt?.medical_history?.length > 0 && (
                <PrintSection title="Medical History">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {appt.medical_history.map((h, i) => (
                      <span key={i} className={styles.printChip}>{h.label || h.condition || JSON.stringify(h)}</span>
                    ))}
                  </div>
                </PrintSection>
              )}

              {/* Symptoms */}
              {form.symptoms.length > 0 && (
                <PrintSection title="Symptoms">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {form.symptoms.map((s, i) => <span key={i} className={styles.printChip}>{s}</span>)}
                  </div>
                </PrintSection>
              )}

              {/* Diagnosis */}
              {form.diagnosis.length > 0 && (
                <PrintSection title="Diagnosis">
                  {form.diagnosis.map((d, i) => <div key={i} className={styles.printBullet}>• {d.display}</div>)}
                </PrintSection>
              )}

              {/* Medications */}
              {form.medications.length > 0 && (
                <PrintSection title="℞  Medications">
                  <table className={styles.printMedTable}>
                    <thead>
                      <tr><th>#</th><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr>
                    </thead>
                    <tbody>
                      {form.medications.map((m, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td><b>{m.name}</b></td>
                          <td>{m.dosage}</td>
                          <td>{m.frequency}</td>
                          <td>{m.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </PrintSection>
              )}

              {/* Lab Investigations */}
              {form.lab_investigations.length > 0 && (
                <PrintSection title="Lab Investigations">
                  {form.lab_investigations.map((l, i) => <div key={i} className={styles.printBullet}>• {l}</div>)}
                </PrintSection>
              )}

              {/* Lab Results */}
              {form.lab_results.length > 0 && (
                <PrintSection title="Lab Results">
                  <table className={styles.printMedTable}>
                    <thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Normal Range</th></tr></thead>
                    <tbody>
                      {form.lab_results.map((r, i) => (
                        <tr key={i}><td>{r.test}</td><td><b>{r.result}</b></td><td>{r.unit}</td><td>{r.range}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </PrintSection>
              )}

              {/* Examination Findings */}
              {form.examination_findings && (
                <PrintSection title="Examination Findings">
                  <p className={styles.printText}>{form.examination_findings}</p>
                </PrintSection>
              )}

              {/* Notes */}
              {form.notes && (
                <PrintSection title="Notes">
                  <p className={styles.printText}>{form.notes}</p>
                </PrintSection>
              )}

              {/* Refer */}
              {form.refer_to && (
                <PrintSection title="Refer To">
                  <p className={styles.printText}>{form.refer_to}</p>
                </PrintSection>
              )}

              {/* Follow Up */}
              {(form.next_visit_date || form.next_visit_notes) && (
                <PrintSection title="Follow Up">
                  <p className={styles.printText}>
                    {form.next_visit_date && <span>Date: <b>{form.next_visit_date}</b>  </span>}
                    {form.next_visit_notes}
                  </p>
                </PrintSection>
              )}

              {/* Advices */}
              {form.advices && (
                <PrintSection title="Advices">
                  <p className={styles.printText}>{form.advices}</p>
                </PrintSection>
              )}

              {/* Procedures */}
              {form.procedures.length > 0 && (
                <PrintSection title="Procedures">
                  {form.procedures.map((p, i) => <div key={i} className={styles.printBullet}>• {p}</div>)}
                </PrintSection>
              )}
            </div>

            {/* Footer */}
            <hr className={styles.rxPaperRule} />
            {rxImages.footerImg ? (
              <div className={styles.rxPaperImgBlock}>
                <img src={rxImages.footerImg} alt="Footer" className={styles.rxPaperImg} />
              </div>
            ) : (
              <div className={styles.rxPaperFooter}>
                <span>{user?.clinic_name || 'Clinic'}</span>
                {user?.clinic_address && <span>{user.clinic_address}</span>}
                {user?.clinic_phone   && <span>{user.clinic_phone}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintSection({ title, children }) {
  return (
    <div className={styles.printSection}>
      <div className={styles.printSectionTitle}>{title}</div>
      <div className={styles.printSectionBody}>{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WriteRx() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { user }  = useAuth();

  const [appt,            setAppt]            = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');
  const [tab,             setTab]             = useState('Overview');
  const [prescriptionMode,setPrescriptionMode] = useState(false);
  const [showPreview,     setShowPreview]     = useState(false);
  const [showConfigure,   setShowConfigure]   = useState(false);
  const [form,            setForm]            = useState(EMPTY_FORM);

  const loadRxImages = useCallback(() => {
    const cid = user?.clinic_id || 'default';
    return {
      headerImg: localStorage.getItem(`rx_header_${cid}`) || '',
      footerImg: localStorage.getItem(`rx_footer_${cid}`) || '',
    };
  }, [user?.clinic_id]);

  const [rxImages, setRxImages] = useState(() => {
    const cid = typeof window !== 'undefined'
      ? (JSON.parse(localStorage.getItem('emr_user') || '{}')?.clinic_id || 'default')
      : 'default';
    return {
      headerImg: localStorage.getItem(`rx_header_${cid}`) || '',
      footerImg: localStorage.getItem(`rx_footer_${cid}`) || '',
    };
  });

  useEffect(() => {
    if (appointmentId === 'new') return;
    api.get(`/appointments/${appointmentId}`).then(data => {
      setAppt(data);
      if (data.encounter_id) {
        setPrescriptionMode(true);
        setForm(f => ({
          ...f,
          vitals:               data.vitals          ? { ...f.vitals, ...data.vitals } : f.vitals,
          symptoms:             data.symptoms        || [],
          diagnosis:            data.diagnosis       || [],
          medications:          data.medications     || [],
          lab_investigations:   data.lab_investigations || [],
          lab_results:          data.lab_results     || [],
          examination_findings: data.examination_findings || '',
          notes:                data.notes           || '',
          refer_to:             data.refer_to        || '',
          next_visit_date:      data.next_visit_date ? data.next_visit_date.slice(0, 10) : '',
          next_visit_notes:     data.next_visit_notes || '',
          advices:              data.advices || data.instructions || '',
          procedures:           data.procedures || [],
        }));
      }
    }).catch(() => {});
  }, [appointmentId]);

  const set      = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setVital = (k, v) => setForm(f => ({ ...f, vitals: { ...f.vitals, [k]: v } }));

  const addChip = (field, inputField) => {
    const val = form[inputField]?.trim();
    if (!val) return;
    set(field, [...form[field], val]);
    set(inputField, '');
  };
  const removeChip = (field, idx) => set(field, form[field].filter((_, i) => i !== idx));

  const addDiag = () => {
    if (!form.diagInput.trim()) return;
    set('diagnosis', [...form.diagnosis, { display: form.diagInput.trim(), code: '', system: 'http://snomed.info/sct', status: 'active' }]);
    set('diagInput', '');
  };

  const addMed = () => set('medications', [...form.medications, { name: '', dosage: '', frequency: '', duration: '' }]);
  const updateMed = (i, k, v) => {
    const meds = [...form.medications];
    meds[i] = { ...meds[i], [k]: v };
    set('medications', meds);
  };

  const addLabResult = () => set('lab_results', [...form.lab_results, { test: '', result: '', unit: '', range: '' }]);
  const updateLabResult = (i, k, v) => {
    const rows = [...form.lab_results];
    rows[i] = { ...rows[i], [k]: v };
    set('lab_results', rows);
  };

  const handleClear = () => {
    if (window.confirm('Clear all prescription data?')) setForm(EMPTY_FORM);
  };

  const handlePrint = () => {
    setShowPreview(true);
    setTimeout(() => window.print(), 300);
  };

  const handleFinish = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/appointments/${appointmentId}/encounter`, {
        symptoms:             form.symptoms,
        diagnosis:            form.diagnosis,
        medications:          form.medications,
        instructions:         form.advices,
        advices:              form.advices,
        next_visit_date:      form.next_visit_date || null,
        next_visit_notes:     form.next_visit_notes,
        vitals:               form.vitals,
        lab_investigations:   form.lab_investigations,
        lab_results:          form.lab_results,
        examination_findings: form.examination_findings,
        notes:                form.notes,
        refer_to:             form.refer_to,
        procedures:           form.procedures,
      });
      navigate('/queue');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  // ── Prescription editor (document layout) ──────────────────────────────────
  const RxEditor = () => (
    <div className={styles.rxDoc}>
      {/* Clinic header */}
      {rxImages.headerImg ? (
        <div className={styles.rxDocImgHeader}>
          <img src={rxImages.headerImg} alt="Header" className={styles.rxDocImg} />
        </div>
      ) : (
        <div className={styles.rxDocHeader}>
          <div className={styles.rxDocClinic}>{user?.clinic_name || 'Clinic'}</div>
          {user?.clinic_address && <div className={styles.rxDocAddr}>{user.clinic_address}</div>}
          {user?.clinic_phone   && <div className={styles.rxDocAddr}>{user.clinic_phone}</div>}
          <div className={styles.rxDocTitle}>PRESCRIPTION</div>
        </div>
      )}

      {/* Patient info */}
      {appt && (
        <div className={styles.rxDocPatient}>
          <span className={styles.rxDocPatientItem}><span className={styles.rxDocLabel}>Patient</span>{appt.patient_name}</span>
          <span className={styles.rxDocPatientItem}><span className={styles.rxDocLabel}>Date</span>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {appt.uhid          && <span className={styles.rxDocPatientItem}><span className={styles.rxDocLabel}>UHID</span>{appt.uhid}</span>}
          {appt.patient_mobile && <span className={styles.rxDocPatientItem}><span className={styles.rxDocLabel}>Mob</span>{appt.patient_mobile}</span>}
          {appt.patient_gender && <span className={styles.rxDocPatientItem}><span className={styles.rxDocLabel}>Gender</span>{appt.patient_gender === 'M' ? 'Male' : 'Female'}</span>}
          {appt.doctor_name   && <span className={styles.rxDocPatientItem}><span className={styles.rxDocLabel}>Doctor</span>Dr. {appt.doctor_name}</span>}
        </div>
      )}

      <div className={styles.rxDocBody}>

        {/* Vitals */}
        <RxSection title="Vitals">
          <div className={styles.vitalsGrid}>
            {[['bp_systolic','BP Sys','mmHg'],['bp_diastolic','BP Dia','mmHg'],
              ['pulse','Pulse','bpm'],['spo2','SpO₂','%'],
              ['temp','Temp','°C'],['weight','Weight','kg'],['height','Height','cm'],
            ].map(([k, label, unit]) => (
              <div key={k} className={styles.vitalCell}>
                <label>{label} <span className={styles.unit}>{unit}</span></label>
                <input type="number" value={form.vitals[k]} onChange={e => setVital(k, e.target.value)} placeholder="—" />
              </div>
            ))}
          </div>
        </RxSection>

        {/* Patient Medical History (read-only from check-in) */}
        {appt?.medical_history?.length > 0 && (
          <RxSection title="Patient Medical History">
            <div className={styles.chipsRow}>
              {appt.medical_history.map((h, i) => (
                <span key={i} className={`${styles.chip} ${styles.chipReadOnly}`}>
                  {h.label || h.condition || JSON.stringify(h)}
                </span>
              ))}
            </div>
            <p className={styles.fieldHint}>Collected at check-in — read only</p>
          </RxSection>
        )}

        {/* Symptoms */}
        <RxSection title="Symptoms">
          <div className={styles.chipsRow}>
            {form.symptoms.map((s, i) => (
              <span key={i} className={styles.chip}>{s}
                <button onClick={() => removeChip('symptoms', i)}>✕</button>
              </span>
            ))}
          </div>
          <div className={styles.addRow}>
            <input placeholder="Type symptom and press Enter…" value={form.symptomInput}
              onChange={e => set('symptomInput', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChip('symptoms', 'symptomInput'))} />
            <button onClick={() => addChip('symptoms', 'symptomInput')}>Add</button>
          </div>
        </RxSection>

        {/* Diagnosis */}
        <RxSection title="Diagnosis">
          <div className={styles.chipsRow}>
            {form.diagnosis.map((d, i) => (
              <span key={i} className={`${styles.chip} ${styles.chipDiag}`}>{d.display}
                <button onClick={() => removeChip('diagnosis', i)}>✕</button>
              </span>
            ))}
          </div>
          <div className={styles.addRow}>
            <input placeholder="Type diagnosis and press Enter…" value={form.diagInput}
              onChange={e => set('diagInput', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDiag())} />
            <button onClick={addDiag}>Add</button>
          </div>
        </RxSection>

        {/* Medications */}
        <RxSection title="℞  Medications">
          <div className={styles.medTableWrap}>
            {form.medications.length > 0 && (
              <div className={styles.medTable}>
                <div className={styles.medTableHead}>
                  <span>Medicine</span><span>Dosage</span><span>Frequency</span><span>Duration</span><span></span>
                </div>
                {form.medications.map((m, i) => (
                  <div key={i} className={styles.medTableRow}>
                    <input placeholder="Medicine name"        value={m.name}      onChange={e => updateMed(i, 'name',      e.target.value)} />
                    <input placeholder="e.g. 500mg"           value={m.dosage}    onChange={e => updateMed(i, 'dosage',    e.target.value)} />
                    <input placeholder="e.g. TDS"             value={m.frequency} onChange={e => updateMed(i, 'frequency', e.target.value)} />
                    <input placeholder="e.g. 5 days"          value={m.duration}  onChange={e => updateMed(i, 'duration',  e.target.value)} />
                    <button className={styles.removeBtn}
                      onClick={() => set('medications', form.medications.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <button className={styles.addLineBtn} onClick={addMed}><Plus size={13} /> Add Medicine</button>
          </div>
        </RxSection>

        {/* Lab Investigations */}
        <RxSection title="Lab Investigations">
          <div className={styles.chipsRow}>
            {form.lab_investigations.map((l, i) => (
              <span key={i} className={`${styles.chip} ${styles.chipLab}`}>{l}
                <button onClick={() => removeChip('lab_investigations', i)}>✕</button>
              </span>
            ))}
          </div>
          <div className={styles.addRow}>
            <input placeholder="e.g. CBC, HbA1c, Lipid Profile…" value={form.labInput}
              onChange={e => set('labInput', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChip('lab_investigations', 'labInput'))} />
            <button onClick={() => addChip('lab_investigations', 'labInput')}>Add</button>
          </div>
        </RxSection>

        {/* Lab Results */}
        <RxSection title="Lab Results">
          <div className={styles.medTableWrap}>
            {form.lab_results.length > 0 && (
              <div className={styles.medTable}>
                <div className={`${styles.medTableHead} ${styles.medTableHead4}`}>
                  <span>Test Name</span><span>Result</span><span>Unit</span><span>Normal Range</span><span></span>
                </div>
                {form.lab_results.map((r, i) => (
                  <div key={i} className={`${styles.medTableRow} ${styles.medTableRow4}`}>
                    <input placeholder="e.g. Hb"     value={r.test}   onChange={e => updateLabResult(i, 'test',   e.target.value)} />
                    <input placeholder="e.g. 12.5"   value={r.result} onChange={e => updateLabResult(i, 'result', e.target.value)} />
                    <input placeholder="e.g. g/dL"   value={r.unit}   onChange={e => updateLabResult(i, 'unit',   e.target.value)} />
                    <input placeholder="e.g. 11-16"  value={r.range}  onChange={e => updateLabResult(i, 'range',  e.target.value)} />
                    <button className={styles.removeBtn}
                      onClick={() => set('lab_results', form.lab_results.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <button className={styles.addLineBtn} onClick={addLabResult}><Plus size={13} /> Add Result</button>
          </div>
        </RxSection>

        {/* Examination Findings */}
        <RxSection title="Examination Findings">
          <textarea rows={3} placeholder="Clinical findings on examination…"
            value={form.examination_findings}
            onChange={e => set('examination_findings', e.target.value)} />
        </RxSection>

        {/* Notes */}
        <RxSection title="Notes">
          <textarea rows={2} placeholder="Internal notes…"
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </RxSection>

        {/* Refer to a doctor */}
        <RxSection title="Refer to a Doctor">
          <input placeholder="e.g. Cardiologist — Dr. Mehta, Apollo" value={form.refer_to}
            onChange={e => set('refer_to', e.target.value)} />
        </RxSection>

        {/* Follow Up */}
        <RxSection title="Follow Up">
          <div className={styles.twoCol}>
            <div className={styles.fieldGroup}>
              <label>Date</label>
              <input type="date" value={form.next_visit_date} onChange={e => set('next_visit_date', e.target.value)} />
            </div>
            <div className={styles.fieldGroup} style={{ flex: 2 }}>
              <label>Notes</label>
              <input placeholder="e.g. Review reports, fasting" value={form.next_visit_notes}
                onChange={e => set('next_visit_notes', e.target.value)} />
            </div>
          </div>
        </RxSection>

        {/* Advices */}
        <RxSection title="Advices">
          <textarea rows={3} placeholder="Diet, lifestyle, patient instructions…"
            value={form.advices} onChange={e => set('advices', e.target.value)} />
        </RxSection>

        {/* Procedures */}
        <RxSection title="Procedures">
          <div className={styles.chipsRow}>
            {form.procedures.map((p, i) => (
              <span key={i} className={`${styles.chip} ${styles.chipProc}`}>{p}
                <button onClick={() => removeChip('procedures', i)}>✕</button>
              </span>
            ))}
          </div>
          <div className={styles.addRow}>
            <input placeholder="e.g. ECG, Dressing, Nebulisation…" value={form.procInput}
              onChange={e => set('procInput', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChip('procedures', 'procInput'))} />
            <button onClick={() => addChip('procedures', 'procInput')}>Add</button>
          </div>
        </RxSection>

      </div>

      {/* Clinic footer */}
      {rxImages.footerImg ? (
        <div className={styles.rxDocImgFooter}>
          <img src={rxImages.footerImg} alt="Footer" className={styles.rxDocImg} />
        </div>
      ) : (
        <div className={styles.rxDocFooter}>
          <span>{user?.clinic_name || 'Clinic'}</span>
          {user?.clinic_address && <span> · {user.clinic_address}</span>}
          {user?.clinic_phone   && <span> · {user.clinic_phone}</span>}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className={styles.page}>

        {/* ── Top bar ── */}
        <div className={styles.topbar}>
          <button className={styles.back} onClick={() => navigate('/queue')}>
            <ChevronLeft size={15} strokeWidth={2.5} /> Queue
          </button>
          <div className={styles.patientInfo}>
            <span className={styles.patientName}>{appt ? appt.patient_name : 'Write Rx'}</span>
            {appt && (
              <span className={styles.patientMeta}>
                {[appt.uhid, appt.visit_type, appt.patient_mobile].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>

        {/* ── Sub-bar: tabs + link buttons ── */}
        <div className={styles.subbar}>
          <nav className={styles.tabs}>
            {TABS.map(t => (
              <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <div className={styles.linkBtns}>
            <button className={styles.linkBtn}><LayoutTemplate size={13} strokeWidth={1.8} /> Templates</button>
            <button className={styles.linkBtn} onClick={() => setShowConfigure(true)}>
              <Settings2 size={13} strokeWidth={1.8} /> Configure your InferPad
            </button>
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className={styles.content}>
          {tab === 'Overview' && (
            !prescriptionMode
              ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📋</div>
                  <h3 className={styles.emptyTitle}>No prescription created!</h3>
                  <p className={styles.emptyText}>
                    Whenever the patient visits you next again, you will see your last prescription here.
                  </p>
                  <button className={styles.createRxBtn} onClick={() => setPrescriptionMode(true)}>
                    + Create Prescription
                  </button>
                </div>
              )
              : (
                <div className={styles.tabBody}>
                  <RxEditor />

                  {/* ── Vitals summary card ── */}
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryCardHeader}>
                      <span className={styles.summaryCardTitle}>Vitals</span>
                    </div>
                    <div className={styles.vitalsDisplayGrid}>
                      {[
                        ['bp_systolic',  'BP Systolic',  'mmHg', '#3b82f6'],
                        ['bp_diastolic', 'BP Diastolic', 'mmHg', '#6366f1'],
                        ['pulse',        'Pulse',        'bpm',  '#f59e0b'],
                        ['spo2',         'SpO₂',         '%',    '#06b6d4'],
                        ['temp',         'Temp',         '°C',   '#ef4444'],
                        ['weight',       'Weight',       'kg',   '#8b5cf6'],
                        ['height',       'Height',       'cm',   '#10b981'],
                      ].map(([k, label, unit, color]) => (
                        <div key={k} className={styles.vitalDisplayCell}>
                          <div className={styles.vitalDisplayBar} style={{ background: color + '18', borderColor: color + '44' }}>
                            <span className={styles.vitalDisplayValue} style={{ color }}>
                              {form.vitals[k] || <span className={styles.vitalEmpty}>—</span>}
                            </span>
                            <span className={styles.vitalDisplayUnit}>{unit}</span>
                          </div>
                          <span className={styles.vitalDisplayLabel}>{label}</span>
                          <input
                            type="number"
                            className={styles.vitalDisplayInput}
                            value={form.vitals[k]}
                            onChange={e => setVital(k, e.target.value)}
                            placeholder="—"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Lab Results summary card ── */}
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryCardHeader}>
                      <span className={styles.summaryCardTitle}>Lab Results</span>
                      <button className={styles.summaryAddBtn} onClick={addLabResult}>
                        <Plus size={13} /> Add Result
                      </button>
                    </div>
                    {form.lab_results.length === 0 ? (
                      <div className={styles.summaryEmpty}>
                        No lab results added yet.
                        <button className={styles.summaryEmptyLink} onClick={addLabResult}>+ Add one</button>
                      </div>
                    ) : (
                      <div className={styles.labResultsTable}>
                        <div className={styles.labResultsHead}>
                          <span>Test Name</span><span>Result</span><span>Unit</span><span>Normal Range</span><span></span>
                        </div>
                        {form.lab_results.map((r, i) => (
                          <div key={i} className={styles.labResultsRow}>
                            <input placeholder="e.g. Haemoglobin" value={r.test}   onChange={e => updateLabResult(i, 'test',   e.target.value)} />
                            <input placeholder="e.g. 12.5"        value={r.result} onChange={e => updateLabResult(i, 'result', e.target.value)}
                              className={r.result ? styles.labResultValueFilled : ''} />
                            <input placeholder="g/dL"             value={r.unit}   onChange={e => updateLabResult(i, 'unit',   e.target.value)} />
                            <input placeholder="11 – 16"          value={r.range}  onChange={e => updateLabResult(i, 'range',  e.target.value)} />
                            <button className={styles.removeBtn}
                              onClick={() => set('lab_results', form.lab_results.filter((_, j) => j !== i))}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {error && <p className={styles.error}>{error}</p>}
                </div>
              )
          )}

          {tab === 'InferPad' && (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon}>📝</span>
              <p>InferPad coming soon</p>
            </div>
          )}

          {tab === 'Canvas' && (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon}>🎨</span>
              <p>Canvas coming soon</p>
            </div>
          )}

          {tab === 'Medical Records' && (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon}>📂</span>
              <p>Medical Records coming soon</p>
            </div>
          )}
        </div>

        {/* ── Fixed bottom action bar ── */}
        <div className={styles.bottomBar}>
          <div className={styles.bottomLeft}>
            <button className={styles.btnClear} onClick={handleClear}>
              <Trash2 size={13} strokeWidth={2} /> Clear
            </button>
            <button className={styles.btnPrintSettings}>
              <SlidersHorizontal size={13} strokeWidth={2} /> Print Settings
            </button>
          </div>
          <div className={styles.bottomRight}>
            <button className={styles.btnPreview} onClick={() => setShowPreview(true)}>
              <Eye size={13} strokeWidth={2} /> Preview
            </button>
            <button className={styles.btnPrint} onClick={handlePrint}>
              <Printer size={13} strokeWidth={2} /> Print
            </button>
            <button className={styles.btnFinish} onClick={handleFinish} disabled={saving}>
              <CheckCircle size={13} strokeWidth={2} />
              {saving ? 'Saving…' : 'Finish Prescription'}
            </button>
          </div>
        </div>

      </div>

      {showPreview && (
        <PrescriptionPreview
          form={form} appt={appt} user={user} rxImages={rxImages}
          onClose={() => setShowPreview(false)}
          onPrint={handlePrint}
        />
      )}

      {showConfigure && (
        <ConfigureInferPadModal
          clinicId={user?.clinic_id || 'default'}
          onClose={(saved) => {
            setShowConfigure(false);
            if (saved) setRxImages(loadRxImages());
          }}
        />
      )}
    </>
  );
}

function RxSection({ title, children }) {
  return (
    <div className={styles.rxSection}>
      <div className={styles.rxSectionTitle}>{title}</div>
      <div className={styles.rxSectionBody}>{children}</div>
    </div>
  );
}
