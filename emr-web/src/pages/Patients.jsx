import { useState, useEffect } from 'react';
import { Trash2, User, Phone, ChevronRight, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import styles from './Patients.module.css';

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [search,   setSearch]   = useState('');
  const [deleting, setDeleting] = useState(null);
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
        <div className={styles.headerActions}>
          <input className={styles.search} placeholder="Search by name, mobile or ABHA…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <button
            className={styles.qrButton}
            onClick={() => navigate('/abha-qr-scan')}
            title="Register patient via ABHA QR code"
          >
            <QrCode size={18} /> ABHA QR
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
    </div>
  );
}
