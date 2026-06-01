import { useState, useRef } from 'react';
import { X, GripVertical, Upload, Trash2, Check, PenLine } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SignaturePad from './SignaturePad';
import {
  INFERPAD_SECTIONS, MANDATORY_FIELDS,
  getSectionOrder, saveSectionOrder,
  getMandatoryFields, getICD10Settings,
} from '../pages/settings/InferPadSettings';
import styles from './ConfigureInferPadModal.module.css';

const TABS = ['Pad Order', 'Features', 'Appearance'];

// ── Image upload helper ──────────────────────────────────────────────────────
function ImageUpload({ title, hint, value, onChange }) {
  const inputRef = useRef(null);
  const readFile = file => {
    if (!file || !file.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = e => onChange(e.target.result);
    r.readAsDataURL(file);
  };
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionHint}>{hint}</div>
      {value ? (
        <div className={styles.previewWrap}>
          <img src={value} alt={title} className={styles.previewImg} />
          <button className={styles.removeBtn} onClick={() => onChange('')}>
            <Trash2 size={12} /> Remove
          </button>
        </div>
      ) : (
        <div className={styles.dropZone}
          onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); }}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}>
          <Upload size={24} strokeWidth={1.5} className={styles.uploadIcon} />
          <span className={styles.dropLabel}>Click or drag to upload</span>
          <span className={styles.dropHint}>PNG / JPG</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => readFile(e.target.files[0])} />
    </div>
  );
}

// ── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, hint, checked, onChange, indent, disabled }) {
  return (
    <div className={styles.toggleRow} style={indent ? { paddingLeft: 20, borderLeft: '2px solid #e2e8f0' } : {}}>
      <div style={{ opacity: disabled ? .5 : 1 }}>
        <div className={styles.sectionTitle} style={{ fontSize: 13 }}>{label}</div>
        {hint && <div className={styles.sectionHint}>{hint}</div>}
      </div>
      <label className={styles.toggle}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
        <span className={styles.toggleSlider} />
      </label>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────
export default function ConfigureInferPadModal({ clinicId: propClinicId, onClose }) {
  const { user } = useAuth();
  const cid  = propClinicId || user?.clinic_id || 'default';
  const uid  = user?.id || 'default';
  const key  = t => `rx_${t}_${cid}`;
  const sigK = () => `rx_sig_${uid}_${cid}`;

  const [activeTab, setActiveTab] = useState('Pad Order');

  // ── Features state ──
  const [vaccChart,    setVaccChart]    = useState(() => localStorage.getItem(key('vaccination_chart')) === 'true');
  const [dietChart,    setDietChart]    = useState(() => localStorage.getItem(key('diet_chart'))         === 'true');
  const [growthChart,  setGrowthChart]  = useState(() => localStorage.getItem(key('growth_chart'))       === 'true');
  const [icd10Display, setIcd10Display] = useState(() => localStorage.getItem(key('icd10_display'))      === 'true');
  const [icd10Print,   setIcd10Print]   = useState(() => localStorage.getItem(key('icd10_print'))        === 'true');
  const [finishPrev,   setFinishPrev]   = useState(() => localStorage.getItem(key('finish_preview'))     === 'true');

  const toggle = (setting, val) => {
    val ? localStorage.setItem(key(setting), 'true') : localStorage.removeItem(key(setting));
    window.dispatchEvent(new Event('storage'));
  };

  // ── Pad order state ──
  const [sectionOrder,    setSectionOrder]    = useState(() => getSectionOrder(cid));
  const [mandatoryFields, setMandatoryFields] = useState(() => getMandatoryFields(cid));
  const dragIndexRef = useRef(null);
  const dragCounter  = useRef(0);
  const [dragOverIdx, setDragOverIdx]         = useState(null);

  const onDragStart = idx => { dragIndexRef.current = idx; };
  const onDragEnter = idx => { dragCounter.current++; setDragOverIdx(idx); };
  const onDragLeave = ()  => { dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOverIdx(null); } };
  const onDrop      = idx => {
    dragCounter.current = 0; setDragOverIdx(null);
    const from = dragIndexRef.current;
    if (from === null || from === idx) return;
    const next = [...sectionOrder];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    setSectionOrder(next);
    saveSectionOrder(cid, next);
    dragIndexRef.current = null;
  };
  const toggleMandatory = k => {
    const next = mandatoryFields.includes(k)
      ? mandatoryFields.filter(f => f !== k)
      : [...mandatoryFields, k];
    setMandatoryFields(next);
    localStorage.setItem(`rx_mandatory_fields_${cid}`, JSON.stringify(next));
    window.dispatchEvent(new Event('storage'));
  };

  // ── Appearance state ──
  const [headerImg,    setHeaderImg]    = useState(() => localStorage.getItem(key('header'))  || '');
  const [footerImg,    setFooterImg]    = useState(() => localStorage.getItem(key('footer'))  || '');
  const [signatureImg, setSignatureImg] = useState(() => localStorage.getItem(sigK())         || '');
  const [googleLink,   setGoogleLink]   = useState(() => localStorage.getItem(key('google_review')) || '');
  const [saved,        setSaved]        = useState(false);
  const [sigMsg,       setSigMsg]       = useState('');

  const handleSaveAppearance = () => {
    headerImg ? localStorage.setItem(key('header'), headerImg)         : localStorage.removeItem(key('header'));
    footerImg ? localStorage.setItem(key('footer'), footerImg)         : localStorage.removeItem(key('footer'));
    googleLink ? localStorage.setItem(key('google_review'), googleLink): localStorage.removeItem(key('google_review'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    window.dispatchEvent(new Event('storage'));
  };
  const handleSaveSig = url => {
    localStorage.setItem(sigK(), url);
    setSignatureImg(url);
    setSigMsg('Signature saved!');
    setTimeout(() => setSigMsg(''), 2500);
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 680 }}>

        {/* Header */}
        <div className={styles.header}>
          <h3>Configure your Pad</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className={styles.modalTabs}>
          {TABS.map(t => (
            <button key={t} className={`${styles.modalTab} ${activeTab === t ? styles.modalTabActive : ''}`}
              onClick={() => setActiveTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={styles.body} style={{ maxHeight: '65vh', overflowY: 'auto' }}>

          {/* ── Pad Order ── */}
          {activeTab === 'Pad Order' && (
            <div className={styles.section}>
              <div className={styles.sectionHint}>Drag to reorder sections. Toggle to require before finishing.</div>
              <div className={styles.sectionTable}>
                <div className={styles.sectionTableHeader}>
                  <span style={{ flex: 1 }}>SECTION</span>
                  <span className={styles.sectionTableCol}>MANDATORY</span>
                </div>
                {sectionOrder.map((k, idx) => {
                  const sec = INFERPAD_SECTIONS.find(s => s.key === k);
                  if (!sec) return null;
                  return (
                    <div key={k} draggable
                      className={`${styles.sectionRow} ${dragOverIdx === idx ? styles.sectionRowOver : ''}`}
                      onDragStart={() => onDragStart(idx)}
                      onDragEnter={() => onDragEnter(idx)}
                      onDragLeave={onDragLeave}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => onDrop(idx)}
                      onDragEnd={() => { dragCounter.current = 0; setDragOverIdx(null); }}
                    >
                      <span className={styles.sectionHandle}><GripVertical size={14} /></span>
                      <span className={styles.sectionIcon}>{sec.icon}</span>
                      <span className={styles.sectionLabel}>{sec.label}</span>
                      <span className={styles.sectionPos}>{idx + 1}</span>
                      <div className={styles.sectionTableCol}>
                        <label className={styles.toggle}>
                          <input type="checkbox" checked={mandatoryFields.includes(k)} onChange={() => toggleMandatory(k)} />
                          <span className={styles.toggleSlider} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Features ── */}
          {activeTab === 'Features' && (
            <div className={styles.section} style={{ gap: 0 }}>
              <ToggleRow label="Vaccination Chart" hint="Show a Vaccines tab in Write Rx with IAP schedule." checked={vaccChart} onChange={e => { setVaccChart(e.target.checked); toggle('vaccination_chart', e.target.checked); }} />
              <ToggleRow label="Diet Chart" hint="Show a Diet Chart tab to create and assign diet plans." checked={dietChart} onChange={e => { setDietChart(e.target.checked); toggle('diet_chart', e.target.checked); }} />
              <ToggleRow label="Growth Chart [WHO/IAP]" hint="Show growth chart strip for patients under 15 years." checked={growthChart} onChange={e => { setGrowthChart(e.target.checked); toggle('growth_chart', e.target.checked); }} />
              <ToggleRow label="ICD-10 Codes" hint="Display ICD-10 codes on symptom and diagnosis chips." checked={icd10Display} onChange={e => { setIcd10Display(e.target.checked); toggle('icd10_display', e.target.checked); }} />
              <ToggleRow label="Print ICD-10 codes on Rx" hint="Include ICD-10 codes when printing the prescription." checked={icd10Print} disabled={!icd10Display} indent onChange={e => { setIcd10Print(e.target.checked); toggle('icd10_print', e.target.checked); }} />
              <ToggleRow label="Finish with Preview" hint="Show prescription preview before saving to avoid blank Rx." checked={finishPrev} onChange={e => { setFinishPrev(e.target.checked); toggle('finish_preview', e.target.checked); }} />
            </div>
          )}

          {/* ── Appearance ── */}
          {activeTab === 'Appearance' && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PenLine size={14} /> Doctor Signature
                </div>
                <div className={styles.sectionHint}>Appears at bottom-right of every prescription.</div>
                <SignaturePad current={signatureImg} doctorName={user?.name || ''} onSave={handleSaveSig} onClear={() => { localStorage.removeItem(sigK()); setSignatureImg(''); }} />
                {sigMsg && <span className={styles.savedMsg}><Check size={12} /> {sigMsg}</span>}
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Prescription Header</div>
                <div className={styles.sectionHint}>Clinic letterhead — recommended 680 × 150 px</div>
                <ImageUpload title="" hint="" value={headerImg} onChange={setHeaderImg} />
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Prescription Footer</div>
                <div className={styles.sectionHint}>Stamp or contact info — recommended 680 × 100 px</div>
                <ImageUpload title="" hint="" value={footerImg} onChange={setFooterImg} />
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Google Review Link</div>
                <div className={styles.sectionHint}>Shared after each visit via the "Send Google Review" button.</div>
                <input type="url" className={styles.textInput} placeholder="https://g.page/r/XXXXXXXX/review"
                  value={googleLink} onChange={e => setGoogleLink(e.target.value)} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                {saved && <span className={styles.savedMsg}><Check size={12} /> Saved</span>}
                <button className={styles.btnSave} onClick={handleSaveAppearance}>
                  <Check size={13} /> Save Changes
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
