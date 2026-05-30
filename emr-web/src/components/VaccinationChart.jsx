import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Syringe, X, RefreshCw } from 'lucide-react';
import s from './VaccinationChart.module.css';

// ── IAP Schedule ─────────────────────────────────────────────────────────────
const IAP_GROUPS = [
  { id: 'birth',   label: 'Birth',        days: 0,    vaccines: [
    { id: 'BCG',   name: 'BCG' },
    { id: 'HB-1',  name: 'HB-1' },
    { id: 'OPV',   name: 'OPV' },
  ]},
  { id: 'w6',      label: '6 Weeks',      days: 42,   vaccines: [
    { id: 'HB-2',  name: 'HB-2' },
    { id: 'IPV-1', name: 'IPV-1' },
    { id: 'DPT-1', name: 'DPT-1' },
    { id: 'Hib-1', name: 'Hib-1' },
    { id: 'PCV-1', name: 'PCV-1' },
    { id: 'RV-1',  name: 'RV-1' },
  ]},
  { id: 'w10',     label: '10 Weeks',     days: 70,   vaccines: [
    { id: 'HB-3',  name: 'HB-3' },
    { id: 'IPV-2', name: 'IPV-2' },
    { id: 'DPT-2', name: 'DPT-2' },
    { id: 'Hib-2', name: 'Hib-2' },
    { id: 'PCV-2', name: 'PCV-2' },
    { id: 'RV-2',  name: 'RV-2' },
  ]},
  { id: 'w14',     label: '14 Weeks',     days: 98,   vaccines: [
    { id: 'HB-4',  name: 'HB-4' },
    { id: 'IPV-3', name: 'IPV-3' },
    { id: 'DPT-3', name: 'DPT-3' },
    { id: 'Hib-3', name: 'Hib-3' },
    { id: 'PCV-3', name: 'PCV-3' },
    { id: 'RV-3',  name: 'RV-3' },
  ]},
  { id: 'm6',      label: '6 Months',     days: 183,  vaccines: [
    { id: 'Influenza-1', name: 'Influenza-1' },
    { id: 'TCV',         name: 'TCV' },
  ]},
  { id: 'm7',      label: '7 Months',     days: 213,  vaccines: [
    { id: 'Influenza-2', name: 'Influenza-2' },
  ]},
  { id: 'm9',      label: '9 Months',     days: 274,  vaccines: [
    { id: 'Meningococcal-1', name: 'Meningococcal 1' },
    { id: 'Yellow-Fever',    name: 'Yellow Fever' },
    { id: 'MMR-1',           name: 'MMR-1' },
  ]},
  { id: 'm12',     label: '12 Months',    days: 365,  vaccines: [
    { id: 'Hep-A-Live',      name: 'Hep A - Live Vaccine' },
    { id: 'Hep-A1-Inact',    name: 'Hep A1 - Inactivated' },
    { id: 'Meningococcal-2', name: 'Meningococcal 2' },
    { id: 'JE-1',            name: 'JE 1' },
    { id: 'Cholera-1',       name: 'Cholera 1' },
  ]},
  { id: 'm12_18',  label: '12-18 Months', days: 365,  vaccines: [
    { id: 'PCV-B', name: 'PCV B' },
  ]},
  { id: 'm13',     label: '13 Months',    days: 396,  vaccines: [
    { id: 'JE-2',      name: 'JE 2' },
    { id: 'Cholera-2', name: 'Cholera 2' },
  ]},
  { id: 'm15',     label: '15 Months',    days: 457,  vaccines: [
    { id: 'Varicella-1', name: 'Varicella Dose 1' },
    { id: 'MMR-2',       name: 'MMR-2' },
  ]},
  { id: 'm16_18',  label: '16-18 Months', days: 487,  vaccines: [
    { id: 'IPV-B1', name: 'IPV B1' },
    { id: 'DPT-B1', name: 'DPT B1' },
    { id: 'Hib-B1', name: 'Hib B1' },
  ]},
  { id: 'm18_24',  label: '18-24 Months', days: 548,  vaccines: [
    { id: 'Hep-A2-Inact', name: 'Hep A2 - Inactivated' },
    { id: 'Varicella-2',  name: 'Varicella Dose 2' },
  ]},
  { id: 'y2_3',    label: '2-3 Years',    days: 730,  vaccines: [
    { id: 'PPSV-23', name: 'PPSV 23' },
  ]},
  { id: 'y4_6',    label: '4-6 Years',    days: 1460, vaccines: [
    { id: 'IPV-B2', name: 'IPV B2' },
    { id: 'DPT-B2', name: 'DPT B2' },
    { id: 'MMR-3',  name: 'MMR-3' },
  ]},
  { id: 'y9_14',   label: '9-14 Years',   days: 3285, vaccines: [
    { id: 'Tdap',  name: 'Tdap' },
    { id: 'HPV-1', name: 'HPV-1' },
    { id: 'HPV-2', name: 'HPV-2', extraDays: 180 },
  ]},
  { id: 'y15_18',  label: '15-18 Years',  days: 5475, vaccines: [
    { id: 'Td',     name: 'Td' },
    { id: 'HPV-D1', name: 'HPV-D1' },
    { id: 'HPV-D2', name: 'HPV-D2', extraDays: 30 },
    { id: 'HPV-D3', name: 'HPV-D3', extraDays: 180 },
  ]},
];

