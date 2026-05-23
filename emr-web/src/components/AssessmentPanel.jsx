import { useState, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, CheckCircle, AlertCircle,
  AlertTriangle, Info, RotateCcw, CheckCheck, Loader,
  Activity, Heart, User, Layers, Eye, Droplets, Shield,
  Brain, Volume2, Smile, Zap, Stethoscope, Leaf, Pill,
} from 'lucide-react';
import { api } from '../api/client';
import styles from './AssessmentPanel.module.css';

const CATEGORIES = [
  {
    id: 'lifestyle', name: 'Lifestyle & Chronic Diseases', icon: Activity, color: '#8B5CF6',
    subcategories: ['Exercise & Physical Activity', 'Diet & Nutrition', 'Sleep Quality', 'Stress Management', 'Smoking & Tobacco Use', 'Alcohol & Substance Use', 'Obesity & Weight Management'],
  },
  {
    id: 'general', name: 'General Health Problems', icon: Stethoscope, color: '#06B6D4',
    subcategories: ['Fatigue & Low Energy', 'Headaches', 'Fever & Infections', 'Allergies & Sensitivities', 'Chronic Pain', 'Dizziness & Fainting'],
  },
  {
    id: 'male', name: 'Male Sexual & Reproductive Health', icon: User, color: '#3B82F6',
    subcategories: ['Erectile Dysfunction', 'Prostate Health', 'Testosterone & Hormones', 'Male Infertility', 'Testicular Health', 'STI Screening'],
  },
  {
    id: 'skin', name: 'Skin & Hair', icon: Layers, color: '#F97316',
    subcategories: ['Acne & Pimples', 'Hair Loss & Alopecia', 'Eczema & Dermatitis', 'Psoriasis', 'Rashes & Allergic Reactions', 'Nail Problems', 'Skin Pigmentation Issues'],
  },
  {
    id: 'digestive', name: 'Digestive & Bowel Health', icon: Leaf, color: '#10B981',
    subcategories: ['Acid Reflux & GERD', 'IBS', 'Constipation', 'Diarrhea & Loose Stools', 'Bloating & Gas', 'Peptic Ulcers', 'Inflammatory Bowel Disease'],
  },
  {
    id: 'eye', name: 'Eye Problems', icon: Eye, color: '#0EA5E9',
    subcategories: ['Vision Problems', 'Dry & Irritated Eyes', 'Eye Infections', 'Glaucoma Risk', 'Cataract Symptoms', 'Diabetic Eye Disease'],
  },
  {
    id: 'kidney', name: 'Kidney & Liver Health', icon: Droplets, color: '#EF4444',
    subcategories: ['Kidney Stones', 'Chronic Kidney Disease Risk', 'Liver Function & Health', 'Hepatitis', 'Gallstones & Gallbladder', 'Fatty Liver Disease'],
  },
  {
    id: 'infectious', name: 'Infectious Diseases', icon: Shield, color: '#F59E0B',
    subcategories: ['Common Cold & Influenza', 'Urinary Tract Infection', 'Respiratory Infections', 'Skin Infections', 'Vector-borne Diseases', 'Foodborne Illness'],
  },
  {
    id: 'diabetes', name: 'Diabetes Complications', icon: Pill, color: '#EC4899',
    subcategories: ['Diabetic Foot Complications', 'Diabetic Neuropathy', 'Diabetic Retinopathy', 'Diabetic Nephropathy', 'Cardiovascular Risk in Diabetes', 'Hypoglycemia Episodes'],
  },
  {
    id: 'bone', name: 'Bone & Joint Health', icon: Activity, color: '#78716C',
    subcategories: ['Osteoporosis Risk', 'Joint Pain & Arthritis', 'Back & Spine Pain', 'Fracture Risk Assessment', 'Vitamin D Deficiency', 'Gout'],
  },
  {
    id: 'female', name: 'Female Sexual & Reproductive Health', icon: Heart, color: '#DB2777',
    subcategories: ['Menstrual Irregularities', 'PCOS', 'Menopause Symptoms', 'Fertility & Conception', 'Cervical & Ovarian Health', 'STI Screening', 'Pregnancy Concerns'],
  },
  {
    id: 'mental', name: 'Mental & Neurological Health', icon: Brain, color: '#7C3AED',
    subcategories: ['Depression Screening', 'Anxiety Disorders', 'ADHD Assessment', 'Memory & Cognitive Issues', 'Sleep Disorders', 'Epilepsy & Seizures', 'Stress & Burnout'],
  },
  {
    id: 'ent', name: 'Ear, Nose & Throat', icon: Volume2, color: '#0891B2',
    subcategories: ['Hearing Loss', 'Chronic Sinusitis', 'Tonsillitis', 'Snoring & Sleep Apnea', 'Vertigo & Balance Issues', 'Nosebleeds', 'Voice & Throat Problems'],
  },
  {
    id: 'oral', name: 'Oral Health', icon: Smile, color: '#059669',
    subcategories: ['Tooth Decay & Cavities', 'Gum Disease & Periodontitis', 'Bad Breath', 'Teeth Sensitivity', 'TMJ Disorders', 'Mouth Ulcers & Sores'],
  },
  {
    id: 'hormonal', name: 'Hormonal Problems', icon: Zap, color: '#D97706',
    subcategories: ['Thyroid Disorders', 'Adrenal Health', 'Insulin Resistance', 'Cortisol Imbalance', 'Growth Hormone Issues', 'Parathyroid Problems'],
  },
];

