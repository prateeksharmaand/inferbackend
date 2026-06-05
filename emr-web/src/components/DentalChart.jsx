import { useState, useRef, useEffect } from 'react';
import { Trash2, Search, FlaskConical } from 'lucide-react';

// FDI layout — chart order (left→right on screen)
const UPPER = [18,17,16,15,14,13,12,11,  21,22,23,24,25,26,27,28];
const LOWER = [48,47,46,45,44,43,42,41,  31,32,33,34,35,36,37,38];

const SURFACES = ['Buccal','Lingual','Mesial','Distal','Occlusal','Cervical','Root'];
const SC = {
  Buccal:'#3b82f6', Lingual:'#8b5cf6', Mesial:'#f59e0b',
  Distal:'#f97316', Occlusal:'#10b981', Cervical:'#ec4899', Root:'#64748b',
};

// Which image file exists — missing: 13, 15
const HAS_IMAGE = new Set([
  11,12,14,16,17,18,21,22,23,24,25,26,27,28,
  31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48,
]);

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

// ── Sub-components (all top-level) ────────────────────────────────────────────

function SuggestionItem({ text, color, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding:'7px 12px', fontSize:12, cursor:'pointer', color:'#334155',
        borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:6,
        background: hov ? color+'18' : 'transparent' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }} />
      {text}
    </div>
  );
}

function FindingSearch({ onAdd, placeholder }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const q = query.toLowerCase();
  const exams = EXAMINATIONS.filter(e => !q || e.toLowerCase().includes(q));
  const procs = PROCEDURES.filter(p => !q || p.toLowerCase().includes(q));

  const select = text => { onAdd(text); setQuery(''); setOpen(false); };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
        border:'1px solid #e2e8f0', borderRadius:8, background:'white' }}>
        <Search size={12} color="#94a3b8" />
        <input value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => e.key==='Enter' && query.trim() && select(query.trim())}
          placeholder={placeholder || 'Start typing an examination or past procedure…'}
          style={{ border:'none', outline:'none', fontSize:12, flex:1, background:'transparent' }} />
      </div>
      {open && (exams.length > 0 || procs.length > 0) && (
        <div style={{ position:'absolute', left:0, right:0, top:'100%', marginTop:4,
          background:'white', border:'1px solid #e2e8f0', borderRadius:10,
          boxShadow:'0 8px 32px #0002', zIndex:400, display:'grid',
          gridTemplateColumns:'1fr 1fr', maxHeight:300, overflowY:'auto' }}>
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

// Single tooth in the chart
function ToothCell({ num, isUpper, activeSurfaces, hasCard, onClick }) {
  const [hov, setHov] = useState(false);
  const imgSrc = HAS_IMAGE.has(num) ? `/teeth/teeth-${num}.webp` : null;
  const highlighted = hasCard || hov;

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => onClick(num)}
      style={{ display:'flex', flexDirection:'column', alignItems:'center',
        gap:2, cursor:'pointer', padding:'3px 2px', borderRadius:6,
        background: highlighted ? '#f0fdf4' : 'transparent',
        border:`1px solid ${highlighted ? '#86efac' : 'transparent'}`,
        transition:'all 0.15s', minWidth:38 }}>

      {/* Tooth image or fallback */}
      <div style={{ width:36, height:52, display:'flex', alignItems:'center', justifyContent:'center',
        filter: hasCard ? 'drop-shadow(0 0 4px #22c55e88)' : 'none',
        opacity: hov && !hasCard ? 0.75 : 1, transition:'all 0.15s' }}>
        {imgSrc
          ? <img src={imgSrc} alt={`Tooth ${num}`} style={{ maxWidth:36, maxHeight:52, objectFit:'contain' }} />
          : <div style={{ width:24, height:44, background:'#e2e8f0', borderRadius:'4px 4px 12px 12px', border:'1px solid #cbd5e1' }} />
        }
      </div>

      {/* Tooth number */}
      <span style={{ fontSize:10, fontWeight: hasCard ? 800 : 500,
        color: hasCard ? '#16a34a' : '#64748b',
        background: hasCard ? '#dcfce7' : 'transparent',
        borderRadius:4, padding:'1px 4px' }}>{num}</span>

      {/* Active surface dots */}
      {activeSurfaces.length > 0 && (
        <div style={{ display:'flex', gap:2, flexWrap:'wrap', justifyContent:'center', maxWidth:36 }}>
          {activeSurfaces.map(s => (
            <span key={s} title={s} style={{ width:6, height:6, borderRadius:'50%', background:SC[s] }} />
          ))}
        </div>
      )}
    </div>
  );
}