// ── Other Vaccines ────────────────────────────────────────────────────────────
const OTHER_VACCINES = [
  { category: 'Td',            vaccines: ['Td Dose 1', 'Td Dose 2', 'Td Dose 3'] },
  { category: 'Pneumococcal',  vaccines: ['PPSV 23 - Dose 1', 'PCV 13', 'PPSV 23 - Dose 2'] },
  { category: 'Influenza',     vaccines: Array.from({ length: 10 }, (_, i) => `Influenza Annual ${i + 1}`) },
  { category: 'HPV',           vaccines: ['HPV 1', 'HPV 2', 'HPV 3'] },
  { category: 'Covid-19',      vaccines: ['Corbevax 1', 'Corbevax 2'] },
  { category: 'Rabies',        vaccines: ['Day 0', 'Day 3', 'Day 7', 'Day 14', 'Day 28'] },
  { category: 'Meningococcal', vaccines: ['Meningococcal 1', 'Meningococcal 2'] },
  { category: 'Yellow Fever',  vaccines: ['Yellow Fever'] },
  { category: 'Hepatitis B',   vaccines: ['Hepatitis B Dose 1', 'Hepatitis B Dose 2', 'Hepatitis B Dose 3'] },
  { category: 'Hepatitis A',   vaccines: ['Hepatitis A Dose 1', 'Hepatitis A Dose 2'] },
  { category: 'JE',            vaccines: ['JE 1', 'JE Booster'] },
  { category: 'MMR',           vaccines: ['MMR 1', 'MMR 2'] },
  { category: 'Varicella',     vaccines: ['Varicella 1', 'Varicella 2'] },
  { category: 'Typhoid',       vaccines: ['Typhoid Dose 1', 'Typhoid Dose 2', 'Typhoid Dose 3', 'Typhoid Booster'] },
  { category: 'Hib',           vaccines: ['Hib'] },
  { category: 'Rotavirus',     vaccines: ['RV 1', 'RV 2', 'RV 3'] },
  { category: 'Cholera',       vaccines: ['Cholera'] },
  { category: 'Herpes zoster', vaccines: ['Shingrix 1', 'Shingrix 2'] },
  { category: 'DTwP/DTaP',     vaccines: ['Tdap'] },
];

