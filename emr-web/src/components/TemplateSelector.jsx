/**
 * TemplateSelector
 *
 * Browse all scribe templates (predefined + custom) and set one as the
 * doctor's active consultation template.  Also exposes a helper that maps
 * a template's specialty to the InferPad sections that should be enabled.
 */
import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, BookOpen, Sparkles, Clock } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import s from './TemplateSelector.module.css';
import { INFERPAD_SECTIONS } from '../pages/settings/InferPadSettings';

// ── Specialty → InferPad section mapping ─────────────────────────────────────
const ALL_KEYS = INFERPAD_SECTIONS.map(sec => sec.key);

const OPHTHO = ALL_KEYS.filter(k => k.startsWith('ophtho_'));
const ENT    = ALL_KEYS.filter(k => k.startsWith('ent_'));
const CORE   = ['vitals','medical_history','symptoms','diagnosis','medications','lab_investigations','lab_results','examination_findings','notes','refer_to','follow_up','advices','procedures','injections'];

const SPECIALTY_MAP = {
  ophthalmology: [...['vitals','symptoms','medical_history','diagnosis','medications','examination_findings','lab_investigations','notes','follow_up','advices','procedures'], ...OPHTHO],
  ent:           [...['vitals','symptoms','medical_history','diagnosis','medications','examination_findings','lab_investigations','notes','follow_up','advices','procedures'], ...ENT],
  pediatrics:    [...CORE, 'growth_chart'],
  endocrinology: [...CORE],
  cardiology:    [...CORE],
  dermatology:   ['vitals','medical_history','symptoms','diagnosis','medications','examination_findings','procedures','notes','follow_up','advices'],
  gynecology:    [...CORE],
  orthopedics:   ['vitals','medical_history','symptoms','diagnosis','medications','lab_investigations','examination_findings','procedures','injections','notes','follow_up','advices'],
  neurology:     [...CORE],
  psychiatry:    ['medical_history','symptoms','diagnosis','medications','notes','follow_up','advices'],
  pulmonology:   [...CORE],
  gastroenterology:[...CORE],
  nephrology:    [...CORE],
  emergency:     [...CORE],
  oncology:      [...CORE],
};

/**
 * Returns the list of InferPad section keys to DISABLE for a given specialty.
 * If no specialty or 'general', returns [] (enable everything).
 */
export function getDisabledSectionsForSpecialty(specialty) {
  if (!specialty) return [];
  const norm = specialty.toLowerCase().replace(/\s+/g, '');
  const matched = Object.entries(SPECIALTY_MAP).find(([k]) => norm.includes(k));
  if (!matched) return [];
  const enabled = new Set(matched[1]);
  return ALL_KEYS.filter(k => !enabled.has(k));
}

// ── Specialty colour chips ────────────────────────────────────────────────────
const SPEC_COLOR = {
  ophthalmology:'#0284c7', ent:'#0891b2', pediatrics:'#16a34a', endocrinology:'#7c3aed',
  cardiology:'#dc2626', dermatology:'#d97706', gynecology:'#db2777', orthopedics:'#64748b',
  neurology:'#4f46e5', psychiatry:'#9333ea', pulmonology:'#0369a1', gastroenterology:'#b45309',
  nephrology:'#0f766e', emergency:'#ef4444', oncology:'#7c2d12', general:'#64748b',
};
function specColor(spec) { return SPEC_COLOR[spec?.toLowerCase()] || '#64748b'; }

// ── Single template card ──────────────────────────────────────────────────────
function TemplateCard({ tpl, isActive, onSelect }) {
  const color = specColor(tpl.specialty);
  return (
    <div className={`${s.card} ${isActive ? s.cardActive : ''}`} onClick={() => onSelect(tpl)}>
      {isActive && <div className={s.activePill}><Check size={10} /> Active</div>}
      <div className={s.cardHeader}>
        <div className={s.cardIcon} style={{ background: color + '18', color }}>
          {tpl.is_predefined ? <BookOpen size={16} /> : <Sparkles size={16} />}
        </div>
        <div className={s.cardMeta}>
          {tpl.specialty && (
            <span className={s.specBadge} style={{ background: color + '18', color }}>
              {tpl.specialty}
            </span>
          )}
          {!tpl.is_predefined && <span className={s.customBadge}>Custom</span>}
        </div>
      </div>
      <div className={s.cardName}>{tpl.name}</div>
      {tpl.description && <div className={s.cardDesc}>{tpl.description}</div>}
      <button
        className={`${s.setBtn} ${isActive ? s.setBtnActive : ''}`}
        onClick={e => { e.stopPropagation(); onSelect(tpl); }}
      >
        {isActive ? <><Check size={12} /> Active Template</> : 'Set as Active'}
      </button>
    </div>
  );
}

