import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BookAppointmentModal from './BookAppointmentModal';
import styles from './TopBar.module.css';

const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export default function TopBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAdd,  setShowAdd]  = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [addMode,  setAddMode]  = useState('');

  const ADD_OPTIONS = [
    { key: 'checkin', label: 'Add Patient & Check-In' },
    { key: 'book',    label: 'Book Appointment' },
    { key: 'receipt', label: 'Create Receipt' },
    { key: 'rx',      label: 'Write Rx' },
    { key: 'tele',    label: 'Tele Consultation' },
  ];

  const handleOption = (key) => {
    setShowAdd(false);
    if (key === 'book' || key === 'checkin') { setAddMode(key); setShowBook(true); }
    else if (key === 'rx') navigate('/rx/new');
  };

  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.left}>
          <h1 className={styles.title}>Queue</h1>
          <div className={styles.datePill}>
            <button className={styles.arrow}>‹</button>
            <span className={styles.dateText}>Tdy, {today()}</span>
            <button className={styles.arrow}>›</button>
          </div>
          <div className={styles.clinicPill}>
            <span className={styles.clinicIcon}>🏥</span>
            <span>{user?.clinic_name ?? 'Clinic'}</span>
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.addWrap}>
            <button className={styles.addBtn} onClick={() => setShowAdd(v => !v)}>
              Add New <span className={styles.plus}>+</span>
            </button>
            {showAdd && (
              <ul className={styles.dropdown}>
                {ADD_OPTIONS.map(o => (
                  <li key={o.key} onClick={() => handleOption(o.key)}>{o.label}</li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.search}>
            <span>🔍</span>
            <input placeholder="Search" />
            <span className={styles.kbd}>⌘+K</span>
          </div>

          <div className={styles.userChip}>
            <span className={styles.userAvatar}>{user?.name?.[0] ?? 'D'}</span>
            <span>Dr {user?.name?.split(' ')[0] ?? ''}</span>
            <span className={styles.badge}>Premium</span>
          </div>
        </div>
      </header>

      {showBook && (
        <BookAppointmentModal
          mode={addMode}
          onClose={() => setShowBook(false)}
        />
      )}
    </>
  );
}
