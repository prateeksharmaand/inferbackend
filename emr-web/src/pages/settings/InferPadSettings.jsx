import { useState, useRef } from 'react';
import { Upload, Trash2, Check, PenLine } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import SignaturePad from '../../components/SignaturePad';
import styles from './InferPadSettings.module.css';

function ImageUploadSection({ title, hint, value, onChange }) {
  const inputRef = useRef(null);

  const readFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => onChange(e.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionHint}>{hint}</div>
      {value ? (
        <div className={styles.previewWrap}>
          <img src={value} alt={title} className={styles.previewImg} />
          <button className={styles.removeBtn} onClick={() => onChange('')}>
            <Trash2 size={13} strokeWidth={2} /> Remove
          </button>
        </div>
      ) : (
        <div
          className={styles.dropZone}
          onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); }}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={28} strokeWidth={1.5} className={styles.uploadIcon} />
          <span className={styles.dropLabel}>Click to upload or drag &amp; drop</span>
          <span className={styles.dropHintSub}>PNG / JPG</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => readFile(e.target.files[0])} />
    </div>
  );
}

// All fields that can be made mandatory
export const MANDATORY_FIELDS = [
  { key: 'symptoms',             label: 'Chief Complaints',      hint: 'At least one symptom must be added.' },
  { key: 'diagnosis',            label: 'Diagnosis',             hint: 'At least one diagnosis must be added.' },
  { key: 'medications',          label: 'Medications',           hint: 'At least one medication must be added.' },
  { key: 'vitals',               label: 'Vitals',                hint: 'At least one vital sign must be filled.' },
  { key: 'lab_investigations',   label: 'Lab Investigations',    hint: 'At least one lab test must be added.' },
  { key: 'examination_findings', label: 'Examination Findings',  hint: 'Examination findings must be filled.' },
  { key: 'medical_history',      label: 'Medical History',       hint: 'At least one medical history entry must be added.' },
  { key: 'notes',                label: 'Notes',                 hint: 'Notes/instructions must be filled.' },
  { key: 'advices',              label: 'Advices',               hint: 'Advice to patient must be filled.' },
];

