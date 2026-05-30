import { useState } from 'react';
import { X } from 'lucide-react';
import styles from './ConfigureInferPadModal.module.css';

export default function ConfigureInferPadModal({ clinicId, onClose }) {
  const key = (t) => `rx_${t}_${clinicId}`;
  const [googleReviewLink, setGoogleReviewLink] = useState(() => localStorage.getItem(key('google_review')) || '');
  const [vaccChart, setVaccChart] = useState(() => localStorage.getItem(key('vaccination_chart')) === 'true');

  const handleSave = () => {
    googleReviewLink
      ? localStorage.setItem(key('google_review'), googleReviewLink)
      : localStorage.removeItem(key('google_review'));
    vaccChart
      ? localStorage.setItem(key('vaccination_chart'), 'true')
      : localStorage.removeItem(key('vaccination_chart'));
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
          <div className={styles.section}>
            <div className={styles.toggleRow}>
              <div>
                <div className={styles.sectionTitle}>Vaccination Chart</div>
                <div className={styles.sectionHint}>Show a Vaccines tab in Write Rx with IAP schedule and other vaccines.</div>
              </div>
              <label className={styles.toggle}>
                <input type="checkbox" checked={vaccChart} onChange={e => setVaccChart(e.target.checked)} />
                <span className={styles.toggleSlider} />
              </label>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Google Review Link</div>
            <div className={styles.sectionHint}>
              Shared with patients after each visit via the "Send Google Review" button.
              Copy your link from Google Business Profile → Get more reviews.
            </div>
            <input
              type="url"
              className={styles.textInput}
              placeholder="https://g.page/r/XXXXXXXX/review"
              value={googleReviewLink}
              onChange={e => setGoogleReviewLink(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}
