import { useState, useRef } from 'react';
import { Upload, Trash2, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
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

export default function InferPadSettings() {
  const { user } = useAuth();
  const cid = user?.clinic_id || 'default';
  const key = (t) => `rx_${t}_${cid}`;

  const [headerImg, setHeaderImg] = useState(() => localStorage.getItem(key('header')) || '');
  const [footerImg, setFooterImg] = useState(() => localStorage.getItem(key('footer')) || '');
  const [saved,     setSaved]     = useState(false);

  const handleSave = () => {
    headerImg ? localStorage.setItem(key('header'), headerImg) : localStorage.removeItem(key('header'));
    footerImg ? localStorage.setItem(key('footer'), footerImg) : localStorage.removeItem(key('footer'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={styles.wrap}>
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
            hint="Signature, stamp or contact info — recommended 680 × 100 px"
            value={footerImg}
            onChange={setFooterImg}
          />
        </div>

        <div className={styles.actions}>
          {saved && (
            <span className={styles.savedMsg}><Check size={13} /> Saved</span>
          )}
          <button className={styles.btnSave} onClick={handleSave}>
            <Check size={14} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