// Per-tooth finding card (like T21 / T18 in the reference)
function ToothCard({ cardId, toothNum, isUpper, findings, onAddFinding, onDeleteCard, onDeleteFinding }) {
  return (
    <div style={{ border:'1px solid #d1fae5', borderRadius:10, overflow:'hidden',
      marginBottom:8, background:'#f0fdf4' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'8px 14px', background:'#dcfce7', borderBottom:'1px solid #bbf7d0' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <FlaskConical size={14} color="#16a34a" />
          <span style={{ fontWeight:800, fontSize:13, color:'#14532d',
            background:'#22c55e', color:'white', padding:'2px 10px', borderRadius:6 }}>
            T{toothNum}
          </span>
          {findings.length > 0 && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {findings.map((f, i) => (
                <span key={i} style={{ fontSize:11, background:'white', color:'#166534',
                  padding:'1px 8px', borderRadius:6, border:'1px solid #bbf7d0',
                  display:'flex', alignItems:'center', gap:4 }}>
                  {f.text}
                  <button onClick={() => onDeleteFinding(cardId, i)}
                    style={{ background:'none', border:'none', cursor:'pointer',
                      color:'#86efac', padding:0, lineHeight:1, fontSize:13 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => onDeleteCard(cardId)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#86efac', padding:2 }}>
          <Trash2 size={14} />
        </button>
      </div>
      {/* Search */}
      <div style={{ padding:'8px 14px' }}>
        <FindingSearch
          onAdd={text => onAddFinding(cardId, text)}
          placeholder="Start typing an examination or past procedure…"
        />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DentalChart({ value, onChange }) {
  const data = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  // cards: [{ id, toothNum, findings: [{text}] }]
  const cards = data.cards || [];

  const update = patch => onChange({ ...data, ...patch });

  const openCard = num => {
    // If card already exists for this tooth, don't duplicate
    if (cards.find(c => c.toothNum === num)) return;
    update({ cards: [...cards, { id: Date.now(), toothNum: num, findings: [] }] });
  };

  const deleteCard = cardId => update({ cards: cards.filter(c => c.id !== cardId) });

  const addFinding = (cardId, text) => {
    update({
      cards: cards.map(c => c.id === cardId
        ? { ...c, findings: [...c.findings, { text }] }
        : c)
    });
  };

  const deleteFinding = (cardId, idx) => {
    update({
      cards: cards.map(c => c.id === cardId
        ? { ...c, findings: c.findings.filter((_, i) => i !== idx) }
        : c)
    });
  };

  const toothHasCard = num => cards.some(c => c.toothNum === num);

  return (
    <div>
      {/* Chart header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>🦷 Dental Examinations / Past Procedures</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'#64748b' }}>Type:</span>
          <span style={{ fontSize:12, fontWeight:600, color:'#334155', background:'#f1f5f9', padding:'3px 10px', borderRadius:6 }}>Adult Dentition</span>
        </div>
      </div>

      <div style={{ fontSize:11, color:'#94a3b8', marginBottom:8 }}>Click any tooth to add Dental Examination / Past Procedure</div>

      {/* Tooth chart */}
      <div style={{ border:'1px solid #e2e8f0', borderRadius:12, padding:'10px 8px',
        background:'#fafafa', marginBottom:14, overflowX:'auto' }}>

        {/* Upper jaw */}
        <div style={{ display:'flex', justifyContent:'center', gap:0, marginBottom:4 }}>
          <div style={{ display:'flex', gap:2, paddingRight:8, borderRight:'2px dashed #cbd5e1' }}>
            {UPPER.slice(0,8).map(num => (
              <ToothCell key={num} num={num} isUpper activeSurfaces={[]}
                hasCard={toothHasCard(num)} onClick={openCard} />
            ))}
          </div>
          <div style={{ display:'flex', gap:2, paddingLeft:8 }}>
            {UPPER.slice(8).map(num => (
              <ToothCell key={num} num={num} isUpper activeSurfaces={[]}
                hasCard={toothHasCard(num)} onClick={openCard} />
            ))}
          </div>
        </div>

        <div style={{ borderTop:'2px solid #e2e8f0', margin:'6px 0' }} />

        {/* Lower jaw */}
        <div style={{ display:'flex', justifyContent:'center', gap:0, marginTop:4 }}>
          <div style={{ display:'flex', gap:2, paddingRight:8, borderRight:'2px dashed #cbd5e1' }}>
            {LOWER.slice(0,8).map(num => (
              <ToothCell key={num} num={num} isUpper={false} activeSurfaces={[]}
                hasCard={toothHasCard(num)} onClick={openCard} />
            ))}
          </div>
          <div style={{ display:'flex', gap:2, paddingLeft:8 }}>
            {LOWER.slice(8).map(num => (
              <ToothCell key={num} num={num} isUpper={false} activeSurfaces={[]}
                hasCard={toothHasCard(num)} onClick={openCard} />
            ))}
          </div>
        </div>
      </div>

      {/* Finding cards */}
      {cards.length > 0 && (
        <div>
          {cards.map(card => (
            <ToothCard
              key={card.id}
              cardId={card.id}
              toothNum={card.toothNum}
              findings={card.findings}
              onAddFinding={addFinding}
              onDeleteCard={deleteCard}
              onDeleteFinding={deleteFinding}
            />
          ))}
        </div>
      )}

      {/* Dental Procedures (global) */}
      <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', marginTop:4 }}>
        <div style={{ background:'#6366f1', padding:'8px 14px' }}>
          <span style={{ fontSize:12, fontWeight:800, color:'white', textTransform:'uppercase', letterSpacing:'0.05em' }}>
            🔧 Dental Procedures
          </span>
        </div>
        <div style={{ padding:'10px 12px' }}>
          {(data.dental_procedures||[]).length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {(data.dental_procedures||[]).map((p, i) => (
                <span key={i} style={{ background:'#eef2ff', border:'1px solid #c7d2fe',
                  color:'#4338ca', borderRadius:8, padding:'3px 10px', fontSize:12,
                  fontWeight:500, display:'flex', alignItems:'center', gap:4 }}>
                  {p}
                  <button onClick={() => update({ dental_procedures: (data.dental_procedures||[]).filter((_,j)=>j!==i) })}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#a5b4fc', padding:0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <FindingSearch
            onAdd={text => update({ dental_procedures: [...(data.dental_procedures||[]), text] })}
            placeholder="Search or type a procedure…"
          />
        </div>
      </div>
    </div>
  );
}
