// Shared prescription extras rendered by RxDocumentBody (InferPad preview, Print, Download and
// the queue's print modal): vitals trend graphs, diet plan and the QR code for the digital copy.
// Moved here from RxPrintModal so every prescription view renders the same content.
import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import styles from './RxExtras.module.css';

// Print settings shared by every view (toggled in the print settings menu)
export const QR_KEY            = 'rx_qr_enabled';
export const HIDE_PHONE_KEY    = 'rx_print_hide_phone';
export const SHOW_VITALS_GRAPH = 'rx_vitals_graph';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const getRxPrintPrefs = () => ({
  qr:          lsGet(QR_KEY) !== 'false',
  hidePhone:   lsGet(HIDE_PHONE_KEY) === 'true',
  vitalsGraph: lsGet(SHOW_VITALS_GRAPH) !== 'false',
});


// ── Vitals SVG Line Chart (print-safe — no canvas) ───────────────────────────
function VitalsLineChart({ title, yAxisLabel = 'Value', series, xLabels }) {
  // series: [{ label, color, dashArray?, values: [number|null] }]
  const W = 420, H = 170;
  const PAD = { top: 28, right: 16, bottom: 34, left: 46 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n = xLabels.length;

  const allVals = series.flatMap(s => s.values).filter(v => v != null && !isNaN(v));
  if (allVals.length < 2) return null;

  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const range  = rawMax - rawMin || 10;
  const yMin   = Math.floor((rawMin - range * 0.15) / 5) * 5;
  const yMax   = Math.ceil((rawMax  + range * 0.15) / 5) * 5;

  const xOf = i => PAD.left + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yOf = v => PAD.top  + cH - ((v - yMin) / (yMax - yMin)) * cH;

  // Y-axis grid ticks (4 lines)
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + Math.round(((yMax - yMin) / 4) * i));

  const pathFor = (values) => {
    let d = '';
    values.forEach((v, i) => {
      if (v == null || isNaN(v)) return;
      d += `${d === '' ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)} `;
    });
    return d.trim();
  };

  return (
    <div style={{ margin: '10px 0', pageBreakInside: 'avoid' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textAlign: 'center', marginBottom: 2, letterSpacing: 0.5 }}>
        {title}
      </div>
      <svg
        width={W} height={H}
        style={{ display: 'block', margin: '0 auto', fontFamily: 'Times New Roman, serif' }}
        viewBox={`0 0 ${W} ${H}`}
      >
        {/* Chart border */}
        <rect x={PAD.left} y={PAD.top} width={cW} height={cH}
          fill="#fff" stroke="#cbd5e1" strokeWidth={0.8} />

        {/* Y-axis gridlines + labels */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} y1={yOf(t)} x2={PAD.left + cW} y2={yOf(t)}
              stroke="#e2e8f0" strokeWidth={0.6} strokeDasharray="3,2" />
            <text x={PAD.left - 4} y={yOf(t) + 3.5} textAnchor="end"
              fontSize={8} fill="#64748b">{t}</text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((lbl, i) => (
          <text key={i} x={xOf(i)} y={PAD.top + cH + 12}
            textAnchor="middle" fontSize={8} fill="#475569">{lbl}</text>
        ))}

        {/* Y-axis title */}
        <text
          x={12} y={PAD.top + cH / 2}
          textAnchor="middle" fontSize={8} fill="#64748b"
          transform={`rotate(-90, 12, ${PAD.top + cH / 2})`}
        >{yAxisLabel}</text>

        {/* X-axis title */}
        <text x={PAD.left + cW / 2} y={H - 4}
          textAnchor="middle" fontSize={8} fill="#64748b">Observations</text>

        {/* Lines */}
        {series.map(s => (
          <path key={s.label} d={pathFor(s.values)}
            fill="none" stroke={s.color} strokeWidth={1.6}
            strokeDasharray={s.dashArray || ''}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Data points + value labels */}
        {series.map(s =>
          s.values.map((v, i) => {
            if (v == null || isNaN(v)) return null;
            const x = xOf(i), y = yOf(v);
            const isTop = s === series[0];
            return (
              <g key={`${s.label}-${i}`}>
                <circle cx={x} cy={y} r={3} fill={s.color} stroke="#fff" strokeWidth={0.8} />
                <text x={x} y={isTop ? y - 5 : y + 11}
                  textAnchor="middle" fontSize={7.5} fill={s.color} fontWeight="600">
                  {v}
                </text>
              </g>
            );
          })
        )}

        {/* Legend */}
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(${PAD.left + cW - (series.length - i) * 90 + 10}, ${PAD.top - 14})`}>
            <line x1={0} y1={5} x2={16} y2={5} stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashArray || ''} />
            <circle cx={8} cy={5} r={2.5} fill={s.color} />
            <text x={20} y={8.5} fontSize={8} fill="#334155">{s.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// Build chart series from patient visit history
function buildChartData(history, currentVitals, currentLabResults) {
  // Take last 6 visits (oldest → newest) including current
  const visits = [...history].reverse().slice(-5); // up to 5 past
  const labels = [];
  const bpSys  = [], bpDia = [], pulse = [], weight = [], glucose = [];

  const extractGlucose = (labResults) => {
    if (!labResults?.length) return null;
    const g = labResults.find(r =>
      /fasting|glucose|fbg|rbs|ppbs|sugar/i.test(r.test || '')
    );
    return g ? parseFloat(g.result) : null;
  };

  visits.forEach((v, i) => {
    const vit = v.vitals || {};
    const lr  = v.lab_results || [];
    labels.push(`O${i + 1}`);
    bpSys.push(parseFloat(vit.bp_systolic)  || null);
    bpDia.push(parseFloat(vit.bp_diastolic) || null);
    pulse.push(parseFloat(vit.pulse)         || null);
    weight.push(parseFloat(vit.weight)       || null);
    glucose.push(extractGlucose(lr));
  });

  // Add current visit
  const curLabel = `O${labels.length + 1}`;
  labels.push(curLabel);
  bpSys.push(parseFloat(currentVitals?.bp_systolic)  || null);
  bpDia.push(parseFloat(currentVitals?.bp_diastolic) || null);
  pulse.push(parseFloat(currentVitals?.pulse)         || null);
  weight.push(parseFloat(currentVitals?.weight)       || null);
  glucose.push(extractGlucose(currentLabResults));

  const hasBP     = bpSys.some(v => v)  && bpDia.some(v => v);
  const hasPulse  = pulse.some(v => v)  && pulse.filter(Boolean).length >= 2;
  const hasWeight = weight.some(v => v) && weight.filter(Boolean).length >= 2;
  const hasGluc   = glucose.some(v => v)&& glucose.filter(Boolean).length >= 2;

  return { labels, bpSys, bpDia, pulse, weight, glucose, hasBP, hasPulse, hasWeight, hasGluc };
}

export function VitalsTrend({ history = [], vitals, labResults }) {
  if (!history.length) return null;
  const { labels, bpSys, bpDia, pulse, weight, glucose, hasBP, hasPulse, hasWeight, hasGluc } =
    buildChartData(history, vitals, labResults);
  return (
    <>
      {hasBP && (
        <VitalsLineChart title="Blood Pressure Trend (mmHg)" yAxisLabel="Blood Pressure" xLabels={labels}
          series={[
            { label: 'Systolic BP',  color: '#1d4ed8', values: bpSys },
            { label: 'Diastolic BP', color: '#dc2626', dashArray: '4,2', values: bpDia },
          ]} />
      )}
      {hasGluc && (
        <VitalsLineChart title="Blood Glucose Trend (mg/dL)" yAxisLabel="Glucose (mg/dL)" xLabels={labels}
          series={[{ label: 'Glucose', color: '#7c3aed', values: glucose }]} />
      )}
      {hasPulse && !hasBP && (
        <VitalsLineChart title="Pulse Rate Trend (bpm)" yAxisLabel="Pulse (bpm)" xLabels={labels}
          series={[{ label: 'Pulse', color: '#0891b2', values: pulse }]} />
      )}
      {hasWeight && !hasBP && !hasPulse && (
        <VitalsLineChart title="Weight Trend (kg)" yAxisLabel="Weight (kg)" xLabels={labels}
          series={[{ label: 'Weight', color: '#059669', values: weight }]} />
      )}
    </>
  );
}

export function DietPlanBlock({ charts = [] }) {
  if (!charts.length) return null;
  return (
    <div className={styles.dietSection}>
      <div className={styles.prescHeading}>
        <span className={styles.prescLine} />DIET PLAN<span className={styles.prescLine} />
      </div>
      {charts.slice(0, 2).map((chart, ci) => (
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
                {(meal.food_items || []).map(f => `${f.name}${f.serving_size ? ` (${f.serving_size})` : ''}`).join(', ') || '—'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function QrBlock({ url }) {
  if (!url) return null;
  return (
    <div className={styles.qrSection}>
      {url === 'loading'
        ? <div className={styles.qrPlaceholder}>⏳</div>
        : <QRCodeSVG value={url} size={80} level="M" includeMargin={false} />}
      <div className={styles.qrLabel}>
        <strong>Scan for digital copy</strong>
        <span>View prescription &amp; book appointment</span>
      </div>
    </div>
  );
}

/**
 * Loads the extras for one appointment: diet charts and past visits (by patient mobile) and,
 * when enabled and a prescription exists, the QR link. `prefs` comes from getRxPrintPrefs().
 */
export function useRxExtras(appt, { encounterId, prefs }) {
  const [dietCharts,    setDietCharts]    = useState([]);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [qrUrl,         setQrUrl]         = useState('');
  const apptId = appt?.id;
  const mobile = appt?.patient_mobile;

  useEffect(() => {
    if (!mobile) { setDietCharts([]); setVitalsHistory([]); return; }
    let alive = true;
    api.get(`/diet/charts?patient_mobile=${encodeURIComponent(mobile)}`)
      .then(d => { if (alive) setDietCharts(Array.isArray(d) ? d : []); }).catch(() => {});
    api.get(`/patients/history?mobile=${encodeURIComponent(mobile)}`)
      .then(rows => {
        if (!alive) return;
        // Past visits only, with vitals or lab results
        setVitalsHistory((rows || []).filter(r => r.id !== apptId && (
          (r.vitals && Object.values(r.vitals).some(v => v)) || r.lab_results?.length > 0)));
      }).catch(() => {});
    return () => { alive = false; };
  }, [apptId, mobile]);

  useEffect(() => {
    if (!prefs?.qr || !apptId || !encounterId) { setQrUrl(''); return; }
    let alive = true;
    setQrUrl('loading');
    api.get(`/appointments/${apptId}/rx-token`)
      .then(r => { if (alive) setQrUrl(r.url || ''); })
      .catch(() => { if (alive) setQrUrl(''); });
    return () => { alive = false; };
  }, [prefs?.qr, apptId, encounterId]);

  return {
    dietCharts,
    vitalsHistory: prefs?.vitalsGraph ? vitalsHistory : [],
    qrUrl: prefs?.qr ? qrUrl : '',
  };
}

/**
 * Header/footer/signature images for the prescription.
 * Header/footer: the clinic's server copy (saved by Configure InferPad) first, so every device
 * shows the same letterhead; this browser's copy only if the server has none or is unreachable.
 * Signature: this doctor's browser copy first (it's per user), then the clinic's server copy.
 * Re-reads (and re-fetches the server copy) whenever InferPad settings fire a 'storage' event.
 */
export function useRxImages(user) {
  const cid = user?.clinic_id || 'default';
  const uid = user?.id || 'default';
  const [server, setServer] = useState(null);
  const read = (srv) => ({
    headerImg:        srv?.rx_header_img || lsGet(`rx_header_${cid}`) || '',
    footerImg:        srv?.rx_footer_img || lsGet(`rx_footer_${cid}`) || '',
    googleReviewLink: lsGet(`rx_google_review_${cid}`) || '',
    signatureImg:     lsGet(`rx_sig_${uid}_${cid}`) || srv?.rx_signature || '',
  });
  const [images, setImages] = useState(() => read(null));

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const fetchServer = () => api.get('/settings/clinic-assets')
      .then(a => { if (alive) setServer(a || {}); })
      .catch(() => { if (alive) setImages(read(null)); });
    fetchServer();
    window.addEventListener('storage', fetchServer);
    return () => { alive = false; window.removeEventListener('storage', fetchServer); };
  }, [user?.clinic_id, user?.id]);

  useEffect(() => { setImages(read(server)); }, [server, cid, uid]);

  return images;
}
