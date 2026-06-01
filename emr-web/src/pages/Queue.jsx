import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useQueueDate } from '../context/QueueDateContext';
import { Search, SlidersHorizontal, ArrowUpDown, Plus, LayoutList, CalendarDays, X, Check } from 'lucide-react';
import AppointmentCard from '../components/AppointmentCard';
import QuickVitalsModal from '../components/QuickVitalsModal';
import RxPrintModal from '../components/RxPrintModal';
import PatientProfilePanel from '../components/PatientProfilePanel';
import CalendarView from '../components/CalendarView';
import FilterPanel, { DEFAULT_FILTERS, activeFilterCount } from '../components/FilterPanel';
import styles from './Queue.module.css';

const STATUS_TABS = ['Booked', 'Follow Ups', 'Others'];

function filterAppts(list, q, filters) {
  let out = list;

  // Text search
  if (q.trim()) {
    const t = q.trim().toLowerCase();
    out = out.filter(a =>
      a.patient_name?.toLowerCase().includes(t) ||
      a.patient_mobile?.includes(t) ||
      String(a.token_number).includes(t)
    );
  }

  // Tags filter
  if (filters.tags === 'no_tags') {
    out = out.filter(a => !a.tags || a.tags.length === 0);
  } else if (typeof filters.tags === 'string' && filters.tags.startsWith('tag:')) {
    const tagId = parseInt(filters.tags.slice(4), 10);
    out = out.filter(a => Array.isArray(a.tags) && a.tags.includes(tagId));
  }

  // Follow-up filter
  if (filters.followup === 'added') {
    out = out.filter(a => a.status === 'follow_up' || a.next_visit_date);
  } else if (filters.followup === 'not_added') {
    out = out.filter(a => a.status !== 'follow_up' && !a.next_visit_date);
  }

  // Paid status filter
  if (filters.paid === 'paid') {
    out = out.filter(a => a.payment_status === 'billed' || a.payment_status === 'paid');
  } else if (filters.paid === 'unpaid') {
    out = out.filter(a => a.payment_status === 'unbilled' || a.payment_status === 'unpaid' || !a.payment_status);
  }

  return out;
}

const SORT_OPTIONS = [
  { key: 'token_asc',  label: 'Token #',       dir: '↑' },
  { key: 'token_desc', label: 'Token #',       dir: '↓' },
  { key: 'time_asc',   label: 'Appt. Time',    dir: '↑' },
  { key: 'time_desc',  label: 'Appt. Time',    dir: '↓' },
  { key: 'name_asc',   label: 'Name',          dir: 'A–Z' },
  { key: 'name_desc',  label: 'Name',          dir: 'Z–A' },
];

function sortAppts(list, sort) {
  const s = [...list];
  switch (sort) {
    case 'token_asc':  return s.sort((a, b) => (a.token_number || 0) - (b.token_number || 0));
    case 'token_desc': return s.sort((a, b) => (b.token_number || 0) - (a.token_number || 0));
    case 'time_asc':   return s.sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''));
    case 'time_desc':  return s.sort((a, b) => (b.appointment_time || '').localeCompare(a.appointment_time || ''));
    case 'name_asc':   return s.sort((a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''));
    case 'name_desc':  return s.sort((a, b) => (b.patient_name || '').localeCompare(a.patient_name || ''));
    default:           return s;
  }
}

