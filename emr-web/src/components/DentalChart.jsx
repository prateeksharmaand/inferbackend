import { useState, useRef, useEffect } from 'react';
import { Trash2, Search } from 'lucide-react';

// FDI adult dentition
const UPPER_R = [18,17,16,15,14,13,12,11];
const UPPER_L = [21,22,23,24,25,26,27,28];
const LOWER_L = [48,47,46,45,44,43,42,41];
const LOWER_R = [31,32,33,34,35,36,37,38];

// Surfaces per tooth
const SURFACES = ['Buccal','Lingual','Mesial','Distal','Occlusal','Cervical','Root'];

const SURFACE_COLORS = {
  Buccal:   '#3b82f6',
  Lingual:  '#8b5cf6',
  Mesial:   '#f59e0b',
  Distal:   '#f97316',
  Occlusal: '#10b981',
  Cervical: '#ec4899',
  Root:     '#64748b',
};

// Searchable examinations and procedures
const EXAMINATIONS = [
  'Caries','Calculus','Gingivitis','Periodontitis','Abscess','Fracture','Attrition',
  'Erosion','Abrasion','Hypersensitivity','Mobility','Furcation Involvement',
  'Pocketing','Recession','Impaction','Crowding','Spacing','Missing Tooth',
  'Retained Root','Discoloration','Swelling','Tenderness on Percussion',
];

const PROCEDURES = [
  'Scaling & Polishing','Root Planing','Filling - Composite','Filling - GIC',
  'Filling - Amalgam','Root Canal Treatment','Pulpectomy','Pulpotomy',
  'Extraction','Surgical Extraction','Crown','Bridge','Denture','Implant',
  'Apicectomy','Splinting','Fluoride Application','Pit & Fissure Sealant',
  'Bleaching','Orthodontic Banding','Space Maintainer','Curettage',
  'Incision & Drainage','Biopsy','Pack Filling','Polish Teeth',
  'P/R - Removal Of Dental Pack','Parotidectomy','Sialolithotomy','Pyalectasis',
];

