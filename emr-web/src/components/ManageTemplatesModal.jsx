import { useState, useMemo } from 'react';
import { X, Search, Plus, Edit2, Trash2, ChevronLeft, Check, Lock } from 'lucide-react';
import { api } from '../api/client';
import styles from './ManageTemplatesModal.module.css';

const TABS = ['Predefined', 'My Templates'];

// Specialty color map
const SPECIALTY_COLORS = {
  cardiology:       '#ef4444',
  dermatology:      '#f97316',
  orthopedics:      '#eab308',
  pediatrics:       '#22c55e',
  gynecology:       '#ec4899',
  neurology:        '#8b5cf6',
  psychiatry:       '#6366f1',
  ophthalmology:    '#06b6d4',
  ent:              '#0891b2',
  endocrinology:    '#10b981',
  pulmonology:      '#3b82f6',
  gastroenterology: '#f59e0b',
  nephrology:       '#7c3aed',
  general:          '#6b7280',
};
function specialtyColor(s) { return SPECIALTY_COLORS[s?.toLowerCase()] || '#6b7280'; }

function TemplateCard({ template, isSelected, onClick }) {
  const color = specialtyColor(template.specialty);
  return (
    <button
      className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
      onClick={onClick}
    >
      <div className={styles.cardDot} style={{ background: color }} />
      <div className={styles.cardBody}>
        <div className={styles.cardName}>{template.name}</div>
        {template.specialty && template.specialty !== 'general' && (
          <span className={styles.cardSpecialty} style={{ color, background: color + '18' }}>
            {template.specialty}
          </span>
        )}
      </div>
      {template.is_predefined && <Lock size={10} className={styles.lockIcon} />}
      {isSelected && <Check size={13} className={styles.checkIcon} />}
    </button>
  );
}

