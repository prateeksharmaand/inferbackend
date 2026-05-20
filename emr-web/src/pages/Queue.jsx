import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Search, SlidersHorizontal, ArrowUpDown, MoreVertical, Plus, LayoutList, CalendarDays, X } from 'lucide-react';
import AppointmentCard from '../components/AppointmentCard';
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

  // Tags filter (no tags = no tags field set)
  if (filters.tags === 'no_tags') {
    out = out.filter(a => !a.tags || a.tags.length === 0);
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

export default function Queue() {
  const navigate = useNavigate();
  const [queues,       setQueues]       = useState([]);
  const [activeQueue,  setActiveQueue]  = useState(null);
  const [board,        setBoard]        = useState({ booked: [], my_opd: [], completed: [] });
  const [leftTab,      setLeftTab]      = useState('Booked');
  const [rightTab,     setRightTab]     = useState('MY OPD');
  const [loading,      setLoading]      = useState(true);
  const [viewMode,     setViewMode]     = useState('list');
  const [slotDuration, setSlotDuration] = useState(10);
  const [selectedDate, setSelectedDate] = useState(new Date());

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

  useEffect(() => {
    api.get('/queues').then(rows => {
      setQueues(rows);
      if (rows.length) setActiveQueue(rows[0]);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchBoard = useCallback((date) => {
    if (!activeQueue) return;
    setLoading(true);
    const d = date || new Date().toISOString().slice(0, 10);
    api.get(`/appointments?queue_id=${activeQueue.id}&date=${d}`)
      .then(data => { setBoard(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeQueue]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  useEffect(() => {
    if (viewMode === 'calendar') fetchBoard(selectedDate.toISOString().slice(0, 10));
  }, [selectedDate, viewMode]);

  const handleStatusChange = async (apptId, status) => {
    await api.patch(`/appointments/${apptId}/status`, { status });
    fetchBoard();
  };

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
  const leftList  = filterAppts(rawLeft,  leftSearch,  leftFilters);
  const rightList = filterAppts(rawRight, rightSearch, rightFilters);
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
          <button className={styles.newQueueBtn} onClick={() => navigate('/queue/setup')}>+ Queue</button>

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
        <CalendarView board={board} slotDuration={slotDuration} setSlotDuration={setSlotDuration} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
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
              <button
                className={`${styles.colAction} ${leftSearchOpen ? styles.colActionActive : ''}`}
                title="Search" onClick={toggleLeftSearch}
              ><Search size={14} strokeWidth={2} /></button>
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
                  />
                )}
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

            <div className={styles.cardList}>
              {loading && <p className={styles.empty}>Loading…</p>}
              {!loading && leftList.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>{leftSearch ? '🔍' : '👤'}</div>
                  <p>{leftSearch ? `No results for "${leftSearch}"` : 'No booked appointments yet'}</p>
                  {!leftSearch && <small>Future appointments you schedule will appear here</small>}
                </div>
              )}
              {leftList.map(a => (
                <AppointmentCard key={a.id} appt={a}
                  onStatusChange={handleStatusChange}
                  onOpen={() => navigate(`/rx/${a.id}`)}
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
              <button
                className={`${styles.colAction} ${rightSearchOpen ? styles.colActionActive : ''}`}
                title="Search" onClick={toggleRightSearch}
              ><Search size={14} strokeWidth={2} /></button>
              <button className={styles.colAction} title="Sort"><ArrowUpDown size={14} strokeWidth={2} /></button>
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
                  />
                )}
              </div>
              <button className={styles.colAction} title="More"><MoreVertical size={14} strokeWidth={2} /></button>
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

            <div className={styles.cardList}>
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
                <AppointmentCard key={a.id} appt={a}
                  onStatusChange={handleStatusChange}
                  onOpen={() => navigate(`/rx/${a.id}`)}
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
    </div>
  );
}
