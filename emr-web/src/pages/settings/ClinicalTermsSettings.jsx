// Settings → Symptoms & Diagnoses: the master data InferPad suggests from.
// Shared terms can be hidden for this clinic; the clinic's own terms (added here or learned
// from saved prescriptions) can be edited or deleted.
import { useState, useEffect } from 'react';
import { Plus, Search, X, Pencil, Trash2, Check, Eye, EyeOff, Stethoscope } from 'lucide-react';
import { api } from '../../api/client';
import base from './ServicesSettings.module.css';
import styles from './ClinicalTermsSettings.module.css';

const KINDS = [
  { key: 'symptom',   label: 'Symptoms' },
  { key: 'diagnosis', label: 'Diagnoses' },
];

function TermModal({ kind, term, onSave, onClose }) {
  const [name, setName]   = useState(term?.name || '');
  const [code, setCode]   = useState(term?.icd10_code || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const label = kind === 'symptom' ? 'Symptom' : 'Diagnosis';

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError(`${label} name is required`);
    setSaving(true); setError('');
    try { await onSave({ name: name.trim(), icd10_code: code.trim() }); }
    catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className={base.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={base.modal}>
        <div className={base.modalHeader}>
          <span>{term ? `Edit ${label}` : `Add ${label}`}</span>
          <button className={base.modalClose} onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={submit} className={base.modalBody}>
          <div className={base.field}>
            <label>{label} <span className={base.req}>*</span></label>
            <input className={base.input} value={name} onChange={e => setName(e.target.value)}
              placeholder={kind === 'symptom' ? 'e.g. Burning feet' : 'e.g. Diabetic foot ulcer'} autoFocus />
          </div>
          <div className={base.field}>
            <label>ICD-10 code</label>
            <input className={base.input} value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Optional, e.g. E11.621" />
          </div>
          {error && <p className={base.error}>{error}</p>}
          <div className={base.modalFooter}>
            <button type="button" className={base.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={base.btnSave} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} /> {term ? 'Save Changes' : `Add ${label}`}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClinicalTermsSettings() {
  const [kind,    setKind]    = useState('symptom');
  const [search,  setSearch]  = useState('');
  const [show,    setShow]    = useState('visible');   // visible | hidden | all
  const [terms,   setTerms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [adding,  setAdding]  = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams({ kind, include_hidden: '1', limit: '1000' });
      if (search.trim()) p.set('q', search.trim());
      setTerms(await api.get(`/clinical-terms?${p}`));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [kind, search]);

  const visible = terms.filter(t => show === 'all' || (show === 'hidden' ? t.hidden : !t.hidden));

  const act = async (fn) => { setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } };
  const toggleHidden = t => act(() => api.patch(`/clinical-terms/${t.id}`, { hidden: !t.hidden }));
  const remove = t => {
    if (!window.confirm(`Delete "${t.name}"? It will no longer be suggested in InferPad.`)) return;
    act(() => api.delete(`/clinical-terms/${t.id}`));
  };
  const create = async data => { await api.post('/clinical-terms', { kind, ...data }); setAdding(false); await load(); };
  const save   = async data => { await api.patch(`/clinical-terms/${editing.id}`, data); setEditing(null); await load(); };

  return (
    <div className={base.wrap}>
      <div className={base.toolbar}>
        <div className={base.filterGroup}>
          {KINDS.map(k => (
            <button key={k.key} className={`${base.filterBtn} ${kind === k.key ? base.filterBtnActive : ''}`}
              onClick={() => setKind(k.key)}>{k.label}</button>
          ))}
        </div>
        <div className={base.filterGroup}>
          {[['visible', 'In use'], ['hidden', 'Hidden'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={`${base.filterBtn} ${show === k ? base.filterBtnActive : ''}`}
              onClick={() => setShow(k)}>{l}</button>
          ))}
        </div>
        <div className={base.searchWrap}>
          <Search size={14} className={base.searchIcon} />
          <input className={base.searchInput} placeholder="Search name or ICD-10 code…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className={base.searchClear} onClick={() => setSearch('')}><X size={12} /></button>}
        </div>
        <button className={base.btnCreate} onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={2.5} /> Add {kind === 'symptom' ? 'Symptom' : 'Diagnosis'}
        </button>
      </div>
      <p className={styles.hint}>
        InferPad suggests these in the {kind === 'symptom' ? 'Symptoms' : 'Diagnosis'} section, most-used first.
        Terms typed on a saved prescription are added here automatically. Shared terms can be hidden; your own can be edited.
      </p>

      {error && <p className={base.error}>{error}</p>}

      {loading ? (
        <p className={base.emptyText}>Loading…</p>
      ) : visible.length === 0 ? (
        <div className={base.emptyState}>
          <Stethoscope size={36} strokeWidth={1.2} className={base.emptyIcon} />
          <p>{search ? 'No terms match your search.' : show === 'hidden' ? 'No hidden terms.' : 'No terms yet.'}</p>
        </div>
      ) : (
        <div className={base.table}>
          <div className={`${base.tableHead} ${styles.grid}`}>
            <span>{kind === 'symptom' ? 'Symptom' : 'Diagnosis'}</span>
            <span>ICD-10</span><span>Source</span><span>Used</span><span>Status</span><span></span>
          </div>
          {visible.map(t => (
            <div key={t.id} className={`${base.tableRow} ${styles.grid} ${t.hidden ? styles.hiddenRow : ''}`}>
              <span className={base.svcName}>{t.name}</span>
              <span className={t.icd10_code ? styles.code : styles.muted}>{t.icd10_code || '—'}</span>
              <span className={`${styles.source} ${t.is_custom ? styles.sourceClinic : styles.sourceShared}`}>
                {t.is_custom ? 'Clinic' : 'Shared'}
              </span>
              <span className={styles.count}>{t.usage_count || 0}</span>
              <span>
                <button className={`${base.badge} ${t.hidden ? base.badgeInactive : base.badgeActive}`}
                  onClick={() => toggleHidden(t)} title={t.hidden ? 'Show in InferPad' : 'Hide from InferPad'}>
                  {t.hidden ? 'Hidden' : 'In use'}
                </button>
              </span>
              <span className={base.rowActions}>
                {t.is_custom ? (
                  <>
                    <button className={base.iconBtn} onClick={() => setEditing(t)} title="Edit"><Pencil size={13} /></button>
                    <button className={`${base.iconBtn} ${base.iconBtnDanger}`} onClick={() => remove(t)} title="Delete"><Trash2 size={13} /></button>
                  </>
                ) : (
                  <button className={base.iconBtn} onClick={() => toggleHidden(t)} title={t.hidden ? 'Show' : 'Hide'}>
                    {t.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {adding  && <TermModal kind={kind} onSave={create} onClose={() => setAdding(false)} />}
      {editing && <TermModal kind={kind} term={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}
