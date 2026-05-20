import { useState, useRef } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import styles from './ConfigureInferPadModal.module.css';

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
          <Upload size={24} strokeWidth={1.5} className={styles.uploadIcon} />
          <span className={styles.dropLabel}>Click to upload or drag &amp; drop</span>
          <span className={styles.dropHint}>{hint}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => readFile(e.target.files[0])} />
    </div>
  );
}

export default function ConfigureInferPadModal({ clinicId, onClose }) {
  const key   = (t) => `rx_${t}_${clinicId}`;
  const [headerImg, setHeaderImg] = useState(() => localStorage.getItem(key('header')) || '');
  const [footerImg, setFooterImg] = useState(() => localStorage.getItem(key('footer')) || '');

  const handleSave = () => {
    headerImg ? localStorage.setItem(key('header'), headerImg) : localStorage.removeItem(key('header'));
    footerImg ? localStorage.setItem(key('footer'), footerImg) : localStorage.removeItem(key('footer'));
    onClose(true);
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Configure your InferPad</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.body}>
          <ImageUploadSection
            title="Header Image"
            hint="Clinic letterhead top — recommended 680 × 150 px · PNG / JPG"
            value={headerImg}
            onChange={setHeaderImg}
          />
          <ImageUploadSection
            title="Footer Image"
            hint="Signature, stamp or contact info — recommended 680 × 100 px · PNG / JPG"
            value={footerImg}
            onChange={setFooterImg}
          />
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}