const STATUS_CONFIG = {
  given:   { label: 'Given',           color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  due:     { label: 'Due',             color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  refused: { label: 'Patient Refused', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  missed:  { label: 'Missed',          color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtVaccDate(d) {
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}'${String(d.getFullYear()).slice(2)}`;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

// Convert Date → YYYY-MM-DD for <input type="date">
function toInputDate(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Convert YYYY-MM-DD → "DD Mon'YY"
function fmtInputDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return fmtVaccDate(d);
}

// ── Status badge (read-only display in grid) ──────────────────────────────────
function StatusBadge({ status }) {
  const cfg = status ? STATUS_CONFIG[status] : null;
  if (!cfg) return null;
  return (
    <span className={s.statusBadge} style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  );
}

// ── Status dropdown (used inside modal) ──────────────────────────────────────
function StatusSelect({ value, onChange }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const cfg = value ? STATUS_CONFIG[value] : null;

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} className={s.mselWrap}>
      <button
        className={s.mselBtn}
        style={cfg ? { color: cfg.color, borderColor: cfg.border, background: cfg.bg } : {}}
        onClick={() => setOpen(o => !o)}
      >
        <span>{cfg ? cfg.label : 'Select Status'}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className={s.mselDrop}>
          <button className={s.mselOpt} style={{ color: '#64748b' }} onClick={() => { onChange(''); setOpen(false); }}>
            — None —
          </button>
          {Object.entries(STATUS_CONFIG).map(([k, c]) => (
            <button key={k} className={s.mselOpt} style={{ color: c.color }}
              onClick={() => { onChange(k); setOpen(false); }}>
              <span className={s.statusDot} style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Update Vaccine Modal ──────────────────────────────────────────────────────
function UpdateVaccineModal({ entries, onClose, onDone }) {
  // entries: [{ vaccKey, vaccineName, defaultDate }]
  const [rows, setRows] = useState(() =>
    entries.map(e => ({
      vaccKey:     e.vaccKey,
      vaccineName: e.vaccineName,
      defaultDate: e.defaultDate,
      status:      e.existing?.status || '',
      date:        e.existing?.inputDate || e.defaultDate || '',
      brand:       e.existing?.brand || '',
      batch:       e.existing?.batch || '',
      notes:       e.existing?.notes || '',
    }))
  );

  const update = (i, field, val) => {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  };

  const reset = (i) => {
    setRows(r => r.map((row, idx) => idx === i ? {
      ...row, status: '', date: row.defaultDate || '', brand: '', batch: '', notes: '',
    } : row));
  };

  const handleDone = () => {
    const updates = {};
    rows.forEach(row => {
      if (row.status || row.brand || row.batch || row.notes) {
        updates[row.vaccKey] = {
          status:    row.status,
          date:      fmtInputDate(row.date),
          inputDate: row.date,
          brand:     row.brand,
          batch:     row.batch,
          notes:     row.notes,
        };
      }
    });
    onDone(updates);
  };

  return (
    <div className={s.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>Update vaccines</span>
          <button className={s.modalClose} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={s.modalBody}>
          <table className={s.modalTable}>
            <thead>
              <tr>
                <th>Vaccine</th>
                <th>Status</th>
                <th>Date</th>
                <th>Brand</th>
                <th>Batch Number</th>
                <th>Notes (If Any)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.vaccKey}>
                  <td className={s.mtVaccName}>{row.vaccineName}</td>
                  <td>
                    <StatusSelect value={row.status} onChange={v => update(i, 'status', v)} />
                  </td>
                  <td>
                    <div className={s.mtDateWrap}>
                      <span className={s.mtDateDisplay}>
                        {row.date ? fmtInputDate(row.date) : '—'}
                      </span>
                      <input
                        type="date"
                        className={s.mtDateInput}
                        value={row.date}
                        onChange={e => update(i, 'date', e.target.value)}
                      />
                    </div>
                  </td>
                  <td>
                    <input className={s.mtInput} placeholder="Brand name"
                      value={row.brand} onChange={e => update(i, 'brand', e.target.value)} />
                  </td>
                  <td>
                    <input className={s.mtInput} placeholder="Batch number"
                      value={row.batch} onChange={e => update(i, 'batch', e.target.value)} />
                  </td>
                  <td>
                    <textarea className={s.mtNotes} placeholder="Notes..."
                      value={row.notes} onChange={e => update(i, 'notes', e.target.value)} rows={1} />
                  </td>
                  <td>
                    <button className={s.mtReset} onClick={() => reset(i)} title="Reset">
                      <RefreshCw size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={s.modalFoot}>
          <button className={s.modalBtnClose} onClick={onClose}>Close</button>
          <button className={s.modalBtnDone} onClick={handleDone}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Other Vaccines status cell (inline popover, kept for Other tab) ───────────
function StatusCell({ vaccKey, vaccinations, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const rec = vaccinations[vaccKey];
  const cfg = rec ? STATUS_CONFIG[rec.status] : null;

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const setStatus = (status) => {
    const next = { ...vaccinations };
    if (status === null) delete next[vaccKey];
    else next[vaccKey] = { ...(rec || {}), status };
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={ref} className={s.statusWrap}>
      <button
        className={s.statusBtn}
        style={cfg ? { background: cfg.bg, color: cfg.color, borderColor: cfg.border } : {}}
        onClick={() => setOpen(o => !o)}
      >
        {cfg ? cfg.label : <span className={s.statusPlaceholder}>Set status</span>}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className={s.statusPopover}>
          {Object.entries(STATUS_CONFIG).map(([key, c]) => (
            <button key={key} className={s.statusOption} style={{ color: c.color }}
              onClick={() => setStatus(key)}>
              <span className={s.statusDot} style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
          {rec && (
            <button className={s.statusOption} style={{ color: '#64748b' }} onClick={() => setStatus(null)}>
              <span className={s.statusDot} style={{ background: '#cbd5e1' }} />
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VaccinationChart({ dob, age, vaccinations = {}, onChange }) {
  const [mode, setMode] = useState('iap');
  const [modalEntries, setModalEntries] = useState(null); // null = closed

  const dobDate = dob ? new Date(dob + 'T00:00:00') : null;
  const today   = new Date();
  const ageInDays = dobDate ? Math.floor((today - dobDate) / 86400000) : null;
  const ageYears  = ageInDays ? Math.floor(ageInDays / 365) : null;
  const ageDisplay = age || (ageYears !== null ? `${ageYears}y` : null);

  const getDate = (days, extra = 0) =>
    dobDate ? addDays(dobDate, days + extra) : null;

  const currentGroupId = (() => {
    if (ageInDays === null) return IAP_GROUPS[IAP_GROUPS.length - 1].id;
    let cur = IAP_GROUPS[0].id;
    for (const g of IAP_GROUPS) { if (ageInDays >= g.days) cur = g.id; }
    return cur;
  })();

  const isGroupAllGiven = g =>
    g.vaccines.every(v => vaccinations[`iap_${v.id}`]?.status === 'given');

  const handleGroupCheck = (g, checked) => {
    const next = { ...vaccinations };
    g.vaccines.forEach(v => {
      const k = `iap_${v.id}`;
      const d = getDate(g.days, v.extraDays || 0);
      if (checked) next[k] = { status: 'given', date: fmtVaccDate(d), inputDate: toInputDate(d) };
      else delete next[k];
    });
    onChange(next);
  };

  const handleAllPastGiven = () => {
    const next = { ...vaccinations };
    for (const g of IAP_GROUPS) {
      const d = getDate(g.days);
      if (d && d > today) break;
      g.vaccines.forEach(v => {
        const vd = getDate(g.days, v.extraDays || 0);
        next[`iap_${v.id}`] = { status: 'given', date: fmtVaccDate(vd), inputDate: toInputDate(vd) };
      });
    }
    onChange(next);
  };

  const handleCurrentGiven = () => {
    const g = IAP_GROUPS.find(x => x.id === currentGroupId);
    if (!g) return;
    const next = { ...vaccinations };
    g.vaccines.forEach(v => {
      const vd = getDate(g.days, v.extraDays || 0);
      next[`iap_${v.id}`] = { status: 'given', date: fmtVaccDate(vd), inputDate: toInputDate(vd) };
    });
    onChange(next);
  };

  const openModal = (vaccKey, vaccineName, scheduledDate) => {
    setModalEntries([{
      vaccKey,
      vaccineName,
      defaultDate:  toInputDate(scheduledDate),
      existing:     vaccinations[vaccKey] || null,
    }]);
  };

  const handleModalDone = (updates) => {
    onChange({ ...vaccinations, ...updates });
    setModalEntries(null);
  };

  const otherKey = (cat, name) => `other_${(cat + '_' + name).replace(/[\s/]+/g, '_')}`;

  const givenCount = Object.values(vaccinations).filter(v => v.status === 'given').length;
  const totalSet   = Object.keys(vaccinations).length;

  return (
    <div className={s.root}>
      {/* ── Top bar ── */}
      <div className={s.topBar}>
        <div className={s.modeGroup}>
          <button
            className={`${s.modeBtn} ${mode === 'iap' ? s.modeBtnActive : ''}`}
            onClick={() => setMode('iap')}
          >
            <Syringe size={13} strokeWidth={2} />
            IAP Schedule
            <ChevronDown size={11} />
          </button>
          <button
            className={`${s.modeBtn} ${mode === 'other' ? s.modeBtnActive : ''}`}
            onClick={() => setMode('other')}
          >
            Other Vaccines
          </button>
        </div>

        {ageDisplay && (
          <span className={s.ageTag}>Patient Age: <strong>{ageDisplay}</strong></span>
        )}

        {totalSet > 0 && (
          <span className={s.summaryTag}>{givenCount} given · {totalSet} recorded</span>
        )}

        {mode === 'iap' && (
          <div className={s.bulkActions}>
            <span className={s.bulkLabel}>Update:</span>
            <button className={s.bulkBtn} onClick={handleAllPastGiven}>All past vaccines as given</button>
            <button className={s.bulkBtn} onClick={handleCurrentGiven}>Current vaccines as given</button>
          </div>
        )}
      </div>

      {/* ── IAP Grid ── */}
      {mode === 'iap' && (
        <div className={s.gridScroll}>
          <div className={s.grid} style={{ gridTemplateColumns: `repeat(${IAP_GROUPS.length}, 155px)` }}>
            {/* Column headers */}
            {IAP_GROUPS.map(g => {
              const isCur = g.id === currentGroupId;
              return (
                <div key={g.id + '_h'} className={`${s.colHead} ${isCur ? s.colHeadCurrent : ''}`}>
                  <span className={s.colLabel}>{g.label}</span>
                  <input
                    type="checkbox"
                    className={s.colCheck}
                    checked={isGroupAllGiven(g)}
                    onChange={e => handleGroupCheck(g, e.target.checked)}
                  />
                  {isCur && <span className={s.curBadge}>Current Age Group</span>}
                </div>
              );
            })}

            {/* Vaccine cells per column */}
            {IAP_GROUPS.map(g => (
              <div key={g.id + '_v'} className={s.colBody}>
                {g.vaccines.map(v => {
                  const k    = `iap_${v.id}`;
                  const rec  = vaccinations[k];
                  const cfg  = rec?.status ? STATUS_CONFIG[rec.status] : null;
                  const vd   = getDate(g.days, v.extraDays || 0);
                  return (
                    <div
                      key={v.id}
                      className={s.vaccCell}
                      style={cfg ? { borderLeftColor: cfg.color } : {}}
                      onClick={() => openModal(k, v.name, vd)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && openModal(k, v.name, vd)}
                    >
                      <span className={s.vaccName}>{v.name}</span>
                      {vd && <span className={s.vaccDate}>{fmtVaccDate(vd)}</span>}
                      {cfg && <StatusBadge status={rec.status} />}
                      {rec?.brand && <span className={s.vaccMeta}>{rec.brand}</span>}
                      {rec?.batch && <span className={s.vaccMeta}>#{rec.batch}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Other Vaccines ── */}
      {mode === 'other' && (
        <div className={s.otherGrid}>
          {OTHER_VACCINES.map(cat => (
            <div key={cat.category} className={s.otherCard}>
              <div className={s.otherCatHead}>{cat.category}</div>
              <div className={s.otherDoses}>
                {cat.vaccines.map(vname => {
                  const k   = otherKey(cat.category, vname);
                  const rec = vaccinations[k];
                  const cfg = rec ? STATUS_CONFIG[rec.status] : null;
                  return (
                    <div
                      key={vname}
                      className={s.otherRow}
                      style={cfg ? { borderLeftColor: cfg.color } : {}}
                    >
                      <span className={s.otherName}>{vname}</span>
                      <StatusCell vaccKey={k} vaccinations={vaccinations} onChange={onChange} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {modalEntries && (
        <UpdateVaccineModal
          entries={modalEntries}
          onClose={() => setModalEntries(null)}
          onDone={handleModalDone}
        />
      )}
    </div>
  );
}
