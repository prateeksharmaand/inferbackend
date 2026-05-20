import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueueDate } from '../context/QueueDateContext';
import { api } from '../api/client';
import { Search, X, ChevronLeft, ChevronRight, Building2, Plus } from 'lucide-react';
import BookAppointmentModal from './BookAppointmentModal';
import BookSlotModal from './BookSlotModal';
import styles from './TopBar.module.css';

function formatDateLabel(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const base = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (d.toDateString() === today.toDateString())     return `Tdy, ${base}`;
  if (d.toDateString() === tomorrow.toDateString())  return `Tmrw, ${base}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yest, ${base}`;
  return base;
}

function getAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
}

export default function TopBar() {
  const { user } = useAuth();
  const { queueDate, prevDay, nextDay } = useQueueDate();
  const navigate = useNavigate();
  const [showAdd,     setShowAdd]     = useState(false);
  const [showBook,    setShowBook]    = useState(false);
  const [addMode,     setAddMode]     = useState('');
  const [prefill,     setPrefill]     = useState({});
  const [checkinMode, setCheckinMode] = useState(false);
  const [query,       setQuery]       = useState('');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [patients,    setPatients]    = useState([]);
  const [searching,   setSearching]   = useState(false);
  const searchRef    = useRef(null);
  const searchInput  = useRef(null);
  const debounceRef  = useRef(null);

  const ADD_OPTIONS = [
    { key: 'checkin', label: 'Add Patient & Check-In' },
    { key: 'book',    label: 'Book Appointment' },
    { key: 'receipt', label: 'Create Receipt' },
    { key: 'rx',      label: 'Write Rx' },
    { key: 'tele',    label: 'Tele Consultation' },
  ];

  const handleOption = (key) => {
    setShowAdd(false);
    if (key === 'checkin') {
      setCheckinMode(true);
      setSearchOpen(true);
      setTimeout(() => searchInput.current?.focus(), 50);
    } else if (key === 'book') {
      setCheckinMode(false);
      setAddMode('book');
      setPrefill({});
      setShowBook(true);
    } else if (key === 'rx') {
      navigate('/rx/new');
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchOpen(false);
    setPatients([]);
    setCheckinMode(false);
  };

  const openWithPatient = (p) => {
    const isCheckin = checkinMode;
    clearSearch();
    const pf = {
      patient_name:   p.name,
      patient_mobile: p.mobile        || '',
      patient_abha:   p.abha_number   || '',
      channel: 'walk_in',
    };
    setAddMode(isCheckin ? 'checkin' : 'book');
    setPrefill(pf);
    setShowBook(true);
  };

  const openWithName = (name, via) => {
    const isCheckin = checkinMode;
    clearSearch();
    setAddMode(isCheckin ? 'checkin' : 'book');
    setPrefill({ patient_name: name, channel: via === 'abha' ? 'abha' : 'walk_in' });
    setShowBook(true);
  };

  // Debounced patient search
  const doSearch = useCallback((q) => {
    if (q.trim().length < 2) { setPatients([]); setSearching(false); return; }
    setSearching(true);
    api.get(`/patients?q=${encodeURIComponent(q.trim())}`)
      .then(rows => setPatients(rows || []))
      .catch(() => setPatients([]))
      .finally(() => setSearching(false));
  }, []);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSearchOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
        setCheckinMode(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const trimmed      = query.trim();
  const showDropdown = searchOpen && (checkinMode || trimmed.length > 0);

  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.left}>
          <h1 className={styles.title}>Queue</h1>
          <div className={styles.datePill}>
            <button className={styles.arrow} onClick={prevDay}><ChevronLeft size={14} /></button>
            <span className={styles.dateText}>{formatDateLabel(queueDate)}</span>
            <button className={styles.arrow} onClick={nextDay}><ChevronRight size={14} /></button>
          </div>
          <div className={styles.clinicPill}>
            <Building2 size={14} strokeWidth={1.8} />
            <span>{user?.clinic_name ?? 'Clinic'}</span>
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.addWrap}>
            <button className={styles.addBtn} onClick={() => setShowAdd(v => !v)}>
              Add New <Plus size={16} strokeWidth={2.5} />
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
            <div className={`${styles.searchBox} ${checkinMode ? styles.searchBoxCheckin : ''}`}>
              {checkinMode
                ? <span className={styles.checkinTag}>Check-In</span>
                : <Search size={14} className={styles.searchIcon} strokeWidth={2} />
              }
              <input
                ref={searchInput}
                className={styles.searchInput}
                placeholder={checkinMode
                  ? 'Search patient to check in, or type a new name…'
                  : 'Search / Add Patient by Name, Number, UHID, ABHA ID, or Aadhar'}
                value={query}
                onChange={handleQueryChange}
                onFocus={() => setSearchOpen(true)}
              />
              {(query || checkinMode) ? (
                <button className={styles.clearBtn} onClick={clearSearch}><X size={13} /></button>
              ) : (
                <span className={styles.kbd}>⌘K</span>
              )}
            </div>

            {showDropdown && (
              <ul className={styles.suggestions}>
                {searching && <li className={styles.suggHint}>Searching…</li>}

                {!searching && patients.map(p => {
                  const age = getAge(p.dob);
                  return (
                    <li key={p.id} className={`${styles.suggestion} ${styles.suggPatient}`}
                        onClick={() => openWithPatient(p)}>
                      <span className={styles.patientAvatar}>{p.name[0].toUpperCase()}</span>
                      <div className={styles.suggText}>
                        <span className={styles.suggMain}>{p.name}</span>
                        <span className={styles.suggSub}>
                          {[p.mobile, p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Other', age ? `${age}y` : null, p.abha_number].filter(Boolean).join(' • ')}
                        </span>
                      </div>
                      <span className={`${styles.suggBadge} ${checkinMode ? styles.suggBadgeCheckin : ''}`}>
                        {checkinMode ? 'Check-In' : 'Book'}
                      </span>
                    </li>
                  );
                })}

                {!searching && patients.length > 0 && (
                  <li className={styles.suggDivider}>
                    {checkinMode ? 'Add new patient & check in' : 'Add new patient'}
                  </li>
                )}

                {/* Show "add new" only when something is typed */}
                {trimmed.length > 0 && <>
                  <li className={styles.suggestion} onClick={() => openWithName(trimmed, 'manual')}>
                    <span className={styles.suggIcon}>👤</span>
                    <div className={styles.suggText}>
                      <span className={styles.suggMain}>{checkinMode ? 'Add & Check-In' : 'Add New Patient'}</span>
                      <span className={styles.suggSub}>"{trimmed}"</span>
                    </div>
                    <span className={`${styles.suggBadge} ${checkinMode ? styles.suggBadgeCheckin : ''}`}>
                      {checkinMode ? 'Check-In' : 'Manual'}
                    </span>
                  </li>
                  {!checkinMode && (
                    <li className={styles.suggestion} onClick={() => openWithName(trimmed, 'abha')}>
                      <span className={styles.suggIcon}>🔗</span>
                      <div className={styles.suggText}>
                        <span className={styles.suggMain}>Add New Patient</span>
                        <span className={styles.suggSub}>"{trimmed}"</span>
                      </div>
                      <span className={`${styles.suggBadge} ${styles.suggBadgeAbha}`}>via ABHA</span>
                    </li>
                  )}
                </>}

                {/* In checkin mode with no query yet, show a prompt */}
                {checkinMode && !searching && trimmed.length === 0 && (
                  <li className={styles.suggHint}>Type a name or number to search…</li>
                )}
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

      {showBook && addMode === 'checkin' && (
        <BookAppointmentModal
          mode="checkin"
          prefill={prefill}
          onClose={() => { setShowBook(false); setPrefill({}); }}
        />
      )}
      {showBook && addMode === 'book' && (
        <BookSlotModal
          prefill={prefill}
          onClose={() => { setShowBook(false); setPrefill({}); }}
        />
      )}
    </>
  );
}
