import { useState, useEffect } from 'react';
import {
  X, User, Clock, Stethoscope, ClipboardList, FileText,
  Activity, Search, PlusCircle, IndianRupee, Paperclip,
  ChevronRight, CalendarCheck,
} from 'lucide-react';
import { api } from '../api/client';
import MedicalHistorySection from './MedicalHistorySection';
import MedicalRecordsTab from './MedicalRecordsTab';
import styles from './PatientProfilePanel.module.css';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
}
function fmtTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,'0')} ${ap}`;
}
function durationMins(from, to) {
  if (!from || !to) return null;
  const mins = Math.round((new Date(to) - new Date(from)) / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const STATUS_COLOR = {
  booked:'#3b82f6', checked_in:'#8b5cf6', ongoing:'#f59e0b',
  completed:'#16a34a', cancelled:'#dc2626', parked:'#64748b', no_show:'#ef4444',
};

function EmptyState({ text }) {
  return <div className={styles.empty}><p className={styles.emptyText}>{text}</p></div>;
}

const TABS = [
  { key: 'Past Visits',          icon: Clock },
  { key: 'Patient Overview',     icon: User },
  { key: 'Treatments',           icon: Stethoscope },
  { key: 'Medical History',      icon: ClipboardList },
  { key: 'Medical Records',      icon: FileText },
  { key: 'Vitals & Lab Results', icon: Activity },
  { key: 'Assessments',          icon: Search },
  { key: 'Create New Visit',     icon: PlusCircle },
  { key: 'Receipts',             icon: IndianRupee },
  { key: 'Medical Documents',    icon: Paperclip },
];

// ── Past Visits ───────────────────────────────────────────────────────────────
function PastVisits({ history, loading, currentId }) {
  if (loading) return <div className={styles.tabPad}><p className={styles.hint}>Loading…</p></div>;
  if (!history.length) return <EmptyState text="No past visits on record." />;
  return (
    <div className={styles.visitList}>
      {history.map(h => {
        const diags    = (h.diagnosis  || []).map(d => d.display || d).filter(Boolean).join(', ');
        const medCount = (h.medications|| []).length;
        const dur      = durationMins(h.checked_in_at, h.completed_at);
        const isCur    = h.id === currentId;
        return (
          <div key={h.id} className={`${styles.visitCard} ${isCur ? styles.visitCardCur : ''}`}>
            <div className={styles.visitTop}>
              <div className={styles.visitLeft}>
                <span className={styles.visitDate}>{fmtDate(h.appointment_date)}</span>
                {isCur && <span className={styles.curBadge}>Current</span>}
              </div>
              <span className={styles.visitStatus} style={{ color: STATUS_COLOR[h.status] || '#64748b' }}>
                {h.status?.replace(/_/g,' ')}
              </span>
            </div>
            {h.doctor_name && <div className={styles.visitDoc}>Dr. {h.doctor_name}</div>}
            {diags  && <div className={styles.visitDiag}>{diags}</div>}
            <div className={styles.visitMeta}>
              {medCount > 0 && <span className={styles.visitPill}>{medCount} med{medCount > 1 ? 's':''}</span>}
              {h.visit_type  && <span className={styles.visitPill}>{h.visit_type}</span>}
              {dur           && <span className={styles.visitPill}>{dur}</span>}
              {h.completed_at&& <span className={styles.visitPill}>Done {fmtTime(h.completed_at)}</span>}
            </div>
            {h.encounter_id && (
              <a href={`/opd/rx/${h.id}`} target="_blank" rel="noreferrer" className={styles.visitRxLink}>
                View Rx <ChevronRight size={12} />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Patient Overview ──────────────────────────────────────────────────────────
function PatientOverview({ appt, history }) {
  const age    = fmtAge(appt.patient_dob);
  const gender = appt.patient_gender === 'M' ? 'Male' : appt.patient_gender === 'F' ? 'Female' : appt.patient_gender;
  const totalVisits = history.length;
  const lastVisit   = history.find(h => h.id !== appt.id);

  const rows = [
    { label: 'Full Name',    value: appt.patient_name },
    { label: 'Mobile',       value: appt.patient_mobile },
    { label: 'Date of Birth',value: appt.patient_dob ? fmtDate(appt.patient_dob) : null },
    { label: 'Age',          value: age != null ? `${age} years` : null },
    { label: 'Gender',       value: gender || null },
    { label: 'UHID',         value: appt.uhid || null },
    { label: 'ABHA ID',      value: appt.patient_abha || null },
    { label: 'Total Visits', value: totalVisits ? `${totalVisits} visit${totalVisits > 1 ? 's' : ''}` : null },
    { label: 'Last Visit',   value: lastVisit ? fmtDate(lastVisit.appointment_date) : null },
  ].filter(r => r.value);

  return (
    <div className={styles.overviewWrap}>
      {rows.map(r => (
        <div key={r.label} className={styles.overviewRow}>
          <span className={styles.overviewLabel}>{r.label}</span>
          <span className={styles.overviewValue}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Treatments ────────────────────────────────────────────────────────────────
function Treatments({ history }) {
  const visits = history.filter(h => h.medications?.length);
  if (!visits.length) return <EmptyState text="No treatments recorded." />;
  return (
    <div className={styles.treatList}>
      {visits.map(h => (
        <div key={h.id} className={styles.treatGroup}>
          <div className={styles.treatHeader}>
            <span className={styles.treatDate}>{fmtDate(h.appointment_date)}</span>
            {h.doctor_name && <span className={styles.treatDoc}>Dr. {h.doctor_name}</span>}
          </div>
          {h.medications.map((m, i) => (
            <div key={i} className={styles.medRow}>
              <span className={styles.medName}>{m.name}</span>
              <span className={styles.medMeta}>
                {[m.dose || m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}
              </span>
              {m.instructions && <span className={styles.medInstr}>{m.instructions}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Medical Records (clinical encounter summaries) ────────────────────────────
function MedicalRecords({ history }) {
  const visits = history.filter(h => h.encounter_id);
  if (!visits.length) return <EmptyState text="No clinical records found." />;
  return (
    <div className={styles.recordList}>
      {visits.map(h => {
        const diags = (h.diagnosis || []).map(d => d.display || d).filter(Boolean);
        const symps = (h.symptoms  || []).map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);
        return (
          <div key={h.id} className={styles.recordCard}>
            <div className={styles.recordTop}>
              <span className={styles.recordDate}>{fmtDate(h.appointment_date)}</span>
              {h.doctor_name && <span className={styles.recordDoc}>Dr. {h.doctor_name}</span>}
            </div>
            {symps.length > 0 && (
              <div className={styles.recordLine}>
                <span className={styles.recordLbl}>Symptoms:</span> {symps.join(', ')}
              </div>
            )}
            {diags.length > 0 && (
              <div className={styles.recordLine}>
                <span className={styles.recordLbl}>Diagnosis:</span> {diags.join(', ')}
              </div>
            )}
            {h.encounter_notes && (
              <div className={styles.recordNote}>{h.encounter_notes}</div>
            )}
            {h.advices && (
              <div className={styles.recordLine}>
                <span className={styles.recordLbl}>Advices:</span> {h.advices}
              </div>
            )}
            {h.next_visit_date && (
              <div className={styles.recordLine}>
                <span className={styles.recordLbl}>Follow-up:</span> {fmtDate(h.next_visit_date)}
              </div>
            )}
            <a href={`/opd/rx/${h.id}`} target="_blank" rel="noreferrer" className={styles.visitRxLink}>
              View full Rx <ChevronRight size={12} />
            </a>
          </div>
        );
      })}
    </div>
  );
}

// ── Vitals & Lab Results ──────────────────────────────────────────────────────
function VitalsLabs({ history }) {
  const entries = history.filter(h =>
    (h.vitals && Object.values(h.vitals).some(v => v)) || h.lab_results?.length
  );
  if (!entries.length) return <EmptyState text="No vitals or lab results recorded." />;

  const VITALS = [
    ['BP',           v => v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic} mmHg` : null],
    ['Pulse',        v => v.pulse     ? `${v.pulse} bpm`  : null],
    ['SpO2',         v => v.spo2      ? `${v.spo2}%`      : null],
    ['Temp',         v => v.temp      ? `${v.temp}°C`     : null],
    ['Weight',       v => v.weight    ? `${v.weight} kg`  : null],
    ['Height',       v => v.height    ? `${v.height} cm`  : null],
    ['BMI',          v => v.bmi       ? `${v.bmi}`        : null],
    ['Resp. Rate',   v => v.respiratory_rate ? `${v.respiratory_rate}/min` : null],
  ];

  return (
    <div className={styles.vitalsList}>
      {entries.map(h => (
        <div key={h.id} className={styles.vitalsCard}>
          <div className={styles.vitalsDate}>{fmtDate(h.appointment_date)}</div>
          {h.vitals && (
            <div className={styles.vitalsGrid}>
              {VITALS.map(([label, fn]) => {
                const val = fn(h.vitals);
                if (!val) return null;
                return (
                  <div key={label} className={styles.vitalItem}>
                    <span className={styles.vitalLabel}>{label}</span>
                    <span className={styles.vitalVal}>{val}</span>
                  </div>
                );
              })}
            </div>
          )}
          {h.lab_results?.length > 0 && (
            <div className={styles.labTable}>
              {h.lab_results.map((r, i) => (
                <div key={i} className={styles.labRow}>
                  <span className={styles.labTest}>{r.test}</span>
                  <span className={styles.labVal}>{r.result}{r.unit ? ` ${r.unit}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Assessments ───────────────────────────────────────────────────────────────
function Assessments({ history }) {
  const entries = history.filter(h => h.symptoms?.length || h.diagnosis?.length || h.examination_findings);
  if (!entries.length) return <EmptyState text="No assessments recorded." />;
  return (
    <div className={styles.assessList}>
      {entries.map(h => (
        <div key={h.id} className={styles.assessCard}>
          <div className={styles.assessDate}>{fmtDate(h.appointment_date)}</div>
          {h.symptoms?.length > 0 && (
            <div className={styles.assessSection}>
              <span className={styles.assessLbl}>Symptoms</span>
              <div className={styles.chipRow}>
                {h.symptoms.map((s, i) => (
                  <span key={i} className={styles.symptomChip}>
                    {typeof s === 'string' ? s : s.name}
                    {typeof s === 'object' && s.since ? ` · ${s.since}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          {h.diagnosis?.length > 0 && (
            <div className={styles.assessSection}>
              <span className={styles.assessLbl}>Diagnosis</span>
              <div className={styles.chipRow}>
                {h.diagnosis.map((d, i) => (
                  <span key={i} className={styles.diagChip}>{d.display || d}</span>
                ))}
              </div>
            </div>
          )}
          {h.examination_findings && (
            <div className={styles.assessSection}>
              <span className={styles.assessLbl}>Examination</span>
              <p className={styles.assessText}>{h.examination_findings}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Create New Visit ──────────────────────────────────────────────────────────
function CreateNewVisit({ appt, onNewVisit }) {
  return (
    <div className={styles.newVisitWrap}>
      <CalendarCheck size={48} strokeWidth={1} className={styles.newVisitIcon} />
      <p className={styles.newVisitText}>Start a new visit for <strong>{appt.patient_name}</strong></p>
      <p className={styles.newVisitSub}>
        Patient details (name, mobile, gender, DOB, UHID) will be pre-filled.
      </p>
      <button className={styles.newVisitBtn} onClick={() => onNewVisit(appt)}>
        <PlusCircle size={16} /> Create New Visit
      </button>
    </div>
  );
}

// ── Receipts ──────────────────────────────────────────────────────────────────
function ReceiptsTab({ receipts, loading }) {
  if (loading) return <div className={styles.tabPad}><p className={styles.hint}>Loading…</p></div>;
  if (!receipts.length) return <EmptyState text="No receipts found." />;
  const grandTotal = receipts.reduce((s, r) => s + parseFloat(r.grand_total || 0), 0);
  return (
    <div className={styles.receiptList}>
      <div className={styles.receiptTotal}>
        Total billed: <strong>₹{grandTotal.toFixed(0)}</strong>
      </div>
      {receipts.map(r => (
        <div key={r.id} className={styles.receiptCard}>
          <div className={styles.receiptTop}>
            <span className={styles.receiptDate}>{fmtDate(r.created_at)}</span>
            <span className={styles.receiptAmt}>₹{parseFloat(r.grand_total || 0).toFixed(0)}</span>
          </div>
          <div className={styles.receiptMeta}>
            {r.paymode && <span className={styles.receiptPill}>{r.paymode}</span>}
            <span className={`${styles.receiptPill} ${r.payment_status === 'paid' ? styles.receiptPaid : ''}`}>
              {r.payment_status}
            </span>
          </div>
          {r.items?.length > 0 && (
            <div className={styles.receiptItems}>
              {r.items.map((item, i) => (
                <span key={i} className={styles.receiptItem}>{item.service_name}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function PatientProfilePanel({ appt, onClose, onNewVisit }) {
  const [tab,            setTab]            = useState('Past Visits');
  const [history,        setHistory]        = useState([]);
  const [histLoading,    setHistLoading]    = useState(true);
  const [receipts,       setReceipts]       = useState([]);
  const [recLoading,     setRecLoading]     = useState(true);
  const [medHistory,     setMedHistory]     = useState(appt.medical_history || []);
  const [savingMH,       setSavingMH]       = useState(false);

  useEffect(() => {
    const mobile = appt.patient_mobile;
    const qs = mobile
      ? `mobile=${encodeURIComponent(mobile)}`
      : `name=${encodeURIComponent(appt.patient_name)}`;

    api.get(`/patients/history?${qs}`)
      .then(rows => {
        setHistory(rows);
        // Seed medical history from the most recent appointment that has data
        const withMH = rows.find(r => r.medical_history?.length);
        if (withMH) setMedHistory(withMH.medical_history);
        setHistLoading(false);
      })
      .catch(() => setHistLoading(false));

    if (mobile) {
      api.get(`/receipts?phone=${encodeURIComponent(mobile)}`)
        .then(rows => { setReceipts(rows); setRecLoading(false); })
        .catch(() => setRecLoading(false));
    } else {
      setRecLoading(false);
    }
  }, [appt.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMedHistory = async () => {
    setSavingMH(true);
    try { await api.patch(`/appointments/${appt.id}/status`, { medical_history: medHistory }); }
    catch (_) {}
    setSavingMH(false);
  };

  const age     = fmtAge(appt.patient_dob);
  const gender  = appt.patient_gender === 'M' ? 'M' : appt.patient_gender === 'F' ? 'F' : appt.patient_gender;
  const initials = (appt.patient_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>

        {/* ── Patient header ── */}
        <div className={styles.header}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.headerInfo}>
            <div className={styles.headerName}>{appt.patient_name}</div>
            <div className={styles.headerMeta}>
              {[gender, age != null ? `${age}y` : null, appt.patient_mobile, appt.uhid ? `UHID: ${appt.uhid}` : null]
                .filter(Boolean).join('  ·  ')}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        {/* ── Body: tabs + content ── */}
        <div className={styles.body}>

          {/* Left tab nav */}
          <nav className={styles.tabNav}>
            {TABS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                className={`${styles.tabBtn} ${tab === key ? styles.tabBtnActive : ''}`}
                onClick={() => setTab(key)}
              >
                <Icon size={14} strokeWidth={2} />
                <span>{key}</span>
              </button>
            ))}
          </nav>

          {/* Tab content */}
          <div className={styles.content}>
            {tab === 'Past Visits' && (
              <PastVisits history={history} loading={histLoading} currentId={appt.id} />
            )}
            {tab === 'Patient Overview' && (
              <PatientOverview appt={appt} history={history} />
            )}
            {tab === 'Treatments' && (
              <Treatments history={history} />
            )}
            {tab === 'Medical History' && (
              <div className={styles.tabPad}>
                <MedicalHistorySection value={medHistory} onChange={setMedHistory} />
                <button className={styles.saveBtn} onClick={saveMedHistory} disabled={savingMH}>
                  {savingMH ? 'Saving…' : 'Save Medical History'}
                </button>
              </div>
            )}
            {tab === 'Medical Records' && (
              <MedicalRecords history={history} />
            )}
            {tab === 'Vitals & Lab Results' && (
              <VitalsLabs history={history} />
            )}
            {tab === 'Assessments' && (
              <Assessments history={history} />
            )}
            {tab === 'Create New Visit' && (
              <CreateNewVisit appt={appt} onNewVisit={onNewVisit} />
            )}
            {tab === 'Receipts' && (
              <ReceiptsTab receipts={receipts} loading={recLoading} />
            )}
            {tab === 'Medical Documents' && (
              <MedicalRecordsTab apptId={appt.id} patientMobile={appt.patient_mobile} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
