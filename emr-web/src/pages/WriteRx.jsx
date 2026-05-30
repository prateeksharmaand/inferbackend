import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, Settings2, Globe,
  Printer, Eye, Trash2, SlidersHorizontal, CheckCircle, X, Plus,
  Share2, Calendar, Download, CreditCard, FileText, Star, LogOut, Mic, ClipboardList,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { RX_LANGUAGES, getLang, translateTiming, translateFrequency, translateDuration, translateDose } from '../data/rxTranslations';
import ConfigureInferPadModal from '../components/ConfigureInferPadModal';
import MedicalRecordsTab from '../components/MedicalRecordsTab';
import CreateReceiptModal from '../components/CreateReceiptModal';
import DrawingCanvas from '../components/DrawingCanvas';
import InferPad from '../components/InferPad';
import VaccinationChart from '../components/VaccinationChart';
import ScribePanel from '../components/ScribePanel';
import AssessmentPanel from '../components/AssessmentPanel';
import styles from './WriteRx.module.css';

// ── Language picker (bottom bar) ─────────────────────────────────────────────
function LangPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = RX_LANGUAGES.find(l => (l.code === 'en' ? '' : l.code) === value) || RX_LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} className={styles.langPickerWrap}>
      <button
        className={`${styles.langPickerBtn} ${value ? styles.langPickerBtnActive : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <Globe size={13} strokeWidth={2} />
        <span className={styles.langPickerText}>Change Language</span>
        <span className={styles.langPickerLabel}>{selected.native}</span>
        <ChevronDown size={11} className={`${styles.langPickerChev} ${open ? styles.langPickerChevOpen : ''}`} />
      </button>

      {open && (
        <div className={styles.langPickerDrop}>
          <div className={styles.langPickerDropHead}>Prescription Language</div>
          <div className={styles.langPickerGrid}>
            {RX_LANGUAGES.map(l => {
              const val = l.code === 'en' ? '' : l.code;
              const active = value === val;
              return (
                <button
                  key={l.code}
                  className={`${styles.langPickerOpt} ${active ? styles.langPickerOptActive : ''}`}
                  onClick={() => { onChange(val); setOpen(false); }}
                >
                  <span className={styles.langPickerNative}>{l.native}</span>
                  <span className={styles.langPickerEng}>{l.label}</span>
                  {active && <span className={styles.langPickerCheck}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const BASE_TABS = ['Overview', 'InferPad', 'Canvas', 'Medical Records'];

const MED_HISTORY_LABELS = {
  diabetes: 'Diabetes', hypertension: 'Hypertension', hypothyroidism: 'Hypothyroidism',
  alcohol: 'Alcohol', tobacco: 'Tobacco', smoking: 'Smoking',
};
function medHistoryLabel(h) {
  const label = MED_HISTORY_LABELS[h.key] || h.label || h.condition || h.key || '?';
  const meta = [h.since, h.frequency].filter(Boolean).join(' · ');
  return { label, meta };
}

const EMPTY_FORM = {
  vitals: {
    bp_systolic: '', bp_diastolic: '', temp: '', spo2: '', pulse: '',
    respiratory_rate: '', height: '', weight: '', bmi: '',
  },
  medical_history: [],
  symptoms: [],  symptomInput: '', symptomSince: '', symptomSeverity: '',
  diagnosis: [], diagInput: '',    diagSince: '',    diagSeverity: '',
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
  custom_sections: [],
  canvasImage: '',
  vaccinations: {},
  rx_language: '',
};

// ── Prescription data formatting ─────────────────────────────────────────────
function getFlag(r) {
  if (!r.result || !r.range) return '';
  const val = parseFloat(r.result);
  const parts = r.range.split('-').map(Number);
  if (parts.length !== 2 || isNaN(val) || parts.some(isNaN)) return '';
  if (val > parts[1]) return 'High';
  if (val < parts[0]) return 'Low';
  return '';
}

function RxInlineRow({ label, value }) {
  return (
    <div className={styles.rxInlineRow}>
      <span className={styles.rxInlineLabel}>{label} :&nbsp;</span>
      <span className={styles.rxInlineValue}>{value}</span>
    </div>
  );
}

// ── Shared prescription document (used in preview modal + post-visit screen) ──
function RxDocumentBody({ form, appt, user, rxImages = {} }) {
  const lang = form.rx_language || 'en';
  const t    = getLang(lang);
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr  = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const todayFmt = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

  const gender = appt?.patient_gender === 'M' ? 'Male' : appt?.patient_gender === 'F' ? 'Female' : (appt?.patient_gender || '');
  const age    = appt?.patient_age ? `${appt.patient_age} year(s)` : '';

  const VLABEL = { bp_systolic:'SYSTOLIC BLOOD PRESSURE', bp_diastolic:'DIASTOLIC BLOOD PRESSURE', pulse:'PULSE', spo2:'SPO2', temp:'TEMPERATURE', respiratory_rate:'RESPIRATORY RATE', weight:'WEIGHT', height:'HEIGHT', bmi:'BMI' };
  const VUNIT  = { bp_systolic:'mmHg', bp_diastolic:'mmHg', pulse:'bpm', spo2:'%', temp:'°C', respiratory_rate:'/min', weight:'kg', height:'cm', bmi:'kg/m²' };

  const vitalsStr     = Object.entries(form.vitals).filter(([k,v]) => v && VLABEL[k]).map(([k,v]) => `${VLABEL[k]}-${v}${VUNIT[k]||''}`).join(' | ');
  const histStr       = (form.medical_history||[]).map(h => { const {label,meta}=medHistoryLabel(h); const p=['Status: Active']; if(h.since) p.push(`Since: ${h.since}`); else if(meta) p.push(meta); return `${label} (${p.join(', ')})`; }).join(', ');
  const symptomsStr   = form.symptoms.map(s => { const name=typeof s==='string'?s:s.name; const code=typeof s==='object'&&s.code?` | ${s.code}`:''; const mp=[s.since&&`Since: ${s.since}`,s.severity&&`Severity: ${s.severity}`].filter(Boolean); return `${name}${code}${mp.length?` (${mp.join(' | ')})`:''}`;}).join(', ');
  const diagStr       = form.diagnosis.map(d => { const mp=[d.since&&`Since: ${d.since}`,d.severity&&`Severity: ${d.severity}`].filter(Boolean); return `${d.display}${mp.length?` (${mp.join(' | ')})`:''}`;}).join(', ');
  const labInvLines   = form.lab_investigations.map(l => { if(typeof l==='string') return l; const rep=l.repeat_on?` | Repeat: ${l.repeat_on}`:''; const rem=l.remarks?` Remark: ${l.remarks}`:''; return `${l.test} (On: ${todayFmt}${rep})${rem}`;});
  const labResultLines= form.lab_results.map(r => { const flag=getFlag(r); return `${r.test}: ${r.result}${r.unit?' '+r.unit:''}${flag?` [${flag}]`:''} - ${todayFmt}`;});
  const followupStr   = form.next_visit_date ? `Visit on ${new Date(form.next_visit_date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'})}` : '';
  const proceduresStr = form.procedures.map(p=>`${p} - ${todayFmt}`).join(', ');

  return (
    <div className={styles.rxPaper} id="rx-print-area">
      {rxImages.headerImg ? (
        <div className={styles.rxPaperImgBlock}><img src={rxImages.headerImg} alt="Header" className={styles.rxPaperImg} /></div>
      ) : (
        <div className={styles.rxPaperHeader}>
          <div className={styles.rxPaperClinic}>{user?.clinic_name||'Clinic'}</div>
          {user?.clinic_address && <div className={styles.rxPaperAddr}>{user.clinic_address}</div>}
          {user?.clinic_phone   && <div className={styles.rxPaperAddr}>{user.clinic_phone}</div>}
        </div>
      )}

      <div className={styles.rxPatientHeader}>
        <div>
          <span className={styles.rxPatientName}>{appt?.patient_name||'—'}</span>
          {(gender||age) && <span className={styles.rxPatientMeta}>, {[gender,age].filter(Boolean).join(', ')},</span>}
          {appt?.uhid && <div className={styles.rxUhid}>UHID : {appt.uhid}.</div>}
        </div>
        <div className={styles.rxDateTime}>{dateStr}</div>
      </div>
      <hr className={styles.rxHr} />

      <div className={styles.rxBody}>
        {vitalsStr   && <RxInlineRow label={t.VITALS}   value={vitalsStr} />}
        {histStr     && <RxInlineRow label={t.HISTORY}  value={histStr} />}
        {symptomsStr && <RxInlineRow label={t.SYMPTOMS} value={symptomsStr} />}
        {diagStr     && <RxInlineRow label={t.DIAGNOSIS} value={diagStr} />}

        {form.medications.length > 0 && (
          <div className={styles.rxMedSection}>
            <div className={styles.rxPrescriptionHeading}>
              <span className={styles.rxPrescriptionLine} />{t.PRESCRIPTION_HEADING}<span className={styles.rxPrescriptionLine} />
            </div>
            <table className={styles.rxMedTable}>
              <thead><tr><th>{t.COL_SNo}</th><th>{t.COL_MEDICINE}</th><th>{t.COL_DOSE}</th><th>{t.COL_FREQUENCY}</th><th>{t.COL_DURATION}</th><th>{t.COL_REMARKS}</th></tr></thead>
              <tbody>
                {form.medications.map((m,i) => (
                  <tr key={i}>
                    <td className={styles.rxMedNum}>{i+1}</td>
                    <td>
                      <strong>{m.name}</strong>
                      {m.timing && <div className={styles.rxMedSub}>{translateTiming(m.timing, lang)}</div>}
                    </td>
                    <td>{translateDose(m.dose||m.dosage, lang)}</td>
                    <td>{translateFrequency(m.frequency, lang)}</td>
                    <td className={styles.rxMedDuration}>
                      {translateDuration(m.duration, lang)}
                      {m.start_from && <div className={styles.rxMedSub}>({t.FROM_LABEL} {m.start_from})</div>}
                    </td>
                    <td>{m.instructions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {labInvLines.length>0 && <div className={styles.rxInlineRow}><span className={styles.rxInlineLabel}>{t.LAB_TESTS} :&nbsp;</span><span className={styles.rxInlineValue}>{labInvLines.map((l,i)=><div key={i}>{l}</div>)}</span></div>}
        {labResultLines.length>0 && <div className={styles.rxInlineRow}><span className={styles.rxInlineLabel}>{t.LAB_RESULTS} :&nbsp;</span><span className={styles.rxInlineValue}>{labResultLines.map((l,i)=><div key={i}>{l}</div>)}</span></div>}
        {form.examination_findings && <RxInlineRow label={t.EXAM_FINDINGS} value={form.examination_findings} />}
        {form.notes    && <RxInlineRow label={t.NOTES}       value={form.notes} />}
        {form.advices  && <RxInlineRow label={t.ADVICES}     value={form.advices} />}
        {form.refer_to && <RxInlineRow label={t.REFERRED_TO} value={form.refer_to} />}
        {(followupStr||form.next_visit_notes) && <RxInlineRow label={t.FOLLOWUP} value={[followupStr,form.next_visit_notes].filter(Boolean).join(' · ')} />}
        {proceduresStr && <RxInlineRow label={t.PROCEDURES} value={proceduresStr} />}
        {(form.custom_sections||[]).filter(s=>s.content).map(s=><RxInlineRow key={s.id} label={(s.title||'NOTES').toUpperCase()} value={s.content} />)}
        {form.vaccinations && Object.keys(form.vaccinations).length > 0 && (() => {
          const groups = { given: [], due: [], missed: [], refused: [] };
          Object.entries(form.vaccinations).filter(([,v]) => v?.status).forEach(([k, v]) => {
            const name = k.replace(/^(iap_|other_)/, '').replace(/_/g, ' ');
            const label = `${name}${v.date ? ` (${v.date})` : ''}`;
            (groups[v.status] || groups.given).push(label);
          });
          const parts = [
            groups.given.length   && `Given: ${groups.given.join(', ')}`,
            groups.due.length     && `Due: ${groups.due.join(', ')}`,
            groups.missed.length  && `Missed: ${groups.missed.join(', ')}`,
            groups.refused.length && `Patient Refused: ${groups.refused.join(', ')}`,
          ].filter(Boolean);
          return parts.length > 0
            ? <RxInlineRow label={t.VACCINATIONS} value={parts.join(' | ')} />
            : null;
        })()}
        {form.canvasImage && <div style={{marginTop:8}}><img src={form.canvasImage} alt="Clinical drawing" style={{width:'100%',borderRadius:4,border:'1px solid #e2e8f0'}} /></div>}
      </div>

      {rxImages.signatureImg && (
        <div className={styles.rxSignatureBlock}>
          <img src={rxImages.signatureImg} alt="Doctor signature" className={styles.rxSignatureImg} />
          <div className={styles.rxSignatureName}>
            {user?.name && <span>{user.name}</span>}
            {user?.specialization && <span className={styles.rxSignatureSub}>{user.specialization}</span>}
            {user?.qualification  && <span className={styles.rxSignatureSub}>{user.qualification}</span>}
          </div>
        </div>
      )}

      <hr className={styles.rxHr} />
      {rxImages.footerImg ? (
        <div className={styles.rxPaperImgBlock}><img src={rxImages.footerImg} alt="Footer" className={styles.rxPaperImg} /></div>
      ) : (
        <div className={styles.rxPaperFooter}>
          <span>{user?.clinic_name||'Clinic'}</span>
          {user?.clinic_address && <span> · {user.clinic_address}</span>}
          {user?.clinic_phone   && <span> · {user.clinic_phone}</span>}
        </div>
      )}
    </div>
  );
}

// ── Prescription preview modal (Preview button) ───────────────────────────────
function PrescriptionPreview({ form, appt, user, rxImages = {}, onClose, onPrint }) {
  return (
    <div className={styles.previewOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.previewModal}>
        <div className={styles.previewToolbar}>
          <span className={styles.previewTitle}>Prescription Preview</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.previewPrintBtn} onClick={onPrint}><Printer size={13} strokeWidth={2} /> Print</button>
            <button className={styles.previewCloseBtn} onClick={onClose}><X size={15} /></button>
          </div>
        </div>
        <div className={styles.previewBody}>
          <RxDocumentBody form={form} appt={appt} user={user} rxImages={rxImages} />
        </div>
      </div>
    </div>
  );
}

// ── Post-visit screen (shown after Finish Prescription) ───────────────────────
function PostVisitScreen({ form, appt, user, rxImages = {}, onBookAgain, onPrint, onGoogleReview, onBillPatient, onEndVisit }) {
  const actions = [
    { icon: <Share2     size={20} />, label: 'Send Attachment',    onClick: onPrint,         color: '#6366f1' },
    { icon: <Calendar   size={20} />, label: 'Book Slot Again',    onClick: onBookAgain,     color: '#0891b2' },
    { icon: <Printer    size={20} />, label: 'Print',              onClick: onPrint,         color: '#059669' },
    { icon: <Download   size={20} />, label: 'Download',           onClick: onPrint,         color: '#7c3aed' },
    { icon: <CreditCard size={20} />, label: 'Send Payment Link',  onClick: () => {},        color: '#d97706' },
    { icon: <FileText   size={20} />, label: 'Bill Patient',       onClick: onBillPatient,   color: '#dc2626' },
    { icon: <Star       size={20} />, label: 'Send Google Review', onClick: onGoogleReview,  color: '#ca8a04' },
  ];

  return (
    <div className={styles.postVisitWrap}>
      {/* Success banner */}
      <div className={styles.postVisitBanner}>
        <CheckCircle size={18} strokeWidth={2.5} className={styles.postVisitBannerIcon} />
        Prescription saved for <strong>{appt?.patient_name || 'Patient'}</strong>
      </div>

      {/* Two-column layout: prescription + actions */}
      <div className={styles.postVisitLayout}>

        {/* Left — prescription document */}
        <div className={styles.postVisitRx}>
          <RxDocumentBody form={form} appt={appt} user={user} rxImages={rxImages} />
        </div>

        {/* Right — action panel */}
        <div className={styles.postVisitPanel}>
          <div className={styles.postVisitPanelTitle}>What's next?</div>

          <div className={styles.postVisitGrid}>
            {actions.map(({ icon, label, onClick, color }) => (
              <button key={label} className={styles.postVisitActionBtn} onClick={onClick}
                style={{ '--ac': color }}>
                <span className={styles.postVisitActionIcon}>{icon}</span>
                <span className={styles.postVisitActionLabel}>{label}</span>
              </button>
            ))}
          </div>

          <button className={styles.postVisitEndBtn} onClick={onEndVisit}>
            <LogOut size={16} strokeWidth={2.5} />
            End Visit
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WriteRx() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user }  = useAuth();

  const [appt,            setAppt]            = useState(null);
  const [pastNotes,       setPastNotes]       = useState([]);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');
  const [tab,             setTab]             = useState('Overview');
  const [prescriptionMode,setPrescriptionMode] = useState(false);
  const [showPreview,     setShowPreview]     = useState(false);
  const [showConfigure,   setShowConfigure]   = useState(false);
  const [showScribe,      setShowScribe]      = useState(false);
  const [showAssessment,  setShowAssessment]  = useState(false);
  const [showPostVisit,   setShowPostVisit]   = useState(false);
  const [showReceipt,     setShowReceipt]     = useState(false);
  const [form,            setForm]            = useState(EMPTY_FORM);

  const loadRxImages = useCallback(() => {
    const cid = user?.clinic_id || 'default';
    const uid = user?.id        || 'default';
    return {
      headerImg:         localStorage.getItem(`rx_header_${cid}`)         || '',
      footerImg:         localStorage.getItem(`rx_footer_${cid}`)         || '',
      googleReviewLink:  localStorage.getItem(`rx_google_review_${cid}`)  || '',
      signatureImg:      localStorage.getItem(`rx_sig_${uid}_${cid}`)     || '',
    };
  }, [user?.clinic_id, user?.id]);

  const vaccChartEnabled = user?.clinic_id
    ? localStorage.getItem(`rx_vaccination_chart_${user.clinic_id}`) === 'true'
    : false;
  const TABS = vaccChartEnabled ? [...BASE_TABS, 'Vaccines'] : BASE_TABS;

  const [rxImages, setRxImages] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('emr_user') || '{}');
    const cid = stored?.clinic_id || 'default';
    const uid = stored?.id        || 'default';
    return {
      headerImg:        localStorage.getItem(`rx_header_${cid}`)        || '',
      footerImg:        localStorage.getItem(`rx_footer_${cid}`)        || '',
      googleReviewLink: localStorage.getItem(`rx_google_review_${cid}`) || '',
      signatureImg:     localStorage.getItem(`rx_sig_${uid}_${cid}`)    || '',
    };
  });

  useEffect(() => {
    if (appointmentId === 'new') return;
    api.get(`/appointments/${appointmentId}`).then(data => {
      setAppt(data);
      if (data.past_encounter_notes) setPastNotes(data.past_encounter_notes);
      // Always seed medical_history from appointment (check-in data)
      if (data.medical_history?.length) {
        setForm(f => ({ ...f, medical_history: data.medical_history }));
      }
      if (data.encounter_id) {
        setPrescriptionMode(true);
        setForm(f => ({
          ...f,
          vitals:               data.vitals          ? { ...EMPTY_FORM.vitals, ...data.vitals } : f.vitals,
          medical_history:      data.medical_history || appt?.medical_history || [],
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
          custom_sections:      data.custom_sections || [],
          canvasImage:          data.canvas_image || '',
          vaccinations:         data.vaccinations || {},
          rx_language:          data.rx_language  || '',
        }));
        if (searchParams.get('print') === '1') {
          setTimeout(() => { setShowPreview(true); window.print(); }, 400);
        }
      }
    }).catch(() => {});
  }, [appointmentId]);

  const set      = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setVital = (k, v) => setForm(f => ({ ...f, vitals: { ...f.vitals, [k]: v } }));

  // Auto-calculate BMI whenever height or weight changes
  useEffect(() => {
    const h = parseFloat(form.vitals.height);
    const w = parseFloat(form.vitals.weight);
    if (h > 0 && w > 0) {
      const bmi = (w / ((h / 100) ** 2)).toFixed(1);
      setForm(f => ({ ...f, vitals: { ...f.vitals, bmi } }));
    }
  }, [form.vitals.height, form.vitals.weight]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Persist any medical_history edits back to the appointment
      await api.patch(`/appointments/${appointmentId}/status`, {
        medical_history: form.medical_history,
      });
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
        custom_sections:      form.custom_sections || [],
        canvas_image:         form.canvasImage || null,
        vaccinations:         form.vaccinations || {},
        rx_language:          form.rx_language  || '',
      });
      setShowPostVisit(true);
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
            {[
              ['bp_systolic',      'BP Systolic',     'mmHg' ],
              ['bp_diastolic',     'BP Diastolic',    'mmHg' ],
              ['temp',             'Temperature',     '°C'   ],
              ['spo2',             'SpO₂',            '%'    ],
              ['pulse',            'Pulse',           'bpm'  ],
              ['respiratory_rate', 'Respiratory Rate','/min' ],
              ['height',           'Height',          'cm'   ],
              ['weight',           'Weight',          'kg'   ],
            ].map(([k, label, unit]) => (
              <div key={k} className={styles.vitalCell}>
                <label>{label} <span className={styles.unit}>{unit}</span></label>
                <input type="number" value={form.vitals[k] || ''} onChange={e => setVital(k, e.target.value)} placeholder="—" />
              </div>
            ))}
            <div className={styles.vitalCell}>
              <label>BMI <span className={styles.unit}>kg/m²</span></label>
              <input type="number" value={form.vitals.bmi || ''} onChange={e => setVital('bmi', e.target.value)}
                placeholder="auto" style={form.vitals.bmi ? { background: '#f0fdf4', color: '#065f46', fontWeight: 700 } : {}} />
            </div>
          </div>
        </RxSection>

        {/* Patient Medical History (read-only from check-in) */}
        {form.medical_history?.length > 0 && (
          <RxSection title="Patient Medical History">
            <div className={styles.chipsRow}>
              {form.medical_history.map((h, i) => {
                const { label, meta } = medHistoryLabel(h);
                return (
                  <span key={i} className={`${styles.chip} ${styles.chipReadOnly}`}>
                    {label}{meta && <span style={{ opacity:.7, fontSize:10 }}> ({meta})</span>}
                  </span>
                );
              })}
            </div>
            <p className={styles.fieldHint}>Collected at check-in — editable in InferPad</p>
          </RxSection>
        )}

        {/* Symptoms */}
        <RxSection title="Symptoms">
          <div className={styles.chipsRow}>
            {form.symptoms.map((s, i) => {
              const name = typeof s === 'string' ? s : s.name;
              return (
                <span key={i} className={styles.chip}>{name}
                  {s.since    && <span style={{ opacity:.7, fontSize:10 }}> · {s.since}</span>}
                  {s.severity && <span style={{ opacity:.7, fontSize:10 }}> · {s.severity}</span>}
                  <button onClick={() => set('symptoms', form.symptoms.filter((_,j)=>j!==i))}>✕</button>
                </span>
              );
            })}
          </div>
        </RxSection>

        {/* Diagnosis */}
        <RxSection title="Diagnosis">
          <div className={styles.chipsRow}>
            {form.diagnosis.map((d, i) => (
              <span key={i} className={`${styles.chip} ${styles.chipDiag}`}>{d.display}
                {d.code     && <span style={{ opacity:.7, fontSize:10 }}> [{d.code}]</span>}
                {d.severity && <span style={{ opacity:.7, fontSize:10 }}> · {d.severity}</span>}
                <button onClick={() => set('diagnosis', form.diagnosis.filter((_,j)=>j!==i))}>✕</button>
              </span>
            ))}
          </div>
        </RxSection>

        {/* Medications */}
        <RxSection title="℞  Medications">
          <div className={styles.medTableWrap}>
            {form.medications.length > 0 && (
              <div className={styles.medTable}>
                <div className={styles.medTableHead} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 28px' }}>
                  <span>Medicine</span><span>Dose</span><span>Frequency</span><span>Timing</span><span>Duration</span><span></span>
                </div>
                {form.medications.map((m, i) => (
                  <div key={i} className={styles.medTableRow} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 28px' }}>
                    <input placeholder="Medicine name"      value={m.name}                onChange={e => updateMed(i, 'name',      e.target.value)} />
                    <input placeholder="e.g. 1 tablet"      value={m.dose||m.dosage||''} onChange={e => updateMed(i, 'dose',      e.target.value)} />
                    <input placeholder="e.g. 1-0-1"         value={m.frequency||''}      onChange={e => updateMed(i, 'frequency', e.target.value)} />
                    <input placeholder="e.g. After meal"    value={m.timing||''}         onChange={e => updateMed(i, 'timing',    e.target.value)} />
                    <input placeholder="e.g. 5 days"        value={m.duration||''}       onChange={e => updateMed(i, 'duration',  e.target.value)} />
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
            {form.lab_investigations.map((l, i) => {
              const name = typeof l === 'string' ? l : l.test;
              const meta = typeof l === 'object' ? [l.repeat_on, l.remarks].filter(Boolean).join(' · ') : '';
              return (
                <span key={i} className={`${styles.chip} ${styles.chipLab}`}>
                  {name}{meta && <span style={{ opacity:.7, fontSize:10 }}> · {meta}</span>}
                  <button onClick={() => set('lab_investigations', form.lab_investigations.filter((_,j)=>j!==i))}>✕</button>
                </span>
              );
            })}
          </div>
          <p className={styles.fieldHint}>Add lab investigations from the InferPad tab.</p>
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

        {/* Custom sections */}
        {(form.custom_sections || []).map(s => (
          <RxSection key={s.id} title={s.title || 'Custom'}>
            <textarea rows={2} value={s.content}
              onChange={e => set('custom_sections', form.custom_sections.map(x => x.id === s.id ? { ...x, content: e.target.value } : x))} />
          </RxSection>
        ))}

        {/* Canvas drawing */}
        {form.canvasImage && (
          <RxSection title="Drawing / Diagram">
            <img src={form.canvasImage} alt="Clinical drawing"
              style={{ width: '100%', borderRadius: 6, border: '1px solid #e2e8f0' }} />
            <button style={{ marginTop: 6, background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
              onClick={() => set('canvasImage', '')}>✕ Remove drawing</button>
          </RxSection>
        )}

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

  const handleBookAgain = () => {
    navigate(`/queue?bookAgain=${appt?.patient_id || ''}&name=${encodeURIComponent(appt?.patient_name || '')}`);
  };

  if (showPostVisit) {
    return (
      <div className={styles.page}>
        <div className={styles.topbar}>
          <button className={styles.back} onClick={() => setShowPostVisit(false)}>
            <ChevronLeft size={15} strokeWidth={2.5} /> Back
          </button>
          <div className={styles.patientInfo}>
            <span className={styles.patientName}>{appt?.patient_name || 'Visit Complete'}</span>
            {appt && <span className={styles.patientMeta}>{[appt.uhid, appt.visit_type].filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
        <div className={styles.content} style={{ overflow: 'auto' }}>
          <PostVisitScreen
            form={form} appt={appt} user={user} rxImages={rxImages}
            onBookAgain={handleBookAgain}
            onPrint={() => window.print()}
            onGoogleReview={() => {
              const link = rxImages.googleReviewLink;
              link ? window.open(link, '_blank') : alert('No Google review link set. Add it in Configure → InferPad Settings.');
            }}
            onBillPatient={() => setShowReceipt(true)}
            onEndVisit={() => navigate('/queue')}
          />
        </div>
        {showReceipt && appt && (
          <CreateReceiptModal
            appt={appt}
            user={user}
            rxImages={rxImages}
            onClose={() => setShowReceipt(false)}
            onSaved={() => {}}
          />
        )}
      </div>
    );
  }

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
            <button className={styles.linkBtn} onClick={() => setShowConfigure(true)}>
              <Settings2 size={13} strokeWidth={1.8} /> Configure your InferPad
            </button>
            <button
              className={`${styles.linkBtn} ${showScribe ? styles.linkBtnActive : ''}`}
              onClick={() => { setShowScribe(s => !s); setShowAssessment(false); }}
            >
              <Mic size={13} strokeWidth={1.8} /> Scribe
            </button>
            <button
              className={`${styles.linkBtn} ${showAssessment ? styles.linkBtnActive : ''}`}
              onClick={() => { setShowAssessment(s => !s); setShowScribe(false); }}
            >
              <ClipboardList size={13} strokeWidth={1.8} /> Assessment
            </button>
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className={styles.content}>
          {tab === 'Overview' && (
            <div className={styles.tabBody}>

              {/* Prescription doc or empty state */}
              {prescriptionMode
                ? <RxEditor />
                : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>📋</div>
                    <h3 className={styles.emptyTitle}>No prescription created!</h3>
                    <p className={styles.emptyText}>
                      Whenever the patient visits you next again, you will see your last prescription here.
                    </p>
                  </div>
                )
              }

              {/* ── Vitals card — display only ── */}
              <div className={styles.summaryCard}>
                <div className={styles.summaryCardHeader}>
                  <span className={styles.summaryCardTitle}>Vitals</span>
                </div>
                {Object.values(form.vitals).every(v => !v) ? (
                  <div className={styles.summaryEmptyState}>
                    <span className={styles.summaryEmptyIcon}>🩺</span>
                    <span className={styles.summaryEmptyText}>No Vitals Added!</span>
                  </div>
                ) : (
                  <div className={styles.vitalsDisplayGrid}>
                    {[
                      ['bp_systolic',      'BP Systolic',     'mmHg',  '#3b82f6'],
                      ['bp_diastolic',     'BP Diastolic',    'mmHg',  '#6366f1'],
                      ['pulse',            'Pulse',           'bpm',   '#f59e0b'],
                      ['spo2',             'SpO₂',            '%',     '#06b6d4'],
                      ['temp',             'Temp',            '°C',    '#ef4444'],
                      ['respiratory_rate', 'Resp Rate',       '/min',  '#0891b2'],
                      ['weight',           'Weight',          'kg',    '#8b5cf6'],
                      ['height',           'Height',          'cm',    '#10b981'],
                      ['bmi',              'BMI',             'kg/m²', '#16a34a'],
                    ].filter(([k]) => form.vitals[k]).map(([k, label, unit, color]) => (
                      <div key={k} className={styles.vitalDisplayCell}>
                        <div className={styles.vitalDisplayBar} style={{ background: color + '18', borderColor: color + '44' }}>
                          <span className={styles.vitalDisplayValue} style={{ color }}>{form.vitals[k]}</span>
                          <span className={styles.vitalDisplayUnit}>{unit}</span>
                        </div>
                        <span className={styles.vitalDisplayLabel}>{label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Lab Results card — display only ── */}
              <div className={styles.summaryCard}>
                <div className={styles.summaryCardHeader}>
                  <span className={styles.summaryCardTitle}>Lab Results</span>
                </div>
                {form.lab_results.length === 0 ? (
                  <div className={styles.summaryEmptyState}>
                    <span className={styles.summaryEmptyIcon}>🧪</span>
                    <span className={styles.summaryEmptyText}>No Lab Results Added!</span>
                  </div>
                ) : (
                  <div className={styles.labResultsTable}>
                    <div className={styles.labResultsHead}>
                      <span>Test Name</span><span>Result</span><span>Unit</span><span>Normal Range</span>
                    </div>
                    {form.lab_results.map((r, i) => (
                      <div key={i} className={styles.labResultsRowDisplay}>
                        <span>{r.test || '—'}</span>
                        <span className={r.result ? styles.labResultValueFilled : ''}>{r.result || '—'}</span>
                        <span>{r.unit || '—'}</span>
                        <span>{r.range || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className={styles.error}>{error}</p>}
            </div>
          )}

          {tab === 'InferPad' && (
            <InferPad form={form} set={set} setVital={setVital} appt={appt} pastNotes={pastNotes} />
          )}

          {tab === 'Canvas' && (
            <DrawingCanvas
              initialImage={form.canvasImage || null}
              onSave={img => set('canvasImage', img)}
            />
          )}

          {tab === 'Medical Records' && (
            <div className={styles.tabBody}>
              <MedicalRecordsTab apptId={appointmentId} patientMobile={appt?.patient_mobile} />
            </div>
          )}

          {tab === 'Vaccines' && (
            <VaccinationChart
              dob={appt?.patient_dob}
              age={appt?.patient_age}
              vaccinations={form.vaccinations || {}}
              onChange={v => set('vaccinations', v)}
            />
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
            <LangPicker value={form.rx_language || ''} onChange={v => set('rx_language', v)} />
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

      {showScribe && (
        <ScribePanel
          set={set} setVital={setVital} onClose={() => setShowScribe(false)}
          appt={appt} pastNotes={pastNotes} user={user} form={form}
        />
      )}

      {showAssessment && (
        <AssessmentPanel
          set={set} onClose={() => setShowAssessment(false)}
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
