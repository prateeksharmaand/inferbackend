import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Search, SlidersHorizontal, ArrowUpDown, MoreVertical, Plus, LayoutList, CalendarDays, X } from 'lucide-react';
import AppointmentCard from '../components/AppointmentCard';
import CalendarView from '../components/CalendarView';
import styles from './Queue.module.css';

const STATUS_TABS = ['Booked', 'Follow Ups', 'Others'];

function filterAppts(list, q) {
  if (!q.trim()) return list;
  const t = q.trim().toLowerCase();
  return list.filter(a =>
    a.patient_name?.toLowerCase().includes(t) ||
    a.patient_mobile?.includes(t) ||
    String(a.token_number).includes(t)
  );
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
  const [leftSearch,     setLeftSearch]     = useState('');
  const [leftSearchOpen, setLeftSearchOpen] = useState(false);
  const [rightSearch,    setRightSearch]    = useState('');
  const [rightSearchOpen,setRightSearchOpen]= useState(false);
  const leftInputRef  = useRef(null);
  const rightInputRef = useRef(null);

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
  const leftList  = filterAppts(rawLeft,  leftSearch);
  const rightList = filterAppts(rawRight, rightSearch);

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
              <button className={styles.colAction} title="Filter"><SlidersHorizontal size={14} strokeWidth={2} /></button>
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
              <button className={styles.colAction} title="Add"><Plus size={14} strokeWidth={2.5} /></button>
              <button
                className={`${styles.colAction} ${rightSearchOpen ? styles.colActionActive : ''}`}
                title="Search" onClick={toggleRightSearch}
              ><Search size={14} strokeWidth={2} /></button>
              <button className={styles.colAction} title="Sort"><ArrowUpDown size={14} strokeWidth={2} /></button>
              <button className={styles.colAction} title="Filter"><SlidersHorizontal size={14} strokeWidth={2} /></button>
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
