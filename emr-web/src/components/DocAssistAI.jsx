import { useState, useRef, useEffect } from 'react';
import {
  X, Send, Bot, RotateCcw, Copy, Check,
  Sparkles, RefreshCw, User, ChevronDown, ChevronUp,
  Activity, ClipboardList, Pill, FlaskConical, Stethoscope,
  Heart, Syringe, UtensilsCrossed, FileText, AlertCircle,
} from 'lucide-react';
import { api } from '../api/client';
import styles from './DocAssistAI.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Simple markdown renderer
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const out = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length) {
      out.push(<ul key={`ul-${out.length}`} className={styles.mdList}>{listItems}</ul>);
      listItems = [];
    }
  };

  const inlineFormat = (str) => {
    let rest = str;
    rest = rest.replace(/\*\*(.+?)\*\*/g, (_, m) => `§B§${m}§/B§`);
    rest = rest.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, m) => `§I§${m}§/I§`);
    rest = rest.replace(/`(.+?)`/g, (_, m) => `§C§${m}§/C§`);
    const tokens = rest.split(/(§B§.*?§\/B§|§I§.*?§\/I§|§C§.*?§\/C§)/);
    return tokens.map((tok, j) => {
      if (tok.startsWith('§B§')) return <strong key={j}>{tok.slice(3, -4)}</strong>;
      if (tok.startsWith('§I§')) return <em key={j}>{tok.slice(3, -4)}</em>;
      if (tok.startsWith('§C§')) return <code key={j} className={styles.mdCode}>{tok.slice(3, -4)}</code>;
      return tok;
    });
  };

  lines.forEach((line, idx) => {
    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const level = line.match(/^(#{1,3})/)[1].length;
      out.push(<p key={idx} className={styles[`mdH${level}`]}>{inlineFormat(line.replace(/^#{1,3}\s/, ''))}</p>);
    } else if (/^[-•*]\s/.test(line)) {
      listItems.push(<li key={idx} className={styles.mdLi}>{inlineFormat(line.replace(/^[-•*]\s/, ''))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      listItems.push(<li key={idx} className={styles.mdLi}>{inlineFormat(line.replace(/^\d+\.\s/, ''))}</li>);
    } else if (line.trim() === '') {
      flushList();
      out.push(<br key={idx} />);
    } else {
      flushList();
      out.push(<p key={idx} className={styles.mdP}>{inlineFormat(line)}</p>);
    }
  });
  flushList();
  return out;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button className={styles.copyBtn} onClick={copy} title="Copy">
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
    </button>
  );
}

function TypingDots() {
  return (
    <div className={styles.msgRow}>
      <div className={styles.msgAvatar}><Bot size={13} strokeWidth={2} /></div>
      <div className={`${styles.bubble} ${styles.bubbleAI}`}>
        <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
      </div>
    </div>
  );
}

// ── Patient Quick-Ask sections (matches patient sidebar) ─────────────────────

const QUICK_ASK_SECTIONS = [
  {
    section: 'Past Visits',
    icon: <ClipboardList size={11} />,
    questions: [
      'Summarize all past visits for this patient.',
      'What was the last diagnosis and treatment?',
      'Did this patient ever have fever?',
      'How many times has this patient visited and for what?',
    ],
  },
  {
    section: 'Patient Overview',
    icon: <User size={11} />,
    questions: [
      'Give me a full clinical overview of this patient.',
      'What are the key health concerns for this patient?',
      'Is there anything unusual in this patient\'s history I should know?',
    ],
  },
  {
    section: 'Treatments',
    icon: <Pill size={11} />,
    questions: [
      'What medications has this patient been prescribed across all visits?',
      'Are there any drug interactions in this patient\'s medication history?',
      'What is the current treatment plan for this patient?',
      'Has this patient been prescribed antibiotics? When?',
    ],
  },
  {
    section: 'Medical History',
    icon: <FileText size={11} />,
    questions: [
      'Summarize the full medical history of this patient.',
      'Does this patient have any chronic conditions?',
      'What allergies does this patient have? What drugs to avoid?',
      'Has this patient had any surgical history or procedures?',
    ],
  },
  {
    section: 'Vitals & Lab Results',
    icon: <Activity size={11} />,
    questions: [
      'What are the latest vitals for this patient? Any concerns?',
      'Summarize all lab investigations ordered for this patient.',
      'Is there any abnormal lab finding I should act on?',
      'Show the BP and pulse trend for this patient.',
    ],
  },
  {
    section: 'Assessments',
    icon: <Stethoscope size={11} />,
    questions: [
      'What diagnoses has this patient received across all visits?',
      'What is the most likely current diagnosis based on history?',
      'Has this patient been referred to any specialist?',
    ],
  },
  {
    section: 'Vaccinations',
    icon: <Syringe size={11} />,
    questions: [
      'Does this patient have any due vaccinations?',
      'What vaccinations has this patient received?',
      'Which vaccines are pending or missed for this patient?',
      'Is this patient\'s vaccination schedule up to date?',
    ],
  },
  {
    section: 'Diet Charts',
    icon: <UtensilsCrossed size={11} />,
    questions: [
      'Suggest a diet plan for this patient based on their conditions.',
      'What dietary restrictions should this patient follow?',
      'Create a 7-day meal plan appropriate for this patient.',
    ],
  },
  {
    section: 'Lab Reports',
    icon: <FlaskConical size={11} />,
    questions: [
      'Interpret the lab results for this patient.',
      'Are any lab values critical or abnormal?',
      'What follow-up tests should be ordered based on history?',
    ],
  },
];

// ── Patient Context Panel ─────────────────────────────────────────────────────

function buildApptContext(appt) {
  if (!appt) return '';
  const age = fmtAge(appt.patient_dob);
  return [
    `Patient: ${appt.patient_name || 'Unknown'}`,
    age            ? `Age: ${age} years`                                                        : null,
    appt.patient_gender === 'M' ? 'Gender: Male' : appt.patient_gender === 'F' ? 'Gender: Female' : null,
    appt.patient_mobile        ? `Mobile: ${appt.patient_mobile}`                              : null,
    appt.uhid                  ? `UHID: ${appt.uhid}`                                          : null,
    appt.visit_type            ? `Visit type: ${appt.visit_type}`                              : null,
  ].filter(Boolean).join('\n');
}

// Safe JSON parse helper
function safeJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}
// Extract text from various object shapes
function extractText(item) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  return item.display || item.name || item.text || item.label || item.drug_name || item.generic_name || null;
}

function buildContextFromHistory(rows, appt) {
  const first = rows[0];
  const age   = fmtAge(first.patient_dob || appt?.patient_dob);
  const gender = first.patient_gender || appt?.patient_gender;

  const lines = [
    `Patient: ${first.patient_name}`,
    age    ? `Age: ${age} years`                                                                    : null,
    gender ? `Gender: ${gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : gender}`             : null,
    first.patient_mobile ? `Mobile: ${first.patient_mobile}`                                        : null,
    first.uhid           ? `UHID: ${first.uhid}`                                                    : null,
  ].filter(Boolean);

  // Medical history from appointment (pre-existing conditions)
  const medHistRow = rows.find(r => r.medical_history?.length);
  if (medHistRow) {
    const mh = safeJson(medHistRow.medical_history);
    if (Array.isArray(mh) && mh.length) {
      const mhStr = mh.map(h => {
        const label = h.label || h.name || h.condition || extractText(h) || '';
        const since = h.since ? ` since ${h.since}` : '';
        return label ? `${label}${since}` : null;
      }).filter(Boolean).join(', ');
      if (mhStr) lines.push(`Medical History: ${mhStr}`);
    } else if (typeof mh === 'string' && mh.trim()) {
      lines.push(`Medical History: ${mh}`);
    }
  }

  // Latest vitals — parse JSON string if needed, use correct field keys from InferPad
  const vitalsRow = rows.find(r => {
    if (!r.vitals) return false;
    const v = typeof r.vitals === 'string' ? JSON.parse(r.vitals) : r.vitals;
    return v && typeof v === 'object' && Object.keys(v).some(k => v[k]);
  });
  if (vitalsRow) {
    const v = typeof vitalsRow.vitals === 'string' ? JSON.parse(vitalsRow.vitals) : vitalsRow.vitals;
    const vStr = [
      v.bp_systolic && v.bp_diastolic ? `BP: ${v.bp_systolic}/${v.bp_diastolic} mmHg`   : null,
      v.pulse            ? `Pulse: ${v.pulse}/min`                                        : null,
      v.temp             ? `Temp: ${v.temp}°C`                                            : null,
      v.temp_f           ? `Temp: ${v.temp_f}°F`                                          : null,
      v.spo2             ? `SpO2: ${v.spo2}%`                                             : null,
      v.respiratory_rate ? `RR: ${v.respiratory_rate}/min`                                : null,
      v.weight           ? `Weight: ${v.weight} kg`                                       : null,
      v.height           ? `Height: ${v.height} cm`                                       : null,
      v.bmi              ? `BMI: ${v.bmi}`                                                 : null,
      v.rbs              ? `RBS: ${v.rbs} mg/dL`                                          : null,
      v.fbs              ? `FBS: ${v.fbs} mg/dL`                                          : null,
      v.hba1c            ? `HbA1c: ${v.hba1c}%`                                           : null,
      v.hemoglobin       ? `Hb: ${v.hemoglobin} g/dL`                                     : null,
      v.creatinine       ? `Creatinine: ${v.creatinine} mg/dL`                            : null,
      v.tsh              ? `TSH: ${v.tsh} μIU/mL`                                         : null,
      v.vitamin_d        ? `Vitamin D: ${v.vitamin_d} ng/mL`                              : null,
      v.vitamin_b12      ? `Vitamin B12: ${v.vitamin_b12} pg/mL`                          : null,
    ].filter(Boolean).join(', ');
    if (vStr) lines.push(`Latest Vitals: ${vStr}`);
  }

  // Vaccinations — collect across all visits
  const allVaccinations = [];
  rows.forEach(r => {
    if (!r.vaccinations) return;
    const vacc = typeof r.vaccinations === 'string' ? JSON.parse(r.vaccinations) : r.vaccinations;
    const visitDate = r.appointment_date
      ? new Date(r.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    if (Array.isArray(vacc)) {
      vacc.forEach(v => {
        const name = v.vaccine_name || v.name || v.vaccine || '';
        const status = v.status || 'given';
        const brand = v.brand_name || v.brand || '';
        const batch = v.batch_number || v.batch || '';
        if (name) allVaccinations.push(`${name}${brand ? ` (${brand})` : ''}${batch ? ` #${batch}` : ''} — ${status} on ${visitDate}`);
      });
    } else if (typeof vacc === 'object') {
      // object keyed by vaccine name
      Object.entries(vacc).forEach(([key, v]) => {
        if (!v) return;
        const name = v.vaccine_name || v.name || key || '';
        const status = v.status || 'given';
        const brand = v.brand_name || v.brand || '';
        if (name) allVaccinations.push(`${name}${brand ? ` (${brand})` : ''} — ${status} on ${visitDate}`);
      });
    }
  });
  if (allVaccinations.length) {
    lines.push(`\nVaccinations (${allVaccinations.length}):`);
    allVaccinations.forEach(v => lines.push(`  • ${v}`));
  }

  const visits = rows.filter(r =>
    r.diagnosis || r.medications || r.chief_complaint || r.symptoms ||
    r.examination_findings || r.advices || r.encounter_notes || r.procedures
  );
  if (visits.length) {
    lines.push(`\nPast ${visits.length} visit(s):`);
    visits.forEach((r, i) => {
      const dateStr = r.appointment_date
        ? new Date(r.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Unknown date';
      const parts = [];

      if (r.doctor_name)     parts.push(`Dr. ${r.doctor_name}`);
      if (r.visit_type)      parts.push(`Type: ${r.visit_type}`);
      if (r.chief_complaint) parts.push(`CC: ${r.chief_complaint}`);

      // Diagnosis — objects have {display, code, system, since, severity}
      const dx = safeJson(r.diagnosis);
      if (Array.isArray(dx) && dx.length) {
        const dxStr = dx.map(d => {
          const name = d.display || d.name || d.text || extractText(d);
          const code = d.code ? ` [${d.code}]` : '';
          const sev  = d.severity ? ` (${d.severity})` : '';
          return name ? `${name}${code}${sev}` : null;
        }).filter(Boolean).join(', ');
        if (dxStr) parts.push(`Dx: ${dxStr}`);
      }

      // Symptoms — objects have {name, code, since, severity}
      const sx = safeJson(r.symptoms);
      if (Array.isArray(sx) && sx.length) {
        const sxStr = sx.map(s => {
          const name = s.name || s.text || extractText(s);
          const since = s.since ? ` since ${s.since}` : '';
          const sev   = s.severity ? ` (${s.severity})` : '';
          return name ? `${name}${since}${sev}` : null;
        }).filter(Boolean).join(', ');
        if (sxStr) parts.push(`Sx: ${sxStr}`);
      }

      // Medications — objects have {name, dose/dosage, frequency, duration, instructions}
      const meds = safeJson(r.medications);
      if (Array.isArray(meds) && meds.length) {
        const medsStr = meds.slice(0, 6).map(m => {
          const name = m.name || m.drug_name || m.generic_name || extractText(m);
          const dose = m.dose || m.dosage || '';
          const freq = m.frequency || '';
          const dur  = m.duration || '';
          const detail = [dose, freq, dur].filter(Boolean).join(' ');
          return name ? `${name}${detail ? ` (${detail})` : ''}` : null;
        }).filter(Boolean).join(', ');
        if (medsStr) parts.push(`Meds: ${medsStr}`);
      }

      // Lab investigations — objects have {name, code}
      const labs = safeJson(r.lab_investigations);
      if (Array.isArray(labs) && labs.length) {
        const labsStr = labs.map(l => l.name || l.test || extractText(l)).filter(Boolean).join(', ');
        if (labsStr) parts.push(`Labs ordered: ${labsStr}`);
      }

      // Lab results — objects have {test/name, result/value, unit}
      const labRes = safeJson(r.lab_results);
      if (Array.isArray(labRes) && labRes.length) {
        const labResStr = labRes.map(l => {
          const name = l.test || l.name || l.parameter;
          const val  = l.result || l.value;
          const unit = l.unit || '';
          return name && val ? `${name}: ${val}${unit ? ' ' + unit : ''}` : null;
        }).filter(Boolean).join(', ');
        if (labResStr) parts.push(`Lab Results: ${labResStr}`);
      }

      // Procedures
      const procs = safeJson(r.procedures);
      if (Array.isArray(procs) && procs.length) {
        const procStr = procs.map(p => typeof p === 'string' ? p : p.name || extractText(p)).filter(Boolean).join(', ');
        if (procStr) parts.push(`Procedures: ${procStr}`);
      } else if (typeof procs === 'string' && procs.trim()) {
        parts.push(`Procedures: ${procs}`);
      }

      if (r.examination_findings) parts.push(`Exam: ${r.examination_findings}`);
      if (r.encounter_notes)      parts.push(`Notes: ${r.encounter_notes}`);
      if (r.advices)              parts.push(`Advice: ${r.advices}`);
      if (r.refer_to)             parts.push(`Referred to: ${r.refer_to}`);
      if (r.next_visit_date)      parts.push(`Next visit: ${r.next_visit_date}`);

      lines.push(`  ${i + 1}. ${dateStr}${parts.length ? '\n     ' + parts.join('\n     ') : ''}`);
    });
  }
  return lines.join('\n');
}

function PatientContextPanel({ appt, onQuickAsk, onClearPatient }) {
  const [expanded,    setExpanded]    = useState(true);
  const [patientData, setPatientData] = useState(null);
  const [loading,     setLoading]     = useState(false);

  // Always build at least basic context from the appointment
  const baseContext = buildApptContext(appt);

  useEffect(() => {
    setPatientData(null);
    const mobile = appt?.patient_mobile;
    const name   = appt?.patient_name;
    if (!mobile && !name) return;
    setLoading(true);
    const param = mobile ? `mobile=${encodeURIComponent(mobile)}` : `name=${encodeURIComponent(name)}`;
    api.get(`/patients/history?${param}`)
      .then(rows => {
        if (!rows?.length) return;
        const context = buildContextFromHistory(rows, appt);
        const last = rows.find(r => r.appointment_date);
        setPatientData({
          context,
          patient: {
            name: rows[0].patient_name,
            visit_count: rows.filter(r => r.diagnosis || r.medications || r.chief_complaint).length,
            last_visit: last?.appointment_date || null,
            allergies: [],
            chronic_conditions: [],
          },
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appt?.id]);

  const name = appt?.patient_name || 'Patient';
  const age  = fmtAge(appt?.patient_dob);
  const gender = appt?.patient_gender;

  return (
    <div className={styles.patientPanel}>
      {/* Header row */}
      <div className={styles.patientPanelHeader} onClick={() => setExpanded(e => !e)}>
        <div className={styles.patientPanelAvatar}>{name.charAt(0).toUpperCase()}</div>
        <div className={styles.patientPanelInfo}>
          <span className={styles.patientPanelName}>{name}</span>
          <span className={styles.patientPanelMeta}>
            {[age ? `${age}y` : null, gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : gender, appt?.patient_mobile].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className={styles.patientPanelActions}>
          <button className={styles.patientPanelClear} onClick={e => { e.stopPropagation(); onClearPatient(); }} title="Remove patient context">
            <X size={11} strokeWidth={2} />
          </button>
          {expanded ? <ChevronUp size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
        </div>
      </div>

      {expanded && (
        <div className={styles.patientPanelBody}>
          {loading && <div className={styles.patientPanelLoading}><RefreshCw size={12} className={styles.spin} /> Loading patient data…</div>}

          {patientData && !loading && (
            <div className={styles.patientPanelStats}>
              {patientData.patient.visit_count > 0 && (
                <span className={styles.patientStatChip}><ClipboardList size={10} /> {patientData.patient.visit_count} visit{patientData.patient.visit_count !== 1 ? 's' : ''}</span>
              )}
              {patientData.patient.last_visit && (
                <span className={styles.patientStatChip}>Last: {fmtDate(patientData.patient.last_visit)}</span>
              )}
            </div>
          )}

          <QuickAskPanel
            ctx={patientData?.context || baseContext}
            onAsk={(q, ctx) => { setExpanded(false); onQuickAsk(q, ctx); }}
            patientName={name}
          />
        </div>
      )}
    </div>
  );
}

// ── Quick Ask Panel ───────────────────────────────────────────────────────────

function QuickAskPanel({ ctx, onAsk, patientName }) {
  const [openSection, setOpenSection] = useState(null);

  return (
    <div className={styles.quickAskPanel}>
      <p className={styles.patientPanelAskLabel}>Choose a topic to ask:</p>
      <div className={styles.quickAskSections}>
        {QUICK_ASK_SECTIONS.map((sec, si) => (
          <div key={si} className={styles.quickAskSection}>
            <button
              className={`${styles.quickAskSectionHeader} ${openSection === si ? styles.quickAskSectionHeaderOpen : ''}`}
              onClick={() => setOpenSection(openSection === si ? null : si)}
            >
              <span className={styles.quickAskSectionIcon}>{sec.icon}</span>
              <span>{sec.section}</span>
              <ChevronDown size={11} strokeWidth={2} className={`${styles.quickAskChevron} ${openSection === si ? styles.quickAskChevronOpen : ''}`} />
            </button>
            {openSection === si && (
              <div className={styles.quickAskSectionBody}>
                {sec.questions.map((q, qi) => (
                  <button
                    key={qi}
                    className={styles.quickAskQ}
                    onClick={() => { onAsk(q, ctx); setOpenSection(null); }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

function ChatTab({ appt, onClearPatient }) {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [patientCtx, setPatientCtx] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // Seed basic context from appointment when patient changes
  useEffect(() => {
    setPatientCtx(appt ? buildApptContext(appt) : '');
  }, [appt?.id]);

  async function send(text, overrideCtx) {
    const query = text.trim();
    if (!query || loading) return;
    const ts  = fmtTime(new Date());
    const ctx = overrideCtx !== undefined ? overrideCtx : patientCtx;
    setMessages(prev => [...prev, { role: 'user', text: query, ts }]);
    setInput('');
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.text }));
      const res = await api.post('/docassist', {
        message: query,
        history,
        patient_context: ctx || null,
      });
      setMessages(prev => [...prev, { role: 'ai', text: res.reply, ts: fmtTime(new Date()) }]);
    } catch (err) {
      const is429 = err?.status === 429 || String(err?.message).includes('429');
      setMessages(prev => [...prev, {
        role: 'ai',
        text: is429
          ? '⚠️ AI service is busy. Please wait 30 seconds and try again.'
          : 'Sorry, I could not get a response. Please check your connection.',
        ts: fmtTime(new Date()),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  }

  const handleQuickAsk = (q, ctx) => {
    // Use the richest context available; always fall back to basic appt context
    const effectiveCtx = ctx || patientCtx;
    setPatientCtx(effectiveCtx);
    send(q, effectiveCtx);
  };

  const isEmpty = messages.length === 0;

  const GENERAL_SUGGESTIONS = [
    { icon: '💊', text: 'Safe anti-hypertensives in asthma' },
    { icon: '💉', text: 'Ozempic vs Rybelsus — which is more effective?' },
    { icon: '🤰', text: 'Safe cough syrup for pregnant woman' },
    { icon: '🥗', text: 'Diet chart for DM2 patient' },
    { icon: '⚠️', text: 'Common dangerous drug interactions' },
    { icon: '🔬', text: 'When to order HbA1c vs fasting glucose?' },
  ];

  return (
    <div className={styles.tabPane}>
      {/* Patient context panel — shown when an appointment is active */}
      {appt && (
        <PatientContextPanel
          appt={appt}
          onQuickAsk={handleQuickAsk}
          onClearPatient={onClearPatient}
        />
      )}

      <div className={styles.chatBody}>
        {isEmpty ? (
          <div className={styles.welcome}>
            <div className={styles.logoLg}>
              <span className={styles.logoDot1} /><span className={styles.logoDot2} />
            </div>
            <h2 className={styles.welcomeTitle}>InferAssist</h2>
            <p className={styles.welcomeSub}>
              {appt ? `Ask anything about ${appt.patient_name || 'this patient'}, or any clinical question.` : 'Your intelligent clinical copilot'}
            </p>
            {!appt && (
              <>
                <p className={styles.suggestLabel}>Try asking:</p>
                <div className={styles.suggestions}>
                  {GENERAL_SUGGESTIONS.map((s, i) => (
                    <button key={i} className={styles.suggCard} onClick={() => send(s.text)}>
                      <span className={styles.suggIcon}>{s.icon}</span>
                      <span className={styles.suggText}>{s.text}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={styles.messages}>
            {messages.map((m, i) => (
              <div key={i} className={`${styles.msgRow} ${m.role === 'user' ? styles.msgRowUser : ''}`}>
                {m.role === 'ai' && (
                  <div className={styles.msgAvatar}><Bot size={13} strokeWidth={2} /></div>
                )}
                <div className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAI} ${m.error ? styles.bubbleError : ''}`}>
                  {m.role === 'ai' ? renderMarkdown(m.text) : <p className={styles.mdP}>{m.text}</p>}
                  <div className={styles.bubbleMeta}>
                    <span className={styles.bubbleTs}>{m.ts}</span>
                    {m.role === 'ai' && !m.error && <CopyButton text={m.text} />}
                  </div>
                </div>
              </div>
            ))}
            {loading && <TypingDots />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {!isEmpty && (
        <button className={styles.newChatBtn} onClick={() => { setMessages([]); setPatientCtx(''); }}>
          <RotateCcw size={12} strokeWidth={2} /> New chat
        </button>
      )}

      <div className={styles.inputWrap}>
        <textarea
          className={styles.input}
          rows={1}
          placeholder={appt ? `Ask about ${appt.patient_name || 'patient'} or any clinical question…` : 'Ask a clinical question…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        <button
          className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
        >
          <Send size={14} strokeWidth={2.5} />
        </button>
      </div>
      <p className={styles.disclaimer}>We recommend double-checking responses.</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InferAssistAI({ appt: propAppt }) {
  const [open,        setOpen]        = useState(false);
  const [activeAppt,  setActiveAppt]  = useState(null);

  // Auto-open and load patient when "Ask AI" is clicked on a card
  useEffect(() => {
    if (propAppt) {
      setActiveAppt(propAppt);
      setOpen(true);
    }
  }, [propAppt?.id]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      {!open && (
        <button className={styles.fab} onClick={() => setOpen(true)} title="InferAssist">
          <Bot size={18} strokeWidth={2} />
          <span className={styles.fabLabel}>InferAssist</span>
          <span className={styles.fabBadge}>Beta</span>
          {activeAppt && <span className={styles.fabPatientDot} title={activeAppt.patient_name} />}
        </button>
      )}

      {open && (
        <div className={styles.drawer}>
          <div className={styles.drawerHeader}>
            <div className={`${styles.logo} ${styles.logoSm}`}>
              <span className={styles.logoDot1} /><span className={styles.logoDot2} />
            </div>
            <div className={styles.headerText}>
              <span className={styles.headerTitle}>InferAssist</span>
              <span className={styles.headerBadge}>Beta</span>
            </div>
            {activeAppt && (
              <div className={styles.headerPatientCtx}>
                <User size={10} /> {activeAppt.patient_name}
              </div>
            )}
            <button className={styles.headerCloseBtn} onClick={() => setOpen(false)}>
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <div className={styles.drawerBody}>
            <ChatTab
              appt={activeAppt}
              onClearPatient={() => setActiveAppt(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
