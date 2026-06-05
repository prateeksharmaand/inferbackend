import { useState, useRef, useEffect } from 'react';
import { Trash2, Search, FlaskConical } from 'lucide-react';

const UPPER = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28];
const LOWER = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38];

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
  'Biopsy','Space Maintainer',
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SuggestionItem({ text, color, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding:'6px 12px', fontSize:12, cursor:'pointer', color:'#334155',
        borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:6,
        background: hov ? color+'18' : 'transparent' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }} />
      {text}
    </div>
  );
}

function FindingSearch({ onAdd, placeholder }) {
  const [query,  setQuery]  = useState('');
  const [open,   setOpen]   = useState(false);
  const [rect,   setRect]   = useState(null);
  const ref    = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openDropdown = () => {
    if (ref.current) setRect(ref.current.getBoundingClientRect());
    setOpen(true);
  };

  const q = query.toLowerCase();
  const exams = EXAMINATIONS.filter(e => !q || e.toLowerCase().includes(q));
  const procs = PROCEDURES.filter(p => !q || p.toLowerCase().includes(q));
  const select = text => { onAdd(text); setQuery(''); setOpen(false); };

  return (
    <div ref={wrapRef}>
      <div ref={ref} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
        border:'1px solid #e2e8f0', borderRadius:8, background:'white' }}>
        <Search size={12} color="#94a3b8" />
        <input value={query} onChange={e => { setQuery(e.target.value); openDropdown(); }}
          onFocus={openDropdown}
          onKeyDown={e => e.key==='Enter' && query.trim() && select(query.trim())}
          placeholder={placeholder || 'Start typing an examination or past procedure…'}
          style={{ border:'none', outline:'none', fontSize:12, flex:1, background:'transparent' }} />
      </div>
      {open && rect && (exams.length > 0 || procs.length > 0) && (
        <div style={{
          position:'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: Math.max(rect.width, 520),
          background:'white', border:'1px solid #e2e8f0', borderRadius:10,
          boxShadow:'0 8px 32px #0003', zIndex:9999,
          display:'grid', gridTemplateColumns:'1fr 1fr', maxHeight:300, overflowY:'auto',
        }}>
          <div>
            <div style={{ padding:'5px 12px', fontSize:10, fontWeight:800, color:'white',
              background:'#22c55e', textTransform:'uppercase', letterSpacing:'0.07em',
              position:'sticky', top:0, zIndex:1 }}>Examinations</div>
            {exams.map(e => <SuggestionItem key={e} text={e} color="#22c55e" onClick={() => select(e)} />)}
          </div>
          <div style={{ borderLeft:'1px solid #f1f5f9' }}>
            <div style={{ padding:'5px 12px', fontSize:10, fontWeight:800, color:'white',
              background:'#6366f1', textTransform:'uppercase', letterSpacing:'0.07em',
              position:'sticky', top:0, zIndex:1 }}>Procedures</div>
            {procs.map(p => <SuggestionItem key={p} text={p} color="#6366f1" onClick={() => select(p)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// 5-zone SVG odontogram
function Odontogram({ surfaces, onToggle, onSelect, num }) {
  const sz = 34, cx = 17, cy = 17, r = 14;
  const stop = e => e.stopPropagation();
  const act = surfaces || {};
  const hit = (e, surface) => { stop(e); onToggle(num, surface); onSelect(num); };
  return (
    <svg width={sz} height={sz} style={{ display:'block', cursor:'pointer', flexShrink:0 }}>
      <circle cx={cx} cy={cy} r={r} fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
      <polygon points={`${cx},${cy} ${cx-r*0.6},${cy-r} ${cx+r*0.6},${cy-r}`}
        fill={act.Buccal ? SC.Buccal : 'transparent'} stroke={act.Buccal ? SC.Buccal : '#e2e8f0'} strokeWidth="0.5"
        onClick={e => hit(e,'Buccal')}><title>Buccal</title></polygon>
      <polygon points={`${cx},${cy} ${cx-r*0.6},${cy+r} ${cx+r*0.6},${cy+r}`}
        fill={act.Lingual ? SC.Lingual : 'transparent'} stroke={act.Lingual ? SC.Lingual : '#e2e8f0'} strokeWidth="0.5"
        onClick={e => hit(e,'Lingual')}><title>Lingual</title></polygon>
      <polygon points={`${cx},${cy} ${cx-r},${cy-r*0.6} ${cx-r},${cy+r*0.6}`}
        fill={act.Mesial ? SC.Mesial : 'transparent'} stroke={act.Mesial ? SC.Mesial : '#e2e8f0'} strokeWidth="0.5"
        onClick={e => hit(e,'Mesial')}><title>Mesial</title></polygon>
      <polygon points={`${cx},${cy} ${cx+r},${cy-r*0.6} ${cx+r},${cy+r*0.6}`}
        fill={act.Distal ? SC.Distal : 'transparent'} stroke={act.Distal ? SC.Distal : '#e2e8f0'} strokeWidth="0.5"
        onClick={e => hit(e,'Distal')}><title>Distal</title></polygon>
      <circle cx={cx} cy={cy} r={r*0.36}
        fill={act.Occlusal ? SC.Occlusal : '#f1f5f9'} stroke={act.Occlusal ? '#059669':'#cbd5e1'} strokeWidth="1"
        onClick={e => hit(e,'Occlusal')}><title>Occlusal</title></circle>
      <line x1={cx} y1={3} x2={cx} y2={sz-3} stroke="#e2e8f0" strokeWidth="0.5" />
      <line x1={3} y1={cy} x2={sz-3} y2={cy} stroke="#e2e8f0" strokeWidth="0.5" />
    </svg>
  );
}

// Full tooth column: surfaces + image + number
function ToothCell({ num, isUpper, surfaces, hasCard, onSelect, onToggleSurface }) {
  const [hov, setHov] = useState(false);
  const act = surfaces || {};
  const stop = e => e.stopPropagation();

  const rootEl = (
    <div title="Root" onClick={e => { stop(e); onToggleSurface(num,'Root'); onSelect(num); }}
      style={{ width:10, height:14, borderRadius: isUpper ? '0 0 5px 5px' : '5px 5px 0 0',
        background: act.Root ? SC.Root : '#e2e8f0',
        border:`1px solid ${act.Root ? '#475569':'#cbd5e1'}`,
        cursor:'pointer', alignSelf:'center', transition:'background 0.15s' }} />
  );

  const cervEl = (
    <div title="Cervical" onClick={e => { stop(e); onToggleSurface(num,'Cervical'); onSelect(num); }}
      style={{ width:34, height:5, borderRadius:3,
        background: act.Cervical ? SC.Cervical : '#e2e8f0',
        border:`1px solid ${act.Cervical ? '#be185d':'#cbd5e1'}`,
        cursor:'pointer', transition:'background 0.15s' }} />
  );

  const imgEl = (
    <div onClick={() => onSelect(num)}
      style={{ width:36, height:52, display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer',
        filter: hasCard ? 'drop-shadow(0 0 5px #22c55e99)' : hov ? 'brightness(0.9)' : 'none',
        transition:'filter 0.15s' }}>
      <img src={`/teeth/teeth-${num}.webp`} alt={`Tooth ${num}`}
        style={{ maxWidth:36, maxHeight:52, objectFit:'contain' }}
        onError={e => { e.target.style.display='none'; }} />
    </div>
  );

  const odoEl = <Odontogram surfaces={act} onToggle={onToggleSurface} onSelect={onSelect} num={num} />;

  const numEl = (
    <span onClick={() => onSelect(num)} style={{
      fontSize:10, fontWeight: hasCard ? 800 : 500, cursor:'pointer',
      color: hasCard ? 'white' : '#64748b',
      background: hasCard ? '#22c55e' : 'transparent',
      borderRadius:4, padding:'1px 5px', transition:'all 0.15s',
    }}>{num}</span>
  );

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2,
        padding:'3px 2px', borderRadius:8, minWidth:40,
        background: hov ? '#f0fdf4' : 'transparent',
        border:`1px solid ${hov || hasCard ? '#bbf7d0' : 'transparent'}`,
        transition:'all 0.15s' }}>
      {isUpper ? (
        <>
          {rootEl}
          {cervEl}
          {imgEl}
          {odoEl}
          {numEl}
        </>
      ) : (
        <>
          {numEl}
          {odoEl}
          {imgEl}
          {cervEl}
          {rootEl}
        </>
      )}
    </div>
  );
}

// Per-tooth finding card
function ToothCard({ cardId, toothNum, findings, surfaces, onAddFinding, onDeleteCard, onDeleteFinding }) {
  const activeSurfs = SURFACES.filter(s => surfaces?.[s]);
  return (
    <div style={{ border:'1px solid #d1fae5', borderRadius:10, overflow:'hidden',
      marginBottom:8, background:'#f0fdf4' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'8px 14px', background:'#dcfce7', borderBottom:'1px solid #bbf7d0' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <FlaskConical size={13} color="#16a34a" />
          <span style={{ fontWeight:800, fontSize:13, background:'#22c55e', color:'white',
            padding:'2px 10px', borderRadius:6 }}>T{toothNum}</span>
          {activeSurfs.length > 0 && activeSurfs.map(s => (
            <span key={s} style={{ fontSize:10, padding:'1px 7px', borderRadius:5, fontWeight:700,
              background: SC[s]+'22', color:SC[s], border:`1px solid ${SC[s]}55` }}>{s}</span>
          ))}
          {findings.map((f, i) => (
            <span key={i} style={{ fontSize:11, background:'white', color:'#166534',
              padding:'1px 8px', borderRadius:6, border:'1px solid #bbf7d0',
              display:'flex', alignItems:'center', gap:4 }}>
              {f.text}
              <button onClick={() => onDeleteFinding(cardId, i)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#86efac', padding:0, lineHeight:1 }}>×</button>
            </span>
          ))}
        </div>
        <button onClick={() => onDeleteCard(cardId)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#86efac', padding:2, flexShrink:0 }}>
          <Trash2 size={14} />
        </button>
      </div>
      <div style={{ padding:'8px 14px' }}>
        <FindingSearch onAdd={text => onAddFinding(cardId, text)}
          placeholder="Start typing an examination or past procedure…" />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DentalChart({ value, onChange }) {
  const data = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const cards          = data.cards           || [];
  const toothSurfaces  = data.tooth_surfaces  || {};  // { "21": { Buccal:true, Root:true } }
  const dentalProcs    = data.dental_procedures || [];

  const update = patch => onChange({ ...data, ...patch });

  const toggleSurface = (num, surface) => {
    const cur = toothSurfaces[num] || {};
    update({ tooth_surfaces: { ...toothSurfaces, [num]: { ...cur, [surface]: !cur[surface] } } });
  };

  const openCard = num => {
    if (cards.find(c => c.toothNum === num)) return;
    update({ cards: [...cards, { id: Date.now(), toothNum: num, findings: [] }] });
  };

  const deleteCard    = id   => update({ cards: cards.filter(c => c.id !== id) });
  const addFinding    = (id, text) => update({ cards: cards.map(c => c.id===id ? {...c, findings:[...c.findings,{text}]} : c) });
  const deleteFinding = (id, idx)  => update({ cards: cards.map(c => c.id===id ? {...c, findings:c.findings.filter((_,i)=>i!==idx)} : c) });

  const toothHasCard = num => cards.some(c => c.toothNum === num);

  function Quadrant({ nums, isUpper }) {
    return (
      <div style={{ display:'flex', gap:2 }}>
        {nums.map(num => (
          <ToothCell key={num} num={num} isUpper={isUpper}
            surfaces={toothSurfaces[num]} hasCard={toothHasCard(num)}
            onSelect={openCard} onToggleSurface={toggleSurface} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>🦷 Dental Examinations / Past Procedures</span>
        <span style={{ fontSize:12, fontWeight:600, color:'#334155', background:'#f1f5f9', padding:'3px 10px', borderRadius:6 }}>Adult Dentition</span>
      </div>

      {/* Surface legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
        {SURFACES.map(s => (
          <span key={s} style={{ fontSize:10, padding:'2px 8px', borderRadius:6, fontWeight:600,
            background:SC[s]+'22', border:`1px solid ${SC[s]}55`, color:SC[s] }}>● {s}</span>
        ))}
      </div>
      <div style={{ fontSize:11, color:'#94a3b8', marginBottom:8 }}>
        Click <b>tooth image/number</b> to add a finding · Click <b>surface zones</b> to mark surfaces
      </div>

      {/* Chart */}
      <div style={{ border:'1px solid #e2e8f0', borderRadius:12, padding:'10px 8px',
        background:'#fafafa', marginBottom:14, overflowX:'auto' }}>

        {/* Upper jaw — root at top, odontogram below image */}
        <div style={{ display:'flex', justifyContent:'center', alignItems:'flex-end', gap:0, marginBottom:4 }}>
          <div style={{ paddingRight:8, borderRight:'2px dashed #cbd5e1' }}>
            <Quadrant nums={UPPER.slice(0,8)} isUpper />
          </div>
          <div style={{ paddingLeft:8 }}>
            <Quadrant nums={UPPER.slice(8)} isUpper />
          </div>
        </div>

        <div style={{ borderTop:'2px solid #e2e8f0', margin:'4px 0' }} />

        {/* Lower jaw — odontogram at top, root at bottom */}
        <div style={{ display:'flex', justifyContent:'center', alignItems:'flex-start', gap:0, marginTop:4 }}>
          <div style={{ paddingRight:8, borderRight:'2px dashed #cbd5e1' }}>
            <Quadrant nums={LOWER.slice(0,8)} isUpper={false} />
          </div>
          <div style={{ paddingLeft:8 }}>
            <Quadrant nums={LOWER.slice(8)} isUpper={false} />
          </div>
        </div>
      </div>

      {/* Finding cards */}
      {cards.map(card => (
        <ToothCard key={card.id} cardId={card.id} toothNum={card.toothNum}
          findings={card.findings} surfaces={toothSurfaces[card.toothNum]}
          onAddFinding={addFinding} onDeleteCard={deleteCard} onDeleteFinding={deleteFinding} />
      ))}

      {/* Global dental procedures */}
      <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', marginTop:4 }}>
        <div style={{ background:'#6366f1', padding:'8px 14px' }}>
          <span style={{ fontSize:12, fontWeight:800, color:'white', textTransform:'uppercase' }}>🔧 Dental Procedures</span>
        </div>
        <div style={{ padding:'10px 12px' }}>
          {dentalProcs.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {dentalProcs.map((p, i) => (
                <span key={i} style={{ background:'#eef2ff', border:'1px solid #c7d2fe', color:'#4338ca',
                  borderRadius:8, padding:'3px 10px', fontSize:12, fontWeight:500,
                  display:'flex', alignItems:'center', gap:4 }}>
                  {p}
                  <button onClick={() => update({ dental_procedures: dentalProcs.filter((_,j)=>j!==i) })}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#a5b4fc', padding:0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <FindingSearch onAdd={text => update({ dental_procedures:[...dentalProcs,text] })}
            placeholder="Search or type a procedure…" />
        </div>
      </div>
    </div>
  );
}
