import { useState, useRef, useEffect, Fragment } from 'react';
import { Plus, ChevronDown, Settings2, X, Search, GripVertical } from 'lucide-react';
import styles from './InferPad.module.css';
import AutocompleteInput from './AutocompleteInput';
import MedicalHistorySection from './MedicalHistorySection';
import CalculatorsSection from './CalculatorsSection';
import { CALCULATORS, getCalcPrefs, saveCalcPrefs } from '../data/calculators';
import { getSectionOrder, getICD10Settings, getDisabledSections } from '../pages/settings/InferPadSettings';
import GrowthChart from './GrowthChart';
import s2 from './GrowthChart.module.css';
import DentalChart from './DentalChart';

const NLM = 'https://clinicaltables.nlm.nih.gov/api';

async function fetchICD10(query) {
  try {
    const r = await fetch(`${NLM}/icd10cm/v3/search?terms=${encodeURIComponent(query)}&sf=code,name&maxList=12`);
    const data = await r.json();
    const rows = data[3] || [];
    return rows.map(([code, name]) => ({ code, name, label: `${code} — ${name}` }));
  } catch { return []; }
}

async function fetchLOINC(query) {
  try {
    const r = await fetch(`${NLM}/loinc_items/v3/search?terms=${encodeURIComponent(query)}&df=LONG_COMMON_NAME,LOINC_NUM&maxList=12`);
    const data = await r.json();
    const rows = data[3] || [];
    return rows.map(([name, code]) => ({ name, code, label: name }));
  } catch { return []; }
}

async function fetchRxTerms(query) {
  try {
    const r = await fetch(`${NLM}/rxterms/v3/search?terms=${encodeURIComponent(query)}&ef=STRENGTHS_AND_FORMS&maxList=12`);
    const data = await r.json();
    const rows = data[3] || [];
    const strengths = (data[2] && data[2].STRENGTHS_AND_FORMS) || [];
    return rows.map((row, i) => ({ name: row[0], strength: (strengths[i] || []).join(', '), label: row[0] }));
  } catch { return []; }
}

// ── Constants ─────────────────────────────────────────────────────────────────

// All available vitals — derived from SERVER_VITALS spec (exported for use in WriteRx Overview)
// decimal: true = allow decimals, false = integers only
// safeRange: {low, high} used for soft validation hint
export const VITALS_ALL = [
  // ── Core vitals (on by default) ──────────────────────────────────────────
  { key: 'bp_systolic',      label: 'Systolic BP',                    unit: 'mmHg',    placeholder: '120',  defaultOn: true,  decimal: true,  safeRange: { low: '100', high: '140' } },
  { key: 'bp_diastolic',     label: 'Diastolic BP',                   unit: 'mmHg',    placeholder: '80',   defaultOn: true,  decimal: false, safeRange: { low: '70',  high: '90'  } },
  { key: 'pulse',            label: 'Pulse Rate',                     unit: '/min',    placeholder: '72',   defaultOn: true,  decimal: true,  safeRange: { low: '60',  high: '100' } },
  { key: 'spo2',             label: 'SpO₂',                           unit: '%',       placeholder: '98',   defaultOn: true,  decimal: true,  safeRange: { low: '95',  high: '100' } },
  { key: 'temp',             label: 'Temperature',                    unit: '°C',      placeholder: '37.0', defaultOn: true,  decimal: true,  safeRange: { low: '36.6','high': '37.0' } },
  { key: 'respiratory_rate', label: 'Respiratory Rate',               unit: '/min',    placeholder: '16',   defaultOn: true,  decimal: false, safeRange: { low: '12',  high: '16'  } },
  { key: 'height',           label: 'Height',                         unit: 'cm',      placeholder: '170',  defaultOn: true,  decimal: true,  safeRange: { low: '0',   high: '250' } },
  { key: 'weight',           label: 'Weight',                         unit: 'kg',      placeholder: '70',   defaultOn: true,  decimal: true,  safeRange: { low: '0',   high: '300' } },
  { key: 'temp_f',           label: 'Temperature (°F)',               unit: '°F',      placeholder: '98.6', defaultOn: false, decimal: true,  safeRange: { low: '97',  high: '99'  } },
  { key: 'height_feet',      label: 'Height (Feet)',                  unit: 'ft',      placeholder: '5.7',  defaultOn: false, decimal: true,  safeRange: { low: '0',   high: '10'  } },
  { key: 'weight_lbs',       label: 'Weight (lbs)',                   unit: 'lbs',     placeholder: '154',  defaultOn: false, decimal: true,  safeRange: { low: '0',   high: '500' } },
  // ── Body measurements ───────────────────────────────────────────────────
  { key: 'birth_weight',     label: 'Birth Weight',                   unit: 'kg',      placeholder: '3.0',  defaultOn: false, decimal: true,  safeRange: { low: '0',   high: '10'  } },
  { key: 'ofc',              label: 'Occipital Frontal Circumference', unit: 'cm',      placeholder: '35',   defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'head_circ',        label: 'Head Circumference (HC)',        unit: 'cm',      placeholder: '35',   defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'chest_circ',       label: 'Chest Circumference (CC)',       unit: 'cm',      placeholder: '33',   defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'muac',             label: 'Mid Arm Circumference (MUAC)',   unit: 'cm',      placeholder: '14',   defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'waist',            label: 'Waist Circumference (WC)',       unit: 'cm',      placeholder: '80',   defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'abdominal_girth',  label: 'Abdominal Girth',               unit: 'cm',      placeholder: '80',   defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'neck_circ',        label: 'Neck Circumference',             unit: 'cm',      placeholder: '37',   defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'muscle_mass',      label: 'Muscle Mass',                    unit: 'kg',      placeholder: '36',   defaultOn: false, decimal: true,  safeRange: { low: '32.4','high': '40.4' } },
  { key: 'bone_mass',        label: 'Bone Mass',                      unit: 'kg',      placeholder: '2.6',  defaultOn: false, decimal: true,  safeRange: { low: '2.3', high: '2.9'  } },
  { key: 'fat_mass',         label: 'Body Fat Mass',                  unit: '%',       placeholder: '20',   defaultOn: false, decimal: true,  safeRange: { low: '14.6','high': '25.2' } },
  { key: 'metabolic_age',    label: 'Metabolic Age',                  unit: 'years',   placeholder: '30',   defaultOn: false, decimal: false, safeRange: { low: '0',   high: '120' } },
  // ── Blood sugar ─────────────────────────────────────────────────────────
  { key: 'rbs',              label: 'Random Blood Sugar (RBS)',        unit: 'mg/dL',   placeholder: '100',  defaultOn: false, decimal: true,  safeRange: { low: '60',  high: '140' } },
  { key: 'fbs',              label: 'Fasting Blood Sugar (FBS)',       unit: 'mg/dL',   placeholder: '90',   defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'ppbs',             label: 'Post-Prandial Blood Sugar (PPBS)',unit: 'mg/dL',   placeholder: '140',  defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'hba1c',            label: 'HbA1c',                          unit: '%',       placeholder: '5.7',  defaultOn: false, decimal: true,  safeRange: { low: '3.9', high: '5.7'  } },
  { key: 'fasting_insulin',  label: 'Fasting Insulin',                unit: 'μIU/mL',  placeholder: '10',   defaultOn: false, decimal: true,  safeRange: {} },
  // ── Renal / kidney ──────────────────────────────────────────────────────
  { key: 'creatinine',       label: 'Creatinine, Serum',              unit: 'mg/dL',   placeholder: '1.0',  defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'microalbumin',     label: 'Microalbuminuria',               unit: 'mg/dL',   placeholder: '',     defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'acr',              label: 'Albumin Creatinine Ratio (ACR)', unit: 'mg/g Cr', placeholder: '',     defaultOn: false, decimal: true,  safeRange: {} },
  // ── Inflammatory ────────────────────────────────────────────────────────
  { key: 'crp',              label: 'CRP (C-Reactive Protein)',        unit: 'mg/L',    placeholder: '',     defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'hscrp',            label: 'HsCRP (High Sensitivity CRP)',    unit: 'mg/L',    placeholder: '',     defaultOn: false, decimal: true,  safeRange: {} },
  // ── Haematology ─────────────────────────────────────────────────────────
  { key: 'hemoglobin',       label: 'Hemoglobin (Hb)',                unit: 'g/dL',    placeholder: '13.5', defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'platelets',        label: 'Platelets',                      unit: 'lakhs',   placeholder: '2.5',  defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'inr',              label: 'INR',                            unit: '',        placeholder: '1.0',  defaultOn: false, decimal: true,  safeRange: {} },
  // ── Hormones / thyroid ──────────────────────────────────────────────────
  { key: 'tsh',              label: 'TSH (Thyroid Stimulating Hormone)', unit: 'μIU/mL',placeholder: '',    defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'c_peptide',        label: 'C-Peptide, Fasting',             unit: 'ng/mL',   placeholder: '',     defaultOn: false, decimal: true,  safeRange: {} },
  // ── Vitamins ────────────────────────────────────────────────────────────
  { key: 'vitamin_b12',      label: 'Vitamin B12',                    unit: 'pg/mL',   placeholder: '',     defaultOn: false, decimal: true,  safeRange: {} },
  { key: 'vitamin_d',        label: 'Vitamin D (25-OH)',              unit: 'ng/mL',   placeholder: '',     defaultOn: false, decimal: true,  safeRange: {} },
  // ── Pain scales ─────────────────────────────────────────────────────────
  { key: 'pain_score',       label: 'Pain Score (0-10)',              unit: '/10',     placeholder: '0',    defaultOn: false, decimal: false, safeRange: { low: '0',   high: '10'  } },
  { key: 'nips_score',       label: 'NIPS Pain Scale',                unit: '/7',      placeholder: '0',    defaultOn: false, decimal: false, safeRange: { low: '0',   high: '7'   } },
  { key: 'wong_baker',       label: 'Wong-Baker Pain Scale',          unit: '/10',     placeholder: '0',    defaultOn: false, decimal: false, safeRange: { low: '0',   high: '10'  } },
  { key: 'flacc_score',      label: 'FLACC Pain Severity',            unit: '/10',     placeholder: '0',    defaultOn: false, decimal: false, safeRange: { low: '0',   high: '10'  } },
  // ── Reproductive ────────────────────────────────────────────────────────
  { key: 'lmp',              label: 'Last Menstrual Period (LMP)',     unit: 'date',    placeholder: '',     defaultOn: false, decimal: false, safeRange: {} },
];

