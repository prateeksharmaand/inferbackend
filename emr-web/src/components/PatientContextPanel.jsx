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

// ── FHIR Bundle Reader ────────────────────────────────────────────────────────
function FhirBundleReader({ content }) {
  let bundle = null;
  try {
    if (typeof content !== 'string') { bundle = content; }
    else {
      // content is stored as base64-encoded FHIR JSON
      try { bundle = JSON.parse(atob(content)); }
      catch { bundle = JSON.parse(content); } // fallback: already plain JSON
    }
  } catch { return <p style={{ fontSize: 11, color: '#ef4444' }}>Could not parse health record content.</p>; }
  if (!bundle) return null;

  // Collect all entries from bundle or nested bundles
  const entries = [];
  const collectEntries = (b) => {
    if (!b) return;
    if (b.resourceType === 'Bundle' && Array.isArray(b.entry)) {
      b.entry.forEach(e => { if (e.resource) collectEntries(e.resource); });
    } else {
      entries.push(b);
    }
  };
  collectEntries(bundle);

  const byType = {};
  entries.forEach(r => { if (r.resourceType) { (byType[r.resourceType] = byType[r.resourceType] || []).push(r); } });

  const Section = ({ title, color = '#7c3aed', children }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, paddingBottom: 3, borderBottom: `1px solid ${color}22` }}>{title}</div>
      {children}
    </div>
  );
  const Row = ({ label, value }) => value ? (
    <div style={{ display: 'flex', gap: 6, fontSize: 11, marginBottom: 3 }}>
      <span style={{ color: '#94a3b8', minWidth: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#1e293b', fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
    </div>
  ) : null;

  const fmtName = (n) => {
    if (!n) return '';
    if (typeof n === 'string') return n;
    if (Array.isArray(n)) n = n[0];
    return [n.prefix, n.given?.join(' '), n.family].filter(Boolean).join(' ');
  };
  const fmtCode = (c) => c?.text || c?.coding?.[0]?.display || c?.coding?.[0]?.code || '';
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const fmtVal  = (v) => { if (!v) return ''; if (typeof v === 'object') { if (v.value !== undefined) return `${v.value}${v.unit ? ' ' + v.unit : ''}`; if (v.text) return v.text; } return String(v); };

  const sections = [];

  // Composition (document title/summary)
  if (byType.Composition) {
    byType.Composition.forEach(r => {
      sections.push(
        <Section key={r.id} title={r.title || 'Document'} color="#6366f1">
          <Row label="Type" value={fmtCode(r.type)} />
          <Row label="Date" value={fmtDate(r.date)} />
          <Row label="Status" value={r.status} />
          {r.section?.map((s, i) => s.title && <Row key={i} label={s.title} value={s.text?.div?.replace(/<[^>]+>/g, ' ').trim().slice(0, 200)} />)}
        </Section>
      );
    });
  }

  // Patient
  if (byType.Patient) {
    byType.Patient.forEach(r => {
      sections.push(
        <Section key={r.id} title="Patient" color="#0891b2">
          <Row label="Name"   value={fmtName(r.name)} />
          <Row label="DOB"    value={fmtDate(r.birthDate)} />
          <Row label="Gender" value={r.gender} />
          <Row label="Phone"  value={r.telecom?.find(t => t.system === 'phone')?.value} />
        </Section>
      );
    });
  }

  // Encounter
  if (byType.Encounter) {
    byType.Encounter.forEach(r => {
      sections.push(
        <Section key={r.id} title="Encounter" color="#0284c7">
          <Row label="Type"    value={r.type?.map(fmtCode).join(', ')} />
          <Row label="Class"   value={r.class?.display || r.class?.code} />
          <Row label="Status"  value={r.status} />
          <Row label="Start"   value={fmtDate(r.period?.start)} />
          <Row label="End"     value={fmtDate(r.period?.end)} />
        </Section>
      );
    });
  }

  // Conditions / Diagnoses
  if (byType.Condition) {
    sections.push(
      <Section key="cond" title="Diagnoses / Conditions" color="#dc2626">
        {byType.Condition.map((r, i) => (
          <div key={i} style={{ marginBottom: 4, padding: '5px 8px', background: '#fef2f2', borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{fmtCode(r.code) || 'Condition'}</div>
            <Row label="Status"   value={r.clinicalStatus?.coding?.[0]?.code} />
            <Row label="Onset"    value={fmtDate(r.onsetDateTime || r.onsetPeriod?.start)} />
            <Row label="Note"     value={r.note?.[0]?.text} />
          </div>
        ))}
      </Section>
    );
  }

  // MedicationRequest / Prescriptions
  if (byType.MedicationRequest) {
    sections.push(
      <Section key="med" title="Medications / Prescriptions" color="#7c3aed">
        {byType.MedicationRequest.map((r, i) => (
          <div key={i} style={{ marginBottom: 4, padding: '5px 8px', background: '#faf5ff', borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>
              {fmtCode(r.medicationCodeableConcept) || r.medicationReference?.display || 'Medication'}
            </div>
            <Row label="Dosage"    value={r.dosageInstruction?.[0]?.text} />
            <Row label="Frequency" value={r.dosageInstruction?.[0]?.timing?.code?.text} />
            <Row label="Duration"  value={r.dosageInstruction?.[0]?.timing?.repeat?.boundsDuration ? `${r.dosageInstruction[0].timing.repeat.boundsDuration.value} ${r.dosageInstruction[0].timing.repeat.boundsDuration.unit}` : ''} />
            <Row label="Status"    value={r.status} />
          </div>
        ))}
      </Section>
    );
  }

  // Observations (vitals/labs)
  if (byType.Observation) {
    sections.push(
      <Section key="obs" title="Observations / Vitals" color="#d97706">
        {byType.Observation.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ color: '#475569' }}>{fmtCode(r.code)}</span>
            <span style={{ fontWeight: 600, color: '#1e293b' }}>
              {fmtVal(r.valueQuantity || r.valueString || r.valueCodeableConcept)}
              {r.interpretation?.[0] && <span style={{ marginLeft: 4, fontSize: 10, color: r.interpretation[0].coding?.[0]?.code === 'H' ? '#dc2626' : '#16a34a' }}>({r.interpretation[0].coding?.[0]?.code})</span>}
            </span>
          </div>
        ))}
      </Section>
    );
  }

  // DiagnosticReport
  if (byType.DiagnosticReport) {
    sections.push(
      <Section key="dr" title="Diagnostic Reports" color="#0891b2">
        {byType.DiagnosticReport.map((r, i) => (
          <div key={i} style={{ marginBottom: 4, padding: '5px 8px', background: '#f0f9ff', borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{fmtCode(r.code) || 'Report'}</div>
            <Row label="Status"     value={r.status} />
            <Row label="Date"       value={fmtDate(r.effectiveDateTime)} />
            <Row label="Conclusion" value={r.conclusion} />
          </div>
        ))}
      </Section>
    );
  }

  // AllergyIntolerance
  if (byType.AllergyIntolerance) {
    sections.push(
      <Section key="allergy" title="Allergies" color="#b45309">
        {byType.AllergyIntolerance.map((r, i) => (
          <div key={i} style={{ fontSize: 11, padding: '3px 0' }}>
            <span style={{ fontWeight: 600 }}>{fmtCode(r.code)}</span>
            {r.reaction?.[0]?.manifestation?.map(m => ` → ${fmtCode(m)}`).join('')}
          </div>
        ))}
      </Section>
    );
  }

  // Immunization
  if (byType.Immunization) {
    sections.push(
      <Section key="imm" title="Immunizations" color="#16a34a">
        {byType.Immunization.map((r, i) => (
          <div key={i} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
            <span>{fmtCode(r.vaccineCode)}</span>
            <span style={{ color: '#94a3b8' }}>{fmtDate(r.occurrenceDateTime)}</span>
          </div>
        ))}
      </Section>
    );
  }

  // DocumentReference
  if (byType.DocumentReference) {
    sections.push(
      <Section key="docref" title="Documents" color="#475569">
        {byType.DocumentReference.map((r, i) => (
          <div key={i} style={{ fontSize: 11, marginBottom: 3 }}>
            <div style={{ fontWeight: 600 }}>{r.type?.text || fmtCode(r.type) || 'Document'}</div>
            <Row label="Date" value={fmtDate(r.date)} />
            {r.content?.[0]?.attachment?.url && (
              <a href={r.content[0].attachment.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#7c3aed' }}>View attachment ↗</a>
            )}
          </div>
        ))}
      </Section>
    );
  }

  if (!sections.length) {
    return <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>No readable content found in this bundle.</p>;
  }

  return <div>{sections}</div>;
}

function RecordDetailModal({ record, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', position: 'relative' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{record.hi_type || 'Health Record'}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{record.care_context_reference} · {record.received_at ? fmtDate(record.received_at) : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
        </div>
        {/* FHIR content */}
        <div style={{ padding: '16px 20px' }}>
          {record.content
            ? <FhirBundleReader content={record.content} />
            : <p style={{ color: '#94a3b8', fontSize: 13 }}>No content available for this record.</p>
          }
        </div>
      </div>
    </div>
  );
}

function ConsentCard({ c, onFetched, abha }) {
  const [fetching,     setFetching]     = useState(false);
  const [records,      setRecords]      = useState(null);
  const [expanded,     setExpanded]     = useState(false);
  const [selectedRec,  setSelectedRec]  = useState(null);
  const [dataSource,   setDataSource]   = useState(null);

  const st = STATUS_CFG_C[c.status] || STATUS_CFG_C.REQUESTED;
  const PURPOSE_LABEL = { CAREMGT: 'Care Management', BTG: 'Break the Glass', PUBHLTH: 'Public Health', HPAYMT: 'Healthcare Payment', DSRCH: 'Disease Research' };
  const isGranted = c.status === 'GRANTED';

  const fetchRecords = async () => {
    setFetching(true);
    try {
      const pullRes = await api.post(`/consents/${c.request_id}/pull-data`);
      if (pullRes.source === 'abdm_pending') {
        // Keep records=null so the button stays as "Fetch Medical Records"
        // allowing the user to click again once ABDM delivers
        toast.success('Request sent to ABDM — click "Fetch Medical Records" again in a moment to load records');
        onFetched?.();
        return;
      }
      const abhaParam = abha ? `?abha=${encodeURIComponent(abha)}` : '';
      const recs = await api.get(`/consents/health-records${abhaParam}`);
      // Filter by txnId from pull-data response (authoritative), or fall back to consent's stored txnId.
      // Don't use c.transaction_id alone — it may be stale/null for patient-initiated consents.
      const txnId = pullRes.txnId || c.transaction_id;
      const mine = txnId ? recs.filter(r => r.transaction_id === txnId) : recs;
      setRecords(mine);
      setExpanded(true);
      setDataSource(pullRes.source || 'unknown');
      onFetched?.();
      if (!mine.length) toast.success('Records requested — click again shortly to load records');
    } catch (err) { toast.error(err.message); }
    finally { setFetching(false); }
  };

  const HI_ICON = { OPConsultation: '🩺', Prescription: '💊', DiagnosticReport: '🔬', DischargeSummary: '🏥', ImmunizationRecord: '💉', HealthDocumentRecord: '📄', WellnessRecord: '❤️' };

  return (
    <>
      <div style={{ border: `1.5px solid ${isGranted ? '#86efac' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 12px', background: isGranted ? '#f0fdf4' : '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b' }}>{PURPOSE_LABEL[c.purpose] || c.purpose}</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 4 }}>{c.request_id?.slice(0, 24)}…</div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: isGranted ? 8 : 0 }}>{c.created_at ? fmtDate(c.created_at) : ''}</div>

        {isGranted && (
          <>
            <button onClick={records ? () => setExpanded(e => !e) : fetchRecords} disabled={fetching}
              style={{ width: '100%', padding: '6px', borderRadius: 7, border: 'none', background: fetching ? '#d1fae5' : '#16a34a', color: '#fff', fontWeight: 600, fontSize: 11, cursor: fetching ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              {fetching ? 'Fetching…' : records ? (expanded ? '▲ Hide Records' : `▼ View Records (${records.length})`) : '↓ Fetch Medical Records'}
            </button>
            {dataSource && (
              <div style={{ fontSize: 9, color: dataSource === 'abdm' ? '#16a34a' : dataSource === 'local_emr' ? '#d97706' : '#94a3b8', textAlign: 'center', marginTop: 3 }}>
                {dataSource === 'abdm' && '✓ Delivered by ABDM'}
                {dataSource === 'local_emr' && '⚠ Local EMR data (sandbox mode)'}
                {dataSource === 'abdm_pending' && '⏳ Waiting for HIP to deliver'}
              </div>
            )}
          </>
        )}

        {expanded && records && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!records.length ? (
              <p style={{ margin: 0, fontSize: 11, color: '#64748b', textAlign: 'center', padding: '8px 0' }}>
                Records are being delivered by ABDM — check back in a moment.
              </p>
            ) : records.map((r, i) => (
              <button key={i} onClick={() => setSelectedRec(r)}
                style={{ width: '100%', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#7c3aed'}
                onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 14 }}>{HI_ICON[r.hi_type] || '📋'}</span>
                  <span style={{ fontWeight: 600, fontSize: 11, color: '#1e293b' }}>{r.hi_type || 'Health Record'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>Tap to view →</span>
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>{r.care_context_reference || ''}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{r.received_at ? fmtDate(r.received_at) : ''}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedRec && <RecordDetailModal record={selectedRec} onClose={() => setSelectedRec(null)} />}
    </>
  );
}

function ConsentsTab({ appt, patientAbhaAddress }) {
  const abha  = patientAbhaAddress || appt?.patient_abha || '';
  const hipId = import.meta.env.VITE_ABDM_HIP_ID || 'noushealthhip';
  const [consents,  setConsents]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = () => {
    api.get('/consents').then(rows => {
      setConsents(abha ? rows.filter(r => r.patient_abha === abha) : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  // Initial load + poll every 8s while any consent is REQUESTED
  useEffect(() => {
    setLoading(true);
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [appt?.id, abha]); // eslint-disable-line

  if (!abha) return (
    <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      <Shield size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
      <p style={{ margin: 0 }}>Patient has no ABHA address — link ABHA to request consent.</p>
    </div>
  );

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ padding: '0 12px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {consents.some(c => c.status === 'REQUESTED') && '⏳ Waiting for patient…'}
        </span>
        <button onClick={() => setShowModal(true)}
          style={{ padding: '6px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={12} /> Request
        </button>
      </div>

      {loading && !consents.length ? (
        <div style={{ padding: '16px', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : !consents.length ? (
        <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          <Shield size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0 }}>No consent requests yet</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 12px' }}>
          {consents.map((c, i) => <ConsentCard key={c.request_id || i} c={c} onFetched={load} abha={abha} />)}
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
  const [activeTab,   setActiveTab]   = useState('history');
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [labReports,  setLabReports]  = useState([]);
  const [labLoading,  setLabLoading]  = useState(false);
  const [patientAbhaAddress, setPatientAbhaAddress] = useState('');

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

    // Fetch patient record to get abha_address (patient_abha on appt may be ABHA number)
    if (appt.emr_patient_id) {
      api.get(`/patients/${appt.emr_patient_id}`)
        .then(p => setPatientAbhaAddress(p.abha_address || ''))
        .catch(() => {});
    } else {
      setPatientAbhaAddress('');
    }
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
          {(patientAbhaAddress || appt?.patient_abha) && (
            <div style={{ marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {patientAbhaAddress && (
                <span style={{ fontSize: 10, color: '#7c3aed', fontFamily: 'monospace', fontWeight: 600 }}>
                  {patientAbhaAddress}
                </span>
              )}
              {appt?.patient_abha && !appt.patient_abha.includes('@') && (
                <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                  {appt.patient_abha}
                </span>
              )}
            </div>
          )}
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
        {activeTab === 'consents'     && <ConsentsTab     appt={appt} patientAbhaAddress={patientAbhaAddress} />}
      </div>}
    </div>
  );
}
