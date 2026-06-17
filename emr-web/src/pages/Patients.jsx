import { useState, useEffect } from 'react';
import { Trash2, QrCode, X, Download, Printer, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import styles from './Patients.module.css';

// ── Facility QR Modal ─────────────────────────────────────────────────────────
// Patients scan this QR with ABDM PHR app → profile is shared to HIP
function FacilityQrModal({ onClose }) {
  const hipId = import.meta.env.VITE_ABDM_HIP_ID || 'noushealthhip';

  // ABDM deep-link for patient profile sharing (SHARE_PATIENT_PROFILE_701)
  const qrValue = `https://phrsbx.abdm.gov.in/share-profile?hip-id=noushealthhip&counter-id=12345`;

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
            onClick={() => navigate('/add-patient-abha')}
            style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <Plus size={15} /> Add Patient via ABHA
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
    </div>
  );
}