export function getMandatoryFields(clinicId) {
  try {
    const stored = localStorage.getItem(`rx_mandatory_fields_${clinicId}`);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

export default function InferPadSettings() {
  const { user } = useAuth();
  const cid = user?.clinic_id || 'default';
  const uid = user?.id        || 'default';

  const clKey  = (t) => `rx_${t}_${cid}`;
  const sigKey = () => `rx_sig_${uid}_${cid}`;

  const [headerImg,    setHeaderImg]    = useState(() => localStorage.getItem(clKey('header'))            || '');
  const [footerImg,    setFooterImg]    = useState(() => localStorage.getItem(clKey('footer'))            || '');
  const [signatureImg, setSignatureImg] = useState(() => localStorage.getItem(sigKey())                   || '');
  const [vaccChart,    setVaccChart]    = useState(() => localStorage.getItem(clKey('vaccination_chart')) === 'true');
  const [dietChart,    setDietChart]    = useState(() => localStorage.getItem(clKey('diet_chart')) === 'true');
  const [mandatoryFields, setMandatoryFields] = useState(() => getMandatoryFields(cid));
  const [saved,  setSaved]  = useState(false);

  const handleFeatureToggle = (setting, value) => {
    value ? localStorage.setItem(clKey(setting), 'true') : localStorage.removeItem(clKey(setting));
    window.dispatchEvent(new Event('storage'));
  };

  const toggleMandatory = (key) => {
    const next = mandatoryFields.includes(key)
      ? mandatoryFields.filter(k => k !== key)
      : [...mandatoryFields, key];
    setMandatoryFields(next);
    localStorage.setItem(`rx_mandatory_fields_${cid}`, JSON.stringify(next));
    window.dispatchEvent(new Event('storage'));
  };
  const [sigMsg, setSigMsg] = useState('');

  const handleSave = () => {
    headerImg   ? localStorage.setItem(clKey('header'),             headerImg)   : localStorage.removeItem(clKey('header'));
    footerImg   ? localStorage.setItem(clKey('footer'),             footerImg)   : localStorage.removeItem(clKey('footer'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    window.dispatchEvent(new Event('storage')); // so Write Rx re-evaluates tabs
  };

  const handleSaveSignature = (dataUrl) => {
    localStorage.setItem(sigKey(), dataUrl);
    setSignatureImg(dataUrl);
    setSigMsg('Signature saved!');
    setTimeout(() => setSigMsg(''), 2500);
  };

  const handleClearSignature = () => {
    localStorage.removeItem(sigKey());
    setSignatureImg('');
  };

  return (
    <div className={styles.wrap}>

      {/* ── Features ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Features</h3>
        <p className={styles.cardSub}>Enable or disable optional modules in Write Rx.</p>

        <div className={styles.toggleRow}>
          <div>
            <div className={styles.toggleLabel}>Vaccination Chart</div>
            <div className={styles.toggleHint}>Show a Vaccines tab in Write Rx with IAP schedule and other vaccines.</div>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={vaccChart} onChange={e => {
              setVaccChart(e.target.checked);
              handleFeatureToggle('vaccination_chart', e.target.checked);
            }} />
            <span className={styles.toggleSlider} />
          </label>
        </div>

        <div className={styles.toggleRow}>
          <div>
            <div className={styles.toggleLabel}>Diet Chart</div>
            <div className={styles.toggleHint}>Show a Diet Chart tab in Write Rx to create and assign diet plans to patients.</div>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={dietChart} onChange={e => {
              setDietChart(e.target.checked);
              handleFeatureToggle('diet_chart', e.target.checked);
            }} />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>

      {/* ── Mandatory Fields ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Mandatory Fields</h3>
        <p className={styles.cardSub}>
          Fields marked as mandatory must be filled before finishing a prescription. If skipped, the doctor will be prompted with a warning.
        </p>
        <div className={styles.mandatoryTable}>
          <div className={styles.mandatoryHeader}>
            <span>Field</span>
            <span>Mandatory</span>
          </div>
          {MANDATORY_FIELDS.map(f => (
            <div key={f.key} className={styles.mandatoryRow}>
              <div>
                <div className={styles.toggleLabel}>{f.label}</div>
                <div className={styles.toggleHint}>{f.hint}</div>
              </div>
              <label className={styles.toggle}>
                <input type="checkbox"
                  checked={mandatoryFields.includes(f.key)}
                  onChange={() => toggleMandatory(f.key)} />
                <span className={styles.toggleSlider} />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* ── Signature ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          <PenLine size={16} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Doctor Signature
        </h3>
        <p className={styles.cardSub}>
          Your signature appears at the bottom-right of every prescription you generate.
          Draw it, upload an image, or type your name in a signature style.
        </p>

        <SignaturePad
          current={signatureImg}
          doctorName={user?.name || ''}
          onSave={handleSaveSignature}
          onClear={handleClearSignature}
        />

        {sigMsg && (
          <span className={styles.savedMsg} style={{ marginTop: 8 }}>
            <Check size={13} /> {sigMsg}
          </span>
        )}
      </div>

      {/* ── Header / Footer ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Prescription Header &amp; Footer</h3>
        <p className={styles.cardSub}>
          These images appear at the top and bottom of every prescription and receipt printed from InferPad.
        </p>

        <div className={styles.uploadGrid}>
          <ImageUploadSection
            title="Header Image"
            hint="Clinic letterhead top — recommended 680 × 150 px"
            value={headerImg}
            onChange={setHeaderImg}
          />
          <ImageUploadSection
            title="Footer Image"
            hint="Stamp or contact info — recommended 680 × 100 px"
            value={footerImg}
            onChange={setFooterImg}
          />
        </div>

        <div className={styles.actions}>
          {saved && <span className={styles.savedMsg}><Check size={13} /> Saved</span>}
          <button className={styles.btnSave} onClick={handleSave}>
            <Check size={14} /> Save Changes
          </button>
        </div>
      </div>

    </div>
  );
}