function TemplateDetail({ template, onEdit, onDelete, onCloneAsCustom }) {
  if (!template) {
    return (
      <div className={styles.detailEmpty}>
        <div className={styles.detailEmptyIcon}>📋</div>
        <div className={styles.detailEmptyText}>Select a template to preview it</div>
      </div>
    );
  }

  const color = specialtyColor(template.specialty);

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div>
          <div className={styles.detailName}>{template.name}</div>
          {template.specialty && (
            <span className={styles.detailSpecialty} style={{ color, background: color + '18' }}>
              {template.specialty}
            </span>
          )}
          {template.is_predefined && (
            <span className={styles.detailPredefinedBadge}>
              <Lock size={9} /> Predefined
            </span>
          )}
        </div>
        <div className={styles.detailActions}>
          {template.is_predefined ? (
            <button className={styles.btnClone} onClick={() => onCloneAsCustom(template)}>
              <Plus size={12} /> Use as Base
            </button>
          ) : (
            <>
              <button className={styles.btnEdit} onClick={() => onEdit(template)}>
                <Edit2 size={12} /> Edit
              </button>
              <button className={styles.btnDelete} onClick={() => onDelete(template)}>
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>
      {template.description && (
        <p className={styles.detailDesc}>{template.description}</p>
      )}
      {template.focus_prompt && (
        <div className={styles.detailPromptWrap}>
          <div className={styles.detailPromptLabel}>AI Instructions</div>
          <pre className={styles.detailPrompt}>{template.focus_prompt}</pre>
        </div>
      )}
      {!template.focus_prompt && (
        <div className={styles.detailDefaultNote}>
          Uses the standard Infer care EMR extraction — all SOAP fields filled automatically.
        </div>
      )}
    </div>
  );
}

function TemplateForm({ initial, onSave, onCancel, saving }) {
  const [name,         setName]         = useState(initial?.name         || '');
  const [description,  setDescription]  = useState(initial?.description  || '');
  const [focusPrompt,  setFocusPrompt]  = useState(initial?.focus_prompt || '');
  const [specialty,    setSpecialty]    = useState(initial?.specialty     || '');

  const specialties = Object.keys(SPECIALTY_COLORS).filter(s => s !== 'general');

  return (
    <div className={styles.form}>
      <div className={styles.formTitle}>{initial?.id ? 'Edit Template' : 'New Template'}</div>

      <label className={styles.formLabel}>Name *</label>
      <input
        className={styles.formInput}
        placeholder="e.g. Diabetic Follow-Up"
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={80}
      />

      <label className={styles.formLabel}>Specialty</label>
      <select
        className={styles.formInput}
        value={specialty}
        onChange={e => setSpecialty(e.target.value)}
      >
        <option value="">General / Other</option>
        {specialties.map(s => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>

      <label className={styles.formLabel}>Description</label>
      <input
        className={styles.formInput}
        placeholder="Short description of what this template captures"
        value={description}
        onChange={e => setDescription(e.target.value)}
        maxLength={200}
      />

      <label className={styles.formLabel}>AI Focus Instructions</label>
      <p className={styles.formHint}>
        Tell the AI what to specifically capture, emphasize, or format for this consultation type.
        The AI will follow these rules when extracting SOAP notes from the transcript.
      </p>
      <textarea
        className={styles.formTextarea}
        rows={8}
        placeholder={
          'Example:\n- Capture SOCRATES for all pain complaints.\n- Screen for diabetes and hypertension comorbidities.\n- Document drug compliance for all chronic medications.\n- For follow-up visits: note changes since last visit.'
        }
        value={focusPrompt}
        onChange={e => setFocusPrompt(e.target.value)}
      />

      <div className={styles.formFooter}>
        <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
        <button
          className={styles.btnSave}
          onClick={() => onSave({ name, description, focus_prompt: focusPrompt, specialty: specialty || null })}
          disabled={!name.trim() || saving}
        >
          {saving ? 'Saving…' : <><Check size={13} /> Save Template</>}
        </button>
      </div>
    </div>
  );
}

export default function ManageTemplatesModal({ templates, onClose, onRefresh }) {
  const [tab,         setTab]        = useState('Predefined');
  const [search,      setSearch]     = useState('');
  const [selected,    setSelected]   = useState(null);
  const [editTarget,  setEditTarget] = useState(null); // template being edited
  const [showForm,    setShowForm]   = useState(false);
  const [saving,      setSaving]     = useState(false);
  const [deleteConf,  setDeleteConf] = useState(null); // template pending delete confirm

  const predefined = templates.predefined || [];
  const custom     = templates.custom     || [];

  const filteredPredefined = useMemo(() => {
    const q = search.toLowerCase();
    return predefined.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.specialty?.toLowerCase().includes(q)
    );
  }, [predefined, search]);

  const filteredCustom = useMemo(() => {
    const q = search.toLowerCase();
    return custom.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.specialty?.toLowerCase().includes(q)
    );
  }, [custom, search]);

  const currentList = tab === 'Predefined' ? filteredPredefined : filteredCustom;

  const openCreate = () => {
    setEditTarget(null);
    setShowForm(true);
    setSelected(null);
  };

  const openEdit = (tpl) => {
    setEditTarget(tpl);
    setShowForm(true);
    setSelected(null);
  };

  const cloneAsCustom = (tpl) => {
    setEditTarget({
      name:         tpl.name + ' (Copy)',
      description:  tpl.description || '',
      focus_prompt: tpl.focus_prompt || '',
      specialty:    tpl.specialty || '',
    });
    setShowForm(true);
    setTab('My Templates');
    setSelected(null);
  };

  const handleSave = async (data) => {
    setSaving(true);
    try {
      if (editTarget?.id) {
        await api.put(`/scribe/templates/${editTarget.id}`, data);
      } else {
        await api.post('/scribe/templates', data);
      }
      await onRefresh();
      setShowForm(false);
      setEditTarget(null);
      setTab('My Templates');
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl) => {
    setDeleteConf(tpl);
  };

  const confirmDelete = async () => {
    if (!deleteConf) return;
    try {
      await api.delete(`/scribe/templates/${deleteConf.id}`);
      await onRefresh();
      if (selected?.id === deleteConf.id) setSelected(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleteConf(null);
    }
  };

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={onClose}>
            <ChevronLeft size={15} /> Back to Scribe
          </button>
        </div>
        <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
      </div>

      <div className={styles.titleRow}>
        <div className={styles.title}>Scribe Templates</div>
        <p className={styles.subtitle}>
          Select a template before recording to guide the AI on what to extract from the consultation.
        </p>
      </div>

      {/* Tabs */}
      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t}
            className={`${styles.tabBtn} ${tab === t ? styles.tabBtnActive : ''}`}
            onClick={() => { setTab(t); setSearch(''); setSelected(null); setShowForm(false); }}
          >
            {t}
            <span className={styles.tabCount}>
              {t === 'Predefined' ? predefined.length : custom.length}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <Search size={13} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {tab === 'My Templates' && !showForm && (
          <button className={styles.btnNew} onClick={openCreate}>
            <Plus size={13} /> New
          </button>
        )}
      </div>

      {/* Body: list + detail / form */}
      <div className={styles.body}>

        {/* Left: list */}
        <div className={styles.list}>
          {currentList.length === 0 ? (
            <div className={styles.emptyList}>
              {search
                ? 'No templates match your search.'
                : tab === 'My Templates'
                  ? 'No custom templates yet. Click "New" to create one.'
                  : 'No predefined templates found.'
              }
            </div>
          ) : (
            currentList.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                isSelected={selected?.id === t.id}
                onClick={() => { setSelected(t); setShowForm(false); }}
              />
            ))
          )}
        </div>

        {/* Right: detail or form */}
        <div className={styles.detail}>
          {showForm ? (
            <TemplateForm
              initial={editTarget}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditTarget(null); }}
              saving={saving}
            />
          ) : (
            <TemplateDetail
              template={selected}
              onEdit={openEdit}
              onDelete={handleDelete}
              onCloneAsCustom={cloneAsCustom}
            />
          )}
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {deleteConf && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <div className={styles.confirmTitle}>Delete Template?</div>
            <div className={styles.confirmMsg}>
              "<strong>{deleteConf.name}</strong>" will be permanently deleted.
            </div>
            <div className={styles.confirmBtns}>
              <button className={styles.btnCancel} onClick={() => setDeleteConf(null)}>Cancel</button>
              <button className={styles.btnDeleteConfirm} onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
