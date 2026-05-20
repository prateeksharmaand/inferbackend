import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BookAppointmentModal from './BookAppointmentModal';
import styles from './TopBar.module.css';

const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export default function TopBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAdd,   setShowAdd]   = useState(false);
  const [showBook,  setShowBook]  = useState(false);
  const [addMode,   setAddMode]   = useState('');
  const [prefill,   setPrefill]   = useState({});
  const [query,     setQuery]     = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const ADD_OPTIONS = [
    { key: 'checkin', label: 'Add Patient & Check-In' },
    { key: 'book',    label: 'Book Appointment' },
    { key: 'receipt', label: 'Create Receipt' },
    { key: 'rx',      label: 'Write Rx' },
    { key: 'tele',    label: 'Tele Consultation' },
  ];

  const handleOption = (key) => {
    setShowAdd(false);
    if (key === 'book' || key === 'checkin') { setAddMode(key); setPrefill({}); setShowBook(true); }
    else if (key === 'rx') navigate('/rx/new');
  };

  const openWithName = (name, via) => {
    setQuery('');
    setSearchOpen(false);
    setAddMode('book');
    setPrefill({ patient_name: name, channel: via === 'abha' ? 'abha' : 'walk_in' });
    setShowBook(true);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const trimmed = query.trim();
  const showSuggestions = searchOpen && trimmed.length > 0;

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

          {/* Search */}
          <div ref={searchRef} className={`${styles.searchWrap} ${searchOpen ? styles.searchWrapOpen : ''}`}>
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                className={styles.searchInput}
                placeholder="Search / Add Patient by Name, Number, UHID, ABHA ID, or Aadhar"
                value={query}
                onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
              />
              {query && (
                <button className={styles.clearBtn} onClick={() => { setQuery(''); setSearchOpen(false); }}>✕</button>
              )}
              {!query && <span className={styles.kbd}>⌘K</span>}
            </div>

            {showSuggestions && (
              <ul className={styles.suggestions}>
                <li
                  className={styles.suggestion}
                  onClick={() => openWithName(trimmed, 'manual')}
                >
                  <span className={styles.suggIcon}>👤</span>
                  <div className={styles.suggText}>
                    <span className={styles.suggMain}>Add New Patient</span>
                    <span className={styles.suggSub}>"{trimmed}"</span>
                  </div>
                  <span className={styles.suggBadge}>Manual</span>
                </li>
                <li
                  className={styles.suggestion}
                  onClick={() => openWithName(trimmed, 'abha')}
                >
                  <span className={styles.suggIcon}>🔗</span>
                  <div className={styles.suggText}>
                    <span className={styles.suggMain}>Add New Patient</span>
                    <span className={styles.suggSub}>"{trimmed}"</span>
                  </div>
                  <span className={`${styles.suggBadge} ${styles.suggBadgeAbha}`}>via ABHA</span>
                </li>
              </ul>
            )}
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
          prefill={prefill}
          onClose={() => { setShowBook(false); setPrefill({}); }}
        />
      )}
    </>
  );
}
