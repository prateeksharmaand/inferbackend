import { useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import styles from './InferPad.module.css';

const VITALS_CONFIG = [
  { key: 'bp_systolic',      label: 'Systolic BP',      unit: 'mmHg',  placeholder: '120' },
  { key: 'bp_diastolic',     label: 'Diastolic BP',      unit: 'mmHg',  placeholder: '80'  },
  { key: 'temp',             label: 'Temperature',       unit: '°C',    placeholder: '37.2' },
  { key: 'spo2',             label: 'SpO₂',              unit: '%',     placeholder: '98'  },
  { key: 'pulse',            label: 'Pulse',             unit: 'bpm',   placeholder: '72'  },
  { key: 'respiratory_rate', label: 'Respiratory Rate',  unit: '/min',  placeholder: '16'  },
  { key: 'height',           label: 'Height',            unit: 'cm',    placeholder: '170' },
  { key: 'weight',           label: 'Weight',            unit: 'kg',    placeholder: '70'  },
];

// Collapsible card
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

export default function InferPad({ form, set, setVital, appt }) {
  // Chip helpers (chip arrays + input fields)
  const addChip = (field, inputField) => {
    const val = (form[inputField] || '').trim();
    if (!val) return;
    set(field, [...form[field], val]);
    set(inputField, '');
  };
  const removeChip = (field, idx) => set(field, form[field].filter((_, i) => i !== idx));

  const addDiag = () => {
    if (!(form.diagInput || '').trim()) return;
    set('diagnosis', [...form.diagnosis, {
      display: form.diagInput.trim(), code: '', system: 'http://snomed.info/sct', status: 'active',
    }]);
    set('diagInput', '');
  };

  const addMed = () =>
    set('medications', [...form.medications, { name: '', dosage: '', frequency: '', duration: '' }]);
  const updateMed = (i, k, v) => {
    const arr = [...form.medications]; arr[i] = { ...arr[i], [k]: v }; set('medications', arr);
  };

  const addLabResult = () =>
    set('lab_results', [...form.lab_results, { test: '', result: '', unit: '', range: '' }]);
  const updateLabResult = (i, k, v) => {
    const arr = [...form.lab_results]; arr[i] = { ...arr[i], [k]: v }; set('lab_results', arr);
  };

  const customSections = form.custom_sections || [];
  const addCustom = () =>
    set('custom_sections', [...customSections, { id: Date.now(), title: '', content: '' }]);
  const updateCustom = (id, k, v) =>
    set('custom_sections', customSections.map(s => s.id === id ? { ...s, [k]: v } : s));
  const removeCustom = (id) =>
    set('custom_sections', customSections.filter(s => s.id !== id));

  return (
    <div className={styles.wrap}>

      {/* 1 — Vitals */}
      <ICard title="Vitals" icon="🩺" color="#3b82f6">
        <div className={styles.vitalsGrid}>
          {VITALS_CONFIG.map(({ key, label, unit, placeholder }) => (
            <div key={key} className={styles.vCell}>
              <label>{label} <span className={styles.unit}>{unit}</span></label>
              <input type="number" value={form.vitals[key] || ''}
                onChange={e => setVital(key, e.target.value)}
                placeholder={placeholder} />
            </div>
          ))}
          {/* BMI — auto-calculated, still editable */}
          <div className={styles.vCell}>
            <label>
              BMI <span className={styles.unit}>kg/m²</span>
              {form.vitals.bmi && <span className={styles.autoTag}>auto</span>}
            </label>
            <input type="number"
              className={form.vitals.bmi ? styles.vInputAuto : ''}
              value={form.vitals.bmi || ''}
              onChange={e => setVital('bmi', e.target.value)}
              placeholder="auto" />
          </div>
        </div>
      </ICard>

      {/* 2 — Patient Medical History */}
      <ICard title="Patient Medical History" icon="📋" color="#64748b" defaultOpen={false}>
        {appt?.medical_history?.length > 0 ? (
          <>
            <div className={styles.chips}>
              {appt.medical_history.map((h, i) => (
                <span key={i} className={`${styles.chip} ${styles.chipRO}`}>
                  {h.label || h.condition || JSON.stringify(h)}
                </span>
              ))}
            </div>
            <p className={styles.hint}>From check-in — read only</p>
          </>
        ) : (
          <p className={styles.hint}>No medical history recorded at check-in.</p>
        )}
      </ICard>

      {/* 3 — Symptoms */}
      <ICard title="Symptoms" icon="🤒" color="#f59e0b" defaultOpen={false}>
        <div className={styles.chips}>
          {form.symptoms.map((s, i) => (
            <span key={i} className={`${styles.chip} ${styles.chipSymptom}`}>
              {s}<button onClick={() => removeChip('symptoms', i)}>✕</button>
            </span>
          ))}
        </div>
        <div className={styles.addRow}>
          <input placeholder="Type symptom and press Enter…"
            value={form.symptomInput || ''}
            onChange={e => set('symptomInput', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChip('symptoms', 'symptomInput'))} />
          <button onClick={() => addChip('symptoms', 'symptomInput')}>Add</button>
        </div>
      </ICard>

      {/* 4 — Diagnosis */}
      <ICard title="Diagnosis" icon="🔬" color="#eab308" defaultOpen={false}>
        <div className={styles.chips}>
          {form.diagnosis.map((d, i) => (
            <span key={i} className={`${styles.chip} ${styles.chipDiag}`}>
              {d.display}<button onClick={() => removeChip('diagnosis', i)}>✕</button>
            </span>
          ))}
        </div>
        <div className={styles.addRow}>
          <input placeholder="Type diagnosis and press Enter…"
            value={form.diagInput || ''}
            onChange={e => set('diagInput', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDiag())} />
          <button onClick={addDiag}>Add</button>
        </div>
      </ICard>

      {/* 5 — Medications */}
      <ICard title="℞  Medications" icon="💊" color="#8b5cf6" defaultOpen={false}>
        <div className={styles.tableWrap}>
          {form.medications.length > 0 && (
            <div className={styles.table}>
              <div className={styles.tHead}>
                <span>Medicine</span><span>Dosage</span><span>Frequency</span><span>Duration</span><span/>
              </div>
              {form.medications.map((m, i) => (
                <div key={i} className={styles.tRow}>
                  <input placeholder="Medicine name" value={m.name}      onChange={e => updateMed(i, 'name',      e.target.value)} />
                  <input placeholder="e.g. 500mg"    value={m.dosage}    onChange={e => updateMed(i, 'dosage',    e.target.value)} />
                  <input placeholder="e.g. TDS"      value={m.frequency} onChange={e => updateMed(i, 'frequency', e.target.value)} />
                  <input placeholder="e.g. 5 days"   value={m.duration}  onChange={e => updateMed(i, 'duration',  e.target.value)} />
                  <button className={styles.del}
                    onClick={() => set('medications', form.medications.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
          <button className={styles.addLine} onClick={addMed}><Plus size={13} /> Add Medicine</button>
        </div>
      </ICard>

      {/* 6 — Lab Investigations */}
      <ICard title="Lab Investigations" icon="🧪" color="#0891b2" defaultOpen={false}>
        <div className={styles.chips}>
          {form.lab_investigations.map((l, i) => (
            <span key={i} className={`${styles.chip} ${styles.chipLab}`}>
              {l}<button onClick={() => removeChip('lab_investigations', i)}>✕</button>
            </span>
          ))}
        </div>
        <div className={styles.addRow}>
          <input placeholder="e.g. CBC, HbA1c, Lipid Profile…"
            value={form.labInput || ''}
            onChange={e => set('labInput', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChip('lab_investigations', 'labInput'))} />
          <button onClick={() => addChip('lab_investigations', 'labInput')}>Add</button>
        </div>
      </ICard>

      {/* 7 — Lab Results */}
      <ICard title="Lab Results" icon="📊" color="#06b6d4" defaultOpen={false}>
        <div className={styles.tableWrap}>
          {form.lab_results.length > 0 && (
            <div className={styles.table}>
              <div className={`${styles.tHead} ${styles.tHead4}`}>
                <span>Test Name</span><span>Result</span><span>Unit</span><span>Normal Range</span><span/>
              </div>
              {form.lab_results.map((r, i) => (
                <div key={i} className={`${styles.tRow} ${styles.tRow4}`}>
                  <input placeholder="e.g. Hb"    value={r.test}   onChange={e => updateLabResult(i, 'test',   e.target.value)} />
                  <input placeholder="e.g. 12.5"  value={r.result} onChange={e => updateLabResult(i, 'result', e.target.value)} />
                  <input placeholder="e.g. g/dL"  value={r.unit}   onChange={e => updateLabResult(i, 'unit',   e.target.value)} />
                  <input placeholder="e.g. 11-16" value={r.range}  onChange={e => updateLabResult(i, 'range',  e.target.value)} />
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

      {/* 9 — Notes (PRIVATE) */}
      <ICard title="Notes" icon="🔒" color="#d97706" badge="Private · Not Printed" defaultOpen={false}>
        <div className={styles.privateBox}>
          These notes are for internal use only and will <strong>not</strong> appear on the printed prescription.
          Use for treatment notes, surgical notes, or other private observations.
        </div>
        <textarea rows={4} placeholder="Private notes — treatment / surgical / others…"
          value={form.notes || ''}
          onChange={e => set('notes', e.target.value)} />
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
        <ICard key={section.id}
          title={section.title || 'Custom Section'}
          icon="✏️" color="#94a3b8">
          <div className={styles.customHead}>
            <input className={styles.customTitle}
              placeholder="Section title…"
              value={section.title}
              onChange={e => updateCustom(section.id, 'title', e.target.value)} />
            <button className={styles.customDel}
              onClick={() => removeCustom(section.id)}>Remove</button>
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
