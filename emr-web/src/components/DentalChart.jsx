import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

// FDI adult dentition
const UPPER = [
  [18,17,16,15,14,13,12,11],
  [21,22,23,24,25,26,27,28],
];
const LOWER = [
  [48,47,46,45,44,43,42,41],
  [31,32,33,34,35,36,37,38],
];

const TOOTH_AREAS = ['Buccal','Lingual','Mesial','Distal','Occlusal','Cervical','Root','Palatal','Incisal'];

const CONDITION_COLORS = {
  Caries:      '#ef4444',
  Filled:      '#3b82f6',
  Missing:     '#94a3b8',
  Crown:       '#f59e0b',
  RCT:         '#8b5cf6',
  Extraction:  '#64748b',
  Fracture:    '#f97316',
  Impacted:    '#ec4899',
};
const CONDITIONS = Object.keys(CONDITION_COLORS);

// Simple SVG tooth shape (molar vs anterior)
function ToothSvg({ num, selected, conditions }) {
  const isMolar = [6,7,8].includes(num % 10) || [16,17,18,26,27,28,36,37,38,46,47,48].includes(num);
  const hasCond = conditions && conditions.length > 0;
  const fill = hasCond ? (CONDITION_COLORS[conditions[0]] || '#6366f1') : selected ? '#6366f1' : '#e2e8f0';
  const stroke = selected || hasCond ? '#4f46e5' : '#cbd5e1';

  if (isMolar) return (
    <svg viewBox="0 0 32 40" width="28" height="36">
      <rect x="4" y="4" width="24" height="32" rx="6" fill={fill} stroke={stroke} strokeWidth="2" />
      {hasCond && <circle cx="16" cy="20" r="5" fill="white" opacity="0.4" />}
    </svg>
  );
  return (
    <svg viewBox="0 0 28 44" width="22" height="38">
      <path d="M14 4 C6 4 4 12 4 18 L6 38 C6 40 8 42 10 42 L18 42 C20 42 22 40 22 38 L24 18 C24 12 22 4 14 4Z"
        fill={fill} stroke={stroke} strokeWidth="2" />
      {hasCond && <circle cx="14" cy="22" r="4" fill="white" opacity="0.4" />}
    </svg>
  );
}

