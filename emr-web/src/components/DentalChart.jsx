import { useState, useRef, useEffect } from 'react';
import { Trash2, Search } from 'lucide-react';

const UPPER_R = [18,17,16,15,14,13,12,11];
const UPPER_L = [21,22,23,24,25,26,27,28];
const LOWER_L = [48,47,46,45,44,43,42,41];
const LOWER_R = [31,32,33,34,35,36,37,38];

const SURFACES = ['Buccal','Lingual','Mesial','Distal','Occlusal','Cervical','Root'];

const SC = {
  Buccal:'#3b82f6', Lingual:'#8b5cf6', Mesial:'#f59e0b',
  Distal:'#f97316', Occlusal:'#10b981', Cervical:'#ec4899', Root:'#64748b',
};

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
  'Bleaching','Pack Filling','Polish Teeth','Curettage','Incision & Drainage',
  'Biopsy','Space Maintainer','Parotidectomy','Sialolithotomy',
];

// ── Top-level sub-components (never defined inside another component) ──────────

function ToothOdontogram({ num, surfaces, onToggle }) {
  const act = surfaces || {};
  const sz = 36, cx = 18, cy = 18, r = 15;
  const stop = (e) => e.stopPropagation();

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      {/* Root */}
      <div title="Root" onClick={e => { stop(e); onToggle(num,'Root'); }}
        style={{ width:10, height:14, borderRadius:'0 0 5px 5px', cursor:'pointer',
          background: act.Root ? SC.Root : '#e2e8f0',
          border:`1px solid ${act.Root ? '#475569':'#cbd5e1'}` }} />
      {/* Cervical */}
      <div title="Cervical" onClick={e => { stop(e); onToggle(num,'Cervical'); }}
        style={{ width:sz, height:6, borderRadius:3, cursor:'pointer',
          background: act.Cervical ? SC.Cervical : '#e2e8f0',
          border:`1px solid ${act.Cervical ? '#be185d':'#cbd5e1'}` }} />
      {/* 5-zone odontogram */}
      <svg width={sz} height={sz} style={{ display:'block', cursor:'pointer' }}>
        <circle cx={cx} cy={cy} r={r} fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
        {/* Buccal - top triangle */}
        <polygon points={`${cx},${cy} ${cx-r*0.6},${cy-r} ${cx+r*0.6},${cy-r}`}
          fill={act.Buccal ? SC.Buccal : 'transparent'}
          stroke={act.Buccal ? SC.Buccal : '#e2e8f0'} strokeWidth="0.5"
          onClick={e => { stop(e); onToggle(num,'Buccal'); }}>
          <title>Buccal</title>
        </polygon>
        {/* Lingual - bottom triangle */}
        <polygon points={`${cx},${cy} ${cx-r*0.6},${cy+r} ${cx+r*0.6},${cy+r}`}
          fill={act.Lingual ? SC.Lingual : 'transparent'}
          stroke={act.Lingual ? SC.Lingual : '#e2e8f0'} strokeWidth="0.5"
          onClick={e => { stop(e); onToggle(num,'Lingual'); }}>
          <title>Lingual</title>
        </polygon>
        {/* Mesial - left triangle */}
        <polygon points={`${cx},${cy} ${cx-r},${cy-r*0.6} ${cx-r},${cy+r*0.6}`}
          fill={act.Mesial ? SC.Mesial : 'transparent'}
          stroke={act.Mesial ? SC.Mesial : '#e2e8f0'} strokeWidth="0.5"
          onClick={e => { stop(e); onToggle(num,'Mesial'); }}>
          <title>Mesial</title>
        </polygon>
        {/* Distal - right triangle */}
        <polygon points={`${cx},${cy} ${cx+r},${cy-r*0.6} ${cx+r},${cy+r*0.6}`}
          fill={act.Distal ? SC.Distal : 'transparent'}
          stroke={act.Distal ? SC.Distal : '#e2e8f0'} strokeWidth="0.5"
          onClick={e => { stop(e); onToggle(num,'Distal'); }}>
          <title>Distal</title>
        </polygon>
        {/* Occlusal - centre circle */}
        <circle cx={cx} cy={cy} r={r*0.35}
          fill={act.Occlusal ? SC.Occlusal : '#f1f5f9'}
          stroke={act.Occlusal ? '#059669':'#cbd5e1'} strokeWidth="1"
          onClick={e => { stop(e); onToggle(num,'Occlusal'); }}>
          <title>Occlusal</title>
        </circle>
        <line x1={cx} y1={3} x2={cx} y2={sz-3} stroke="#e2e8f0" strokeWidth="0.5" />
        <line x1={3} y1={cy} x2={sz-3} y2={cy} stroke="#e2e8f0" strokeWidth="0.5" />
      </svg>
      <span style={{ fontSize:11, fontWeight:600, color:'#334155' }}>{num}</span>
    </div>
  );
}

