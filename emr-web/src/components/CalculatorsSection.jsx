import { useState } from 'react';
import { X, Calculator, ChevronUp, HelpCircle } from 'lucide-react';
import { CALCULATORS } from '../data/calculators';
import s from './CalculatorsSection.module.css';

// ── Right-panel tabs: Interpretation + How to use ─────────────────────────────
function InfoPanel({ calc }) {
  const [tab, setTab] = useState('interp');
  return (
    <div className={s.infoPanel}>
      <div className={s.infoTabs}>
        <button
          className={`${s.infoTab} ${tab === 'interp' ? s.infoTabActive : ''}`}
          onClick={() => setTab('interp')}
        >
          <ChevronUp size={13} /> Interpretation
        </button>
        <button
          className={`${s.infoTab} ${tab === 'how' ? s.infoTabActive : ''}`}
          onClick={() => setTab('how')}
        >
          <HelpCircle size={13} /> How to use
        </button>
      </div>

      <div className={s.infoBody}>
        {tab === 'interp' ? (
          calc.interpretation?.length ? (
            <>
              {/* Description + formula compact */}
              {calc.longDesc && <p className={s.infoDesc}>{calc.longDesc}</p>}
              {calc.formula && (
                <div className={s.infoFormula}>
                  <span className={s.infoFormulaLbl}>Formula</span>
                  <pre className={s.infoFormulaText}>{calc.formula}</pre>
                </div>
              )}
              {/* Interpretation table */}
              <table className={s.interpTable}>
                <thead>
                  <tr>
                    <th>RANGE</th>
                    <th>GENDER</th>
                    <th>CATEGORY</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.interpretation.map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: row.color }}>{row.range}</td>
                      <td style={{ color: '#64748b' }}>{row.gender}</td>
                      <td style={{ color: row.color, fontWeight: 700 }}>{row.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className={s.infoDesc}>{calc.longDesc || 'No interpretation data available.'}</p>
          )
        ) : (
          <div className={s.howToUse}>
            {calc.howToUse
              ? calc.howToUse.split('\n').map((line, i) => (
                  <p key={i} className={line.startsWith('•') || /^\d\./.test(line) ? s.howLine : s.howNote}>{line}</p>
                ))
              : <p className={s.infoDesc}>No instructions available.</p>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── Calculator modal ──────────────────────────────────────────────────────────
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
      if (r) onDone(r);
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

        {/* Two-column body */}
        <div className={s.mBodyWrap}>
          {/* Left: inputs + result */}
          <div className={s.mLeft}>
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

          {/* Right: interpretation + how to use */}
          <InfoPanel calc={calc} />
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

  // When doctor types directly into the result box, store as a manual override
  const handleManualEntry = (calc, raw) => {
    if (!raw.trim()) { onResult?.(calc.id, null); return; }
    onResult?.(calc.id, { value: raw, unit: '', label: '', color: '#64748b' });
  };

  return (
    <div className={s.rows}>
      {enabled.map(calc => {
        const r = calcResults[calc.id];
        const displayVal = r ? `${r.value}${r.unit ? ' ' + r.unit : ''}` : '';
        return (
          <div key={calc.id} className={s.calcRow}>
            <div className={s.rowTop}>
              <span className={s.rowLabel} title={calc.desc}>{calc.name}</span>
              {r?.label && <span className={s.rowInterp} style={{ color: r.color }}>{r.label}</span>}
            </div>
            <input
              className={s.rowInput}
              style={r?.color ? { borderColor: r.color, color: r.color, fontWeight: 700 } : {}}
              value={displayVal}
              placeholder="—"
              title={r?.label || 'Enter value or click Calculate'}
              onChange={e => handleManualEntry(calc, e.target.value)}
            />
            <button className={s.rowBtn} onClick={() => setActiveCalc(calc)}>Calculate</button>
          </div>
        );
      })}

      {activeCalc && (
        <CalcModal calc={activeCalc} vitals={vitals}
          onDone={r => onResult?.(activeCalc.id, r)}
          onClose={() => setActiveCalc(null)} />
      )}
    </div>
  );
}