export default function DentalChart({ value = {}, onChange }) {
  const data = typeof value === 'string' ? {} : (value || {});
  const toothConditions = data.tooth_conditions || {};
  const oralFindings    = data.oral_findings    || [];
  const dentalProcs     = data.dental_procedures || [];

  const [selectedTeeth, setSelectedTeeth] = useState([]);
  const [condModal, setCondModal]   = useState(null); // tooth num
  const [procInput, setProcInput]   = useState('');
  const [findingInput, setFindingInput] = useState('');

  const update = (patch) => onChange({ ...data, ...patch });

  const toggleTooth = (num) => {
    setSelectedTeeth(prev =>
      prev.includes(num) ? prev.filter(t => t !== num) : [...prev, num]
    );
  };

  const addFinding = () => {
    if (!findingInput.trim() || selectedTeeth.length === 0) return;
    const newFindings = selectedTeeth.map(t => ({
      tooth: String(t), finding: findingInput.trim(), area: '', since: '', notes: '',
    }));
    update({ oral_findings: [...oralFindings, ...newFindings] });
    setFindingInput('');
  };

  const updateFinding = (i, field, val) => {
    const next = [...oralFindings];
    next[i] = { ...next[i], [field]: val };
    update({ oral_findings: next });
  };

  const removeFinding = (i) => update({ oral_findings: oralFindings.filter((_, j) => j !== i) });

  const toggleCondition = (num, cond) => {
    const cur = toothConditions[num] || [];
    const next = cur.includes(cond) ? cur.filter(c => c !== cond) : [...cur, cond];
    update({ tooth_conditions: { ...toothConditions, [num]: next } });
  };

  const addProc = () => {
    if (!procInput.trim()) return;
    update({ dental_procedures: [...dentalProcs, procInput.trim()] });
    setProcInput('');
  };

  function ToothCol({ num }) {
    const conds = toothConditions[num] || [];
    const sel = selectedTeeth.includes(num);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}
        onClick={() => toggleTooth(num)}
        onContextMenu={e => { e.preventDefault(); setCondModal(num); }}
        title={`Tooth ${num} — right-click to mark conditions`}
      >
        <ToothSvg num={num} selected={sel} conditions={conds} />
        <span style={{
          fontSize: 11, fontWeight: sel ? 700 : 400,
          color: sel ? '#4f46e5' : '#64748b',
          background: sel ? '#eef2ff' : 'transparent',
          borderRadius: 4, padding: '1px 4px',
        }}>{num}</span>
        {conds.length > 0 && (
          <span style={{ fontSize: 9, color: CONDITION_COLORS[conds[0]] || '#6366f1', fontWeight: 700 }}>
            {conds[0].slice(0,3)}
          </span>
        )}
      </div>
    );
  }

  function JawRow({ quads }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', gap: 0 }}>
        {quads.map((quad, qi) => (
          <div key={qi} style={{
            display: 'flex', gap: 4, padding: '0 12px',
            borderRight: qi === 0 ? '2px dashed #cbd5e1' : 'none',
          }}>
            {quad.map(num => <ToothCol key={num} num={num} />)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Click teeth to select · Right-click to mark conditions
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {selectedTeeth.length > 0 && (
            <span style={{ fontSize: 12, background: '#eef2ff', color: '#4f46e5', padding: '3px 10px', borderRadius: 8, fontWeight: 600 }}>
              {selectedTeeth.length} tooth/teeth selected
            </span>
          )}
          {selectedTeeth.length > 0 && (
            <button onClick={() => setSelectedTeeth([])}
              style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Tooth Chart */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 8px', background: '#fafafa', marginBottom: 14 }}>
        <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Upper Jaw</div>
        <JawRow quads={UPPER} />
        <div style={{ borderTop: '2px solid #e2e8f0', margin: '10px 0' }} />
        <JawRow quads={LOWER} />
        <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lower Jaw</div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {CONDITIONS.map(c => (
          <span key={c} style={{ fontSize: 10, background: CONDITION_COLORS[c] + '22', color: CONDITION_COLORS[c], padding: '2px 8px', borderRadius: 6, fontWeight: 600, border: `1px solid ${CONDITION_COLORS[c]}44` }}>
            ● {c}
          </span>
        ))}
      </div>

      {/* Oral Findings */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🦷 Oral Findings / Procedures</span>
        </div>
        {oralFindings.length > 0 && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 120px 1fr 32px', gap: 0, background: '#f8fafc', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              <span>Tooth</span><span>Finding / Procedure</span><span>Area</span><span>Since</span><span>Notes</span><span />
            </div>
            {oralFindings.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 120px 1fr 32px', gap: 0, borderTop: '1px solid #f1f5f9', padding: '5px 10px', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>{f.tooth}</span>
                <input value={f.finding} onChange={e => updateFinding(i, 'finding', e.target.value)}
                  placeholder="e.g. Pulpectomy, Caries…"
                  style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', width: '100%' }} />
                <select value={f.area} onChange={e => updateFinding(i, 'area', e.target.value)}
                  style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', color: f.area ? '#1e293b' : '#94a3b8' }}>
                  <option value="">Select area</option>
                  {TOOTH_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input value={f.since} onChange={e => updateFinding(i, 'since', e.target.value)}
                  placeholder="e.g. 3 days"
                  style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', width: '100%' }} />
                <input value={f.notes} onChange={e => updateFinding(i, 'notes', e.target.value)}
                  placeholder="Additional notes…"
                  style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', width: '100%' }} />
                <button onClick={() => removeFinding(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={findingInput} onChange={e => setFindingInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFinding()}
            placeholder={selectedTeeth.length ? `Add finding for tooth ${selectedTeeth.join(', ')}…` : 'Select teeth first, then type a finding…'}
            style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
          <button onClick={addFinding} disabled={!findingInput.trim() || !selectedTeeth.length}
            style={{ padding: '6px 14px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!findingInput.trim() || !selectedTeeth.length) ? 0.4 : 1 }}>
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {/* Dental Procedures */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>🔧 Dental Procedures</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {dentalProcs.map((p, i) => (
            <span key={i} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              {p}
              <button onClick={() => update({ dental_procedures: dentalProcs.filter((_, j) => j !== i) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, lineHeight: 1 }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={procInput} onChange={e => setProcInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addProc()}
            placeholder="e.g. Scaling, Root Canal, Extraction, Filling…"
            style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
          <button onClick={addProc}
            style={{ padding: '6px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Add
          </button>
        </div>
      </div>

      {/* Condition Modal */}
      {condModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0004', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setCondModal(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 20, minWidth: 280, boxShadow: '0 20px 60px #0003' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Tooth {condModal} — Mark Conditions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CONDITIONS.map(c => {
                const active = (toothConditions[condModal] || []).includes(c);
                return (
                  <button key={c} onClick={() => toggleCondition(condModal, c)}
                    style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `2px solid ${CONDITION_COLORS[c]}`, background: active ? CONDITION_COLORS[c] : 'white', color: active ? 'white' : CONDITION_COLORS[c] }}>
                    {c}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setCondModal(null)}
              style={{ marginTop: 16, width: '100%', padding: '8px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
