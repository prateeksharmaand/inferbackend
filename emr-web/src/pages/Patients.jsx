import { useState, useEffect } from 'react';
import { api } from '../api/client';
import styles from './Patients.module.css';

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [search,   setSearch]   = useState('');

  useEffect(() => { api.get('/patients').then(setPatients).catch(() => {}); }, []);

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.mobile || '').includes(search)
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Patients</h2>
        <input className={styles.search} placeholder="Search by name or mobile…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className={styles.table}>
        <div className={styles.thead}>
          <span>Name</span><span>Mobile</span><span>ABHA</span><span>Gender</span><span>Care Contexts</span>
        </div>
        {filtered.map(p => (
          <div key={p.id} className={styles.row}>
            <span className={styles.name}>{p.name}</span>
            <span>{p.mobile || '—'}</span>
            <span>{p.abha_number || '—'}</span>
            <span>{p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : p.gender || '—'}</span>
            <span>{p.context_count ?? 0}</span>
          </div>
        ))}
        {filtered.length === 0 && <p className={styles.empty}>No patients found</p>}
      </div>
    </div>
  );
}
