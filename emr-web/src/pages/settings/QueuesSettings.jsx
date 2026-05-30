import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, LayoutList } from 'lucide-react';
import { api } from '../../api/client';
import styles from './ServicesSettings.module.css';

export default function QueuesSettings() {
  const navigate  = useNavigate();
  const [queues,  setQueues]  = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/queues').then(rows => { setQueues(rows || []); }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (q) => {
    await api.patch(`/queues/${q.id}`, { is_active: !q.is_active });
    setQueues(qs => qs.map(x => x.id === q.id ? { ...x, is_active: !x.is_active } : x));
  };

  const handleDelete = async (q) => {
    if (!window.confirm(`Delete queue "${q.name}"? This cannot be undone.`)) return;
    await api.delete(`/queues/${q.id}`);
    setQueues(qs => qs.filter(x => x.id !== q.id));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
          Queues persist every day — no need to recreate them. Just manage them here.
        </span>
        <div style={{ flex: 1 }} />
        <button className={styles.btnCreate} onClick={() => navigate('/queue/setup')}>
          <Plus size={13} strokeWidth={2.5} /> New Queue
        </button>
      </div>

      {loading ? (
        <p className={styles.emptyText}>Loading…</p>
      ) : queues.length === 0 ? (
        <div className={styles.emptyState}>
          <LayoutList size={36} strokeWidth={1.2} className={styles.emptyIcon} />
          <p>No queues yet. Create your first queue to start seeing patients.</p>
          <button className={styles.btnCreate} style={{ marginTop: 12 }} onClick={() => navigate('/queue/setup')}>
            <Plus size={13} /> Create Queue
          </button>
        </div>
      ) : (
        <div className={styles.table}>
          <div className={styles.thead} style={{ gridTemplateColumns: '1.5fr 1fr 1fr 0.6fr 0.4fr' }}>
            <span>Name</span><span>Mode</span><span>Doctor</span><span>Status</span><span></span>
          </div>
          {queues.map(q => (
            <div key={q.id} className={styles.row} style={{ gridTemplateColumns: '1.5fr 1fr 1fr 0.6fr 0.4fr' }}>
              <span style={{ fontWeight: 600 }}>{q.name}</span>
              <span style={{ textTransform: 'capitalize' }}>{(q.mode || 'in_clinic').replace('_', ' ')}</span>
              <span>{q.doctor_name || '—'}</span>
              <span>
                <button
                  title={q.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                  onClick={() => toggleActive(q)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    color: q.is_active ? 'var(--color-success)' : 'var(--color-text-3)', fontSize: 12 }}
                >
                  {q.is_active
                    ? <><ToggleRight size={18} /> Active</>
                    : <><ToggleLeft  size={18} /> Inactive</>}
                </button>
              </span>
              <span className={styles.rowActions}>
                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => handleDelete(q)} title="Delete queue">
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