function SuggestionItem({ text, color, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding:'7px 12px', fontSize:12, cursor:'pointer', color:'#334155',
        borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:6,
        background: hov ? color+'11' : 'transparent' }}>
      <span style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }} />
      {text}
    </div>
  );
}

function FindingSearch({ onAdd, placeholder }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const q = query.toLowerCase();
  const exams = EXAMINATIONS.filter(e => !q || e.toLowerCase().includes(q));
  const procs = PROCEDURES.filter(p => !q || p.toLowerCase().includes(q));

  const select = (text) => { onAdd(text); setQuery(''); setOpen(false); };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', gap:6, background:'white' }}>
        <Search size={13} color="#94a3b8" />
        <input value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => e.key === 'Enter' && query.trim() && select(query.trim())}
          placeholder={placeholder}
          style={{ border:'none', outline:'none', fontSize:12, flex:1, background:'transparent' }} />
      </div>
      {open && (exams.length > 0 || procs.length > 0) && (
        <div style={{ position:'absolute', left:0, right:0, top:'100%', marginTop:4,
          background:'white', border:'1px solid #e2e8f0', borderRadius:10,
          boxShadow:'0 8px 32px #0002', zIndex:300,
          display:'grid', gridTemplateColumns:'1fr 1fr',
          maxHeight:300, overflowY:'auto' }}>
          <div>
            <div style={{ padding:'6px 12px', fontSize:10, fontWeight:800, color:'white', background:'#22c55e', textTransform:'uppercase', letterSpacing:'0.08em', position:'sticky', top:0 }}>Examinations</div>
            {exams.map(e => <SuggestionItem key={e} text={e} color="#22c55e" onClick={() => select(e)} />)}
          </div>
          <div style={{ borderLeft:'1px solid #f1f5f9' }}>
            <div style={{ padding:'6px 12px', fontSize:10, fontWeight:800, color:'white', background:'#6366f1', textTransform:'uppercase', letterSpacing:'0.08em', position:'sticky', top:0 }}>Procedures</div>
            {procs.map(p => <SuggestionItem key={p} text={p} color="#6366f1" onClick={() => select(p)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ToothRow({ nums, selected, toothSurfaces, onToggle, onSelect }) {
  return (
    <div style={{ display:'flex', gap:3 }}>
      {nums.map(num => (
        <div key={num} onClick={() => onSelect(num)}
          style={{ cursor:'pointer', padding:'2px 3px', borderRadius:6,
            background: selected.includes(num) ? '#eef2ff' : 'transparent',
            border:`1px solid ${selected.includes(num) ? '#6366f1':'transparent'}`,
            transition:'all 0.15s' }}>
          <ToothOdontogram num={num} surfaces={toothSurfaces[num]} onToggle={onToggle} />
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DentalChart({ value, onChange }) {
  const data = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const toothSurfaces  = data.tooth_surfaces   || {};
  const oralFindings   = data.oral_findings    || [];
  const dentalProcs    = data.dental_procedures || [];

  const [selected, setSelected] = useState([]);

  const update = (patch) => onChange({ ...data, ...patch });

  const toggleSurface = (num, surface) => {
    const cur = toothSurfaces[num] || {};
    update({ tooth_surfaces: { ...toothSurfaces, [num]: { ...cur, [surface]: !cur[surface] } } });
  };

  const toggleTooth = (num) => setSelected(p => p.includes(num) ? p.filter(t => t !== num) : [...p, num]);

  const addFinding = (text) => {
    if (!text.trim() || !selected.length) return;
    const rows = selected.map(t => ({
      tooth: String(t), finding: text.trim(),
      surfaces: Object.keys(toothSurfaces[t] || {}).filter(s => toothSurfaces[t]?.[s]),
      since: '', notes: '',
    }));
    update({ oral_findings: [...oralFindings, ...rows] });
  };

  const updFinding = (i, field, val) => {
    const next = [...oralFindings]; next[i] = { ...next[i], [field]: val };
    update({ oral_findings: next });
  };

  const togFindingSurf = (i, s) => {
    const cur = oralFindings[i].surfaces || [];
    updFinding(i, 'surfaces', cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]);
  };

  return (
    <div>
      {/* Surface legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
        {SURFACES.map(s => (
          <span key={s} style={{ fontSize:10, padding:'2px 8px', borderRadius:6, fontWeight:600,
            background: SC[s]+'22', border:`1px solid ${SC[s]}66`, color: SC[s] }}>
            ● {s}
          </span>
        ))}
      </div>
      <div style={{ fontSize:11, color:'#64748b', marginBottom:8 }}>
        Click tooth number to <b>select</b> · Click zones (triangles/circles) to <b>mark surfaces</b>
      </div>

      {/* Tooth chart */}
      <div style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 8px', background:'#fafafa', marginBottom:12, overflowX:'auto' }}>
        <div style={{ fontSize:10, color:'#94a3b8', textAlign:'center', marginBottom:6, textTransform:'uppercase' }}>Upper Jaw</div>
        <div style={{ display:'flex', justifyContent:'center', gap:0 }}>
          <div style={{ paddingRight:10, borderRight:'2px dashed #cbd5e1' }}>
            <ToothRow nums={UPPER_R} selected={selected} toothSurfaces={toothSurfaces} onToggle={toggleSurface} onSelect={toggleTooth} />
          </div>
          <div style={{ paddingLeft:10 }}>
            <ToothRow nums={UPPER_L} selected={selected} toothSurfaces={toothSurfaces} onToggle={toggleSurface} onSelect={toggleTooth} />
          </div>
        </div>
        <div style={{ borderTop:'2px solid #e2e8f0', margin:'8px 0' }} />
        <div style={{ display:'flex', justifyContent:'center', gap:0 }}>
          <div style={{ paddingRight:10, borderRight:'2px dashed #cbd5e1' }}>
            <ToothRow nums={LOWER_L} selected={selected} toothSurfaces={toothSurfaces} onToggle={toggleSurface} onSelect={toggleTooth} />
          </div>
          <div style={{ paddingLeft:10 }}>
            <ToothRow nums={LOWER_R} selected={selected} toothSurfaces={toothSurfaces} onToggle={toggleSurface} onSelect={toggleTooth} />
          </div>
        </div>
        <div style={{ fontSize:10, color:'#94a3b8', textAlign:'center', marginTop:6, textTransform:'uppercase' }}>Lower Jaw</div>
      </div>

      {/* Oral Findings */}
      <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', marginBottom:12 }}>
        <div style={{ background:'#22c55e', padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:12, fontWeight:800, color:'white', textTransform:'uppercase' }}>🦷 Oral Findings</span>
          {selected.length > 0 && (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:11, background:'white', color:'#16a34a', padding:'2px 8px', borderRadius:6, fontWeight:700 }}>
                Tooth {selected.join(', ')} selected
              </span>
              <button onClick={() => setSelected([])} style={{ fontSize:10, color:'rgba(255,255,255,0.8)', background:'none', border:'none', cursor:'pointer' }}>Clear</button>
            </div>
          )}
        </div>
        {oralFindings.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f8fafc', fontSize:10, color:'#94a3b8', textTransform:'uppercase' }}>
                <th style={{ padding:'5px 12px', textAlign:'left', fontWeight:700, width:50 }}>Tooth</th>
                <th style={{ padding:'5px 8px', textAlign:'left', fontWeight:700 }}>Finding</th>
                <th style={{ padding:'5px 8px', textAlign:'left', fontWeight:700 }}>Surfaces</th>
                <th style={{ padding:'5px 8px', textAlign:'left', fontWeight:700, width:110 }}>Since</th>
                <th style={{ padding:'5px 8px', textAlign:'left', fontWeight:700 }}>Notes</th>
                <th style={{ width:28 }} />
              </tr>
            </thead>
            <tbody>
              {oralFindings.map((f, i) => (
                <tr key={i} style={{ borderTop:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'6px 12px', fontWeight:700, color:'#4f46e5' }}>{f.tooth}</td>
                  <td style={{ padding:'6px 8px', fontWeight:500 }}>{f.finding}</td>
                  <td style={{ padding:'6px 8px' }}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>
                      {SURFACES.map(s => {
                        const on = (f.surfaces||[]).includes(s);
                        return (
                          <span key={s} onClick={() => togFindingSurf(i, s)}
                            style={{ fontSize:9, padding:'1px 5px', borderRadius:4, cursor:'pointer', fontWeight:600,
                              background: on ? SC[s] : '#f1f5f9', color: on ? 'white' : '#94a3b8',
                              border:`1px solid ${on ? SC[s]:'#e2e8f0'}` }}>
                            {s.slice(0,3)}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding:'4px 8px' }}>
                    <input value={f.since||''} onChange={e => updFinding(i,'since',e.target.value)}
                      placeholder="e.g. 3 days"
                      style={{ border:'none', outline:'none', fontSize:12, background:'transparent', width:'100%' }} />
                  </td>
                  <td style={{ padding:'4px 8px' }}>
                    <input value={f.notes||''} onChange={e => updFinding(i,'notes',e.target.value)}
                      placeholder="Notes…"
                      style={{ border:'none', outline:'none', fontSize:12, background:'transparent', width:'100%' }} />
                  </td>
                  <td style={{ padding:'4px 8px' }}>
                    <button onClick={() => update({ oral_findings: oralFindings.filter((_,j)=>j!==i) })}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#cbd5e1', padding:0 }}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ padding:'10px 12px' }}>
          <FindingSearch
            onAdd={addFinding}
            placeholder={selected.length ? `Search finding for tooth ${selected.join(', ')}…` : 'Select teeth above, then search a finding…'}
          />
        </div>
      </div>

      {/* Dental Procedures */}
      <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden' }}>
        <div style={{ background:'#6366f1', padding:'8px 14px' }}>
          <span style={{ fontSize:12, fontWeight:800, color:'white', textTransform:'uppercase' }}>🔧 Dental Procedures</span>
        </div>
        <div style={{ padding:'10px 12px' }}>
          {dentalProcs.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {dentalProcs.map((p, i) => (
                <span key={i} style={{ background:'#eef2ff', border:'1px solid #c7d2fe', color:'#4338ca', borderRadius:8, padding:'3px 10px', fontSize:12, fontWeight:500, display:'flex', alignItems:'center', gap:4 }}>
                  {p}
                  <button onClick={() => update({ dental_procedures: dentalProcs.filter((_,j)=>j!==i) })}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#a5b4fc', padding:0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <FindingSearch
            onAdd={(text) => update({ dental_procedures: [...dentalProcs, text] })}
            placeholder="Search or type a procedure…"
          />
        </div>
      </div>
    </div>
  );
}