const VITALS_CONFIG = VITALS_ALL; // kept for backward compat

// ── Vitals config localStorage helpers ───────────────────────────────────────
export function getVitalsPrefs(clinicId) {
  try {
    const raw = localStorage.getItem(`vitals_cfg_${clinicId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Default: all defaultOn vitals in original order
  return VITALS_ALL.filter(v => v.defaultOn).map(v => v.key);
}
function saveVitalsPrefs(clinicId, keys) {
  localStorage.setItem(`vitals_cfg_${clinicId}`, JSON.stringify(keys));
}

// ── Vitals Configure Modal ────────────────────────────────────────────────────
function VitalsConfigModal({ clinicId, current, currentCalcs = [], onSave, onClose }) {
  const [activeTab, setActiveTab] = useState('vitals'); // 'vitals' | 'calcs'
  const [search, setSearch]   = useState('');
  const [order,  setOrder]    = useState(current); // array of enabled vital keys in order
  const [calcIds, setCalcIds] = useState(currentCalcs); // array of enabled calculator ids
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const isEnabled = key => order.includes(key);

  const toggle = key => {
    setOrder(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Drag handlers
  const onDragStart = (i) => setDragIdx(i);
  const onDragOver  = (e, i) => { e.preventDefault(); setOverIdx(i); };
  const onDrop      = (i) => {
    if (dragIdx === null || dragIdx === i) return;
    const next = [...order];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setOrder(next);
    setDragIdx(null); setOverIdx(null);
  };
  const onDragEnd   = () => { setDragIdx(null); setOverIdx(null); };

  const filtered = VITALS_ALL.filter(v =>
    v.label.toLowerCase().includes(search.toLowerCase()) ||
    v.unit.toLowerCase().includes(search.toLowerCase())
  );

  const enabledVitals = order
    .map(k => VITALS_ALL.find(v => v.key === k))
    .filter(Boolean);

  const calcSearch = CALCULATORS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.desc.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    saveVitalsPrefs(clinicId, order);
    saveCalcPrefs(clinicId, calcIds);
    onSave(order, calcIds);
  };

  return (
    <div className={styles.vcOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.vcModal}>
        <div className={styles.vcHead}>
          <span className={styles.vcTitle}>Configure Vitals &amp; Calculators</span>
          <button className={styles.vcClose} onClick={onClose}><X size={15} /></button>
        </div>

        {/* Tab strip */}
        <div className={styles.vcTabs}>
          <button className={`${styles.vcTab} ${activeTab === 'vitals' ? styles.vcTabActive : ''}`}
            onClick={() => { setActiveTab('vitals'); setSearch(''); }}>
            Vitals
          </button>
          <button className={`${styles.vcTab} ${activeTab === 'calcs' ? styles.vcTabActive : ''}`}
            onClick={() => { setActiveTab('calcs'); setSearch(''); }}>
            Calculators <span className={styles.vcTabBadge}>{calcIds.length}</span>
          </button>
        </div>

        {activeTab === 'calcs' ? (
          <div className={styles.vcCalcBody}>
            <div className={styles.vcSearchBox}>
              <Search size={13} className={styles.vcSearchIcon} />
              <input className={styles.vcSearchInput} placeholder="Search calculators…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className={styles.vcCalcList}>
              {calcSearch.map(c => (
                <label key={c.id} className={styles.vcCalcItem}>
                  <input type="checkbox" className={styles.vcCheck}
                    checked={calcIds.includes(c.id)}
                    onChange={() => setCalcIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                  />
                  <div className={styles.vcCalcInfo}>
                    <span className={styles.vcItemLabel}>{c.name}</span>
                    <span className={styles.vcCalcDesc}>{c.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.vcBody}>
            {/* Left: search + toggle list */}
            <div className={styles.vcLeft}>
              <div className={styles.vcSearchBox}>
                <Search size={13} className={styles.vcSearchIcon} />
                <input className={styles.vcSearchInput} placeholder="Search vitals…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className={styles.vcList}>
                {filtered.map(v => (
                  <label key={v.key} className={styles.vcItem}>
                    <input type="checkbox" className={styles.vcCheck}
                      checked={isEnabled(v.key)} onChange={() => toggle(v.key)} />
                    <span className={styles.vcItemLabel}>{v.label}</span>
                    <span className={styles.vcItemUnit}>{v.unit}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Right: drag-to-reorder */}
            <div className={styles.vcRight}>
              <div className={styles.vcRightHead}>Drag to reorder</div>
              <div className={styles.vcOrder}>
                {enabledVitals.map((v, i) => (
                  <div key={v.key}
                    className={[styles.vcOrderRow, dragIdx === i ? styles.vcDragging : '', overIdx === i ? styles.vcDragOver : ''].filter(Boolean).join(' ')}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={e => onDragOver(e, i)}
                    onDrop={() => onDrop(i)}
                    onDragEnd={onDragEnd}
                  >
                    <GripVertical size={14} className={styles.vcGrip} />
                    <span className={styles.vcOrderLabel}>{v.label}</span>
                    <span className={styles.vcOrderUnit}>{v.unit}</span>
                    <button className={styles.vcOrderRemove} onClick={() => toggle(v.key)}><X size={11} /></button>
                  </div>
                ))}
                {enabledVitals.length === 0 && <div className={styles.vcEmpty}>No vitals selected</div>}
              </div>
              <div className={styles.vcBmiNote}>BMI is always shown (auto-calculated from Height &amp; Weight)</div>
            </div>
          </div>
        )}

        <div className={styles.vcFoot}>
          <button className={styles.vcBtnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.vcBtnSave} onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

const SEVERITIES = ['Mild', 'Moderate', 'Severe'];

// ── Number + unit smart input (e.g. "2" → "2 days / 2 weeks / …") ───────────
const UNITS = ['day', 'week', 'month', 'year'];

function NumberUnitInput({ value, onChange, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const fn = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const num = parseFloat(value);
  const suggestions = !isNaN(num) && num > 0
    ? UNITS.map(u => `${num} ${u}${num !== 1 ? 's' : ''}`)
    : [];

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => suggestions.length && setOpen(true)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className={styles.nuDropdown}>
          {suggestions.map(s => (
            <li key={s} className={styles.nuItem}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Ophthalmology eye-row grid ────────────────────────────────────────────────
function EyeRow({ label, fields, prefix, ophtho, setOphtho, styles: s }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${fields.length}, 1fr)`, gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }} />
        {fields.map(f => <span key={f} style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>{f}</span>)}
        {['RE','LE'].map(eye => (
          <Fragment key={eye}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{eye}</span>
            {fields.map(f => (
              <input key={f} className={s.cellInput} placeholder="—"
                value={ophtho[`${prefix}_${eye}_${f}`] || ''}
                onChange={e => setOphtho(`${prefix}_${eye}_${f}`, e.target.value)}
                style={{ textAlign: 'center' }}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Collapsible card ─────────────────────────────────────────────────────────

function ICard({ title, icon, badge, color = '#6366f1', defaultOpen = true, action, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.card} style={{ '--cc': color }}>
      <div className={styles.cardHead} onClick={() => setOpen(v => !v)}>
        <span className={styles.cardBar} />
        <span className={styles.cardIcon}>{icon}</span>
        <span className={styles.cardTitle}>{title}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
        <ChevronDown size={15} strokeWidth={2}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
        {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
      </div>
      {open && <div className={styles.cardBody}>{children}</div>}
    </div>
  );
}

// ── Severity pills ────────────────────────────────────────────────────────────

function SeverityPills({ value, onChange }) {
  return (
    <div className={styles.severityRow}>
      {SEVERITIES.map(s => (
        <button key={s} type="button"
          className={`${styles.sevBtn} ${value === s ? styles.sevBtnActive : ''}`}
          onClick={() => onChange(value === s ? '' : s)}>
          {s}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InferPad({ form, set, setVital, setCalcResult, appt, pastNotes = [], clinicId = 'default' }) {
  const [showVitalsCfg, setShowVitalsCfg] = useState(false);
  const [vitalsOrder,   setVitalsOrder]   = useState(() => getVitalsPrefs(clinicId));
  const [calcOrder,     setCalcOrder]     = useState(() => getCalcPrefs(clinicId));
  const [sectionOrder,     setSectionOrder]     = useState(() => getSectionOrder(clinicId));
  const [disabledSections, setDisabledSections] = useState(() => getDisabledSections(clinicId));
  const [showGrowth,    setShowGrowth]    = useState(false);
  const [icd10,         setIcd10]         = useState(() => getICD10Settings(clinicId));
  const [growthEnabled, setGrowthEnabled] = useState(
    () => localStorage.getItem(`rx_growth_chart_${clinicId}`) === 'true'
  );

  const patientAge      = appt?.patient_age ? parseFloat(appt.patient_age) : null;
  // Show strip when: feature enabled AND (age unknown OR age < 15)
  const showGrowthStrip = growthEnabled && (patientAge === null || patientAge < 15);

  // Re-read settings when they change
  useEffect(() => {
    const handler = () => {
      setSectionOrder(getSectionOrder(clinicId));
      setDisabledSections(getDisabledSections(clinicId));
      setGrowthEnabled(localStorage.getItem(`rx_growth_chart_${clinicId}`) === 'true');
      setIcd10(getICD10Settings(clinicId));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [clinicId]);

  // Listen for lab results applied from PatientContextPanel
  useEffect(() => {
    const handler = (e) => {
      const { items, summary } = e.detail || {};
      if (Array.isArray(items) && items.length > 0) {
        set('lab_results', [...(form.lab_results || []), ...items]);
      }
      if (summary) {
        set('notes', [form.notes, `Lab Summary: ${summary}`].filter(Boolean).join('\n\n'));
      }
    };
    window.addEventListener('lab:apply', handler);
    return () => window.removeEventListener('lab:apply', handler);
  }); // no deps — reads latest form

  const visibleVitals = vitalsOrder
    .map(k => VITALS_ALL.find(v => v.key === k))
    .filter(Boolean);

  // ── Symptom helpers ──────────────────────────────────────────────────────
  const selectSymptomSuggestion = (item) => {
    set('symptomInput', item.name);
    set('symptomCode', item.code || '');
  };
  const addSymptom = (nameOrItem) => {
    const name = typeof nameOrItem === 'object' ? nameOrItem.name : nameOrItem;
    if (!name?.trim()) return;
    set('symptoms', [...form.symptoms, {
      name: name.trim(),
      code: typeof nameOrItem === 'object' ? (nameOrItem.code || '') : (form.symptomCode || ''),
      since:    form.symptomSince    || '',
      severity: form.symptomSeverity || '',
    }]);
    set('symptomInput', '');
    set('symptomCode', '');
    set('symptomSince', '');
    set('symptomSeverity', '');
  };
  const removeSymptom = (i) => set('symptoms', form.symptoms.filter((_, j) => j !== i));

  // ── Diagnosis helpers ────────────────────────────────────────────────────
  const selectDiagSuggestion = (item) => {
    set('diagInput', item.name);
    set('diagCode', item.code || '');
  };
  const addDiag = (nameOrItem) => {
    const name = typeof nameOrItem === 'object' ? nameOrItem.name : nameOrItem;
    if (!name?.trim()) return;
    set('diagnosis', [...form.diagnosis, {
      display:  name.trim(),
      code:     typeof nameOrItem === 'object' ? (nameOrItem.code || '') : (form.diagCode || ''),
      system:   'http://snomed.info/sct',
      status:   'active',
      since:    form.diagSince    || '',
      severity: form.diagSeverity || '',
    }]);
    set('diagInput', '');
    set('diagCode', '');
    set('diagSince', '');
    set('diagSeverity', '');
  };
  const removeDiag = (i) => set('diagnosis', form.diagnosis.filter((_, j) => j !== i));

  // ── Medication helpers ────────────────────────────────────────────────────
  const addMed = () => set('medications', [...form.medications,
    { name: '', dose: '', frequency: '', timing: '', duration: '', start_from: '', instructions: '' }
  ]);
  const updateMed = (i, k, v) => {
    const arr = [...form.medications]; arr[i] = { ...arr[i], [k]: v }; set('medications', arr);
  };

  // ── Lab result helpers ────────────────────────────────────────────────────
  const addLabResult = () =>
    set('lab_results', [...form.lab_results, { test: '', result: '', unit: '', range: '' }]);
  const updateLabResult = (i, k, v) => {
    const arr = [...form.lab_results]; arr[i] = { ...arr[i], [k]: v }; set('lab_results', arr);
  };

  // ── Lab investigation helpers ─────────────────────────────────────────────
  const addLabInv = () =>
    set('lab_investigations', [...form.lab_investigations, { test: '', repeat_on: '', remarks: '' }]);
  const updateLabInv = (i, k, v) => {
    const arr = [...form.lab_investigations]; arr[i] = { ...arr[i], [k]: v }; set('lab_investigations', arr);
  };

  // ── Chip helpers (procedures) ─────────────────────────────────────────────
  const addChip = (field, inputField) => {
    const val = (form[inputField] || '').trim();
    if (!val) return;
    set(field, [...form[field], val]);
    set(inputField, '');
  };
  const removeChip = (field, i) => set(field, form[field].filter((_, j) => j !== i));

  // ── Custom section helpers ────────────────────────────────────────────────
  const customSections = form.custom_sections || [];
  const addCustom = () => set('custom_sections', [...customSections, { id: Date.now(), title: '', content: '' }]);
  const updateCustom = (id, k, v) =>
    set('custom_sections', customSections.map(s => s.id === id ? { ...s, [k]: v } : s));
  const removeCustom = (id) => set('custom_sections', customSections.filter(s => s.id !== id));

  const ophtho    = form.ophtho || {};
  const setOphtho = (field, val) => set('ophtho', { ...ophtho, [field]: val });
  const eyeRowProps = { ophtho, setOphtho, styles };

  const fillSampleData = () => {
    setVital('bp_systolic',      '124');
    setVital('bp_diastolic',     '82');
    setVital('pulse',            '76');
    setVital('spo2',             '98');
    setVital('temp',             '37.2');
    setVital('respiratory_rate', '16');
    setVital('height',           '168');
    setVital('weight',           '72');
    set('symptoms', [
      { name: 'Fever', since: '3 days', severity: 'Moderate' },
      { name: 'Headache', since: '2 days', severity: 'Mild' },
      { name: 'Cough', since: '5 days', severity: 'Mild' },
    ]);
    set('diagnosis', [
      { display: 'Viral Upper Respiratory Tract Infection', code: '54150009', system: 'http://snomed.info/sct', status: 'active' },
      { display: 'Tension Headache', code: '398057008', system: 'http://snomed.info/sct', status: 'active' },
    ]);
    set('medications', [
      { name: 'Paracetamol', dose: '500mg', frequency: 'TDS', duration: '5 days', timing: 'After meals', instructions: 'Take with warm water' },
      { name: 'Cetirizine', dose: '10mg', frequency: 'OD', duration: '7 days', timing: 'At bedtime', instructions: '' },
      { name: 'Azithromycin', dose: '500mg', frequency: 'OD', duration: '3 days', timing: 'Before meals', instructions: '' },
    ]);
    set('lab_investigations', [
      { test: 'Complete Blood Count (CBC)', repeat_on: '1 week', remarks: 'Fasting preferred' },
      { test: 'C-Reactive Protein (CRP)', repeat_on: '', remarks: '' },
    ]);
    set('lab_results', [
      { test: 'Hemoglobin', result: '13.2', unit: 'g/dL', range: '12-16' },
      { test: 'WBC', result: '9800', unit: 'cells/µL', range: '4000-11000' },
      { test: 'Platelet Count', result: '210000', unit: '/µL', range: '150000-400000' },
    ]);
    set('examination_findings', 'Throat mildly congested. Bilateral tonsils Grade I. No lymphadenopathy. Chest clear on auscultation.');
    set('advices', 'Take rest. Drink plenty of fluids (minimum 2–3 litres/day). Avoid cold food and drinks. Use steam inhalation twice daily. Wear a mask in public.');
    set('refer_to', '');
    set('next_visit_date', new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10));
    set('next_visit_notes', 'Review CBC reports. Follow up if fever persists beyond 3 days.');
    set('procedures', ['Throat Swab Culture', 'Nebulisation']);
    set('injections', [
      { name: 'Ondansetron', dose: '4mg', route: 'IV', frequency: 'SOS' },
    ]);
    set('notes', 'Patient is allergic to Penicillin. Advised COVID test if fever persists beyond 5 days.');
    // Ophthalmology sample data
    set('ophtho', {
      // Visual Acuity
      va_wog_RE_Distance: '6/18', va_wog_RE_Near: 'N10',
      va_wog_LE_Distance: '6/12', va_wog_LE_Near: 'N8',
      va_wg_RE_Distance:  '6/6',  va_wg_RE_Near:  'N6',
      va_wg_LE_Distance:  '6/6',  va_wg_LE_Near:  'N6',
      // Subjective Refraction
      subj_RE_SPH: '-1.50', subj_RE_CYL: '-0.75', subj_RE_AXIS: '180', subj_RE_VA: '6/6',
      subj_LE_SPH: '-1.00', subj_LE_CYL: '-0.50', subj_LE_AXIS: '175', subj_LE_VA: '6/6',
      // Auto Refraction
      auto_RE_SPH: '-1.75', auto_RE_CYL: '-0.75', auto_RE_AXIS: '180',
      auto_LE_SPH: '-1.25', auto_LE_CYL: '-0.50', auto_LE_AXIS: '170',
      // Current Glass
      cur_glass_RE_SPH: '-1.00', cur_glass_RE_CYL: '-0.50', cur_glass_RE_AXIS: '180', cur_glass_RE_ADD: '+2.00', cur_glass_RE_VA: '6/9',
      cur_glass_LE_SPH: '-0.75', cur_glass_LE_CYL: '-0.25', cur_glass_LE_AXIS: '175', cur_glass_LE_ADD: '+2.00', cur_glass_LE_VA: '6/9',
      // Final Glass
      fin_glass_RE_SPH: '-1.50', fin_glass_RE_CYL: '-0.75', fin_glass_RE_AXIS: '180', fin_glass_RE_ADD: '+2.25', fin_glass_RE_VA: '6/6',
      fin_glass_LE_SPH: '-1.00', fin_glass_LE_CYL: '-0.50', fin_glass_LE_AXIS: '175', fin_glass_LE_ADD: '+2.25', fin_glass_LE_VA: '6/6',
      fin_glass_notes: 'Anti-glare coating recommended. Bifocal lens.',
      // IOP
      'iop_RE_IOP (mmHg)': '14', iop_RE_Method: 'NCT', iop_RE_Time: '10:00 AM',
      'iop_LE_IOP (mmHg)': '16', iop_LE_Method: 'NCT', iop_LE_Time: '10:00 AM',
      // Color Vision
      'color_vision_RE_Plates Seen': '14/14', color_vision_RE_Result: 'Normal',
      'color_vision_LE_Plates Seen': '14/14', color_vision_LE_Result: 'Normal',
      // Eye Examination
      eye_lids_RE: 'Normal', eye_lids_LE: 'Normal',
      eye_conjunctiva_RE: 'Clear', eye_conjunctiva_LE: 'Clear',
      eye_cornea_RE: 'Clear', eye_cornea_LE: 'Clear',
      eye_ac_RE: 'Deep & quiet', eye_ac_LE: 'Deep & quiet',
      eye_iris_RE: 'Normal', eye_iris_LE: 'Normal',
      eye_lens_RE: 'Clear', eye_lens_LE: 'Early NS Grade 1',
      eye_vitreous_RE: 'Clear', eye_vitreous_LE: 'Clear',
      eye_fundus_RE: 'DDDR, Macula normal', eye_fundus_LE: 'DDDR, Macula normal',
      eye_motility_RE: 'Full', eye_motility_LE: 'Full',
      // Pachymetry
      pachy_RE_Central: '520', pachy_RE_Thinnest: '515', pachy_RE_Location: 'Central',
      pachy_LE_Central: '525', pachy_LE_Thinnest: '518', pachy_LE_Location: 'Central',
      // K Reading
      kread_RE_K1: '43.50 @ 180', kread_RE_K2: '44.00 @ 90', kread_RE_Avg: '43.75',
      kread_LE_K1: '43.25 @ 180', kread_LE_K2: '43.75 @ 90', kread_LE_Avg: '43.50',
      'biom_RE_Axial Length': '23.45', biom_RE_ACD: '3.12', biom_RE_WTW: '11.8',
      'biom_LE_Axial Length': '23.38', biom_LE_ACD: '3.10', biom_LE_WTW: '11.7',
    });
  };

  return (
    <div className={styles.wrap}>

      {/* ── Sample data button ── */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:4 }}>
        <button onClick={fillSampleData}
          style={{ fontSize:11, padding:'4px 12px', borderRadius:6, border:'1px dashed #94a3b8',
            background:'transparent', color:'#64748b', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
          🧪 Fill Sample Data
        </button>
      </div>

      {/* ── All sections rendered in saved order ── */}
      {sectionOrder.filter(key => !disabledSections.includes(key)).map(key => {
        if (key === 'vitals') return (
          <ICard key="vitals" title="Vitals" icon="🩺" color="#3b82f6"
            action={
              <button className={styles.vitalsConfigBtn} onClick={e => { e.stopPropagation(); setShowVitalsCfg(true); }} title="Configure vitals">
                <Settings2 size={13} strokeWidth={2} />
              </button>
            }
          >
            <div className={styles.vitalsGrid}>
              {visibleVitals.map(({ key: k, label, unit, placeholder, decimal, safeRange }) => {
                const val = form.vitals[k] || '';
                const low = parseFloat(safeRange?.low), high = parseFloat(safeRange?.high), num = parseFloat(val);
                const outOfRange = val && !isNaN(num) && !isNaN(low) && !isNaN(high) && (num < low || num > high);
                if (k === 'lmp') return (
                  <div key={k} className={styles.vCell}><label>{label}</label>
                    <input type="date" value={val} onChange={e => setVital(k, e.target.value)} /></div>
                );
                return (
                  <div key={k} className={styles.vCell}>
                    <label title={`${label}${unit ? ` (${unit})` : ''}`}>
                      <span className={styles.vLabelText}>{label}</span>
                      {unit && <span className={styles.unit}>{unit}</span>}
                    </label>
                    <input type="number" step={decimal === false ? '1' : 'any'} value={val}
                      onChange={e => setVital(k, e.target.value)} placeholder={placeholder}
                      style={outOfRange ? { borderColor: '#f59e0b', background: '#fffbeb' } : {}}
                      title={outOfRange ? `Normal range: ${safeRange.low}–${safeRange.high} ${unit}` : ''} />
                  </div>
                );
              })}
              <div className={styles.vCell}>
                <label title="BMI (kg/m²)"><span className={styles.vLabelText}>BMI</span><span className={styles.unit}>kg/m²</span>{form.vitals.bmi && <span className={styles.autoTag}>auto</span>}</label>
                <input type="number" className={form.vitals.bmi ? styles.vInputAuto : ''} value={form.vitals.bmi || ''} onChange={e => setVital('bmi', e.target.value)} placeholder="auto" />
              </div>
            </div>
          </ICard>
        );
        if (key === 'growth_chart') {
          if (!growthEnabled || (patientAge !== null && patientAge >= 15)) return null;
          return (
            <div key="growth_chart" className={s2.strip}>
              <span className={s2.stripLabel}>GROWTH CHART [WHO/IAP]</span>
              {!(form.vitals?.weight || form.vitals?.height || form.vitals?.bmi)
                ? <span className={s2.stripWarn}>⚠️ Add height, weight, BMI or OFC for latest growth chart.</span>
                : <span style={{ flex: 1 }} />}
              <button className={s2.stripBtn} onClick={() => setShowGrowth(true)}>
                View growth chart →
              </button>
            </div>
          );
        }
        if (key === 'medical_history') return (
          <ICard key="medical_history" title="Patient Medical History" icon="📋" color="#64748b">
            <MedicalHistorySection value={form.medical_history || []} onChange={v => set('medical_history', v)} />
          </ICard>
        );
        if (key === 'symptoms') return (
          <ICard key="symptoms" title="Symptoms" icon="🤒" color="#f59e0b">
            <div className={styles.chips}>
              {form.symptoms.map((s, i) => {
                const name = typeof s === 'string' ? s : s.name;
                return (
                  <span key={i} className={`${styles.chip} ${styles.chipSymptom}`}>
                    {name}
                    {icd10.display && s.code && <span className={styles.chipCode}> [{s.code}]</span>}
                    {s.since    && <span className={styles.chipMeta}> · {s.since}</span>}
                    {s.severity && <span className={styles.chipMeta}> · {s.severity}</span>}
                    <button onClick={() => removeSymptom(i)}>✕</button>
                  </span>
                );
              })}
            </div>
            <AutocompleteInput value={form.symptomInput || ''} onChange={v => { set('symptomInput', v); set('symptomCode', ''); }} onSelect={selectSymptomSuggestion} onAddChip={addSymptom} fetchSuggestions={fetchICD10} placeholder="Search ICD-10 or type symptom, press Enter…" renderItem={item => <div className={styles.acItem}><span className={styles.acCode}>{item.code}</span><span className={styles.acName}>{item.name}</span></div>} />
            <div className={styles.metaRow}>
              <div className={styles.metaField}><label>Since</label><NumberUnitInput placeholder="e.g. 2 days, 1 week" className={styles.metaInput} value={form.symptomSince || ''} onChange={v => set('symptomSince', v)} /></div>
              <div className={styles.metaField}><label>Severity</label><SeverityPills value={form.symptomSeverity || ''} onChange={v => set('symptomSeverity', v)} /></div>
            </div>
          </ICard>
        );
        if (key === 'diagnosis') return (
          <ICard key="diagnosis" title="Diagnosis" icon="🔬" color="#eab308">
            <div className={styles.chips}>
              {form.diagnosis.map((d, i) => (
                <span key={i} className={`${styles.chip} ${styles.chipDiag}`}>
                  {d.display}{icd10.display && d.code && <span className={styles.chipCode}> [{d.code}]</span>}{d.since && <span className={styles.chipMeta}> · {d.since}</span>}{d.severity && <span className={styles.chipMeta}> · {d.severity}</span>}
                  <button onClick={() => removeDiag(i)}>✕</button>
                </span>
              ))}
            </div>
            <AutocompleteInput value={form.diagInput || ''} onChange={v => { set('diagInput', v); set('diagCode', ''); }} onSelect={selectDiagSuggestion} onAddChip={addDiag} fetchSuggestions={fetchICD10} placeholder="Search ICD-10 or type diagnosis, press Enter…" renderItem={item => <div className={styles.acItem}><span className={styles.acCode}>{item.code}</span><span className={styles.acName}>{item.name}</span></div>} />
            <div className={styles.metaRow}>
              <div className={styles.metaField}><label>Since</label><NumberUnitInput placeholder="e.g. 3 years" className={styles.metaInput} value={form.diagSince || ''} onChange={v => set('diagSince', v)} /></div>
              <div className={styles.metaField}><label>Severity</label><SeverityPills value={form.diagSeverity || ''} onChange={v => set('diagSeverity', v)} /></div>
            </div>
          </ICard>
        );
        if (key === 'medications') return (
          <ICard key="medications" title="℞  Medications" icon="💊" color="#8b5cf6">
            <div className={styles.medList}>
              {form.medications.map((m, i) => (
                <div key={i} className={styles.medCard}>
                  <div className={styles.medCardRow}>
                    <div className={styles.medNameCell}><label>Medicine</label>
                      <AutocompleteInput value={m.name} onChange={v => updateMed(i, 'name', v)} onSelect={item => updateMed(i, 'name', item.name)} fetchSuggestions={fetchRxTerms} placeholder="Search or type medicine…" inputClassName={styles.cellInput} renderItem={item => <div className={styles.acItem}><span className={styles.acName}>{item.name}</span>{item.strength && <span className={styles.acSub}>{item.strength}</span>}</div>} />
                    </div>
                    <div className={styles.medSmallCell}><label>Dose</label><input className={styles.cellInput} placeholder="e.g. 1 tablet" value={m.dose || m.dosage || ''} onChange={e => updateMed(i, 'dose', e.target.value)} /></div>
                    <div className={styles.medSmallCell}><label>Frequency</label><input className={styles.cellInput} placeholder="e.g. 1-0-1, TDS" value={m.frequency || ''} onChange={e => updateMed(i, 'frequency', e.target.value)} /></div>
                    <button className={`${styles.del} ${styles.delTop}`} onClick={() => set('medications', form.medications.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  <div className={styles.medCardRow2}>
                    <div className={styles.medSmallCell}><label>Timing</label><input className={styles.cellInput} placeholder="e.g. After meal" value={m.timing || ''} onChange={e => updateMed(i, 'timing', e.target.value)} /></div>
                    <div className={styles.medSmallCell}><label>Duration</label><NumberUnitInput className={styles.cellInput} placeholder="e.g. 5 days" value={m.duration || ''} onChange={v => updateMed(i, 'duration', v)} /></div>
                    <div className={styles.medSmallCell}><label>Start From</label><NumberUnitInput className={styles.cellInput} placeholder="e.g. Today, Day 3" value={m.start_from || ''} onChange={v => updateMed(i, 'start_from', v)} /></div>
                  </div>
                  <div className={styles.medCardRow3}><label>Instructions</label><input className={styles.cellInput} placeholder="Special instructions for this medicine…" value={m.instructions || ''} onChange={e => updateMed(i, 'instructions', e.target.value)} /></div>
                </div>
              ))}
              <button className={styles.addLine} onClick={addMed}><Plus size={13} /> Add Medicine</button>
            </div>
          </ICard>
        );
        if (key === 'lab_investigations') return (
          <ICard key="lab_investigations" title="Lab Investigations" icon="🧪" color="#0891b2">
            <div className={styles.labInvList}>
              {form.lab_investigations.map((l, i) => {
                const isStr = typeof l === 'string';
                return (
                  <div key={i} className={styles.labInvCard}>
                    <div className={styles.labInvRow}>
                      <div className={styles.labInvName}><label>Test</label>
                        <AutocompleteInput value={isStr ? l : (l.test || '')} onChange={v => isStr ? set('lab_investigations', form.lab_investigations.map((x,j)=>j===i?v:x)) : updateLabInv(i, 'test', v)} onSelect={item => updateLabInv(i, 'test', item.name)} fetchSuggestions={fetchLOINC} placeholder="e.g. CBC, HbA1c, Lipid Profile" inputClassName={styles.cellInput} />
                      </div>
                      <div className={styles.labInvSmall}><label>Repeat On</label><input className={styles.cellInput} placeholder="e.g. 2 weeks" value={isStr ? '' : (l.repeat_on || '')} onChange={e => updateLabInv(i, 'repeat_on', e.target.value)} disabled={isStr} /></div>
                      <button className={styles.del} onClick={() => set('lab_investigations', form.lab_investigations.filter((_,j)=>j!==i))}>✕</button>
                    </div>
                    <div className={styles.labInvRemarks}><label>Remarks</label><input className={styles.cellInput} placeholder="Special instructions or remarks…" value={isStr ? '' : (l.remarks || '')} onChange={e => updateLabInv(i, 'remarks', e.target.value)} disabled={isStr} /></div>
                  </div>
                );
              })}
              <button className={styles.addLine} onClick={addLabInv}><Plus size={13} /> Add Investigation</button>
            </div>
          </ICard>
        );
        if (key === 'lab_results') return (
          <ICard key="lab_results" title="Lab Results" icon="📊" color="#06b6d4">
            <div className={styles.tableWrap}>
              {form.lab_results.length > 0 && (
                <div className={styles.table}>
                  <div className={`${styles.tHead} ${styles.tHead4}`}><span>Test Name</span><span>Result</span><span>Unit</span><span>Normal Range</span><span /></div>
                  {form.lab_results.map((r, i) => {
                    // Determine flag from result vs range (e.g. "11-16", "11–16", ">4")
                    let flag = null;
                    const val = parseFloat(r.result);
                    if (!isNaN(val) && r.range) {
                      const m = r.range.match(/([<>]?)\s*([\d.]+)\s*[-–]\s*([\d.]+)/);
                      if (m) {
                        const lo = parseFloat(m[2]), hi = parseFloat(m[3]);
                        flag = val < lo ? 'L' : val > hi ? 'H' : 'N';
                      }
                    }
                    const borderColor = flag === 'N' ? '#16a34a' : (flag === 'L' || flag === 'H') ? '#dc2626' : undefined;
                    const inputStyle = borderColor ? { borderColor, boxShadow: `0 0 0 1px ${borderColor}` } : {};
                    return (
                    <div key={i} className={`${styles.tRow} ${styles.tRow4}`}
                      style={borderColor ? { borderLeft: `3px solid ${borderColor}`, borderRadius: 5 } : {}}>
                      <AutocompleteInput value={r.test} onChange={v => updateLabResult(i, 'test', v)} onSelect={item => updateLabResult(i, 'test', item.name)} fetchSuggestions={fetchLOINC} placeholder="e.g. Hb" inputClassName={styles.cellInput} inputStyle={inputStyle} />
                      <input placeholder="e.g. 12.5" value={r.result} className={styles.cellInput} style={inputStyle} onChange={e => updateLabResult(i, 'result', e.target.value)} />
                      <input placeholder="e.g. g/dL" value={r.unit}   className={styles.cellInput} style={inputStyle} onChange={e => updateLabResult(i, 'unit',   e.target.value)} />
                      <input placeholder="e.g. 11-16" value={r.range}  className={styles.cellInput} style={inputStyle} onChange={e => updateLabResult(i, 'range',  e.target.value)} />
                      <button className={styles.del} onClick={() => set('lab_results', form.lab_results.filter((_, j) => j !== i))}>✕</button>
                    </div>
                    );
                  })}
                </div>
              )}
              <button className={styles.addLine} onClick={addLabResult}><Plus size={13} /> Add Result</button>
            </div>
          </ICard>
        );
        if (key === 'examination_findings') return (
          <ICard key="examination_findings" title="Examination Findings" icon="🩻" color="#6366f1">
            <textarea rows={3} placeholder="Clinical findings on examination…" value={form.examination_findings || ''} onChange={e => set('examination_findings', e.target.value)} />
          </ICard>
        );
        if (key === 'notes') return (
          <ICard key="notes" title="Notes" icon="🔒" color="#d97706" badge="Private">
            <div className={styles.notesSection}>
              <div className={styles.notesSectionHead}><span className={styles.notesSectionTitle}>Current Visit Notes</span><span className={styles.notesPrintTag}>Prints on prescription</span></div>
              <div className={styles.privateBox}>Private notes for this visit — treatment, surgical, or other observations.</div>
              <textarea rows={4} placeholder="Type your private notes for this visit…" value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
            </div>
            <div className={styles.notesDivider} />
            <div className={styles.notesSection}>
              <div className={styles.notesSectionHead}><span className={styles.notesSectionTitle}>Past Visit Notes</span><span className={styles.notesROTag}>Read only · Not printed</span></div>
              {pastNotes.length === 0 ? <p className={styles.hint}>No past visit notes found for this patient.</p> : (
                <div className={styles.pastNotesList}>
                  {pastNotes.map((n, i) => (
                    <div key={i} className={styles.pastNote}>
                      <div className={styles.pastNoteMeta}>{n.appointment_date && <span>{new Date(n.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}{n.doctor_name && <span>· Dr. {n.doctor_name}</span>}</div>
                      <p className={styles.pastNoteText}>{n.notes}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ICard>
        );
        if (key === 'refer_to') return (
          <ICard key="refer_to" title="Refer to a Doctor" icon="🏥" color="#ef4444">
            <input placeholder="e.g. Cardiologist — Dr. Mehta, Apollo Hospital" value={form.refer_to || ''} onChange={e => set('refer_to', e.target.value)} />
          </ICard>
        );
        if (key === 'follow_up') return (
          <ICard key="follow_up" title="Follow Up" icon="📅" color="#16a34a">
            <div className={styles.twoCol}>
              <div className={styles.fg}><label>Date</label><input type="date" value={form.next_visit_date || ''} onChange={e => set('next_visit_date', e.target.value)} /></div>
              <div className={`${styles.fg} ${styles.fg2}`}><label>Instructions</label><input placeholder="e.g. Review reports, fasting" value={form.next_visit_notes || ''} onChange={e => set('next_visit_notes', e.target.value)} /></div>
            </div>
          </ICard>
        );
        if (key === 'advices') return (
          <ICard key="advices" title="Advices" icon="💡" color="#10b981">
            <textarea rows={3} placeholder="Diet, lifestyle, patient instructions…" value={form.advices || ''} onChange={e => set('advices', e.target.value)} />
          </ICard>
        );
        if (key === 'procedures') return (
          <ICard key="procedures" title="Procedures" icon="⚕️" color="#7c3aed">
            <div className={styles.chips}>
              {form.procedures.map((p, i) => <span key={i} className={`${styles.chip} ${styles.chipProc}`}>{p}<button onClick={() => removeChip('procedures', i)}>✕</button></span>)}
            </div>
            <div className={styles.addRow}>
              <input placeholder="e.g. ECG, Dressing, Nebulisation…" value={form.procInput || ''} onChange={e => set('procInput', e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChip('procedures', 'procInput'))} />
              <button onClick={() => addChip('procedures', 'procInput')}>Add</button>
            </div>
          </ICard>
        );
        if (key === 'injections') return (
          <ICard key="injections" title="Injections" icon="💉" color="#dc2626">
            <div className={styles.tableWrap}>
              {(form.injections || []).length > 0 && (
                <div className={styles.table}>
                  <div className={`${styles.tHead} ${styles.tHead4}`}><span>Name</span><span>Dose</span><span>Route</span><span>Frequency</span><span /></div>
                  {(form.injections || []).map((inj, i) => (
                    <div key={i} className={`${styles.tRow} ${styles.tRow4}`}>
                      <AutocompleteInput value={inj.name || ''} onChange={v => { const a=[...(form.injections||[])]; a[i]={...a[i],name:v}; set('injections',a); }} onSelect={item => { const a=[...(form.injections||[])]; a[i]={...a[i],name:item.name}; set('injections',a); }} fetchSuggestions={fetchRxTerms} placeholder="Search injection name…" inputClassName={styles.cellInput} renderItem={item => <div className={styles.acItem}><span className={styles.acName}>{item.name}</span>{item.strength && <span className={styles.acSub}>{item.strength}</span>}</div>} />
                      <input placeholder="e.g. 1g" value={inj.dose || ''} className={styles.cellInput} onChange={e => { const a=[...(form.injections||[])]; a[i]={...a[i],dose:e.target.value}; set('injections',a); }} />
                      <input placeholder="e.g. IV, IM, SC" value={inj.route || ''} className={styles.cellInput} onChange={e => { const a=[...(form.injections||[])]; a[i]={...a[i],route:e.target.value}; set('injections',a); }} />
                      <input placeholder="e.g. Once daily" value={inj.frequency || ''} className={styles.cellInput} onChange={e => { const a=[...(form.injections||[])]; a[i]={...a[i],frequency:e.target.value}; set('injections',a); }} />
                      <button className={styles.del} onClick={() => set('injections', (form.injections||[]).filter((_,j)=>j!==i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button className={styles.addLine} onClick={() => set('injections', [...(form.injections||[]), {name:'',dose:'',route:'',frequency:''}])}><Plus size={13} /> Add Injection</button>
            </div>
          </ICard>
        );
        if (key === 'dental_chart') return (
          <ICard key="dental_chart" title="Dental Chart" icon="🦷" color="#0e7490">
            <DentalChart value={form.dental_chart || {}} onChange={v => set('dental_chart', v)} />
          </ICard>
        );
        if (key === 'ophtho_visual_acuity') return (
          <ICard key="ophtho_visual_acuity" title="Ophthalmology - Visual Acuity Test" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Without Glasses" fields={['Distance','Near']} prefix="va_wog" />
            <EyeRow {...eyeRowProps} label="With Glasses"    fields={['Distance','Near']} prefix="va_wg"  />
            <EyeRow {...eyeRowProps} label="With Pinhole"    fields={['Distance','Near']} prefix="va_ph"  />
          </ICard>
        );
        if (key === 'ophtho_subj_refraction') return (
          <ICard key="ophtho_subj_refraction" title="Ophthalmology - Subjective Refraction" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Subjective Refraction" fields={['SPH','CYL','AXIS','VA']} prefix="subj" />
          </ICard>
        );
        if (key === 'ophtho_auto_refraction') return (
          <ICard key="ophtho_auto_refraction" title="Ophthalmology - Auto Refraction" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Auto Refraction" fields={['SPH','CYL','AXIS']} prefix="auto" />
          </ICard>
        );
        if (key === 'ophtho_current_glass') return (
          <ICard key="ophtho_current_glass" title="Ophthalmology - Current Glass Prescription" icon="👓" color="#0891b2">
            <EyeRow {...eyeRowProps} label="Current Glass Prescription" fields={['SPH','CYL','AXIS','ADD','VA']} prefix="cur_glass" />
          </ICard>
        );
        if (key === 'ophtho_final_glass') return (
          <ICard key="ophtho_final_glass" title="Ophthalmology - Final Glass Prescription" icon="👓" color="#0891b2">
            <EyeRow {...eyeRowProps} label="Final Glass Prescription" fields={['SPH','CYL','AXIS','ADD','VA']} prefix="fin_glass" />
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: '#64748b' }}>Instructions</label>
              <input className={styles.cellInput} style={{ width: '100%', marginTop: 4 }} placeholder="e.g. For distance use, anti-glare" value={ophtho.fin_glass_notes || ''} onChange={e => setOphtho('fin_glass_notes', e.target.value)} />
            </div>
          </ICard>
        );
        if (key === 'ophtho_iop') return (
          <ICard key="ophtho_iop" title="Ophthalmology - IOP" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Intraocular Pressure" fields={['IOP (mmHg)','Method','Time']} prefix="iop" />
          </ICard>
        );
        if (key === 'ophtho_lacrimal') return (
          <ICard key="ophtho_lacrimal" title="Ophthalmology - Lacrimal Syringing" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Lacrimal Syringing" fields={['Result','Patent']} prefix="lacrimal" />
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: '#64748b' }}>Notes</label>
              <textarea rows={2} placeholder="Lacrimal syringing observations…" value={ophtho.lacrimal_notes || ''} onChange={e => setOphtho('lacrimal_notes', e.target.value)} style={{ marginTop: 4 }} />
            </div>
          </ICard>
        );
        if (key === 'ophtho_color_vision') return (
          <ICard key="ophtho_color_vision" title="Ophthalmology - Color Vision" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Color Vision (Ishihara)" fields={['Plates Seen','Result']} prefix="color_vision" />
          </ICard>
        );
        if (key === 'ophtho_pmt') return (
          <ICard key="ophtho_pmt" title="Ophthalmology - PMT" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Potential Macular Test" fields={['Result','Notes']} prefix="pmt" />
          </ICard>
        );
        if (key === 'ophtho_k_reading') return (
          <ICard key="ophtho_k_reading" title="Ophthalmology - K Reading / Biometry" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Keratometry" fields={['K1','K2','Axis','Avg']} prefix="kread" />
            <EyeRow {...eyeRowProps} label="Biometry (AL)" fields={['Axial Length','ACD','WTW']} prefix="biom" />
          </ICard>
        );
        if (key === 'ophtho_eye_exam') return (
          <ICard key="ophtho_eye_exam" title="Ophthalmology - Eye Examination / Motility" icon="👁️" color="#7c3aed">
            {[['Lids & Adnexa','lids'],['Conjunctiva','conjunctiva'],['Cornea','cornea'],['Anterior Chamber','ac'],['Iris & Pupil','iris'],['Lens','lens'],['Vitreous','vitreous'],['Fundus','fundus'],['Motility','motility']].map(([label, field]) => (
              <div key={field} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                  {['RE','LE'].map(eye => (
                    <div key={eye}>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{eye}</span>
                      <input className={styles.cellInput} placeholder="Normal" value={ophtho[`eye_${field}_${eye}`] || ''} onChange={e => setOphtho(`eye_${field}_${eye}`, e.target.value)} style={{ width: '100%' }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </ICard>
        );
        if (key === 'ophtho_pachymetry') return (
          <ICard key="ophtho_pachymetry" title="Ophthalmology - Pachymetry" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Corneal Thickness (µm)" fields={['Central','Thinnest','Location']} prefix="pachy" />
          </ICard>
        );
        if (key === 'ophtho_amsler') return (
          <ICard key="ophtho_amsler" title="Ophthalmology - Amsler Grid" icon="👁️" color="#7c3aed">
            <EyeRow {...eyeRowProps} label="Amsler Grid" fields={['Result','Distortion','Scotoma']} prefix="amsler" />
          </ICard>
        );
        if (key === 'ophtho_contact_lens') return (
          <ICard key="ophtho_contact_lens" title="Ophthalmology - Contact Lens" icon="👁️" color="#0891b2">
            <EyeRow {...eyeRowProps} label="Contact Lens" fields={['SPH','CYL','AXIS','BC','DIA','Brand']} prefix="cl" />
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: '#64748b' }}>Type / Instructions</label>
              <input className={styles.cellInput} style={{ width: '100%', marginTop: 4 }} placeholder="e.g. Daily disposable, monthly, toric…" value={ophtho.cl_notes || ''} onChange={e => setOphtho('cl_notes', e.target.value)} />
            </div>
          </ICard>
        );
        return null;
      })}

      {showVitalsCfg && (
        <VitalsConfigModal
          clinicId={clinicId}
          current={vitalsOrder}
          currentCalcs={calcOrder}
          onSave={(order, calcs) => { setVitalsOrder(order); setCalcOrder(calcs); setShowVitalsCfg(false); }}
          onClose={() => setShowVitalsCfg(false)}
        />
      )}

      {/* Calculators — not orderable, always after vitals */}
      {calcOrder.length > 0 && (
        <ICard title="Calculators" icon="🧮" color="#2563eb">
          <CalculatorsSection enabledIds={calcOrder} vitals={form.vitals} calcResults={form.calc_results || {}} onResult={(id, r) => setCalcResult?.(id, r)} />
        </ICard>
      )}

      {/* Custom Sections */}
      {customSections.map(section => (
        <ICard key={section.id} title={section.title || 'Custom Section'} icon="✏️" color="#94a3b8">
          <div className={styles.customHead}>
            <input className={styles.customTitle} placeholder="Section title…"
              value={section.title}
              onChange={e => updateCustom(section.id, 'title', e.target.value)} />
            <button className={styles.customDel} onClick={() => removeCustom(section.id)}>Remove</button>
          </div>
          <textarea rows={3} placeholder="Section content…"
            value={section.content}
            onChange={e => updateCustom(section.id, 'content', e.target.value)} />
        </ICard>
      ))}

      <button className={styles.addSection} onClick={addCustom}>
        <Plus size={14} /> Add Custom Section
      </button>

      {showGrowth && (
        <GrowthChart appt={appt} vitals={form.vitals} onVitalsChange={setVital} onClose={() => setShowGrowth(false)} />
      )}
    </div>
  );
}

// ── InferPad Settings card ────────────────────────────────────────────────────
