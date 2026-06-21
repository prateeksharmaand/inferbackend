import { useState, useRef, useEffect } from 'react';
import { X, GripVertical, Upload, Trash2, Check, PenLine, Scissors, BookOpen, ChevronRight } from 'lucide-react';
import LetterheadCropper from './LetterheadCropper';
import TemplateSelector, { getDisabledSectionsForSpecialty } from './TemplateSelector';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import SignaturePad from './SignaturePad';
import {
  INFERPAD_SECTIONS, MANDATORY_FIELDS,
  getSectionOrder, saveSectionOrder,
  getMandatoryFields, getICD10Settings,
  getDisabledSections, saveDisabledSections,
  getPrintSections, savePrintSections,
} from '../pages/settings/InferPadSettings';
import styles from './ConfigureInferPadModal.module.css';

const TABS = ['Template', 'Pad Order', 'Features', 'Appearance'];

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

  const [activeTab, setActiveTab] = useState('Template');

  // ── Active template state ──
  const [activeTemplate,   setActiveTemplate]   = useState(null);
  const [showTplSelector,  setShowTplSelector]  = useState(false);
  const [tplLoading,       setTplLoading]       = useState(true);

  useEffect(() => {
    if (user?.role !== 'doctor') { setTplLoading(false); return; }
    api.get('/scribe/active-template')
      .then(d => setActiveTemplate(d.template || null))
      .catch(() => {})
      .finally(() => setTplLoading(false));
  }, []);

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
  const [sectionOrder,     setSectionOrder]    = useState(() => getSectionOrder(cid));
  const [mandatoryFields,  setMandatoryFields] = useState(() => getMandatoryFields(cid));
  const [disabledSections, setDisabledSections] = useState(() => getDisabledSections(cid));
  const [printSections,    setPrintSections]   = useState(() => getPrintSections(cid));
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

  const toggleEnabled = k => {
    const next = disabledSections.includes(k)
      ? disabledSections.filter(f => f !== k)
      : [...disabledSections, k];
    setDisabledSections(next);
    saveDisabledSections(cid, next);
  };

  const togglePrint = k => {
    const next = printSections.includes(k)
      ? printSections.filter(f => f !== k)
      : [...printSections, k];
    setPrintSections(next);
    savePrintSections(cid, next);
  };

  // ── Appearance state ──
  const [headerImg,    setHeaderImg]    = useState(() => localStorage.getItem(key('header'))  || '');
  const [footerImg,    setFooterImg]    = useState(() => localStorage.getItem(key('footer'))  || '');
  const [signatureImg, setSignatureImg] = useState(() => localStorage.getItem(sigK())         || '');
  const [googleLink,   setGoogleLink]   = useState(() => localStorage.getItem(key('google_review')) || '');
  const [saved,        setSaved]        = useState(false);
  const [sigMsg,       setSigMsg]       = useState('');
  const [showCropper,  setShowCropper]  = useState(false);

  const handleSaveAppearance = async () => {
    headerImg ? localStorage.setItem(key('header'), headerImg)          : localStorage.removeItem(key('header'));
    footerImg ? localStorage.setItem(key('footer'), footerImg)          : localStorage.removeItem(key('footer'));
    googleLink ? localStorage.setItem(key('google_review'), googleLink) : localStorage.removeItem(key('google_review'));
    // Persist images to DB so backend can use them for PDF/email
    api.patch('/settings/clinic-assets', {
      rx_header_img: headerImg  || null,
      rx_footer_img: footerImg  || null,
    }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    window.dispatchEvent(new Event('storage'));
  };
  const handleSaveSig = url => {
    localStorage.setItem(sigK(), url);
    setSignatureImg(url);
    // Persist signature to DB
    api.patch('/settings/clinic-assets', { rx_signature: url }).catch(() => {});
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

          {/* ── Template ── */}
          {activeTab === 'Template' && (
            <div className={styles.section}>
              <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={14} /> Consultation Template
              </div>
              <div className={styles.sectionHint}>
                Set a specialty template to auto-configure InferPad sections and guide the AI scribe.
              </div>

              {user?.role !== 'doctor' ? (
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                  Template selection is available for doctors only.
                </div>
              ) : tplLoading ? (
                <div style={{ padding: '16px', fontSize: 13, color: '#9ca3af' }}>Loading…</div>
              ) : (
                <>
                  {/* Current template card */}
                  <div style={{ border: '1.5px solid', borderColor: activeTemplate ? '#7c3aed' : '#e5e7eb', borderRadius: 12, padding: 16, background: activeTemplate ? '#faf5ff' : '#f8fafc', marginBottom: 12 }}>
                    {activeTemplate ? (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <BookOpen size={16} style={{ color: '#7c3aed' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{activeTemplate.name}</div>
                          {activeTemplate.specialty && (
                            <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>{activeTemplate.specialty}</div>
                          )}
                          {activeTemplate.description && (
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.4 }}>{activeTemplate.description}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BookOpen size={20} style={{ color: '#9ca3af' }} />
                        <div style={{ fontSize: 13, color: '#6b7280' }}>No active template — using default InferPad configuration.</div>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setShowTplSelector(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <BookOpen size={13} /> {activeTemplate ? 'Change Template' : 'Browse Templates'} <ChevronRight size={13} />
                    </button>

                    {activeTemplate && getDisabledSectionsForSpecialty(activeTemplate.specialty).length > 0 && (
                      <button
                        onClick={() => {
                          const toDisable = getDisabledSectionsForSpecialty(activeTemplate.specialty);
                          setDisabledSections(toDisable);
                          saveDisabledSections(cid, toDisable);
                          window.dispatchEvent(new Event('storage'));
                          // Switch to Pad Order tab so doctor can see the result
                          setActiveTab('Pad Order');
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #bbf7d0', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        <Check size={13} /> Apply Sections to Pad
                      </button>
                    )}
                  </div>

                  {activeTemplate?.specialty && (
                    <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af' }}>
                      "Apply Sections to Pad" will enable sections relevant to <strong>{activeTemplate.specialty}</strong> and hide unrelated ones. You can still adjust manually in the Pad Order tab.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Pad Order ── */}
          {activeTab === 'Pad Order' && (
            <div className={styles.section}>
              <div className={styles.sectionHint}>Drag to reorder · Enable/Disable sections · Toggle Copy to Pad to include in print</div>
              <div className={styles.sectionTable}>
                <div className={styles.sectionTableHeader}>
                  <span style={{ flex: 1 }}>SECTION</span>
                  <span className={styles.sectionTableCol} style={{ minWidth: 64, textAlign: 'center' }}>ENABLE</span>
                  <span className={styles.sectionTableCol} style={{ minWidth: 90, textAlign: 'center' }}>COPY TO PAD</span>
                  <span className={styles.sectionTableCol} style={{ minWidth: 80, textAlign: 'center' }}>MANDATORY</span>
                </div>
                {sectionOrder.map((k, idx) => {
                  const sec = INFERPAD_SECTIONS.find(s => s.key === k);
                  if (!sec) return null;
                  const enabled = !disabledSections.includes(k);
                  const inPrint = printSections.includes(k);
                  return (
                    <div key={k} draggable
                      className={`${styles.sectionRow} ${dragOverIdx === idx ? styles.sectionRowOver : ''}`}
                      style={{ opacity: enabled ? 1 : 0.45 }}
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
                      {/* Enable toggle */}
                      <div className={styles.sectionTableCol} style={{ minWidth: 64, justifyContent: 'center' }}>
                        <label className={styles.toggle} title={enabled ? 'Disable section' : 'Enable section'}>
                          <input type="checkbox" checked={enabled} onChange={() => toggleEnabled(k)} />
                          <span className={styles.toggleSlider} style={{ background: enabled ? '#22c55e' : undefined }} />
                        </label>
                      </div>
                      {/* Copy to Pad toggle */}
                      <div className={styles.sectionTableCol} style={{ minWidth: 90, justifyContent: 'center' }}>
                        <label className={styles.toggle} title={inPrint ? 'Remove from print' : 'Include in print'}>
                          <input type="checkbox" checked={inPrint} disabled={!enabled} onChange={() => togglePrint(k)} />
                          <span className={styles.toggleSlider} style={{ background: inPrint && enabled ? '#6366f1' : undefined }} />
                        </label>
                      </div>
                      {/* Mandatory toggle */}
                      <div className={styles.sectionTableCol} style={{ minWidth: 80, justifyContent: 'center' }}>
                        <label className={styles.toggle}>
                          <input type="checkbox" checked={mandatoryFields.includes(k)} disabled={!enabled} onChange={() => toggleMandatory(k)} />
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

              {/* Letterhead crop shortcut */}
              <div className={styles.section} style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '12px 14px', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Scissors size={15} style={{ color: '#7c3aed', flexShrink: 0 }} />
                  <div>
                    <div className={styles.sectionTitle} style={{ margin: 0 }}>Crop from Letterhead</div>
                    <div className={styles.sectionHint} style={{ margin: 0 }}>Upload your full letterhead and drag bands to extract header &amp; footer in one step.</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowCropper(true)}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
                >
                  <Scissors size={12} /> Open Letterhead Cropper
                </button>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Prescription Header</div>
                <div className={styles.sectionHint}>Clinic letterhead top — recommended 680 × 150 px</div>
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

      {showTplSelector && (
        <TemplateSelector
          currentTemplate={activeTemplate}
          onClose={() => setShowTplSelector(false)}
          onApply={(tpl) => {
            setActiveTemplate(tpl);
            // Persist to localStorage so WriteRx chip can read it
            const lsKey = `rx_active_tpl_${uid}`;
            tpl ? localStorage.setItem(lsKey, JSON.stringify(tpl)) : localStorage.removeItem(lsKey);
            // Auto-apply section visibility when template has a specialty mapping
            if (tpl?.specialty) {
              const toDisable = getDisabledSectionsForSpecialty(tpl.specialty);
              if (toDisable.length > 0) {
                setDisabledSections(toDisable);
                saveDisabledSections(cid, toDisable);
                window.dispatchEvent(new Event('storage'));
              }
            }
          }}
        />
      )}

      {showCropper && (
        <LetterheadCropper
          onClose={() => setShowCropper(false)}
          onApply={({ header, footer }) => {
            setHeaderImg(header);
            setFooterImg(footer);
            setShowCropper(false);
            // Auto-save
            localStorage.setItem(key('header'), header);
            localStorage.setItem(key('footer'), footer);
            api.patch('/settings/clinic-assets', {
              rx_header_img: header || null,
              rx_footer_img: footer || null,
            }).catch(() => {});
            window.dispatchEvent(new Event('storage'));
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          }}
        />
      )}
    </div>
  );
}
