// Queue → Print prescription. Renders the saved prescription with the same component as the
// InferPad preview and print (RxDocumentBody), so all of them show identical content.
import { useState, useEffect, useRef } from 'react';
import { X, Printer, QrCode, Settings2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { RxDocumentBody, formFromAppointment } from '../pages/WriteRx';
import { useRxExtras, useRxImages, QR_KEY, HIDE_PHONE_KEY, SHOW_VITALS_GRAPH, getRxPrintPrefs } from './RxExtras';
import styles from './RxPrintModal.module.css';

export default function RxPrintModal({ appt, onClose }) {
  const { user } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const initial = getRxPrintPrefs();
  const [qrEnabled,       setQrEnabled]       = useState(initial.qr);
  const [hidePhone,       setHidePhone]       = useState(initial.hidePhone);
  const [showVitalsGraph, setShowVitalsGraph] = useState(initial.vitalsGraph);
  const [showSettings,    setShowSettings]    = useState(false);
  const settingsRef = useRef(null);

  const rxImages = useRxImages(user);
  const extras   = useRxExtras(data, {
    encounterId: data?.encounter_id,
    prefs: { qr: qrEnabled, vitalsGraph: showVitalsGraph },
  });

  useEffect(() => {
    api.get(`/appointments/${appt.id}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [appt.id]);

  // Close settings panel on click outside
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettings(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  const toggle = (key, value, setter) => {
    setter(value);
    try { localStorage.setItem(key, String(value)); } catch {}
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Prescription — {appt.patient_name}</span>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div style={{ position:'relative' }} ref={settingsRef}>
              <button
                className={`${styles.qrToggleBtn} ${showSettings ? styles.qrToggleBtnOn : ''}`}
                onClick={() => setShowSettings(v => !v)}
                title="Print settings"
              >
                <Settings2 size={13} strokeWidth={2} />
                Settings
              </button>
              {showSettings && (
                <div className={styles.printSettingsPanel}>
                  <label className={styles.printSettingRow}>
                    <input type="checkbox" checked={qrEnabled} onChange={() => toggle(QR_KEY, !qrEnabled, setQrEnabled)} />
                    <QrCode size={12} strokeWidth={2} /> Add QR code
                  </label>
                  <label className={styles.printSettingRow}>
                    <input type="checkbox" checked={!hidePhone} onChange={() => toggle(HIDE_PHONE_KEY, !hidePhone, setHidePhone)} />
                    Show patient mobile
                  </label>
                  <label className={styles.printSettingRow}>
                    <input type="checkbox" checked={showVitalsGraph} onChange={() => toggle(SHOW_VITALS_GRAPH, !showVitalsGraph, setShowVitalsGraph)} />
                    Show vitals graph
                  </label>
                </div>
              )}
            </div>
            <button className={styles.printBtn} onClick={() => window.print()} disabled={loading || !data?.encounter_id}>
              <Printer size={13} strokeWidth={2} /> Print
            </button>
            <button className={styles.closeBtn} onClick={onClose}><X size={15} /></button>
          </div>
        </div>
        <div className={styles.body}>
          {loading && <div className={styles.empty}>Loading prescription…</div>}
          {!loading && !data?.encounter_id && <div className={styles.empty}>No prescription found for this appointment.</div>}
          {!loading && data?.encounter_id && (
            <div id="rx-print-modal-area">
              <RxDocumentBody
                form={formFromAppointment(data)}
                appt={data}
                user={user}
                rxImages={rxImages}
                {...extras}
                hidePhone={hidePhone}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
