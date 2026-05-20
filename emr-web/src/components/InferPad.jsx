import { useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import styles from './InferPad.module.css';
import AutocompleteInput from './AutocompleteInput';
import MedicalHistorySection from './MedicalHistorySection';

// ── Backend proxy helpers (avoids CSP restrictions) ──────────────────────────

async function fetchICD10(query) {
  try {
    const r = await fetch(`/api/emr/autocomplete/icd10?q=${encodeURIComponent(query)}`);
    const rows = await r.json();
    return rows.map(({ code, name }) => ({ code, name, label: `${code} — ${name}` }));
  } catch { return []; }
}

async function fetchRxTerms(query) {
  try {
    const r = await fetch(`/api/emr/autocomplete/rxterms?q=${encodeURIComponent(query)}`);
    const rows = await r.json();
    return rows.map(({ name, strength }) => ({ name, strength, label: name }));
  } catch { return []; }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VITALS_CONFIG = [
  { key: 'bp_systolic',      label: 'Systolic BP',      unit: 'mmHg', placeholder: '120'  },
  { key: 'bp_diastolic',     label: 'Diastolic BP',      unit: 'mmHg', placeholder: '80'   },
  { key: 'temp',             label: 'Temperature',       unit: '°C',   placeholder: '37.2' },
  { key: 'spo2',             label: 'SpO₂',              unit: '%',    placeholder: '98'   },
  { key: 'pulse',            label: 'Pulse',             unit: 'bpm',  placeholder: '72'   },
  { key: 'respiratory_rate', label: 'Respiratory Rate',  unit: '/min', placeholder: '16'   },
  { key: 'height',           label: 'Height',            unit: 'cm',   placeholder: '170'  },
  { key: 'weight',           label: 'Weight',            unit: 'kg',   placeholder: '70'   },
];

const SEVERITIES = ['Mild', 'Moderate', 'Severe'];

// ── Collapsible card ─────────────────────────────────────────────────────────

function ICard({ title, icon, badge, color = '#6366f1', defaultOpen = true, children }) {
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

export default function InferPad({ form, set, setVital, appt, pastNotes = [] }) {

  // ── Symptom helpers ──────────────────────────────────────────────────────
  const addSymptom = (nameOrItem) => {
    const name = typeof nameOrItem === 'object' ? nameOrItem.name : nameOrItem;
    if (!name?.trim()) return;
    set('symptoms', [...form.symptoms, {
      name: name.trim(),
      code: typeof nameOrItem === 'object' ? (nameOrItem.code || '') : '',
      since:    form.symptomSince    || '',
      severity: form.symptomSeverity || '',
    }]);
    set('symptomInput', '');
    set('symptomSince', '');
    set('symptomSeverity', '');
  };
  const removeSymptom = (i) => set('symptoms', form.symptoms.filter((_, j) => j !== i));

  // ── Diagnosis helpers ────────────────────────────────────────────────────
  const addDiag = (nameOrItem) => {
    const name = typeof nameOrItem === 'object' ? nameOrItem.name : nameOrItem;
    if (!name?.trim()) return;
    set('diagnosis', [...form.diagnosis, {
      display:  name.trim(),
      code:     typeof nameOrItem === 'object' ? (nameOrItem.code || '') : '',
      system:   'http://snomed.info/sct',
      status:   'active',
      since:    form.diagSince    || '',
      severity: form.diagSeverity || '',
    }]);
    set('diagInput', '');
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

  return (
    <div className={styles.wrap}>

      {/* 1 — Vitals */}
      <ICard title="Vitals" icon="🩺" color="#3b82f6">
        <div className={styles.vitalsGrid}>
          {VITALS_CONFIG.map(({ key, label, unit, placeholder }) => (
            <div key={key} className={styles.vCell}>
              <label>{label} <span className={styles.unit}>{unit}</span></label>
              <input type="number" value={form.vitals[key] || ''}
                onChange={e => setVital(key, e.target.value)} placeholder={placeholder} />
            </div>
          ))}
          <div className={styles.vCell}>
            <label>BMI <span className={styles.unit}>kg/m²</span>
              {form.vitals.bmi && <span className={styles.autoTag}>auto</span>}
            </label>
            <input type="number"
              className={form.vitals.bmi ? styles.vInputAuto : ''}
              value={form.vitals.bmi || ''}
              onChange={e => setVital('bmi', e.target.value)} placeholder="auto" />
          </div>
        </div>
      </ICard>

      {/* 2 — Patient Medical History (same grid as Check-In) */}
      <ICard title="Patient Medical History" icon="📋" color="#64748b" defaultOpen={false}>
        <MedicalHistorySection
          value={form.medical_history || []}
          onChange={v => set('medical_history', v)}
        />
      </ICard>

      {/* 3 — Symptoms (ICD-10 + since + severity) */}
      <ICard title="Symptoms" icon="🤒" color="#f59e0b" defaultOpen={false}>
        <div className={styles.chips}>
          {form.symptoms.map((s, i) => {
            const name = typeof s === 'string' ? s : s.name;
            return (
              <span key={i} className={`${styles.chip} ${styles.chipSymptom}`}>
                {name}
                {s.since    && <span className={styles.chipMeta}> · {s.since}</span>}
                {s.severity && <span className={styles.chipMeta}> · {s.severity}</span>}
                <button onClick={() => removeSymptom(i)}>✕</button>
              </span>
            );
          })}
        </div>
        <AutocompleteInput
          value={form.symptomInput || ''}
          onChange={v => set('symptomInput', v)}
          onSelect={addSymptom}
          onAddChip={addSymptom}
          fetchSuggestions={fetchICD10}
          placeholder="Search ICD-10 or type symptom, press Enter…"
          renderItem={item => (
            <div className={styles.acItem}>
              <span className={styles.acCode}>{item.code}</span>
              <span className={styles.acName}>{item.name}</span>
            </div>
          )}
        />
        <div className={styles.metaRow}>
          <div className={styles.metaField}>
            <label>Since</label>
            <input placeholder="e.g. 2 days, 1 week"
              value={form.symptomSince || ''}
              onChange={e => set('symptomSince', e.target.value)} />
          </div>
          <div className={styles.metaField}>
            <label>Severity</label>
            <SeverityPills value={form.symptomSeverity || ''} onChange={v => set('symptomSeverity', v)} />
          </div>
        </div>
      </ICard>

      {/* 4 — Diagnosis (ICD-10 + since + severity) */}
      <ICard title="Diagnosis" icon="🔬" color="#eab308" defaultOpen={false}>
        <div className={styles.chips}>
          {form.diagnosis.map((d, i) => (
            <span key={i} className={`${styles.chip} ${styles.chipDiag}`}>
              {d.display}
              {d.code     && <span className={styles.chipCode}> [{d.code}]</span>}
              {d.since    && <span className={styles.chipMeta}> · {d.since}</span>}
              {d.severity && <span className={styles.chipMeta}> · {d.severity}</span>}
              <button onClick={() => removeDiag(i)}>✕</button>
            </span>
          ))}
        </div>
        <AutocompleteInput
          value={form.diagInput || ''}
          onChange={v => set('diagInput', v)}
          onSelect={addDiag}
          onAddChip={addDiag}
          fetchSuggestions={fetchICD10}
          placeholder="Search ICD-10 or type diagnosis, press Enter…"
          renderItem={item => (
            <div className={styles.acItem}>
              <span className={styles.acCode}>{item.code}</span>
              <span className={styles.acName}>{item.name}</span>
            </div>
          )}
        />
        <div className={styles.metaRow}>
          <div className={styles.metaField}>
            <label>Since</label>
            <input placeholder="e.g. 3 years"
              value={form.diagSince || ''}
              onChange={e => set('diagSince', e.target.value)} />
          </div>
          <div className={styles.metaField}>
            <label>Severity</label>
            <SeverityPills value={form.diagSeverity || ''} onChange={v => set('diagSeverity', v)} />
          </div>
        </div>
      </ICard>

      {/* 5 — Medications (expanded fields) */}
      <ICard title="℞  Medications" icon="💊" color="#8b5cf6" defaultOpen={false}>
        <div className={styles.medList}>
          {form.medications.map((m, i) => (
            <div key={i} className={styles.medCard}>
              <div className={styles.medCardRow}>
                {/* Medicine name — RxTerms autocomplete */}
                <div className={styles.medNameCell}>
                  <label>Medicine</label>
                  <AutocompleteInput
                    value={m.name}
                    onChange={v => updateMed(i, 'name', v)}
                    onSelect={item => updateMed(i, 'name', item.name)}
                    fetchSuggestions={fetchRxTerms}
                    placeholder="Search or type medicine…"
                    inputClassName={styles.cellInput}
                    renderItem={item => (
                      <div className={styles.acItem}>
                        <span className={styles.acName}>{item.name}</span>
                        {item.strength && <span className={styles.acSub}>{item.strength}</span>}
                      </div>
                    )}
                  />
                </div>
                <div className={styles.medSmallCell}>
                  <label>Dose</label>
                  <input className={styles.cellInput} placeholder="e.g. 1 tablet"
                    value={m.dose || m.dosage || ''}
                    onChange={e => updateMed(i, 'dose', e.target.value)} />
                </div>
                <div className={styles.medSmallCell}>
                  <label>Frequency</label>
                  <input className={styles.cellInput} placeholder="e.g. 1-0-1, TDS"
                    value={m.frequency || ''}
                    onChange={e => updateMed(i, 'frequency', e.target.value)} />
                </div>
                <button className={`${styles.del} ${styles.delTop}`}
                  onClick={() => set('medications', form.medications.filter((_, j) => j !== i))}>✕</button>
              </div>
              <div className={styles.medCardRow2}>
                <div className={styles.medSmallCell}>
                  <label>Timing</label>
                  <input className={styles.cellInput} placeholder="e.g. After meal"
                    value={m.timing || ''}
                    onChange={e => updateMed(i, 'timing', e.target.value)} />
                </div>
                <div className={styles.medSmallCell}>
                  <label>Duration</label>
                  <input className={styles.cellInput} placeholder="e.g. 5 days"
                    value={m.duration || ''}
                    onChange={e => updateMed(i, 'duration', e.target.value)} />
                </div>
                <div className={styles.medSmallCell}>
                  <label>Start From</label>
                  <input className={styles.cellInput} placeholder="e.g. Today, Day 3"
                    value={m.start_from || ''}
                    onChange={e => updateMed(i, 'start_from', e.target.value)} />
                </div>
              </div>
              <div className={styles.medCardRow3}>
                <label>Instructions</label>
                <input className={styles.cellInput} placeholder="Special instructions for this medicine…"
                  value={m.instructions || ''}
                  onChange={e => updateMed(i, 'instructions', e.target.value)} />
              </div>
            </div>
          ))}
          <button className={styles.addLine} onClick={addMed}><Plus size={13} /> Add Medicine</button>
        </div>
      </ICard>

      {/* 6 — Lab Investigations */}
      <ICard title="Lab Investigations" icon="🧪" color="#0891b2" defaultOpen={false}>
        <div className={styles.labInvList}>
          {form.lab_investigations.map((l, i) => {
            const isStr = typeof l === 'string';
            return (
              <div key={i} className={styles.labInvCard}>
                <div className={styles.labInvRow}>
                  <div className={styles.labInvName}>
                    <label>Test</label>
                    <input className={styles.cellInput}
                      placeholder="e.g. CBC, HbA1c, Lipid Profile"
                      value={isStr ? l : (l.test || '')}
                      onChange={e => isStr
                        ? set('lab_investigations', form.lab_investigations.map((x,j)=>j===i?e.target.value:x))
                        : updateLabInv(i, 'test', e.target.value)} />
                  </div>
                  <div className={styles.labInvSmall}>
                    <label>Repeat On</label>
                    <input className={styles.cellInput}
                      placeholder="e.g. 2 weeks"
                      value={isStr ? '' : (l.repeat_on || '')}
                      onChange={e => updateLabInv(i, 'repeat_on', e.target.value)}
                      disabled={isStr} />
                  </div>
                  <button className={styles.del}
                    onClick={() => set('lab_investigations', form.lab_investigations.filter((_,j)=>j!==i))}>✕</button>
                </div>
                <div className={styles.labInvRemarks}>
                  <label>Remarks</label>
                  <input className={styles.cellInput}
                    placeholder="Special instructions or remarks…"
                    value={isStr ? '' : (l.remarks || '')}
                    onChange={e => updateLabInv(i, 'remarks', e.target.value)}
                    disabled={isStr} />
                </div>
              </div>
            );
          })}
          <button className={styles.addLine} onClick={addLabInv}><Plus size={13} /> Add Investigation</button>
        </div>
      </ICard>

      {/* 7 — Lab Results */}
      <ICard title="Lab Results" icon="📊" color="#06b6d4" defaultOpen={false}>
        <div className={styles.tableWrap}>
          {form.lab_results.length > 0 && (
            <div className={styles.table}>
              <div className={`${styles.tHead} ${styles.tHead4}`}>
                <span>Test Name</span><span>Result</span><span>Unit</span><span>Normal Range</span><span />
              </div>
              {form.lab_results.map((r, i) => (
                <div key={i} className={`${styles.tRow} ${styles.tRow4}`}>
                  <input placeholder="e.g. Hb"    value={r.test}   className={styles.cellInput} onChange={e => updateLabResult(i, 'test',   e.target.value)} />
                  <input placeholder="e.g. 12.5"  value={r.result} className={styles.cellInput} onChange={e => updateLabResult(i, 'result', e.target.value)} />
                  <input placeholder="e.g. g/dL"  value={r.unit}   className={styles.cellInput} onChange={e => updateLabResult(i, 'unit',   e.target.value)} />
                  <input placeholder="e.g. 11-16" value={r.range}  className={styles.cellInput} onChange={e => updateLabResult(i, 'range',  e.target.value)} />
                  <button className={styles.del}
                    onClick={() => set('lab_results', form.lab_results.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
          <button className={styles.addLine} onClick={addLabResult}><Plus size={13} /> Add Result</button>
        </div>
      </ICard>

      {/* 8 — Examination Findings */}
      <ICard title="Examination Findings" icon="🩻" color="#6366f1" defaultOpen={false}>
        <textarea rows={3} placeholder="Clinical findings on examination…"
          value={form.examination_findings || ''}
          onChange={e => set('examination_findings', e.target.value)} />
      </ICard>

      {/* 9 — Notes (current + past) */}
      <ICard title="Notes" icon="🔒" color="#d97706" badge="Private" defaultOpen={false}>
        <div className={styles.notesSection}>
          <div className={styles.notesSectionHead}>
            <span className={styles.notesSectionTitle}>Current Visit Notes</span>
            <span className={styles.notesPrintTag}>Prints on prescription</span>
          </div>
          <div className={styles.privateBox}>
            Private notes for this visit — treatment, surgical, or other observations.
          </div>
          <textarea rows={4} placeholder="Type your private notes for this visit…"
            value={form.notes || ''}
            onChange={e => set('notes', e.target.value)} />
        </div>

        <div className={styles.notesDivider} />

        <div className={styles.notesSection}>
          <div className={styles.notesSectionHead}>
            <span className={styles.notesSectionTitle}>Past Visit Notes</span>
            <span className={styles.notesROTag}>Read only · Not printed</span>
          </div>
          {pastNotes.length === 0 ? (
            <p className={styles.hint}>No past visit notes found for this patient.</p>
          ) : (
            <div className={styles.pastNotesList}>
              {pastNotes.map((n, i) => (
                <div key={i} className={styles.pastNote}>
                  <div className={styles.pastNoteMeta}>
                    {n.appointment_date && (
                      <span>{new Date(n.appointment_date).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}</span>
                    )}
                    {n.doctor_name && <span>· Dr. {n.doctor_name}</span>}
                  </div>
                  <p className={styles.pastNoteText}>{n.notes}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </ICard>

      {/* 10 — Refer to a Doctor */}
      <ICard title="Refer to a Doctor" icon="🏥" color="#ef4444" defaultOpen={false}>
        <input placeholder="e.g. Cardiologist — Dr. Mehta, Apollo Hospital"
          value={form.refer_to || ''}
          onChange={e => set('refer_to', e.target.value)} />
      </ICard>

      {/* 11 — Follow Up */}
      <ICard title="Follow Up" icon="📅" color="#16a34a" defaultOpen={false}>
        <div className={styles.twoCol}>
          <div className={styles.fg}>
            <label>Date</label>
            <input type="date" value={form.next_visit_date || ''}
              onChange={e => set('next_visit_date', e.target.value)} />
          </div>
          <div className={`${styles.fg} ${styles.fg2}`}>
            <label>Instructions</label>
            <input placeholder="e.g. Review reports, fasting"
              value={form.next_visit_notes || ''}
              onChange={e => set('next_visit_notes', e.target.value)} />
          </div>
        </div>
      </ICard>

      {/* 12 — Advices */}
      <ICard title="Advices" icon="💡" color="#10b981" defaultOpen={false}>
        <textarea rows={3} placeholder="Diet, lifestyle, patient instructions…"
          value={form.advices || ''}
          onChange={e => set('advices', e.target.value)} />
      </ICard>

      {/* 13 — Procedures */}
      <ICard title="Procedures" icon="⚕️" color="#7c3aed" defaultOpen={false}>
        <div className={styles.chips}>
          {form.procedures.map((p, i) => (
            <span key={i} className={`${styles.chip} ${styles.chipProc}`}>
              {p}<button onClick={() => removeChip('procedures', i)}>✕</button>
            </span>
          ))}
        </div>
        <div className={styles.addRow}>
          <input placeholder="e.g. ECG, Dressing, Nebulisation…"
            value={form.procInput || ''}
            onChange={e => set('procInput', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChip('procedures', 'procInput'))} />
          <button onClick={() => addChip('procedures', 'procInput')}>Add</button>
        </div>
      </ICard>

      {/* 14 — Custom Sections */}
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

    </div>
  );
}
