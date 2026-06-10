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

// ── Patient Quick-Ask chips ───────────────────────────────────────────────────

const PATIENT_QUICK_ASK = [
  { icon: <ClipboardList size={12} />, label: 'Past Visits',        q: 'Summarize this patient\'s past visits and key findings.' },
  { icon: <User size={12} />,          label: 'Overview',           q: 'Give me a clinical overview of this patient.' },
  { icon: <Pill size={12} />,          label: 'Medications',        q: 'What medications has this patient been prescribed? Any interactions?' },
  { icon: <FileText size={12} />,      label: 'Medical History',    q: 'Summarize the medical history of this patient.' },
  { icon: <Activity size={12} />,      label: 'Vitals',             q: 'What are the latest vitals for this patient? Any concerns?' },
  { icon: <FlaskConical size={12} />,  label: 'Lab Results',        q: 'Summarize the recent lab investigations for this patient.' },
  { icon: <Heart size={12} />,         label: 'Chronic Conditions', q: 'What chronic conditions does this patient have? What should I watch for?' },
  { icon: <AlertCircle size={12} />,   label: 'Allergies',          q: 'What are this patient\'s known allergies? What drugs to avoid?' },
  { icon: <Stethoscope size={12} />,   label: 'Diagnosis',          q: 'What diagnoses has this patient been given across visits?' },
  { icon: <Syringe size={12} />,       label: 'Vaccinations',       q: 'What vaccinations are recorded for this patient?' },
  { icon: <UtensilsCrossed size={12}/>, label: 'Diet & Lifestyle',  q: 'Suggest a diet and lifestyle plan for this patient based on their history.' },
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

  // Latest vitals
  const vitalsRow = rows.find(r => r.vitals && typeof r.vitals === 'object' && Object.keys(r.vitals).length > 0);
  if (vitalsRow) {
    const v = vitalsRow.vitals;
    const vStr = [
      v.bp_systolic && v.bp_diastolic ? `BP: ${v.bp_systolic}/${v.bp_diastolic} mmHg` : null,
      v.pulse        ? `Pulse: ${v.pulse} bpm`                      : null,
      v.temperature  ? `Temp: ${v.temperature}°${v.temp_unit || ''}`: null,
      v.spo2         ? `SpO2: ${v.spo2}%`                           : null,
      v.weight       ? `Weight: ${v.weight} kg`                     : null,
      v.height       ? `Height: ${v.height} cm`                     : null,
      v.bmi          ? `BMI: ${v.bmi}`                              : null,
      v.rbs          ? `RBS: ${v.rbs} mg/dL`                        : null,
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

  const visits = rows.filter(r => r.diagnosis?.length || r.medications?.length || r.chief_complaint || r.symptoms?.length);
  if (visits.length) {
    lines.push(`\nPast ${visits.length} visit(s):`);
    visits.forEach((r, i) => {
      const dateStr = r.appointment_date
        ? new Date(r.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Unknown date';
      const parts = [];
      if (r.doctor_name)     parts.push(`Dr. ${r.doctor_name}`);
      if (r.chief_complaint) parts.push(`CC: ${r.chief_complaint}`);
      if (r.diagnosis?.length) {
        const dx = Array.isArray(r.diagnosis)
          ? r.diagnosis.map(d => d.name || d.text || d).filter(Boolean).join(', ')
          : r.diagnosis;
        if (dx) parts.push(`Dx: ${dx}`);
      }
      if (r.symptoms?.length) {
        const sx = Array.isArray(r.symptoms)
          ? r.symptoms.map(s => s.name || s.text || s).filter(Boolean).join(', ')
          : r.symptoms;
        if (sx) parts.push(`Sx: ${sx}`);
      }
      if (r.medications?.length) {
        const meds = Array.isArray(r.medications)
          ? r.medications.slice(0, 5).map(m => m.name || m.drug_name || m.generic_name || m).filter(Boolean).join(', ')
          : r.medications;
        if (meds) parts.push(`Meds: ${meds}`);
      }
      if (r.lab_investigations?.length) {
        const labs = Array.isArray(r.lab_investigations)
          ? r.lab_investigations.slice(0, 3).map(l => l.name || l.test || l).filter(Boolean).join(', ')
          : r.lab_investigations;
        if (labs) parts.push(`Labs: ${labs}`);
      }
      if (r.lab_results?.length) {
        const results = Array.isArray(r.lab_results)
          ? r.lab_results.slice(0, 3).map(l => `${l.test || l.name}: ${l.result || l.value}${l.unit ? ' ' + l.unit : ''}`).filter(Boolean).join(', ')
          : '';
        if (results) parts.push(`Lab Results: ${results}`);
      }
      if (r.examination_findings) parts.push(`Exam: ${r.examination_findings}`);
      if (r.advices)              parts.push(`Advice: ${r.advices}`);
      if (r.refer_to)             parts.push(`Referred to: ${r.refer_to}`);
      if (r.next_visit_date)      parts.push(`Next visit: ${r.next_visit_date}`);
      lines.push(`  ${i + 1}. ${dateStr}${parts.length ? ' — ' + parts.join(' | ') : ''}`);
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
                <span className={styles.patientStatChip}>
                  <ClipboardList size={10} /> {patientData.patient.visit_count} visit{patientData.patient.visit_count !== 1 ? 's' : ''}
                </span>
              )}
              {patientData.patient.last_visit && (
                <span className={styles.patientStatChip}>
                  Last: {fmtDate(patientData.patient.last_visit)}
                </span>
              )}
              {patientData.patient.allergies?.length > 0 && (
                <span className={`${styles.patientStatChip} ${styles.patientStatChipAlert}`}>
                  <AlertCircle size={10} /> {patientData.patient.allergies.length} allerg{patientData.patient.allergies.length > 1 ? 'ies' : 'y'}
                </span>
              )}
              {patientData.patient.chronic_conditions?.length > 0 && (
                <span className={`${styles.patientStatChip} ${styles.patientStatChipWarn}`}>
                  <Heart size={10} /> {patientData.patient.chronic_conditions.length} condition{patientData.patient.chronic_conditions.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          <p className={styles.patientPanelAskLabel}>Ask about this patient:</p>
          <div className={styles.patientQuickAsk}>
            {PATIENT_QUICK_ASK.map((item, i) => (
              <button
                key={i}
                className={styles.patientQuickChip}
                onClick={() => onQuickAsk(item.q, patientData?.context || baseContext)}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
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
