import { useState, useRef, useEffect } from 'react';
import { X, ArrowLeft, Printer } from 'lucide-react';
import { getGrowthData, PERCENTILE_LABELS, PERCENTILE_COLORS, calcBMI } from '../data/growthChartData';
import s from './GrowthChart.module.css';

// ── Tell Me More Dialog ───────────────────────────────────────────────────────
function TellMeMoreDialog({ onClose }) {
  const FEATURES = [
    { icon: '📈', title: 'Plot Growth Over Time', desc: 'Track weight, height and BMI against WHO/IAP reference curves for children 0–18 years.' },
    { icon: '🎯', title: 'Percentile Positioning', desc: 'Instantly see where your patient falls — P3 to P97 — compared to peers of the same age and gender.' },
    { icon: '⚠️', title: 'Early Detection', desc: 'Flag undernutrition, overweight, and stunting early by spotting deviations from expected growth curves.' },
    { icon: '📋', title: 'WHO/IAP Standards', desc: 'Charts are based on WHO Child Growth Standards (0–5y) and WHO Growth Reference (5–19y), adopted by IAP.' },
    { icon: '🖨️', title: 'Print Ready', desc: 'Print the growth chart directly from the prescription workflow to share with parents.' },
  ];

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.tellModal}>
        <button className={s.tellClose} onClick={onClose}><X size={16} /></button>
        <div className={s.tellHeader}>
          <div className={s.tellOrb} />
          <div>
            <h2 className={s.tellTitle}>Growth Chart [WHO/IAP]</h2>
            <p className={s.tellSub}>Evidence-based pediatric growth monitoring</p>
          </div>
        </div>
        <div className={s.tellFeatures}>
          {FEATURES.map((f, i) => (
            <div key={i} className={s.tellFeature} style={{ animationDelay: `${i * 0.1}s` }}>
              <span className={s.tellFeatureIcon}>{f.icon}</span>
              <div>
                <div className={s.tellFeatureTitle}>{f.title}</div>
                <div className={s.tellFeatureDesc}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <button className={s.tellBtn} onClick={onClose}>Got it!</button>
      </div>
    </div>
  );
}

// ── SVG Chart ─────────────────────────────────────────────────────────────────
function GrowthChartSVG({ type, gender, ageMonths, patientValue }) {
  const data = getGrowthData(type, gender);
  if (!data.length) return null;

  const W = 640, H = 400;
  const PAD = { top: 20, right: 55, bottom: 40, left: 50 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;

  const ages  = data.map(d => d[0]);
  const minAge = ages[0], maxAge = ages[ages.length - 1];

  // Collect all values to determine Y range
  const allVals = data.flatMap(d => d.slice(1));
  const minVal = Math.floor(Math.min(...allVals) * 0.95);
  const maxVal = Math.ceil(Math.max(...allVals) * 1.02);

  const xScale = age  => PAD.left + ((age - minAge) / (maxAge - minAge)) * cW;
  const yScale = val  => PAD.top  + cH - ((val - minVal) / (maxVal - minVal)) * cH;

  // Build percentile paths
  const percentilePaths = PERCENTILE_LABELS.map((label, pi) => {
    const pts = data.map(d => `${xScale(d[0]).toFixed(1)},${yScale(d[pi + 1]).toFixed(1)}`).join(' ');
    return { label, color: PERCENTILE_COLORS[label], pts };
  });

  // Patient dot
  let dot = null;
  if (ageMonths && patientValue) {
    const px = xScale(Math.min(maxAge, Math.max(minAge, ageMonths)));
    const py = yScale(Math.min(maxVal, Math.max(minVal, patientValue)));
    dot = { x: px, y: py };
  }

  // X axis ticks (years)
  const xTicks = [];
  for (let m = minAge; m <= maxAge; m += 12) xTicks.push(m);

  // Y axis ticks
  const yTicks = [];
  const step = Math.ceil((maxVal - minVal) / 7);
  for (let v = minVal; v <= maxVal; v += step) yTicks.push(v);

  const typeLabel = type === 'weight' ? 'WEIGHT (IN KGS)' : type === 'height' ? 'HEIGHT (IN CMS)' : 'BMI';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.chartSvg}>
      {/* Background */}
      <rect x={PAD.left} y={PAD.top} width={cW} height={cH} fill="#fff" stroke="#e2e8f0" />

      {/* Grid lines */}
      {yTicks.map(v => (
        <line key={v} x1={PAD.left} x2={PAD.left + cW} y1={yScale(v)} y2={yScale(v)} stroke="#f1f5f9" strokeWidth="1" />
      ))}
      {xTicks.map(m => (
        <line key={m} x1={xScale(m)} x2={xScale(m)} y1={PAD.top} y2={PAD.top + cH} stroke="#f1f5f9" strokeWidth="1" />
      ))}

      {/* Percentile curves */}
      {percentilePaths.map(({ label, color, pts }) => (
        <polyline key={label} points={pts} fill="none" stroke={color} strokeWidth={label === 'P50' ? 2 : 1.2} opacity={0.8} />
      ))}

      {/* Percentile labels on right */}
      {percentilePaths.map(({ label, color }) => {
        const last = data[data.length - 1];
        const pi   = PERCENTILE_LABELS.indexOf(label);
        const y    = yScale(last[pi + 1]);
        return (
          <text key={label} x={PAD.left + cW + 3} y={y + 4} fontSize="9" fill={color} fontWeight="600">{label}</text>
        );
      })}

      {/* X axis */}
      <line x1={PAD.left} x2={PAD.left + cW} y1={PAD.top + cH} y2={PAD.top + cH} stroke="#94a3b8" strokeWidth="1" />
      {xTicks.map(m => (
        <g key={m}>
          <line x1={xScale(m)} x2={xScale(m)} y1={PAD.top + cH} y2={PAD.top + cH + 4} stroke="#94a3b8" strokeWidth="1" />
          <text x={xScale(m)} y={PAD.top + cH + 14} textAnchor="middle" fontSize="10" fill="#64748b">{m / 12 < 2 ? `${m}m` : `${m/12}y`}</text>
        </g>
      ))}

      {/* Y axis */}
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + cH} stroke="#94a3b8" strokeWidth="1" />
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.left - 4} x2={PAD.left} y1={yScale(v)} y2={yScale(v)} stroke="#94a3b8" strokeWidth="1" />
          <text x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="#64748b">{v}</text>
        </g>
      ))}

      {/* Y axis label */}
      <text transform={`translate(12,${PAD.top + cH / 2}) rotate(-90)`} textAnchor="middle" fontSize="9" fill="#94a3b8">{typeLabel}</text>

      {/* Patient dot with hover tooltip */}
      {dot && (
        <g>
          <circle cx={dot.x} cy={dot.y} r={14} fill="#f59e0b" opacity={0.15} />
          <circle cx={dot.x} cy={dot.y} r={8}  fill="#f59e0b" />
          <circle cx={dot.x} cy={dot.y} r={3}  fill="#fff" />
          {/* Tooltip */}
          <g>
            <rect x={dot.x + 10} y={dot.y - 28} width={90} height={22} rx="4" fill="#1e293b" opacity={0.85} />
            <text x={dot.x + 55} y={dot.y - 13} textAnchor="middle" fontSize="10" fill="#fff" fontWeight="600">
              {type === 'weight' ? `${patientValue} kg` : type === 'height' ? `${patientValue} cm` : `BMI ${patientValue}`} · {Math.round(ageMonths / 12 * 10) / 10}y
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

// ── Main GrowthChart Modal ────────────────────────────────────────────────────
export default function GrowthChart({ appt, vitals, onVitalsChange, onClose }) {
  const [tab, setTab]       = useState('weight');
  const [showTell, setShowTell] = useState(false);

  const name        = appt?.patient_name || 'Patient';
  const gender      = appt?.patient_gender || 'M';
  const age         = appt?.patient_age || 0;
  const ageMonths   = Math.round(age * 12);
  const genderLabel = gender === 'F' ? 'F' : 'M';

  // Local editable state — initialised from vitals prop
  const [localWeight, setLocalWeight] = useState(vitals?.weight || '');
  const [localHeight, setLocalHeight] = useState(vitals?.height || '');
  const [gaWks,       setGaWks]       = useState('');
  const [gaDays,      setGaDays]      = useState('');

  // Auto-calculate BMI from local values
  const localBMI = calcBMI(localWeight, localHeight) || '';

  // Chart values driven by local state
  const TABS = [
    { key: 'weight', label: 'Weight For Age', value: parseFloat(localWeight) || null,  unit: 'Kgs' },
    { key: 'height', label: 'Height For Age', value: parseFloat(localHeight) || null,  unit: 'Cms' },
    { key: 'bmi',    label: 'BMI For Age',    value: parseFloat(localBMI)    || null,  unit: 'kg/m²' },
  ];
  const activeTab = TABS.find(t => t.key === tab);

  function handleDone() {
    // Save changes back to InferPad vitals
    if (onVitalsChange) {
      if (localWeight) onVitalsChange('weight', localWeight);
      if (localHeight) onVitalsChange('height', localHeight);
      if (localBMI)    onVitalsChange('bmi',    localBMI);
    }
    onClose();
  }

  return (
    <div className={s.fullscreen}>
      {/* Header */}
      <div className={s.header}>
        <button className={s.backBtn} onClick={onClose}><ArrowLeft size={16} /></button>
        <span className={s.headerTitle}>Growth Chart</span>
        <span className={s.patientMeta}>{name} | {genderLabel} | {age}y</span>
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {TABS.map(t => (
          <button key={t.key} className={`${s.tab} ${tab === t.key ? s.tabActive : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className={s.body}>
        {/* Chart area */}
        <div className={s.chartArea}>
          <h3 className={s.chartTitle}>{activeTab?.label}</h3>
          <GrowthChartSVG type={tab} gender={gender} ageMonths={ageMonths} patientValue={activeTab?.value} />
        </div>

        {/* Right panel */}
        <div className={s.rightPanel}>
          {/* Promo card */}
          <div className={s.promoCard}>
            <div className={s.promoOrb} />
            <div className={s.promoText}>
              <div className={s.promoTitle}>New Growth Chart Upgrades are here!</div>
              <div className={s.promoDesc}>Plot growth on the corrected age with ease</div>
            </div>
            <button className={s.promoBtn} onClick={() => setShowTell(true)}>
              ⠿ Tell me more!
            </button>
          </div>

          {/* Chart type selector */}
          <div className={s.chartTypeRow}>
            <div className={s.chartTypeSelect}>WHO/IAP Chart ▾</div>
            <label className={s.correctedAge}>
              <input type="checkbox" /> Use corrected age
            </label>
          </div>

          {/* Editable input fields */}
          <div className={s.inputList}>
            <div className={s.inputRow}>
              <span className={s.inputIcon}>⊕</span>
              <span className={s.inputLabel}>Gestational Age at birth</span>
              <input className={s.inputBox} type="number" placeholder="—" value={gaWks}  onChange={e => setGaWks(e.target.value)}  />
              <span className={s.inputUnit}>wks</span>
              <input className={s.inputBox} type="number" placeholder="—" value={gaDays} onChange={e => setGaDays(e.target.value)} />
              <span className={s.inputUnit}>days</span>
            </div>
            <div className={s.inputRow}>
              <span className={s.inputIcon}>⊠</span>
              <span className={s.inputLabel}>Weight</span>
              <input className={s.inputBoxFull} type="number" placeholder="—"
                value={localWeight}
                onChange={e => setLocalWeight(e.target.value)} />
              <span className={s.inputUnit}>Kgs</span>
            </div>
            <div className={s.inputRow}>
              <span className={s.inputIcon}>↕</span>
              <span className={s.inputLabel}>Height</span>
              <input className={s.inputBoxFull} type="number" placeholder="—"
                value={localHeight}
                onChange={e => setLocalHeight(e.target.value)} />
              <span className={s.inputUnit}>Cms</span>
            </div>
            <div className={s.inputRow}>
              <span className={s.inputIcon}>÷</span>
              <span className={s.inputLabel}>BMI</span>
              <input className={`${s.inputBoxFull} ${s.inputAuto}`} type="number" placeholder="auto"
                value={localBMI} readOnly />
              <span className={s.inputUnit}>kg/m2</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={s.footer}>
        <button className={s.btnClose} onClick={onClose}>Close</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.btnPrint} onClick={() => window.print()}>
            <Printer size={13} /> Print
          </button>
          <button className={s.btnDone} onClick={handleDone}>Done</button>
        </div>
      </div>

      {showTell && <TellMeMoreDialog onClose={() => setShowTell(false)} />}
    </div>
  );
}
