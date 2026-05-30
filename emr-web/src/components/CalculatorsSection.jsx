import { useState } from 'react';
import { X, Calculator, ChevronRight } from 'lucide-react';
import { CALCULATORS } from '../data/calculators';
import s from './CalculatorsSection.module.css';

// ── Calculator modal ──────────────────────────────────────────────────────────
function CalcModal({ calc, vitals, onClose }) {
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
    try { setResult(calc.calculate(vals)); }
    catch { setResult(null); }
  };

  const hasValue = () => calc.inputs.some(i => {
    if (i.type === 'checkbox') return vals[i.key];
    if (i.type === 'select') return true;
    return vals[i.key] !== '';
  });

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
                    <input
                      type="checkbox"
                      className={s.mCheckbox}
                      checked={!!vals[inp.key]}
                      onChange={e => set(inp.key, e.target.checked)}
                    />
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

          <button className={s.mCalcBtn} onClick={handleCalc}>
            <Calculator size={14} /> Calculate
          </button>

          {/* Result */}
          {result && (
            <div className={s.mResult} style={{ borderColor: result.color + '44', background: result.color + '10' }}>
              <div className={s.mResultValue} style={{ color: result.color }}>
                {result.value}
                {result.unit && <span className={s.mResultUnit}> {result.unit}</span>}
              </div>
              {result.label && (
                <div className={s.mResultLabel} style={{ color: result.color }}>{result.label}</div>
              )}
            </div>
          )}
          {result === null && (
            <div className={s.mResultEmpty}>Fill all required fields to calculate</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Calculators section ───────────────────────────────────────────────────────
export default function CalculatorsSection({ enabledIds, vitals }) {
  const [activeCalc, setActiveCalc] = useState(null);

  const enabled = enabledIds
    .map(id => CALCULATORS.find(c => c.id === id))
    .filter(Boolean);

  if (!enabled.length) return null;

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <Calculator size={14} className={s.sectionIcon} />
        <span className={s.sectionTitle}>Calculators</span>
      </div>
      <div className={s.grid}>
        {enabled.map(calc => (
          <button key={calc.id} className={s.calcCard} onClick={() => setActiveCalc(calc)}>
            <div className={s.calcName}>{calc.name}</div>
            <div className={s.calcDesc}>{calc.desc}</div>
            <span className={s.calcOpen}><ChevronRight size={13} /></span>
          </button>
        ))}
      </div>

      {activeCalc && (
        <CalcModal
          calc={activeCalc}
          vitals={vitals}
          onClose={() => setActiveCalc(null)}
        />
      )}
    </div>
  );
}
