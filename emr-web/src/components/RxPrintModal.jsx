import { useState, useEffect } from 'react';
import { X, Printer, QrCode, Settings2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getICD10Settings } from '../pages/settings/InferPadSettings';
import styles from './RxPrintModal.module.css';

// ── helpers ───────────────────────────────────────────────────────────────────
const VLABEL = {
  bp_systolic:'BP SYSTOLIC', bp_diastolic:'BP DIASTOLIC', pulse:'PULSE',
  spo2:'SPO2', temp:'TEMPERATURE', respiratory_rate:'RESPIRATORY RATE',
  weight:'WEIGHT', height:'HEIGHT', bmi:'BMI',
};
const VUNIT = {
  bp_systolic:'mmHg', bp_diastolic:'mmHg', pulse:'bpm', spo2:'%',
  temp:'°C', respiratory_rate:'/min', weight:'kg', height:'cm', bmi:'kg/m²',
};
const MED_LABELS = {
  diabetes:'Diabetes', hypertension:'Hypertension', hypothyroidism:'Hypothyroidism',
  alcohol:'Alcohol', tobacco:'Tobacco', smoking:'Smoking',
};
function medLabel(h) {
  const label = MED_LABELS[h.key] || h.label || h.condition || h.key || '?';
  const meta  = [h.since, h.frequency].filter(Boolean).join(' · ');
  return { label, meta };
}
function getFlag(r) {
  if (!r.result || !r.range) return '';
  const val = parseFloat(r.result);
  const [lo, hi] = r.range.split('-').map(Number);
  if (isNaN(val) || isNaN(lo) || isNaN(hi)) return '';
  return val > hi ? 'High' : val < lo ? 'Low' : '';
}

