import { useState, useEffect } from 'react';
import { Trash2, QrCode, X, Download, Printer, Plus, Check, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import styles from './Patients.module.css';

// ── Add Patient via ABHA Modal ────────────────────────────────────────────────
function AddPatientAbhaModal({ onClose, onSuccess }) {
  const [step, setStep]       = useState('abha'); // abha | otp | done
  const [abhaId, setAbhaId]   = useState('');
  const [otp, setOtp]         = useState('');
  const [txnId, setTxnId]     = useState('');
  const [loading, setLoading] = useState(false);
  const [newPatient, setNewPatient] = useState(null);

  const requestOtp = async () => {
    if (!abhaId.trim()) return toast.error('Enter ABHA number or address');
    setLoading(true);
    try {
      const res = await api.post('/abha/request-otp', { abhaId: abhaId.trim() });
      setTxnId(res.txnId || res.transactionId || '');
      setStep('otp');
      toast.success('OTP sent to patient\'s mobile');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return toast.error('Enter OTP');
    setLoading(true);
    try {
      const res = await api.post('/abha/verify-create', { otp, txnId });
      setNewPatient(res);
      setStep('done');
      toast.success('Patient added successfully!');
      onSuccess?.();
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const btn = { width: '100%', padding: '11px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: loading ? 0.6 : 1, disabled: loading };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px', width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
          <X size={20} />
        </button>

        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Add Patient via ABHA</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>Create a new patient record using their ABHA</p>

        {step === 'abha' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input style={inp} placeholder="ABHA number (e.g. 91-2345-6789-0123)" value={abhaId} onChange={e => setAbhaId(e.target.value)} />
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Or enter ABHA address (e.g. username@abdm)</p>
            <button style={btn} onClick={requestOtp} disabled={loading}>{loading ? 'Sending OTP…' : 'Send OTP'}</button>
          </div>
        )}

        {step === 'otp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#eff6ff', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={14} />
              OTP sent to ABHA-registered mobile
            </div>
            <input style={inp} placeholder="6-digit OTP" value={otp} onChange={e => setOtp(e.target.value.slice(0, 6))} maxLength={6} />
            <button style={btn} onClick={verifyOtp} disabled={loading}>{loading ? 'Verifying…' : 'Verify & Create Patient'}</button>
          </div>
        )}

        {step === 'done' && newPatient && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: 48, height: 48, background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <Check size={24} color="#16a34a" strokeWidth={3} />
            </div>
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#16a34a' }}>Patient Added!</p>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{newPatient.patient?.name || 'New patient'} has been created</p>
            </div>
            <button style={{ ...btn, background: '#7c3aed' }} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Facility QR Modal ─────────────────────────────────────────────────────────
// Patients scan this QR with ABDM PHR app → profile is shared to HIP
function FacilityQrModal({ onClose }) {
  const hipId = import.meta.env.VITE_ABDM_HIP_ID || 'infer-hip';

  // ABDM deep-link for patient profile sharing (SHARE_PATIENT_PROFILE_701)
  const qrValue = `https://phrsbx.abdm.gov.in/share/profile?hip-id=${encodeURIComponent(hipId)}&counter=1`;

  const handlePrint = () => window.print();

  const handleDownload = () => {
    const svg = document.getElementById('facility-qr-svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `abdm-facility-qr-${hipId}.svg`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, width: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center', position: 'relative',
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: 6 }}>
          <QrCode size={22} style={{ color: '#7c3aed', marginBottom: 6 }} />
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1e293b' }}>Facility QR Code</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            Patient scans this with ABDM PHR app to share their profile
          </p>
        </div>

        {/* HIP ID badge */}
        <div style={{
          display: 'inline-block', background: '#f0f9ff', border: '1px solid #bae6fd',
          borderRadius: 8, padding: '3px 12px', fontSize: 11, color: '#0284c7',
          fontWeight: 600, marginBottom: 20,
        }}>
          HIP ID: {hipId}
        </div>

        {/* QR Code */}
        <div style={{
          background: '#fff', border: '2px solid #e2e8f0', borderRadius: 12,
          padding: 16, display: 'inline-block', marginBottom: 20,
        }}>
          <QRCodeSVG
            id="facility-qr-svg"
            value={qrValue}
            size={220}
            level="H"
            includeMargin={false}
            imageSettings={{
              src: '/vite.svg',
              x: undefined, y: undefined,
              height: 32, width: 32,
              excavate: true,
            }}
          />
        </div>

        {/* Instructions */}
        <div style={{
          background: '#faf5ff', border: '1px solid #e9d5ff',
          borderRadius: 8, padding: '10px 14px', marginBottom: 20, textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontSize: 11, color: '#6d28d9', lineHeight: 1.7 }}>
            <strong>How to use:</strong><br />
            1. Display this QR at your reception desk<br />
            2. Patient opens ABDM PHR app → Scan QR<br />
            3. Patient's profile appears in <strong>Pending OTPs</strong>
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleDownload}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #7c3aed',
              background: '#fff', color: '#7c3aed', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Download size={14} /> Download SVG
          </button>
          <button
            onClick={handlePrint}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
              background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Patients Page ────────────────────────────────────────────────────────
export default function Patients() {
  const [patients,     setPatients]     = useState([]);
  const [search,       setSearch]       = useState('');
  const [deleting,     setDeleting]     = useState(null);
  const [showFacQr,    setShowFacQr]    = useState(false);
  const [showAddAbha,  setShowAddAbha]  = useState(false);
  const navigate = useNavigate();

  const load = () => api.get('/patients').then(setPatients).catch(() => {});
  useEffect(() => { load(); }, []);

  const filtered = patients.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.mobile || '').includes(search) ||
    (p.abha_number || '').includes(search)
  );

  const handleDeletePatient = async (p) => {
    if (!window.confirm(`Delete patient "${p.name}"?\n\nThis will also remove their registered record. Appointment history (visits) will be preserved.`)) return;
    setDeleting(p.id);
    try {
      await api.delete(`/patients/${p.id}`);
      setPatients(prev => prev.filter(x => x.id !== p.id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Patients</h2>
        <div style={{ display: 'flex', gap: 10, flex: 1, maxWidth: 600 }}>
          <input className={styles.search} placeholder="Search by name, mobile or ABHA…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
          <button
            onClick={() => setShowAddAbha(true)}
            title="Add new patient via ABHA"
            style={{
              padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none',
              borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            <Plus size={16} /> Add via ABHA
          </button>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.thead}>
          <span>Name</span><span>Mobile</span><span>ABHA</span><span>Gender</span><span>Care Contexts</span><span>Action</span>
        </div>
        {filtered.map(p => (
          <div key={p.id} className={styles.row}>
            <span className={styles.name}>{p.name}</span>
            <span>{p.mobile || '—'}</span>
            <span>{p.abha_number || '—'}</span>
            <span>{p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : p.gender || '—'}</span>
            <span>{p.context_count ?? 0}</span>
            <span>
              <button
                onClick={() => handleDeletePatient(p)}
                disabled={deleting === p.id}
                title="Delete patient"
                style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, opacity: deleting === p.id ? 0.5 : 1 }}>
                <Trash2 size={13} /> {deleting === p.id ? 'Deleting…' : 'Delete'}
              </button>
            </span>
          </div>
        ))}
        {filtered.length === 0 && <p className={styles.empty}>No patients found</p>}
      </div>

      {/* Facility QR FAB — above ABHA QR */}
      <button
        className={styles.fab}
        onClick={() => setShowFacQr(true)}
        title="Show ABDM Facility QR for patient profile sharing"
        style={{ bottom: 104 }}
      >
        <QrCode size={22} />
        <span>Facility QR</span>
      </button>

      {/* ABHA QR scan FAB */}
      <button
        className={styles.fab}
        onClick={() => navigate('/abha-qr-scan')}
        title="Register patient via ABHA QR code"
      >
        <QrCode size={22} />
        <span>ABHA QR</span>
      </button>

      {/* Modals */}
      {showFacQr && <FacilityQrModal onClose={() => setShowFacQr(false)} />}
      {showAddAbha && <AddPatientAbhaModal onClose={() => setShowAddAbha(false)} onSuccess={() => { setShowAddAbha(false); load(); }} />}
    </div>
  );
}
