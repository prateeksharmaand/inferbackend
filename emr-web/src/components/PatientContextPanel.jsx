import { useState, useEffect } from 'react';
import { X, Clock, Activity, FileText, Syringe, Minimize2, ChevronLeft } from 'lucide-react';
import { api } from '../api/client';
import s from './PatientContextPanel.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TABS = [
  { id: 'history',       icon: Clock,     label: 'History'       },
  { id: 'vitals',        icon: Activity,  label: 'Vitals'        },
  { id: 'records',       icon: FileText,  label: 'Records'       },
  { id: 'vaccinations',  icon: Syringe,   label: 'Vaccinations'  },
];

const STATUS_CFG = {
  given:   { label: 'Given',           color: '#16a34a', bg: '#f0fdf4' },
  due:     { label: 'Due',             color: '#2563eb', bg: '#eff6ff' },
  refused: { label: 'Patient Refused', color: '#d97706', bg: '#fffbeb' },
  missed:  { label: 'Missed',          color: '#dc2626', bg: '#fef2f2' },
};

const VLABEL = {
  bp_systolic: 'BP Sys', bp_diastolic: 'BP Dia', pulse: 'Pulse',
  spo2: 'SpO₂', temp: 'Temp', respiratory_rate: 'Resp Rate',
  weight: 'Weight', height: 'Height', bmi: 'BMI',
};
const VUNIT = {
  bp_systolic: 'mmHg', bp_diastolic: 'mmHg', pulse: 'bpm',
  spo2: '%', temp: '°C', respiratory_rate: '/min',
  weight: 'kg', height: 'cm', bmi: 'kg/m²',
};
const VCOLOR = {
  bp_systolic: '#3b82f6', bp_diastolic: '#6366f1', pulse: '#f59e0b',
  spo2: '#06b6d4', temp: '#ef4444', respiratory_rate: '#0891b2',
  weight: '#8b5cf6', height: '#10b981', bmi: '#16a34a',
};

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryTab({ history, loading }) {
  if (loading) return <div className={s.hint}>Loading…</div>;
  if (!history.length) return <div className={s.hint}>No past visits found.</div>;
  return (
    <div className={s.visitList}>
      {history.map(h => {
        const diags = (h.diagnosis || []).map(d => d.display || d).filter(Boolean).join(', ');
        const meds  = (h.medications || []).map(m => m.name).filter(Boolean);
        return (
          <div key={h.id} className={s.visitCard}>
            <div className={s.visitCardHead}>
              <span className={s.visitDate}>{fmtDate(h.appointment_date)}</span>
              {h.doctor_name && <span className={s.visitDoctor}>Dr. {h.doctor_name}</span>}
            </div>
            {diags && <div className={s.visitDiag}>{diags}</div>}
            {meds.length > 0 && (
              <div className={s.visitMeds}>
                {meds.slice(0, 4).map((m, i) => <span key={i} className={s.visitMedChip}>{m}</span>)}
                {meds.length > 4 && <span className={s.visitMore}>+{meds.length - 4}</span>}
              </div>
            )}
            {h.encounter_notes && <div className={s.visitNote}>{h.encounter_notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Vitals tab ────────────────────────────────────────────────────────────────
function VitalsTab({ history, loading }) {
  if (loading) return <div className={s.hint}>Loading…</div>;
  const entries = history.filter(h => h.vitals && Object.values(h.vitals).some(Boolean));
  if (!entries.length) return <div className={s.hint}>No vitals recorded yet.</div>;
  return (
    <div className={s.vitalsList}>
      {entries.map(h => (
        <div key={h.id} className={s.vitalsCard}>
          <div className={s.vitalsDate}>{fmtDate(h.appointment_date)}</div>
          <div className={s.vitalsGrid}>
            {Object.entries(VLABEL).filter(([k]) => h.vitals[k]).map(([k, label]) => (
              <div key={k} className={s.vitalCell}>
                <span className={s.vitalVal} style={{ color: VCOLOR[k] }}>{h.vitals[k]}</span>
                <span className={s.vitalUnit}>{VUNIT[k]}</span>
                <span className={s.vitalLabel}>{label}</span>
              </div>
            ))}
          </div>
          {h.lab_results?.length > 0 && (
            <div className={s.labResults}>
              {h.lab_results.map((r, i) => (
                <div key={i} className={s.labRow}>
                  <span className={s.labTest}>{r.test}</span>
                  <span className={s.labVal}>{r.result}{r.unit ? ` ${r.unit}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Records tab ───────────────────────────────────────────────────────────────
function RecordsTab({ history, loading }) {
  if (loading) return <div className={s.hint}>Loading…</div>;
  const entries = history.filter(h => h.encounter_id);
  if (!entries.length) return <div className={s.hint}>No clinical records found.</div>;
  return (
    <div className={s.recordsList}>
      {entries.map(h => {
        const symptoms = (h.symptoms || []).map(sym =>
          typeof sym === 'string' ? sym : sym.name
        ).filter(Boolean).join(', ');
        const diags = (h.diagnosis || []).map(d => d.display || d).filter(Boolean).join(', ');
        return (
          <div key={h.id} className={s.recordCard}>
            <div className={s.recordDate}>{fmtDate(h.appointment_date)}</div>
            {symptoms && (
              <div className={s.recordRow}>
                <span className={s.recordLabel}>Symptoms</span>
                <span className={s.recordVal}>{symptoms}</span>
              </div>
            )}
            {diags && (
              <div className={s.recordRow}>
                <span className={s.recordLabel}>Diagnosis</span>
                <span className={s.recordVal}>{diags}</span>
              </div>
            )}
            {h.examination_findings && (
              <div className={s.recordRow}>
                <span className={s.recordLabel}>Findings</span>
                <span className={s.recordVal}>{h.examination_findings}</span>
              </div>
            )}
            {h.encounter_notes && (
              <div className={s.recordRow}>
                <span className={s.recordLabel}>Notes</span>
                <span className={s.recordVal}>{h.encounter_notes}</span>
              </div>
            )}
            {h.advices && (
              <div className={s.recordRow}>
                <span className={s.recordLabel}>Advices</span>
                <span className={s.recordVal}>{h.advices}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Vaccinations tab ──────────────────────────────────────────────────────────
function VaccinationsTab({ history, loading }) {
  if (loading) return <div className={s.hint}>Loading…</div>;

  const merged = {};
  [...history].reverse().forEach(h => {
    if (h.vaccinations && typeof h.vaccinations === 'object') {
      Object.entries(h.vaccinations).forEach(([k, v]) => {
        if (v?.status) merged[k] = { ...v, visitDate: h.appointment_date };
      });
    }
  });

  const entries = Object.entries(merged).map(([k, v]) => ({
    key: k,
    name: k.replace(/^(iap_|other_)/, '').replace(/_/g, ' '),
    type: k.startsWith('iap_') ? 'IAP' : 'Other',
    ...v,
  }));

  if (!entries.length) return <div className={s.hint}>No vaccination records yet.</div>;

  const groups = { given: [], due: [], missed: [], refused: [] };
  entries.forEach(e => { if (groups[e.status]) groups[e.status].push(e); });

  return (
    <div className={s.vaccList}>
      <div className={s.vaccSummaryRow}>
        {[
          { label: 'Total',   value: entries.length,        color: '#7c3aed' },
          { label: 'Given',   value: groups.given.length,   color: '#16a34a' },
          { label: 'Due',     value: groups.due.length,     color: '#2563eb' },
          { label: 'Missed',  value: groups.missed.length + groups.refused.length, color: '#dc2626' },
        ].map(k => (
          <div key={k.label} className={s.vaccKpi}>
            <span style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</span>
            <span style={{ fontSize: 10, color: '#64748b' }}>{k.label}</span>
          </div>
        ))}
      </div>

      {Object.entries(groups).map(([status, items]) => {
        if (!items.length) return null;
        const cfg = STATUS_CFG[status];
        return (
          <div key={status} className={s.vaccGroup}>
            <div className={s.vaccGroupHead} style={{ color: cfg.color, background: cfg.bg }}>
              {cfg.label} · {items.length}
            </div>
            {items.map(e => (
              <div key={e.key} className={s.vaccRow}>
                <div>
                  <div className={s.vaccName}>{e.name}</div>
                  {e.date && <div className={s.vaccDate}>{e.date}</div>}
                </div>
                <div className={s.vaccMeta}>
                  {e.brand && <span>{e.brand}</span>}
                  {e.batch && <span>#{e.batch}</span>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PatientContextPanel({ appt, onClose, shifted = false }) {
  const [activeTab,  setActiveTab]  = useState('history');
  const [history,    setHistory]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [minimized,  setMinimized]  = useState(false);

  const activeTabCfg = TABS.find(t => t.id === activeTab);

  useEffect(() => {
    if (!appt) return;
    const mobile = appt.patient_mobile;
    const qs = mobile
      ? `mobile=${encodeURIComponent(mobile)}`
      : `name=${encodeURIComponent(appt.patient_name)}`;
    api.get(`/patients/history?${qs}`)
      .then(rows => { setHistory(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [appt?.id]); // eslint-disable-line

  const age     = appt?.patient_dob
    ? Math.floor((Date.now() - new Date(appt.patient_dob)) / (365.25 * 24 * 60 * 60 * 1000))
    : appt?.patient_age;
  const initials = (appt?.patient_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={[s.panel, shifted ? s.panelShifted : '', minimized ? s.panelMinimized : ''].filter(Boolean).join(' ')}>

      {/* Minimized tab strip — click to restore */}
      {minimized && (
        <button className={s.minTab} onClick={() => setMinimized(false)}>
          <ChevronLeft size={14} />
          {activeTabCfg && <activeTabCfg.icon size={14} strokeWidth={1.8} />}
          <span className={s.minTabLabel}>Past Visits</span>
        </button>
      )}

      {/* Header */}
      {!minimized && <div className={s.header}>
        <div className={s.avatar}>{initials}</div>
        <div className={s.headerInfo}>
          <div className={s.headerName}>{appt?.patient_name}</div>
          <div className={s.headerMeta}>
            {[
              appt?.patient_gender === 'M' ? 'Male' : appt?.patient_gender === 'F' ? 'Female' : null,
              age ? `${age}y` : null,
              appt?.uhid ? `UHID: ${appt.uhid}` : null,
            ].filter(Boolean).join('  ·  ')}
          </div>
        </div>
        <button className={s.headerBtn} onClick={() => setMinimized(true)} title="Minimize"><Minimize2 size={13} /></button>
        <button className={s.closeBtn} onClick={onClose}><X size={15} /></button>
      </div>}

      {/* Icon tab bar */}
      {!minimized && <div className={s.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${s.tabBtn} ${activeTab === t.id ? s.tabBtnActive : ''}`}
            onClick={() => setActiveTab(t.id)}
            title={t.label}
          >
            <t.icon size={16} strokeWidth={1.8} />
            <span className={s.tabLabel}>{t.label}</span>
          </button>
        ))}
      </div>}

      {/* Content */}
      {!minimized && <div className={s.body}>
        {activeTab === 'history'      && <HistoryTab      history={history} loading={loading} />}
        {activeTab === 'vitals'       && <VitalsTab       history={history} loading={loading} />}
        {activeTab === 'records'      && <RecordsTab      history={history} loading={loading} />}
        {activeTab === 'vaccinations' && <VaccinationsTab history={history} loading={loading} />}
      </div>}
    </div>
  );
}