// ── Prescription document ─────────────────────────────────────────────────────
function RxDoc({ data, user, dietCharts = [], qrUrl = null, hidePhone = false }) {
  const cid      = user?.clinic_id || 'default';
  const icd10    = getICD10Settings(cid);
  const headerImg = localStorage.getItem(`rx_header_${cid}`) || '';
  const footerImg = localStorage.getItem(`rx_footer_${cid}`) || '';

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr  = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const todayFmt = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

  const gender = data.patient_gender === 'M' ? 'Male' : data.patient_gender === 'F' ? 'Female' : (data.patient_gender || '');
  const age    = data.patient_age ? `${data.patient_age} year(s)` : '';

  const vitalsStr   = Object.entries(data.vitals || {}).filter(([k,v]) => v && VLABEL[k]).map(([k,v]) => `${VLABEL[k]}-${v}${VUNIT[k]||''}`).join(' | ');
  const histStr     = (data.medical_history||[]).map(h => { const {label,meta}=medLabel(h); const p=['Status: Active']; if(h.since) p.push(`Since: ${h.since}`); else if(meta) p.push(meta); return `${label} (${p.join(', ')})`;}).join(', ');
  const sympStr     = (data.symptoms||[]).map(s => { const name=typeof s==='string'?s:s.name; const code=icd10.print&&typeof s==='object'&&s.code?` [${s.code}]`:''; const mp=[s.since&&`Since: ${s.since}`,s.severity&&`Severity: ${s.severity}`].filter(Boolean); return `${name}${code}${mp.length?` (${mp.join(' | ')})`:''}`;}).join(', ');
  const diagStr     = (data.diagnosis||[]).map(d => { const code=icd10.print&&d.code?` [${d.code}]`:''; const mp=[d.since&&`Since: ${d.since}`,d.severity&&`Severity: ${d.severity}`].filter(Boolean); return `${d.display}${code}${mp.length?` (${mp.join(' | ')})`:''}`;}).join(', ');
  const labInvLines = (data.lab_investigations||[]).map(l => typeof l==='string'?l:`${l.test} (On: ${todayFmt}${l.repeat_on?` | Repeat: ${l.repeat_on}`:''}${l.remarks?` Remark: ${l.remarks}`:''})` );
  const labResLines = (data.lab_results||[]).map(r => { const f=getFlag(r); return `${r.test}: ${r.result}${r.unit?' '+r.unit:''}${f?` [${f}]`:''} - ${todayFmt}`;});
  const followupStr = data.next_visit_date ? `Visit on ${new Date(data.next_visit_date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'})}` : '';
  const procsStr    = (data.procedures||[]).map(p=>`${p} - ${todayFmt}`).join(', ');

  const Row = ({ label, value }) => (
    <div className={styles.inlineRow}>
      <span className={styles.inlineLabel}>{label} :&nbsp;</span>
      <span className={styles.inlineValue}>{value}</span>
    </div>
  );

  return (
    <div className={styles.rxPaper} id="rx-print-modal-area">
      {headerImg
        ? <div className={styles.imgBlock}><img src={headerImg} alt="Header" className={styles.paperImg} /></div>
        : (
          <div className={styles.paperHeader}>
            <div className={styles.clinicName}>{user?.clinic_name || 'Clinic'}</div>
            {user?.clinic_address && <div className={styles.clinicAddr}>{user.clinic_address}</div>}
          </div>
        )
      }

      <div className={styles.patientRow}>
        <div>
          <span className={styles.patientName}>{data.patient_name || '—'}</span>
          {(gender||age) && <span className={styles.patientMeta}>, {[gender,age].filter(Boolean).join(', ')},</span>}
          {data.uhid && <div className={styles.uhid}>UHID : {data.uhid}.</div>}
        </div>
        <div className={styles.dateTime}>{dateStr}</div>
      </div>
      <hr className={styles.hr} />

      <div className={styles.rxBody}>
        {vitalsStr   && <Row label="VITALS"                  value={vitalsStr} />}
        {histStr     && <Row label="PATIENT MEDICAL HISTORY" value={histStr} />}
        {sympStr     && <Row label="SYMPTOMS"                value={sympStr} />}
        {diagStr     && <Row label="DIAGNOSIS"               value={diagStr} />}

        {(data.medications||[]).length > 0 && (
          <div className={styles.medSection}>
            <div className={styles.prescHeading}>
              <span className={styles.prescLine} />PRESCRIPTION<span className={styles.prescLine} />
            </div>
            <table className={styles.medTable}>
              <thead><tr><th>#</th><th>Medications</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Remarks</th></tr></thead>
              <tbody>
                {(data.medications||[]).map((m,i) => (
                  <tr key={i}>
                    <td className={styles.medNum}>{i+1}</td>
                    <td><strong>{m.name}</strong>{m.timing&&<div className={styles.medSub}>{m.timing}</div>}</td>
                    <td>{m.dose||m.dosage}</td>
                    <td>{m.frequency}</td>
                    <td>{m.duration}{m.start_from&&<div className={styles.medSub}>(From {m.start_from})</div>}</td>
                    <td>{m.instructions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {labInvLines.length>0 && <div className={styles.inlineRow}><span className={styles.inlineLabel}>PRESCRIBED LAB TESTS :&nbsp;</span><span className={styles.inlineValue}>{labInvLines.map((l,i)=><div key={i}>{l}</div>)}</span></div>}
        {labResLines.length>0 && <div className={styles.inlineRow}><span className={styles.inlineLabel}>INVESTIGATIVE READINGS :&nbsp;</span><span className={styles.inlineValue}>{labResLines.map((l,i)=><div key={i}>{l}</div>)}</span></div>}
        {data.examination_findings && <Row label="EXAMINATION FINDINGS" value={data.examination_findings} />}
        {data.notes    && <Row label="NOTES"       value={data.notes} />}
        {data.advices  && <Row label="ADVICES"     value={data.advices} />}
        {data.refer_to && <Row label="REFERRED TO" value={data.refer_to} />}
        {(followupStr||data.next_visit_notes) && <Row label="FOLLOWUP" value={[followupStr,data.next_visit_notes].filter(Boolean).join(' · ')} />}
        {procsStr && <Row label="PROCEDURES" value={procsStr} />}
        {(data.custom_sections||[]).filter(s=>s.content).map(s=><Row key={s.id} label={(s.title||'NOTES').toUpperCase()} value={s.content} />)}
        {data.canvas_image && <div style={{marginTop:8}}><img src={data.canvas_image} alt="Clinical drawing" style={{width:'100%',borderRadius:4,border:'1px solid #e2e8f0'}} /></div>}

        {dietCharts.length > 0 && (
          <div className={styles.dietSection}>
            <div className={styles.prescHeading}>
              <span className={styles.prescLine} />DIET PLAN<span className={styles.prescLine} />
            </div>
            {dietCharts.slice(0, 2).map((chart, ci) => (
              <div key={ci} className={styles.dietChart}>
                <div className={styles.dietChartTitle}>
                  {chart.title}
                  {chart.nutrition_targets?.energy ? ` — ${chart.nutrition_targets.energy} kcal/day` : ''}
                  {chart.duration ? ` · ${chart.duration}` : ''}
                </div>
                {(chart.day_plans?.[0]?.meals || []).map((meal, mi) => (
                  <div key={mi} className={styles.dietMealRow}>
                    <span className={styles.dietMealName}>{meal.name}{meal.time ? ` (${meal.time})` : ''}:</span>
                    <span className={styles.dietMealItems}>
                      {(meal.food_items || []).map(f => `${f.name} ${f.serving_size ? `(${f.serving_size})` : ''}`).join(', ') || '—'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {qrUrl && (
        <div className={styles.qrSection}>
          <QRCodeSVG value={qrUrl} size={80} level="M" includeMargin={false} />
          <div className={styles.qrLabel}>
            <strong>Scan for digital copy</strong>
            <span>View prescription &amp; book appointment</span>
          </div>
        </div>
      )}

      <hr className={styles.hr} />
      {footerImg
        ? <div className={styles.imgBlock}><img src={footerImg} alt="Footer" className={styles.paperImg} /></div>
        : (
          <div className={styles.paperFooter}>
            <span>{user?.clinic_name || 'Clinic'}</span>
            {user?.clinic_address && <span> · {user.clinic_address}</span>}
          </div>
        )
      }
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
const QR_KEY        = 'rx_qr_enabled';
const HIDE_PHONE_KEY = 'rx_print_hide_phone';

export default function RxPrintModal({ appt, onClose }) {
  const { user } = useAuth();
  const [data,        setData]        = useState(null);
  const [dietCharts,  setDietCharts]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [qrEnabled,   setQrEnabled]   = useState(() => localStorage.getItem(QR_KEY) !== 'false');
  const [qrUrl,       setQrUrl]       = useState('');
  const [qrLoading,   setQrLoading]   = useState(false);
  const [hidePhone,   setHidePhone]   = useState(() => localStorage.getItem(HIDE_PHONE_KEY) === 'true');
  const [showSettings,setShowSettings]= useState(false);

  useEffect(() => {
    api.get(`/appointments/${appt.id}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    if (appt.patient_mobile) {
      api.get(`/diet/charts?patient_mobile=${appt.patient_mobile}`)
        .then(setDietCharts).catch(() => {});
    }
  }, [appt.id, appt.patient_mobile]);

  // Fetch QR token when QR is enabled and data is loaded
  useEffect(() => {
    if (!qrEnabled || !data?.encounter_id) { setQrUrl(''); return; }
    setQrLoading(true);
    api.get(`/appointments/${appt.id}/rx-token`)
      .then(r => setQrUrl(r.url || ''))
      .catch(() => setQrUrl(''))
      .finally(() => setQrLoading(false));
  }, [qrEnabled, data?.encounter_id, appt.id]);

  const toggleQr = () => {
    const next = !qrEnabled;
    setQrEnabled(next);
    localStorage.setItem(QR_KEY, String(next));
  };

  const toggleHidePhone = () => {
    const next = !hidePhone;
    setHidePhone(next);
    localStorage.setItem(HIDE_PHONE_KEY, String(next));
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Prescription — {appt.patient_name}</span>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div style={{ position:'relative' }}>
              <button
                className={`${styles.qrToggleBtn} ${showSettings ? styles.qrToggleBtnOn : ''}`}
                onClick={() => setShowSettings(v => !v)}
                title="Print settings"
              >
                <Settings2 size={13} strokeWidth={2} />
                Settings
              </button>
              {showSettings && (
                <div className={styles.printSettingsPanel}>
                  <label className={styles.printSettingRow}>
                    <input type="checkbox" checked={qrEnabled} onChange={toggleQr} />
                    <QrCode size={12} strokeWidth={2} /> Add QR code
                  </label>
                  <label className={styles.printSettingRow}>
                    <input type="checkbox" checked={!hidePhone} onChange={toggleHidePhone} />
                    Show patient mobile
                  </label>
                </div>
              )}
            </div>
            <button className={styles.printBtn} onClick={() => window.print()} disabled={loading}>
              <Printer size={13} strokeWidth={2} /> Print
            </button>
            <button className={styles.closeBtn} onClick={onClose}><X size={15} /></button>
          </div>
        </div>
        <div className={styles.body}>
          {loading && <div className={styles.empty}>Loading prescription…</div>}
          {!loading && !data?.encounter_id && <div className={styles.empty}>No prescription found for this appointment.</div>}
          {!loading && data?.encounter_id && (
            <RxDoc
              data={data}
              user={user}
              dietCharts={dietCharts}
              qrUrl={qrEnabled && !qrLoading ? qrUrl : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