export default function Queue() {
  const navigate = useNavigate();
  const { queueDate, setQueueDate } = useQueueDate();
  const [queues,       setQueues]       = useState([]);
  const [activeQueue,  setActiveQueue]  = useState(null);
  const [board,        setBoard]        = useState({ booked: [], my_opd: [], completed: [] });
  const [clinicTags,   setClinicTags]   = useState([]);
  const [leftTab,      setLeftTab]      = useState('Booked');
  const [rightTab,     setRightTab]     = useState('MY OPD');
  const [loading,      setLoading]      = useState(true);
  const [viewMode,     setViewMode]     = useState('list');
  const [slotDuration, setSlotDuration] = useState(10);

  // Column search
  const [leftSearch,      setLeftSearch]      = useState('');
  const [leftSearchOpen,  setLeftSearchOpen]  = useState(false);
  const [rightSearch,     setRightSearch]     = useState('');
  const [rightSearchOpen, setRightSearchOpen] = useState(false);
  const leftInputRef  = useRef(null);
  const rightInputRef = useRef(null);

  // Column filters
  const [leftFilters,       setLeftFilters]       = useState({ ...DEFAULT_FILTERS });
  const [leftFilterOpen,    setLeftFilterOpen]    = useState(false);
  const [rightFilters,      setRightFilters]      = useState({ ...DEFAULT_FILTERS });
  const [rightFilterOpen,   setRightFilterOpen]   = useState(false);
  const leftFilterBtnRef  = useRef(null);
  const rightFilterBtnRef = useRef(null);

  // Column sort
  const [leftSort,      setLeftSort]      = useState('token_asc');
  const [leftSortOpen,  setLeftSortOpen]  = useState(false);
  const [rightSort,     setRightSort]     = useState('token_asc');
  const [rightSortOpen, setRightSortOpen] = useState(false);
  const leftSortRef  = useRef(null);
  const rightSortRef = useRef(null);

  const [vitalsAppt,   setVitalsAppt]   = useState(null);
  const [printAppt,    setPrintAppt]    = useState(null);
  const [profileAppt,  setProfileAppt]  = useState(null);

  const dateStr = useCallback(() => {
    const q = queueDate;
    return `${q.getFullYear()}-${String(q.getMonth()+1).padStart(2,'0')}-${String(q.getDate()).padStart(2,'0')}`;
  }, [queueDate]);

  useEffect(() => {
    const d = dateStr();
    Promise.all([api.get(`/queues?date=${d}`), api.get('/tags')])
      .then(([rows, tags]) => {
        setClinicTags(tags);
        setQueues(rows);
        // Keep the same active queue if it still exists, else default to first
        setActiveQueue(prev =>
          prev && rows.find(r => r.id === prev.id)
            ? rows.find(r => r.id === prev.id)
            : rows[0] || null
        );
        if (!rows.length) setLoading(false);
      }).catch(() => setLoading(false));
  }, [dateStr]);

  const fetchBoard = useCallback(() => {
    if (!activeQueue) return;
    setLoading(true);
    const q = queueDate;
    const d = `${q.getFullYear()}-${String(q.getMonth()+1).padStart(2,'0')}-${String(q.getDate()).padStart(2,'0')}`;
    api.get(`/appointments?queue_id=${activeQueue.id}&date=${d}`)
      .then(data => { setBoard(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeQueue, queueDate]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  useEffect(() => {
    const handler = () => fetchBoard();
    window.addEventListener('appointment:created', handler);
    return () => window.removeEventListener('appointment:created', handler);
  }, [fetchBoard]);

  const handleStatusChange = async (apptId, status) => {
    await api.patch(`/appointments/${apptId}/status`, { status });
    fetchBoard();
  };

  // ── Drag and drop ────────────────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(null); // 'left' | 'right' | null

  const DROP_STATUS = {
    'Booked':     'booked',
    'Follow Ups': 'follow_up',
    'Others':     'parked',
    'MY OPD':     'checked_in',
  };

  const handleDrop = async (e, targetTab) => {
    e.preventDefault();
    setDragOver(null);
    const apptId = parseInt(e.dataTransfer.getData('apptId'));
    const newStatus = DROP_STATUS[targetTab];
    if (!apptId || !newStatus) return;
    await api.patch(`/appointments/${apptId}/status`, { status: newStatus });
    fetchBoard();
  };

  const handleTagUpdate = (apptId, tagIds) => {
    const update = list => list.map(a => a.id === apptId ? { ...a, tags: tagIds } : a);
    setBoard(prev => ({
      ...prev,
      booked:    update(prev.booked),
      my_opd:    update(prev.my_opd),
      completed: update(prev.completed),
    }));
  };

  useEffect(() => {
    if (!leftSortOpen) return;
    const h = (e) => { if (leftSortRef.current && !leftSortRef.current.contains(e.target)) setLeftSortOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [leftSortOpen]);

  useEffect(() => {
    if (!rightSortOpen) return;
    const h = (e) => { if (rightSortRef.current && !rightSortRef.current.contains(e.target)) setRightSortOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [rightSortOpen]);

  const toggleLeftSearch = () => {
    const next = !leftSearchOpen;
    setLeftSearchOpen(next);
    if (!next) setLeftSearch('');
    else setTimeout(() => leftInputRef.current?.focus(), 50);
  };
  const toggleRightSearch = () => {
    const next = !rightSearchOpen;
    setRightSearchOpen(next);
    if (!next) setRightSearch('');
    else setTimeout(() => rightInputRef.current?.focus(), 50);
  };

  const rawLeft  = leftTab === 'Booked' ? board.booked : [];
  const rawRight = rightTab === 'MY OPD' ? board.my_opd : board.completed;
  const leftList  = sortAppts(filterAppts(rawLeft,  leftSearch,  leftFilters),  leftSort);
  const rightList = sortAppts(filterAppts(rawRight, rightSearch, rightFilters), rightSort);
  const leftFilterCount  = activeFilterCount(leftFilters);
  const rightFilterCount = activeFilterCount(rightFilters);

  return (
    <div className={styles.page}>
      {/* Queue selector + view toggle strip */}
      {queues.length > 0 && (
        <div className={styles.queueStrip}>
          {queues.map(q => (
            <button
              key={q.id}
              className={`${styles.queueTab} ${activeQueue?.id === q.id ? styles.queueTabActive : ''}`}
              onClick={() => setActiveQueue(q)}
            >
              {q.name}
              <span className={styles.queueCount}>{q.today_count}</span>
            </button>
          ))}

          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${viewMode === 'list'     ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('list')} title="List view">
              <LayoutList size={14} /> List
            </button>
            <button className={`${styles.viewBtn} ${viewMode === 'calendar' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('calendar')} title="Schedule view">
              <CalendarDays size={14} /> Schedule
            </button>
          </div>
        </div>
      )}

      {viewMode === 'calendar' && (
        <CalendarView board={board} slotDuration={slotDuration} setSlotDuration={setSlotDuration} selectedDate={queueDate} setSelectedDate={setQueueDate} />
      )}

      {viewMode === 'list' && (
        <div className={styles.board}>

          {/* ── LEFT column ─────────────────────────────── */}
          <div className={styles.column}>
            <div className={styles.colHeader}>
              {STATUS_TABS.map(t => (
                <button key={t}
                  className={`${styles.colTab} ${leftTab === t ? styles.colTabActive : ''}`}
                  onClick={() => setLeftTab(t)}
                >
                  {t} ({t === 'Booked' ? board.booked.length : 0})
                </button>
              ))}
              <div className={styles.colActions}>
                <button
                  className={`${styles.colAction} ${leftSearchOpen ? styles.colActionActive : ''}`}
                  title="Search" onClick={toggleLeftSearch}
                ><Search size={14} strokeWidth={2} /></button>
                <div className={styles.filterWrap} ref={leftSortRef}>
                  <button
                    className={`${styles.colAction} ${leftSort !== 'token_asc' ? styles.colActionActive : ''}`}
                    title="Sort" onClick={() => setLeftSortOpen(v => !v)}
                  ><ArrowUpDown size={14} strokeWidth={2} /></button>
                  {leftSortOpen && (
                    <div className={styles.sortDropdown}>
                      {SORT_OPTIONS.map(o => (
                        <button key={o.key} className={`${styles.sortOption} ${leftSort === o.key ? styles.sortOptionActive : ''}`}
                          onClick={() => { setLeftSort(o.key); setLeftSortOpen(false); }}>
                          {leftSort === o.key && <Check size={11} strokeWidth={3} />}
                          {o.label} {o.dir}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.filterWrap}>
                  <button
                    ref={leftFilterBtnRef}
                    className={`${styles.colAction} ${leftFilterCount > 0 ? styles.colActionActive : ''}`}
                    title="Filter" onClick={() => setLeftFilterOpen(v => !v)}
                  >
                    <SlidersHorizontal size={14} strokeWidth={2} />
                    {leftFilterCount > 0 && <span className={styles.filterBadge}>{leftFilterCount}</span>}
                  </button>
                  {leftFilterOpen && (
                    <FilterPanel
                      filters={leftFilters}
                      onChange={setLeftFilters}
                      onClose={() => setLeftFilterOpen(false)}
                      clinicTags={clinicTags}
                    />
                  )}
                </div>
              </div>
            </div>

            {leftSearchOpen && (
              <div className={styles.searchBar}>
                <Search size={13} className={styles.searchBarIcon} strokeWidth={2} />
                <input
                  ref={leftInputRef}
                  className={styles.searchBarInput}
                  placeholder="Search by name, mobile, token…"
                  value={leftSearch}
                  onChange={e => setLeftSearch(e.target.value)}
                />
                {leftSearch && (
                  <button className={styles.searchBarClear} onClick={() => setLeftSearch('')}><X size={13} /></button>
                )}
                <span className={styles.searchBarCount}>
                  {leftList.length} / {rawLeft.length}
                </span>
              </div>
            )}

            <div
              className={`${styles.cardList} ${dragOver === 'left' ? styles.dropTarget : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver('left'); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, leftTab)}
            >
              {dragOver === 'left' && (
                <div className={styles.dropIndicator}>
                  Drop here → <strong>{leftTab}</strong>
                </div>
              )}
              {loading && <p className={styles.empty}>Loading…</p>}
              {!loading && leftList.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>{leftSearch ? '🔍' : '👤'}</div>
                  <p>{leftSearch ? `No results for "${leftSearch}"` : 'No booked appointments yet'}</p>
                  {!leftSearch && <small>Future appointments you schedule will appear here</small>}
                </div>
              )}
              {leftList.map(a => (
                <AppointmentCard key={a.id} appt={a} clinicTags={clinicTags}
                  onStatusChange={handleStatusChange}
                  onTagUpdate={handleTagUpdate}
                  onOpen={(action) => { if (action === 'vitals') setVitalsAppt(a); else if (action === 'print') setPrintAppt(a); else if (action === 'profile') setProfileAppt(a); else navigate(`/rx/${a.id}`); }}
                />
              ))}
            </div>
          </div>

          {/* ── RIGHT column ────────────────────────────── */}
          <div className={styles.column}>
            <div className={styles.colHeader}>
              <button
                className={`${styles.colTab} ${rightTab === 'MY OPD' ? styles.colTabActive : ''}`}
                onClick={() => setRightTab('MY OPD')}
              >
                MY OPD ({board.my_opd.length})
              </button>
              <button
                className={`${styles.colTab} ${rightTab === 'COMPLETED' ? styles.colTabActive : ''}`}
                onClick={() => setRightTab('COMPLETED')}
              >
                COMPLETED ({board.completed.length})
              </button>
              <div className={styles.colActions}>
                <button
                  className={`${styles.colAction} ${rightSearchOpen ? styles.colActionActive : ''}`}
                  title="Search" onClick={toggleRightSearch}
                ><Search size={14} strokeWidth={2} /></button>
                <div className={styles.filterWrap} ref={rightSortRef}>
                  <button
                    className={`${styles.colAction} ${rightSort !== 'token_asc' ? styles.colActionActive : ''}`}
                    title="Sort" onClick={() => setRightSortOpen(v => !v)}
                  ><ArrowUpDown size={14} strokeWidth={2} /></button>
                  {rightSortOpen && (
                    <div className={styles.sortDropdown}>
                      {SORT_OPTIONS.map(o => (
                        <button key={o.key} className={`${styles.sortOption} ${rightSort === o.key ? styles.sortOptionActive : ''}`}
                          onClick={() => { setRightSort(o.key); setRightSortOpen(false); }}>
                          {rightSort === o.key && <Check size={11} strokeWidth={3} />}
                          {o.label} {o.dir}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.filterWrap}>
                  <button
                    ref={rightFilterBtnRef}
                    className={`${styles.colAction} ${rightFilterCount > 0 ? styles.colActionActive : ''}`}
                    title="Filter" onClick={() => setRightFilterOpen(v => !v)}
                  >
                    <SlidersHorizontal size={14} strokeWidth={2} />
                    {rightFilterCount > 0 && <span className={styles.filterBadge}>{rightFilterCount}</span>}
                  </button>
                  {rightFilterOpen && (
                    <FilterPanel
                      filters={rightFilters}
                      onChange={setRightFilters}
                      onClose={() => setRightFilterOpen(false)}
                      clinicTags={clinicTags}
                    />
                  )}
                </div>
              </div>
            </div>

            {rightSearchOpen && (
              <div className={styles.searchBar}>
                <Search size={13} className={styles.searchBarIcon} strokeWidth={2} />
                <input
                  ref={rightInputRef}
                  className={styles.searchBarInput}
                  placeholder="Search by name, mobile, token…"
                  value={rightSearch}
                  onChange={e => setRightSearch(e.target.value)}
                />
                {rightSearch && (
                  <button className={styles.searchBarClear} onClick={() => setRightSearch('')}><X size={13} /></button>
                )}
                <span className={styles.searchBarCount}>
                  {rightList.length} / {rawRight.length}
                </span>
              </div>
            )}

            <div
              className={`${styles.cardList} ${dragOver === 'right' ? styles.dropTarget : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver('right'); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, rightTab === 'MY OPD' ? 'MY OPD' : 'COMPLETED')}
            >
              {dragOver === 'right' && rightTab === 'MY OPD' && (
                <div className={styles.dropIndicator}>
                  Drop here → <strong>MY OPD</strong>
                </div>
              )}
              {!loading && rightList.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>{(rightTab === 'MY OPD' ? rightSearch : rightSearch) ? '🔍' : (rightTab === 'COMPLETED' ? '✓' : '👤')}</div>
                  <p>
                    {rightSearch
                      ? `No results for "${rightSearch}"`
                      : rightTab === 'MY OPD' ? 'No patient in the Queue' : 'No completed appointments yet'}
                  </p>
                  {!rightSearch && <small>{rightTab === 'MY OPD' ? 'Click "Add New" to start adding appointments' : 'Completed consultations will appear here'}</small>}
                </div>
              )}
              {rightList.map(a => (
                <AppointmentCard key={a.id} appt={a} clinicTags={clinicTags}
                  onStatusChange={handleStatusChange}
                  onTagUpdate={handleTagUpdate}
                  onOpen={(action) => { if (action === 'vitals') setVitalsAppt(a); else if (action === 'print') setPrintAppt(a); else if (action === 'profile') setProfileAppt(a); else navigate(`/rx/${a.id}`); }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {queues.length === 0 && !loading && (
        <div className={styles.setupPrompt}>
          <h2>Set up your first queue</h2>
          <p>Queues help you organise today's patients by doctor, mode, or shift.</p>
          <button className={styles.setupBtn} onClick={() => navigate('/queue/setup')}>Create Queue</button>
        </div>
      )}

      {vitalsAppt && (
        <QuickVitalsModal
          appt={vitalsAppt}
          onClose={() => setVitalsAppt(null)}
          onSaved={() => { setVitalsAppt(null); fetchBoard(); }}
        />
      )}
      {printAppt && (
        <RxPrintModal
          appt={printAppt}
          onClose={() => setPrintAppt(null)}
        />
      )}
      {profileAppt && (
        <PatientProfilePanel
          appt={profileAppt}
          onClose={() => setProfileAppt(null)}
          onNewVisit={(a) => {
            setProfileAppt(null);
            window.dispatchEvent(new CustomEvent('checkin:prefill', { detail: a }));
          }}
        />
      )}
    </div>
  );
}
