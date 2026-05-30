import { useState } from 'react';
import { X, Calculator } from 'lucide-react';
import { CALCULATORS } from '../data/calculators';
import s from './CalculatorsSection.module.css';

// ── Calculator modal (opens when user clicks Calculate) ───────────────────────
function CalcModal({ calc, vitals, onDone, onClose }) {
  const defaults = {};
  calc.inputs.forEach(inp => {
    if (inp.vitalKey && vitals?.[inp.vitalKey]) defaults[inp.key] = String(vitals[inp.vitalKey]);
    else if (inp.type === 'select') defaults[inp.key] = inp.options?.[0] || '';
    else if (inp.type === 'checkbox') defaults[inp.key] = false;
    else defaults[inp.key] = '';
  });

  const [vals, setVals] = useState(defaults);
  const [result, setResult] = useState(null);
  const set = (k, v) => setVals(p => ({ ...p, [k]: v }));

  const handleCalc = () => {
    try {
      const r = calc.calculate(vals);
      setResult(r);
      if (r) onDone(r); // push result back to the inline row immediately
    } catch { setResult(null); }
  };

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        {/* Header */}
        <div className={s.mHead}>
          <div className={s.mHeadLeft}>
            <span className={s.mIcon}><Calculator size={16} /></span>
            <div>
              <div className={s.mTitle}>{calc.name}</div>
              <div className={s.mDesc}>{calc.desc}</div>
            </div>
          </div>
          <button className={s.mClose} onClick={onClose}><X size={15} /></button>
        </div>

        {/* Description + formula */}
        {(calc.longDesc || calc.formula) && (
          <div className={s.mInfo}>
            {calc.longDesc && <p className={s.mLongDesc}>{calc.longDesc}</p>}
            {calc.formula && (
              <div className={s.mFormula}>
                <span className={s.mFormulaLabel}>Formula</span>
                <pre className={s.mFormulaText}>{calc.formula}</pre>
              </div>
            )}
          </div>
        )}

        {/* Inputs */}
        <div className={s.mBody}>
          <div className={s.mInputs}>
            {calc.inputs.map(inp => (
              <div key={inp.key} className={`${s.mField} ${inp.type === 'checkbox' ? s.mFieldCheck : ''}`}>
                {inp.type === 'checkbox' ? (
                  <label className={s.mCheckLabel}>
                    <input type="checkbox" className={s.mCheckbox}
                      checked={!!vals[inp.key]} onChange={e => set(inp.key, e.target.checked)} />
                    <span>{inp.label}</span>
                  </label>
                ) : (
                  <>
                    <label className={s.mLabel}>
                      {inp.label}
                      {inp.unit && <span className={s.mUnit}> {inp.unit}</span>}
                    </label>
                    {inp.type === 'select' ? (
                      <select className={s.mSelect} value={vals[inp.key]} onChange={e => set(inp.key, e.target.value)}>
                        {inp.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : inp.type === 'date' ? (
                      <input type="date" className={s.mInput} value={vals[inp.key] || ''} onChange={e => set(inp.key, e.target.value)} />
                    ) : (
                      <input type="number" step="any" className={s.mInput} value={vals[inp.key] || ''} placeholder="—"
                        onChange={e => set(inp.key, e.target.value)} />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Result + Calculate */}
          <div className={s.mCalcRow}>
            <div className={s.mResultWrap}>
              <label className={s.mResultLbl}>Result</label>
              <input readOnly className={s.mResultBox}
                style={result ? { borderColor: result.color, color: result.color } : {}}
                value={result ? `${result.value}${result.unit ? ' ' + result.unit : ''}` : ''}
                placeholder="—" />
              {result?.label && <span className={s.mResultInterp} style={{ color: result.color }}>{result.label}</span>}
            </div>
            <button className={s.mCalcBtn} onClick={handleCalc}>
              <Calculator size={14} /> Calculate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calculators section ───────────────────────────────────────────────────────
export default function CalculatorsSection({ enabledIds, vitals, calcResults = {}, onResult }) {
  const [activeCalc, setActiveCalc] = useState(null);

  const enabled = enabledIds.map(id => CALCULATORS.find(c => c.id === id)).filter(Boolean);
  if (!enabled.length) return null;

  const setResult = (id, r) => { onResult?.(id, r); };

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <Calculator size={14} className={s.sectionIcon} />
        <span className={s.sectionTitle}>Calculators</span>
      </div>

      <div className={s.rows}>
        {enabled.map(calc => {
          const r = calcResults[calc.id];
          return (
            <div key={calc.id} className={s.calcRow}>
              {/* Label */}
              <span className={s.rowLabel} title={calc.desc}>{calc.name}</span>

              {/* Result text box */}
              <input
                readOnly
                className={s.rowInput}
                style={r ? { borderColor: r.color, color: r.color, fontWeight: 700 } : {}}
                value={r ? `${r.value}${r.unit ? ' ' + r.unit : ''}` : ''}
                placeholder="—"
                title={r?.label || ''}
              />
              {r?.label && <span className={s.rowInterp} style={{ color: r.color }}>{r.label}</span>}

              {/* Calculate button */}
              <button className={s.rowBtn} onClick={() => setActiveCalc(calc)}>
                Calculate
              </button>
            </div>
          );
        })}
      </div>

      {activeCalc && (
        <CalcModal
          calc={activeCalc}
          vitals={vitals}
          onDone={r => setResult(activeCalc.id, r)}
          onClose={() => setActiveCalc(null)}
        />
      )}
    </div>
  );
}
