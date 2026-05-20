import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import AppointmentCard from '../components/AppointmentCard';
import styles from './Queue.module.css';

const STATUS_TABS = ['Booked', 'Follow Ups', 'Others'];

export default function Queue() {
  const navigate = useNavigate();
  const [queues,      setQueues]      = useState([]);
  const [activeQueue, setActiveQueue] = useState(null);
  const [board,       setBoard]       = useState({ booked: [], my_opd: [], completed: [] });
  const [leftTab,     setLeftTab]     = useState('Booked');
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    api.get('/queues').then(rows => {
      setQueues(rows);
      if (rows.length) setActiveQueue(rows[0]);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchBoard = useCallback(() => {
    if (!activeQueue) return;
    setLoading(true);
    api.get(`/appointments?queue_id=${activeQueue.id}`)
      .then(data => { setBoard(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeQueue]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const handleStatusChange = async (apptId, status) => {
    await api.patch(`/appointments/${apptId}/status`, { status });
    fetchBoard();
  };

  const leftList = leftTab === 'Booked' ? board.booked : [];

  return (
    <div className={styles.page}>
      {/* Queue selector strip */}
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
          <button className={styles.newQueueBtn} onClick={() => navigate('/queue/setup')} title="New queue">
            + Queue
          </button>
        </div>
      )}

      {/* Board */}
      <div className={styles.board}>
        {/* LEFT — Booked column */}
        <div className={styles.column}>
          <div className={styles.colHeader}>
            {STATUS_TABS.map(t => (
              <button
                key={t}
                className={`${styles.colTab} ${leftTab === t ? styles.colTabActive : ''}`}
                onClick={() => setLeftTab(t)}
              >
                {t} ({t === 'Booked' ? board.booked.length : 0})
              </button>
            ))}
            <button className={styles.colAction} title="Search">🔍</button>
            <button className={styles.colAction} title="Filter">⊟</button>
          </div>

          <div className={styles.cardList}>
            {loading && <p className={styles.empty}>Loading…</p>}
            {!loading && leftList.length === 0 && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>👤</div>
                <p>No booked appointments yet</p>
                <small>Future appointments you schedule will appear here</small>
              </div>
            )}
            {leftList.map(a => (
              <AppointmentCard
                key={a.id} appt={a}
                onStatusChange={handleStatusChange}
                onOpen={() => navigate(`/rx/${a.id}`)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — My OPD + Completed */}
        <div className={styles.column}>
          <div className={styles.colHeader}>
            <button className={`${styles.colTab} ${styles.colTabActive}`}>
              MY OPD ({board.my_opd.length})
            </button>
            <button className={styles.colTab}>
              COMPLETED ({board.completed.length})
            </button>
            <button className={styles.colAction} title="Add">+</button>
            <button className={styles.colAction} title="Search">🔍</button>
            <button className={styles.colAction} title="Sort">⇅</button>
            <button className={styles.colAction} title="Filter">⊟</button>
            <button className={styles.colAction} title="More">⋮</button>
          </div>

          <div className={styles.cardList}>
            {!loading && board.my_opd.length === 0 && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>👤</div>
                <p>No patient in the Queue</p>
                <small>Click on "Add New" to start adding appointments</small>
              </div>
            )}
            {board.my_opd.map(a => (
              <AppointmentCard
                key={a.id} appt={a}
                onStatusChange={handleStatusChange}
                onOpen={() => navigate(`/rx/${a.id}`)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* No queues empty state */}
      {queues.length === 0 && !loading && (
        <div className={styles.setupPrompt}>
          <h2>Set up your first queue</h2>
          <p>Queues help you organise today's patients by doctor, mode, or shift.</p>
          <button className={styles.setupBtn} onClick={() => navigate('/queue/setup')}>
            Create Queue
          </button>
        </div>
      )}
    </div>
  );
}