const RISK_CONFIG = {
  low:      { label: 'Low Risk',      color: '#16A34A', bg: '#DCFCE7', icon: CheckCircle },
  moderate: { label: 'Moderate Risk', color: '#D97706', bg: '#FEF3C7', icon: Info },
  high:     { label: 'High Risk',     color: '#EA580C', bg: '#FFEDD5', icon: AlertTriangle },
  critical: { label: 'Critical Risk', color: '#DC2626', bg: '#FEE2E2', icon: AlertCircle },
};

export default function AssessmentPanel({
  onClose, standalone = false, fullscreen = false, set,
}) {
  const [phase,     setPhase]     = useState('categories');
  const [category,  setCategory]  = useState(null);
  const [subcat,    setSubcat]    = useState('');
  const [subSearch, setSubSearch] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers,   setAnswers]   = useState({});
  const [currentQ,  setCurrentQ]  = useState(0);
  const [result,    setResult]    = useState(null);
  const [errMsg,    setErrMsg]    = useState('');

  const reset = useCallback(() => {
    setPhase('categories'); setCategory(null); setSubcat(''); setSubSearch('');
    setQuestions([]); setAnswers({}); setCurrentQ(0); setResult(null); setErrMsg('');
  }, []);

  const selectCategory = (cat) => {
    setCategory(cat); setSubSearch(''); setPhase('subcategories');
  };

  const selectSubcategory = useCallback(async (sub) => {
    setSubcat(sub); setPhase('loading-q'); setErrMsg('');
    try {
      const data = await api.post('/assessment/questions', { category: category.name, subcategory: sub });
      setQuestions(data.questions || []);
      setAnswers({});
      setCurrentQ(0);
      setPhase('questions');
    } catch (err) {
      setErrMsg('Failed to generate questions: ' + err.message);
      setPhase('subcategories');
    }
  }, [category]);

  const answerSingle = (qId, opt) => {
    setAnswers(a => ({ ...a, [qId]: opt }));
  };

  const answerMultiple = (qId, opt, checked) => {
    setAnswers(a => {
      const prev = Array.isArray(a[qId]) ? a[qId] : [];
      return { ...a, [qId]: checked ? [...prev, opt] : prev.filter(o => o !== opt) };
    });
  };

  const submitAnswers = useCallback(async () => {
    setPhase('loading-r'); setErrMsg('');
    const payload = questions.map(q => ({
      question: q.text,
      answer: answers[q.id] ?? '',
    }));
    try {
      const data = await api.post('/assessment/analyze', {
        category: category.name, subcategory: subcat, answers: payload,
      });
      setResult(data.result);
      setPhase('result');
    } catch (err) {
      setErrMsg('Analysis failed: ' + err.message);
      setPhase('questions');
    }
  }, [questions, answers, category, subcat]);

  const applyToInferPad = useCallback(() => {
    if (!result || !set) return;
    const noteParts = [`Assessment (${subcat}): ${result.summary}`];
    if (result.when_to_see_doctor) noteParts.push(`When to see doctor: ${result.when_to_see_doctor}`);
    set('notes', noteParts.join('\n'));
    if (result.findings?.length)       set('examination_findings', result.findings.join(' | '));
    if (result.recommendations?.length) set('advices', result.recommendations.join('\n'));
    onClose?.();
  }, [result, set, subcat, onClose]);

  const q = questions[currentQ];
  const isLastQ = currentQ === questions.length - 1;
  const panelClass = [styles.panel, fullscreen ? styles.panelFullscreen : ''].filter(Boolean).join(' ');

  const goBack = () => {
    if (phase === 'subcategories') setPhase('categories');
    else if (phase === 'questions') setPhase('subcategories');
    else if (phase === 'result') { setPhase('questions'); setCurrentQ(questions.length - 1); }
  };

  const headerTitle = () => {
    if (phase === 'categories')                 return 'Patient Assessment';
    if (phase === 'subcategories')              return category?.name;
    if (phase === 'loading-q' || phase === 'loading-r') return 'Assessment';
    if (phase === 'questions')                  return subcat;
    if (phase === 'result')                     return 'Assessment Result';
    return 'Assessment';
  };

  return (
    <div className={panelClass}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {['subcategories', 'questions', 'result'].includes(phase) && (
            <button className={styles.backBtn} onClick={goBack} title="Back">
              <ChevronLeft size={15} />
            </button>
          )}
          <span className={styles.headerTitle}>{headerTitle()}</span>
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={() => { reset(); onClose(); }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>

        {/* ── Categories grid ── */}
        {phase === 'categories' && (
          <div className={styles.categoryGrid}>
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <button key={cat.id} className={styles.categoryCard} onClick={() => selectCategory(cat)}>
                  <div className={styles.catIconWrap} style={{ background: cat.color + '18' }}>
                    <Icon size={20} color={cat.color} strokeWidth={1.8} />
                  </div>
                  <div className={styles.catName}>{cat.name}</div>
                  <div className={styles.catCount}>{cat.subcategories.length} topics</div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Subcategories ── */}
        {phase === 'subcategories' && (
          <div className={styles.subcatPane}>
            <input
              className={styles.searchInput}
              placeholder="Search topics…"
              value={subSearch}
              onChange={e => setSubSearch(e.target.value)}
              autoFocus
            />
            {errMsg && <div className={styles.error}>{errMsg}</div>}
            <div className={styles.subcatList}>
              {category.subcategories
                .filter(s => s.toLowerCase().includes(subSearch.toLowerCase()))
                .map(s => (
                  <button key={s} className={styles.subcatItem} onClick={() => selectSubcategory(s)}>
                    <span>{s}</span>
                    <ChevronRight size={14} className={styles.subcatArrow} />
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* ── Loading questions ── */}
        {phase === 'loading-q' && (
          <div className={styles.loadingPane}>
            <Loader size={28} className={styles.spin} />
            <p>Generating questions for <strong>{subcat}</strong>…</p>
          </div>
        )}

        {/* ── Questionnaire ── */}
        {phase === 'questions' && q && (
          <div className={styles.questionPane}>
            <div className={styles.progressRow}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
              </div>
              <span className={styles.progressLabel}>Question {currentQ + 1} of {questions.length}</span>
            </div>

            <p className={styles.questionType}>
              {q.type === 'multiple_choice' ? 'Select all that apply' : 'Select one'}
            </p>
            <div className={styles.questionText}>{q.text}</div>

            <div className={styles.options}>
              {q.options.map(opt => {
                const isMulti = q.type === 'multiple_choice';
                const ans = answers[q.id];
                const selected = isMulti
                  ? Array.isArray(ans) && ans.includes(opt)
                  : ans === opt;
                return (
                  <button
                    key={opt}
                    className={`${styles.optionCard} ${selected ? styles.optionSelected : ''}`}
                    onClick={() => isMulti
                      ? answerMultiple(q.id, opt, !selected)
                      : answerSingle(q.id, opt)}
                  >
                    <span className={`${styles.optionDot} ${selected ? styles.optionDotSelected : ''}`} />
                    {opt}
                  </button>
                );
              })}
            </div>

            {errMsg && <div className={styles.error}>{errMsg}</div>}

            <div className={styles.qNav}>
              <button
                className={styles.btnNavBack}
                onClick={() => setCurrentQ(i => Math.max(0, i - 1))}
                disabled={currentQ === 0}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              {!isLastQ ? (
                <button className={styles.btnNavNext} onClick={() => setCurrentQ(i => i + 1)}>
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button className={styles.btnSubmit} onClick={submitAnswers}>
                  Submit
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Loading result ── */}
        {phase === 'loading-r' && (
          <div className={styles.loadingPane}>
            <Loader size={28} className={styles.spin} />
            <p>Analyzing responses…</p>
          </div>
        )}

        {/* ── Result ── */}
        {phase === 'result' && result && (() => {
          const risk = RISK_CONFIG[result.risk_level] || RISK_CONFIG.low;
          const RiskIcon = risk.icon;
          return (
            <div className={styles.resultPane}>
              <div className={styles.riskBanner} style={{ background: risk.bg, borderColor: risk.color }}>
                <div className={styles.riskLeft}>
                  <RiskIcon size={22} color={risk.color} strokeWidth={1.8} />
                  <div>
                    <div className={styles.riskLabel} style={{ color: risk.color }}>{risk.label}</div>
                    <div className={styles.riskSubcat}>{subcat}</div>
                  </div>
                </div>
                <div className={styles.riskScore} style={{ borderColor: risk.color, color: risk.color }}>
                  {result.risk_score}
                </div>
              </div>

              <div className={styles.resultSection}>
                <div className={styles.sectionTitle}>Summary</div>
                <p className={styles.summaryText}>{result.summary}</p>
              </div>

              {result.findings?.length > 0 && (
                <div className={styles.resultSection}>
                  <div className={styles.sectionTitle}>Key Findings</div>
                  <ul className={styles.resultList}>
                    {result.findings.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}

              {result.recommendations?.length > 0 && (
                <div className={styles.resultSection}>
                  <div className={styles.sectionTitle}>Recommendations</div>
                  <ol className={styles.resultList}>
                    {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ol>
                </div>
              )}

              {result.warning_signs?.length > 0 && (
                <div className={`${styles.resultSection} ${styles.warnSection}`}>
                  <div className={styles.sectionTitle}>Warning Signs</div>
                  <ul className={styles.resultList}>
                    {result.warning_signs.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {result.when_to_see_doctor && (
                <div className={`${styles.resultSection} ${styles.doctorSection}`}>
                  <div className={styles.sectionTitle}>When to See a Doctor</div>
                  <p className={styles.summaryText}>{result.when_to_see_doctor}</p>
                </div>
              )}

              <p className={styles.disclaimer}>
                This AI-generated risk assessment is not a medical diagnosis.
              </p>

              <div className={styles.resultActions}>
                <button className={styles.btnReset} onClick={reset}>
                  <RotateCcw size={13} /> New Assessment
                </button>
                {!standalone && set && (
                  <button className={styles.btnApply} onClick={applyToInferPad}>
                    <CheckCheck size={14} /> Apply to InferPad
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
