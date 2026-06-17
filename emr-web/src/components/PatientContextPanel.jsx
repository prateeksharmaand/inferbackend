import { useState, useEffect } from 'react';
import { X, Clock, Activity, FileText, Syringe, Minimize2, ChevronLeft, FlaskConical, Shield, Send, Plus } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import s from './PatientContextPanel.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TABS = [
  { id: 'history',       icon: Clock,         label: 'History'      },
  { id: 'vitals',        icon: Activity,      label: 'Vitals'       },
  { id: 'records',       icon: FileText,      label: 'Records'      },
  { id: 'lab-tests',     icon: FlaskConical,  label: 'Lab Tests'    },
  { id: 'vaccinations',  icon: Syringe,       label: 'Vaccinations' },
  { id: 'consents',      icon: Shield,        label: 'Consents'     },
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
          {/* Calculator results */}
          {h.calc_results && Object.entries(h.calc_results).filter(([,r]) => r?.value).length > 0 && (
            <div className={s.labResults}>
              <div className={s.labRow} style={{ color: '#7c3aed', fontWeight: 700, fontSize: 10, paddingBottom: 2 }}>
                Calculators
              </div>
              {Object.entries(h.calc_results).filter(([,r]) => r?.value).map(([id, r]) => (
                <div key={id} className={s.labRow}>
                  <span className={s.labTest}>{id.replace(/_/g, ' ')}</span>
                  <span className={s.labVal} style={{ color: r.color }}>{r.value}{r.unit ? ` ${r.unit}` : ''}</span>
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

// ── Lab Tests tab ─────────────────────────────────────────────────────────────
const FLAG_COLOR = { H: '#b45309', L: '#1e40af', C: '#dc2626' };

function LabOrderCard({ r, appt }) {
  const [open,      setOpen]    = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [applied,   setApplied]  = useState(false);

  const key = r.id || r.order_number;
  const statusColor = { PENDING:'#64748b', COLLECTED:'#d97706', PROCESSING:'#7c3aed', RESULTED:'#059669', REPORTED:'#0891b2' }[r.order_status] || '#64748b';
  const statusLabel = { PENDING:'Pending', COLLECTED:'Collected', PROCESSING:'Testing', RESULTED:'Ready', REPORTED:'Reported' }[r.order_status] || r.order_status || '';
  const filledResults = (r.results || []).filter(x => x.result_value != null);
  const hasVals = filledResults.length > 0;

  const generateSummary = async () => {
    if (aiSummary) return; // already generated
    setAiLoading(true);
    try {
      const res = await fetch('/api/emr/ai/lab-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('emr_token')}` },
        body: JSON.stringify({
          results:        filledResults,
          patient_name:   appt?.patient_name,
          patient_age:    appt?.patient_age || appt?.patient_dob,
          patient_gender: appt?.patient_gender,
          order_number:   r.order_number,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiSummary(data.summary);
      // Immediately push summary to InferPad Notes
      window.dispatchEvent(new CustomEvent('lab:apply', { detail: { items: [], summary: data.summary } }));
    } catch (err) {
      setAiSummary('AI summary failed: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const applyToInferPad = () => {
    // Format results as lab_results objects that InferPad accepts
    const labItems = filledResults.map(x => ({
      test:   x.test_name || '',
      result: String(x.result_value ?? ''),
      unit:   x.result_unit || '',
      range:  x.reference_range_low != null && x.reference_range_high != null
        ? `${x.reference_range_low}–${x.reference_range_high}` : '',
    }));
    // Dispatch event — InferPad listens for this
    window.dispatchEvent(new CustomEvent('lab:apply', { detail: { items: labItems, orderNumber: r.order_number, summary: aiSummary } }));
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9' }}>
      {/* Header — click to expand */}
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', cursor: 'pointer' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{r.report_number || r.order_number || 'Lab Order'}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            {r.lab_name && <span>{r.lab_name}</span>}
            {r.sample_collected_at && <span>{fmtDate(r.sample_collected_at)}</span>}
            <span style={{ background: statusColor + '22', color: statusColor, padding: '0 6px', borderRadius: 6, fontWeight: 600 }}>{statusLabel}</span>
          </div>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Expanded content */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Scrollable results area */}
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '0 14px 6px' }}>
            {!hasVals ? (
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>Results pending — not yet entered by lab</div>
            ) : (
              <>
                {filledResults.map((x, i) => {
                  const val  = parseFloat(x.result_value);
                  const flag = x.is_critical_value ? 'C'
                    : (!isNaN(val) && x.reference_range_high != null && val > parseFloat(x.reference_range_high)) ? 'H'
                    : (!isNaN(val) && x.reference_range_low  != null && val < parseFloat(x.reference_range_low))  ? 'L' : '';
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f8fafc', fontSize: 12 }}>
                      <span style={{ color: '#475569' }}>{x.test_name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontWeight: 700, color: FLAG_COLOR[flag] || '#1e293b' }}>{x.result_value}</span>
                        {x.result_unit && <span style={{ color: '#94a3b8', fontSize: 10 }}>{x.result_unit}</span>}
                        {flag && <span style={{ color: FLAG_COLOR[flag], fontWeight: 700, fontSize: 10 }}>{flag}</span>}
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 11, color: '#166534', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>✨ AI Summary</div>
                {aiSummary}
              </div>
            )}
          </div>

          {/* Sticky action buttons */}
          <div style={{ position: 'sticky', bottom: 0, background: 'white', borderTop: '1px solid #f1f5f9', padding: '8px 14px', display: 'flex', gap: 6 }}>
            <button
              onClick={applyToInferPad}
              disabled={!hasVals}
              style={{ flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 700, cursor: hasVals ? 'pointer' : 'not-allowed', borderRadius: 7, border: '1.5px solid #7c3aed', background: applied ? '#7c3aed' : 'white', color: applied ? 'white' : '#7c3aed', transition: 'all .15s', opacity: hasVals ? 1 : 0.4 }}>
              {applied ? '✓ Applied!' : '📋 Apply to InferPad'}
            </button>
            <button
              onClick={generateSummary}
              disabled={aiLoading || !hasVals || !!aiSummary}
              style={{ flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 700, cursor: (hasVals && !aiSummary) ? 'pointer' : 'not-allowed', borderRadius: 7, border: '1.5px solid #059669', background: aiSummary ? '#059669' : 'white', color: aiSummary ? 'white' : '#059669', opacity: hasVals ? 1 : 0.4, transition: 'all .15s' }}>
              {aiLoading ? '⏳ Generating…' : aiSummary ? '✓ Summary Ready' : '✨ AI Summary'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LabTestsTab({ reports, loading, appt }) {
  if (loading) return <div className={s.hint}>Loading lab results…</div>;
  if (!reports.length) return <div className={s.hint}>No lab results found for this patient.</div>;
  return (
    <div style={{ padding: '8px 0' }}>
      {reports.map(r => <LabOrderCard key={r.id || r.order_number} r={r} appt={appt} />)}
    </div>
  );
}

// ── Consents tab ──────────────────────────────────────────────────────────────
const HI_TYPES = ['OPConsultation','Prescription','DiagnosticReport','DischargeSummary','ImmunizationRecord'];
const PURPOSE_OPTIONS = [
  { value: 'CAREMGT', label: 'Care Management' },
  { value: 'BTG',     label: 'Break the Glass' },
  { value: 'PUBHLTH', label: 'Public Health'   },
  { value: 'HPAYMT',  label: 'Healthcare Payment' },
  { value: 'DSRCH',   label: 'Disease Research' },
];
const STATUS_CFG_C = {
  REQUESTED: { label: 'Requested', color: '#d97706', bg: '#fffbeb' },
  GRANTED:   { label: 'Granted',   color: '#16a34a', bg: '#f0fdf4' },
  DENIED:    { label: 'Denied',    color: '#dc2626', bg: '#fef2f2' },
  REVOKED:   { label: 'Revoked',   color: '#dc2626', bg: '#fef2f2' },
  EXPIRED:   { label: 'Expired',   color: '#64748b', bg: '#f8fafc' },
};

function ConsentRequestModal({ abha, hipId, onClose, onSent }) {
  const [purpose,  setPurpose]  = useState('CAREMGT');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [hiTypes,  setHiTypes]  = useState(['OPConsultation']);
  const [sending,  setSending]  = useState(false);

  const toggleType = t => setHiTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const send = async () => {
    if (!abha) return toast.error('Patient has no ABHA address');
    if (!hiTypes.length) return toast.error('Select at least one document type');
    setSending(true);
    try {
      await api.post('/consents', {
        patientAbha: abha, hipId, purpose, hiTypes,
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo:   dateTo   ? new Date(dateTo).toISOString()   : undefined,
      });
      toast.success('Consent request sent to patient');
      onSent?.();
      onClose();
    } catch (err) { toast.error(err.message); }
    finally { setSending(false); }
  };

  const inp = { width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', boxSizing: 'border-box' };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', padding: 24, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Request Patient Consent</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Patient ABHA Address</label>
            <input style={{ ...inp, background: '#f8fafc', color: '#64748b' }} value={abha} readOnly />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>HIP ID</label>
            <input style={{ ...inp, background: '#f8fafc', color: '#64748b' }} value={hipId} readOnly />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Purpose</label>
            <select style={inp} value={purpose} onChange={e => setPurpose(e.target.value)}>
              {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>From Date</label>
            <input type="date" style={inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>To Date</label>
            <input type="date" style={inp} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>HI Types</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {HI_TYPES.map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                <input type="checkbox" checked={hiTypes.includes(t)} onChange={() => toggleType(t)}
                  style={{ accentColor: '#7c3aed', width: 14, height: 14, cursor: 'pointer' }} />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={send} disabled={sending}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: sending ? '#c4b5fd' : '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 13, cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={13} /> {sending ? 'Sending…' : 'Send Consent Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsentsTab({ appt }) {
  const abha  = appt?.patient_abha || '';
  const hipId = import.meta.env.VITE_ABDM_HIP_ID || 'noushealthhip';
  const [consents,    setConsents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/consents').then(rows => {
      setConsents(abha ? rows.filter(r => r.patient_abha === abha) : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [appt?.id]); // eslint-disable-line

  const PURPOSE_LABEL = { CAREMGT: 'Care Management', BTG: 'Break the Glass', PUBHLTH: 'Public Health', HPAYMT: 'Healthcare Payment', DSRCH: 'Disease Research' };

  if (!abha) return (
    <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      <Shield size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
      <p style={{ margin: 0 }}>Patient has no ABHA address — link ABHA to request consent.</p>
    </div>
  );

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowModal(true)}
          style={{ padding: '7px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Plus size={13} /> Request Consent
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '16px', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : !consents.length ? (
        <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          <Shield size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0 }}>No consent requests yet</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 12px' }}>
          {consents.map((c, i) => {
            const st = STATUS_CFG_C[c.status] || STATUS_CFG_C.REQUESTED;
            const hiTypes = Array.isArray(c.hi_types) ? c.hi_types : (c.hi_types ? JSON.parse(c.hi_types) : []);
            return (
              <div key={c.request_id || i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b' }}>{PURPOSE_LABEL[c.purpose] || c.purpose}</div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 5 }}>
                  ID: {c.request_id?.slice(0, 20)}…
                </div>
                {hiTypes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {hiTypes.map(t => (
                      <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#f1f5f9', color: '#475569' }}>{t}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5 }}>
                  {c.created_at ? fmtDate(c.created_at) : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ConsentRequestModal abha={abha} hipId={hipId} onClose={() => setShowModal(false)} onSent={load} />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PatientContextPanel({ appt, onClose, rightOffset = 0, minimized = false, onMinimize = () => {} }) {
  const [activeTab,  setActiveTab]  = useState('history');
  const [history,    setHistory]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [labReports, setLabReports] = useState([]);
  const [labLoading, setLabLoading] = useState(false);

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

  // Fetch lab results when tab is opened or appt changes
  useEffect(() => {
    if (activeTab !== 'lab-tests' || !appt) return;
    const uhid  = appt.uhid;
    const emrId = appt.emr_patient_id || appt.id;
    if (!uhid && !emrId) return;
    setLabLoading(true);
    const params = uhid ? `?uhid=${encodeURIComponent(uhid)}` : '';
    fetch(`/api/emr/patients/${emrId}/lab-reports${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('emr_token')}` },
    })
      .then(r => r.json())
      .then(d => setLabReports(Array.isArray(d) ? d : []))
      .catch(() => setLabReports([]))
      .finally(() => setLabLoading(false));
  }, [activeTab, appt?.id, appt?.uhid]); // eslint-disable-line

  const age     = appt?.patient_dob
    ? Math.floor((Date.now() - new Date(appt.patient_dob)) / (365.25 * 24 * 60 * 60 * 1000))
    : appt?.patient_age;
  const initials = (appt?.patient_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div
      className={[s.panel, minimized ? s.panelMinimized : ''].filter(Boolean).join(' ')}
      style={{ right: rightOffset }}
    >

      {/* Minimized tab strip — click to restore */}
      {minimized && (
        <button className={s.minTab} onClick={() => onMinimize(false)}>
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
        <button className={s.headerBtn} onClick={() => onMinimize(true)} title="Minimize"><Minimize2 size={13} /></button>
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
        {activeTab === 'history'      && <HistoryTab      history={history}    loading={loading}    />}
        {activeTab === 'vitals'       && <VitalsTab       history={history}    loading={loading}    />}
        {activeTab === 'records'      && <RecordsTab      history={history}    loading={loading}    />}
        {activeTab === 'lab-tests'    && <LabTestsTab     reports={labReports} loading={labLoading} appt={appt} />}
        {activeTab === 'vaccinations' && <VaccinationsTab history={history}    loading={loading}    />}
        {activeTab === 'consents'     && <ConsentsTab     appt={appt} />}
      </div>}
    </div>
  );
}