// ── Main TemplateSelector modal ───────────────────────────────────────────────
export default function TemplateSelector({ currentTemplate, onApply, onClose }) {
  const [templates,  setTemplates]  = useState({ predefined: [], custom: [] });
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [specFilter, setSpecFilter] = useState('');
  const [pending,    setPending]    = useState(null);  // template chosen but not confirmed
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    api.get('/scribe/templates')
      .then(setTemplates)
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  }, []);

  const allTemplates = useMemo(() => [
    ...templates.predefined,
    ...templates.custom,
  ], [templates]);

  const specialties = useMemo(() => {
    const set = new Set(allTemplates.map(t => t.specialty).filter(Boolean));
    return ['', ...Array.from(set).sort()];
  }, [allTemplates]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allTemplates.filter(t => {
      const matchQ = !q || t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.specialty || '').toLowerCase().includes(q);
      const matchS = !specFilter || t.specialty?.toLowerCase() === specFilter.toLowerCase();
      return matchQ && matchS;
    });
  }, [allTemplates, search, specFilter]);

  const activeId = currentTemplate?.id;

  const handleSelect = (tpl) => {
    if (tpl.id === activeId) return; // already active — ignore
    setPending(tpl);
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await api.patch('/scribe/active-template', {
        template_id:   pending.id,
        is_predefined: !!pending.is_predefined,
      });
      onApply(pending);
      toast.success(`"${pending.name}" set as active template`);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to set template');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    await api.patch('/scribe/active-template', { template_id: null }).catch(() => {});
    onApply(null);
    toast.success('Active template cleared');
    onClose();
  };

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>

        {/* Header */}
        <div className={s.head}>
          <div className={s.headLeft}>
            <BookOpen size={18} className={s.headIcon} />
            <div>
              <div className={s.headTitle}>Choose Consultation Template</div>
              <div className={s.headSub}>Select a template to pre-configure InferPad sections for your specialty.</div>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        {/* Search + filter */}
        <div className={s.filterBar}>
          <div className={s.searchWrap}>
            <Search size={14} className={s.searchIcon} />
            <input
              className={s.searchInput}
              placeholder="Search templates…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && <button className={s.searchClear} onClick={() => setSearch('')}><X size={12} /></button>}
          </div>
          <select className={s.specSelect} value={specFilter} onChange={e => setSpecFilter(e.target.value)}>
            <option value="">All Specialties</option>
            {specialties.filter(Boolean).map(sp => (
              <option key={sp} value={sp}>{sp.charAt(0).toUpperCase() + sp.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Grid */}
        <div className={s.grid}>
          {loading ? (
            <p className={s.hint}>Loading templates…</p>
          ) : filtered.length === 0 ? (
            <p className={s.hint}>No templates match your search.</p>
          ) : (
            filtered.map(tpl => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                isActive={tpl.id === activeId}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>

        {/* Confirm bar */}
        {pending && (
          <div className={s.confirmBar}>
            <div className={s.confirmText}>
              Set <strong>"{pending.name}"</strong> as your active consultation template?
              {getDisabledSectionsForSpecialty(pending.specialty).length > 0 && (
                <span className={s.confirmHint}> Pad sections will be auto-configured for {pending.specialty}.</span>
              )}
            </div>
            <div className={s.confirmBtns}>
              <button className={s.btnCancel} onClick={() => setPending(null)}>Cancel</button>
              <button className={s.btnApply} onClick={handleConfirm} disabled={saving}>
                {saving ? 'Saving…' : <><Check size={13} /> Set Active</>}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={s.foot}>
          {currentTemplate && (
            <button className={s.clearBtn} onClick={handleClear}>
              Clear active template
            </button>
          )}
          <button className={s.btnCancel} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