// 5-zone odontogram for each tooth — top view (like a cross-section)
// Zones: B(uccal)=top, L(ingual)=bottom, M=left, D=right, O(cclusal)=center
// Plus separate Root and Cervical
function ToothOdontogram({ num, surfaces, onToggle }) {
  const active = surfaces || {};
  const sz = 36;
  const cx = sz / 2, cy = sz / 2, r = sz / 2 - 2;
  const zones = [
    { key: 'Buccal',   path: `M${cx},${cy} L${cx-r*0.6},${cy-r} L${cx+r*0.6},${cy-r} Z` },
    { key: 'Lingual',  path: `M${cx},${cy} L${cx-r*0.6},${cy+r} L${cx+r*0.6},${cy+r} Z` },
    { key: 'Mesial',   path: `M${cx},${cy} L${cx-r},${cy-r*0.6} L${cx-r},${cy+r*0.6} Z` },
    { key: 'Distal',   path: `M${cx},${cy} L${cx+r},${cy-r*0.6} L${cx+r},${cy+r*0.6} Z` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {/* Root indicator */}
      <div title="Root" onClick={() => onToggle(num, 'Root')} style={{
        width: 10, height: 14, borderRadius: '0 0 5px 5px',
        background: active['Root'] ? SURFACE_COLORS['Root'] : '#e2e8f0',
        cursor: 'pointer', border: `1px solid ${active['Root'] ? '#475569' : '#cbd5e1'}`,
        transition: 'background 0.15s',
      }} />
      {/* Cervical band */}
      <div title="Cervical" onClick={() => onToggle(num, 'Cervical')} style={{
        width: sz, height: 6, borderRadius: 3,
        background: active['Cervical'] ? SURFACE_COLORS['Cervical'] : '#e2e8f0',
        cursor: 'pointer', border: `1px solid ${active['Cervical'] ? '#be185d' : '#cbd5e1'}`,
        transition: 'background 0.15s',
      }} />
      {/* 4-zone + occlusal center */}
      <svg width={sz} height={sz} style={{ cursor: 'pointer', display: 'block' }}>
        {/* outer circle stroke */}
        <circle cx={cx} cy={cy} r={r} fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
        {zones.map(z => (
          <path key={z.key} d={z.path}
            fill={active[z.key] ? SURFACE_COLORS[z.key] : 'transparent'}
            stroke={active[z.key] ? SURFACE_COLORS[z.key] : '#e2e8f0'}
            strokeWidth="0.5"
            onClick={() => onToggle(num, z.key)}
            style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
          >
            <title>{z.key}</title>
          </path>
        ))}
        {/* Occlusal center */}
        <circle cx={cx} cy={cy} r={r * 0.35}
          fill={active['Occlusal'] ? SURFACE_COLORS['Occlusal'] : '#f1f5f9'}
          stroke={active['Occlusal'] ? '#059669' : '#cbd5e1'}
          strokeWidth="1"
          onClick={() => onToggle(num, 'Occlusal')}
          style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
        >
          <title>Occlusal</title>
        </circle>
        {/* dividing lines */}
        <line x1={cx} y1={2} x2={cx} y2={sz-2} stroke="#e2e8f0" strokeWidth="0.5" />
        <line x1={2} y1={cy} x2={sz-2} y2={cy} stroke="#e2e8f0" strokeWidth="0.5" />
      </svg>
      {/* Tooth number */}
      <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{num}</span>
    </div>
  );
}

// Autocomplete input for findings/procedures
function FindingSearch({ onAdd, selectedTeeth }) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef(null);

  const qLow = query.toLowerCase();
  const filteredExams  = EXAMINATIONS.filter(e => e.toLowerCase().includes(qLow));
  const filteredProcs  = PROCEDURES.filter(p => p.toLowerCase().includes(qLow));
  const hasResults = filteredExams.length > 0 || filteredProcs.length > 0;

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (text) => {
    onAdd(text);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', gap: 6, background: 'white' }}>
        <Search size={13} color="#94a3b8" />
        <input value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Enter' && query.trim()) select(query.trim()); }}
          placeholder={selectedTeeth.length ? `Search finding for tooth ${selectedTeeth.join(', ')}…` : 'Select teeth above, then search a finding or procedure…'}
          style={{ border: 'none', outline: 'none', fontSize: 12, flex: 1, background: 'transparent' }} />
      </div>
      {open && hasResults && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 32px #0002', zIndex: 200, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
          <div>
            <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'white', background: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Examinations</div>
            {filteredExams.map(e => (
              <div key={e} onClick={() => select(e)}
                style={{ padding: '7px 12px', fontSize: 12, cursor: 'pointer', color: '#334155', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={el => el.currentTarget.style.background = '#f0fdf4'}
                onMouseLeave={el => el.currentTarget.style.background = 'transparent'}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                {e}
              </div>
            ))}
          </div>
          <div style={{ borderLeft: '1px solid #f1f5f9' }}>
            <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'white', background: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Procedures</div>
            {filteredProcs.map(p => (
              <div key={p} onClick={() => select(p)}
                style={{ padding: '7px 12px', fontSize: 12, cursor: 'pointer', color: '#334155', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={el => el.currentTarget.style.background = '#eef2ff'}
                onMouseLeave={el => el.currentTarget.style.background = 'transparent'}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                {p}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DentalChart({ value = {}, onChange }) {
  const data = (typeof value === 'object' && value !== null && !Array.isArray(value)) ? value : {};
  const toothSurfaces = data.tooth_surfaces || {};   // { "21": { Buccal: true, Root: true } }
  const oralFindings  = data.oral_findings   || [];
  const [selectedTeeth, setSelectedTeeth] = useState([]);

  const update = (patch) => onChange({ ...data, ...patch });

  const toggleSurface = (num, surface) => {
    const cur = toothSurfaces[num] || {};
    update({ tooth_surfaces: { ...toothSurfaces, [num]: { ...cur, [surface]: !cur[surface] } } });
  };

  const toggleTooth = (num) => {
    setSelectedTeeth(prev => prev.includes(num) ? prev.filter(t => t !== num) : [...prev, num]);
  };

  const addFinding = (text) => {
    if (!text.trim() || selectedTeeth.length === 0) return;
    const newFindings = selectedTeeth.map(t => ({
      tooth: String(t), finding: text.trim(),
      surfaces: Object.keys(toothSurfaces[t] || {}).filter(s => toothSurfaces[t][s]),
      since: '', notes: '',
    }));
    update({ oral_findings: [...oralFindings, ...newFindings] });
  };

  const updateFinding = (i, field, val) => {
    const next = [...oralFindings];
    next[i] = { ...next[i], [field]: val };
    update({ oral_findings: next });
  };

  const removeFinding = (i) => update({ oral_findings: oralFindings.filter((_, j) => j !== i) });

  function JawQuad({ nums, flip }) {
    return (
      <div style={{ display: 'flex', flexDirection: flip ? 'column-reverse' : 'column', gap: 2 }}>
        {nums.map(num => (
          <div key={num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div onClick={() => toggleTooth(num)}
              style={{ cursor: 'pointer', padding: '2px 3px', borderRadius: 6,
                background: selectedTeeth.includes(num) ? '#eef2ff' : 'transparent',
                border: selectedTeeth.includes(num) ? '1px solid #6366f1' : '1px solid transparent',
                transition: 'all 0.15s',
              }}>
              <ToothOdontogram num={num} surfaces={toothSurfaces[num]} onToggle={toggleSurface} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Surface legend
  const activeSurfaces = Object.values(toothSurfaces).flatMap(s => Object.entries(s).filter(([,v])=>v).map(([k])=>k));
  const uniqueActive = [...new Set(activeSurfaces)];

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Surface legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {SURFACES.map(s => (
          <span key={s} style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
            background: uniqueActive.includes(s) ? SURFACE_COLORS[s] + '22' : '#f8fafc',
            border: `1px solid ${uniqueActive.includes(s) ? SURFACE_COLORS[s] : '#e2e8f0'}`,
            color: uniqueActive.includes(s) ? SURFACE_COLORS[s] : '#94a3b8',
          }}>
            ● {s}
          </span>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
        Click tooth number/ring to <b>select tooth</b> · Click surface zones to <b>mark surfaces</b>
      </div>

      {/* Tooth Chart */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 8px', background: '#fafafa', marginBottom: 12, overflowX: 'auto' }}>
        {/* Upper jaw */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 3, paddingRight: 12, borderRight: '2px dashed #cbd5e1' }}>
            {UPPER_R.map(num => (
              <div key={num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div onClick={() => toggleTooth(num)} style={{ cursor: 'pointer', padding: '2px 3px', borderRadius: 6,
                  background: selectedTeeth.includes(num) ? '#eef2ff' : 'transparent',
                  border: selectedTeeth.includes(num) ? '1px solid #6366f1' : '1px solid transparent' }}>
                  <ToothOdontogram num={num} surfaces={toothSurfaces[num]} onToggle={toggleSurface} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3, paddingLeft: 12 }}>
            {UPPER_L.map(num => (
              <div key={num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div onClick={() => toggleTooth(num)} style={{ cursor: 'pointer', padding: '2px 3px', borderRadius: 6,
                  background: selectedTeeth.includes(num) ? '#eef2ff' : 'transparent',
                  border: selectedTeeth.includes(num) ? '1px solid #6366f1' : '1px solid transparent' }}>
                  <ToothOdontogram num={num} surfaces={toothSurfaces[num]} onToggle={toggleSurface} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '2px solid #e2e8f0', margin: '4px 0' }} />

        {/* Lower jaw */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 3, paddingRight: 12, borderRight: '2px dashed #cbd5e1' }}>
            {LOWER_L.map(num => (
              <div key={num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div onClick={() => toggleTooth(num)} style={{ cursor: 'pointer', padding: '2px 3px', borderRadius: 6,
                  background: selectedTeeth.includes(num) ? '#eef2ff' : 'transparent',
                  border: selectedTeeth.includes(num) ? '1px solid #6366f1' : '1px solid transparent' }}>
                  <ToothOdontogram num={num} surfaces={toothSurfaces[num]} onToggle={toggleSurface} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3, paddingLeft: 12 }}>
            {LOWER_R.map(num => (
              <div key={num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div onClick={() => toggleTooth(num)} style={{ cursor: 'pointer', padding: '2px 3px', borderRadius: 6,
                  background: selectedTeeth.includes(num) ? '#eef2ff' : 'transparent',
                  border: selectedTeeth.includes(num) ? '1px solid #6366f1' : '1px solid transparent' }}>
                  <ToothOdontogram num={num} surfaces={toothSurfaces[num]} onToggle={toggleSurface} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Oral Findings */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ background: '#22c55e', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🦷 Oral Findings</span>
          {selectedTeeth.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, background: 'white', color: '#16a34a', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                Tooth {selectedTeeth.join(', ')} selected
              </span>
              <button onClick={() => setSelectedTeeth([])} style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
            </div>
          )}
        </div>

        {oralFindings.length > 0 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr 110px 1fr 28px', gap: 0, background: '#f8fafc', padding: '5px 12px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              <span>Tooth</span><span>Finding / Procedure</span><span>Surfaces</span><span>Since</span><span>Notes</span><span />
            </div>
            {oralFindings.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr 110px 1fr 28px', gap: 0, borderTop: '1px solid #f1f5f9', padding: '6px 12px', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>{f.tooth}</span>
                <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{f.finding}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {SURFACES.map(s => {
                    const on = (f.surfaces || []).includes(s);
                    return (
                      <span key={s} onClick={() => {
                        const cur = f.surfaces || [];
                        const next = cur.includes(s) ? cur.filter(x=>x!==s) : [...cur, s];
                        updateFinding(i, 'surfaces', next);
                      }} style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                        background: on ? SURFACE_COLORS[s] : '#f1f5f9',
                        color: on ? 'white' : '#94a3b8',
                        border: `1px solid ${on ? SURFACE_COLORS[s] : '#e2e8f0'}`,
                      }}>{s.slice(0,3)}</span>
                    );
                  })}
                </div>
                <input value={f.since || ''} onChange={e => updateFinding(i, 'since', e.target.value)}
                  placeholder="Since…"
                  style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', width: '100%' }} />
                <input value={f.notes || ''} onChange={e => updateFinding(i, 'notes', e.target.value)}
                  placeholder="Notes…"
                  style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', width: '100%' }} />
                <button onClick={() => removeFinding(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0 }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '10px 12px' }}>
          <FindingSearch onAdd={addFinding} selectedTeeth={selectedTeeth} />
        </div>
      </div>

      {/* Dental Procedures */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#6366f1', padding: '8px 14px' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🔧 Dental Procedures</span>
        </div>
        <div style={{ padding: '10px 12px' }}>
          {(data.dental_procedures || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {(data.dental_procedures || []).map((p, i) => (
                <span key={i} style={{ background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {p}
                  <button onClick={() => update({ dental_procedures: (data.dental_procedures||[]).filter((_,j)=>j!==i) })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a5b4fc', padding: 0, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <FindingSearch
            onAdd={(text) => update({ dental_procedures: [...(data.dental_procedures||[]), text] })}
            selectedTeeth={[]}
          />
        </div>
      </div>
    </div>
  );
}
