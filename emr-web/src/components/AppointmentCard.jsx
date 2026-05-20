import { useState } from 'react';
import { Tag, Clock, Pencil } from 'lucide-react';
import TagDialog from './TagDialog';
import EditPatientModal from './EditPatientModal';
import styles from './AppointmentCard.module.css';

const STATUS_COLOR = {
  booked: '#3b82f6', checked_in: '#8b5cf6', ongoing: '#f59e0b',
  completed: '#16a34a', cancelled: '#dc2626', parked: '#64748b',
  no_show: '#ef4444', follow_up: '#06b6d4',
};

const ACTIONS = {
  booked:     ['Check In', 'Write Rx', 'No Show', 'Cancel'],
  checked_in: ['Start', 'Write Rx', 'Park'],
  ongoing:    ['Write Rx', 'Complete'],
  parked:     ['Resume', 'Complete'],
};

function sinceText(ts) {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function ConsultTimer({ since }) {
  const [, tick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    const id = setInterval(() => tick(n => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
  const text = sinceText(since);
  if (!text) return null;
  return (
    <span className={styles.consultTimer}>
      <Clock size={11} strokeWidth={2} />
      Since {text}
    </span>
  );
}

export default function AppointmentCard({ appt: initialAppt, clinicTags = [], onStatusChange, onTagUpdate, onOpen }) {
  const [appt,          setAppt]          = useState(initialAppt);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showEdit,      setShowEdit]      = useState(false);

  const color   = STATUS_COLOR[appt.status] || '#94a3b8';
  const actions = ACTIONS[appt.status] || [];

  const resolvedTags = Array.isArray(appt.tags) ? appt.tags.map(idOrObj => {
    if (typeof idOrObj === 'object' && idOrObj !== null) return idOrObj;
    return clinicTags.find(t => t.id === idOrObj);
  }).filter(Boolean) : [];

  const handleAction = (action) => {
    const map = {
      'Check In': 'checked_in', 'Start': 'ongoing',
      'Complete': 'completed',  'Park': 'parked',
      'Resume':   'ongoing',    'No Show': 'no_show',
      'Cancel':   'cancelled',
    };
    if (map[action]) onStatusChange(appt.id, map[action]);
    if (action === 'Write Rx') onOpen();
  };

  const openTagDialog  = (e) => { e.stopPropagation(); setShowTagDialog(true); };
  const openEditDialog = (e) => { e.stopPropagation(); setShowEdit(true); };

  return (
    <>
      <div className={styles.card} onClick={onOpen}>
        <div className={styles.stripe} style={{ background: color }} />
        <div className={styles.body}>
          <div className={styles.row1}>
            <span className={styles.token}>#{appt.token_number}</span>
            <span className={styles.name}>{appt.patient_name}</span>
            <div className={styles.row1Right}>
              {appt.status === 'ongoing' && appt.checked_in_at
                ? <ConsultTimer since={appt.checked_in_at} />
                : <span className={styles.status} style={{ color }}>{appt.status.replace('_', ' ')}</span>
              }
              <button
                className={styles.editBtn}
                onClick={openEditDialog}
                title="Edit patient details"
              >
                <Pencil size={12} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className={styles.row2}>
            <span>{appt.patient_mobile || '—'}</span>
            {appt.patient_gender && <span>• {appt.patient_gender === 'M' ? 'Male' : 'Female'}</span>}
            {appt.visit_type && <span>• {appt.visit_type}</span>}
            {appt.is_new_patient && <span className={styles.newBadge}>New Patient</span>}
            <span className={`${styles.pill} ${appt.payment_status === 'billed' ? styles.billed : styles.unbilled}`}>
              {appt.payment_status}
            </span>
          </div>
          {appt.appointment_time && (
            <div className={styles.row2}>
              <span>⏰ {appt.appointment_time}</span>
              {appt.channel && <span>• {appt.channel.replace('_', ' ')}</span>}
            </div>
          )}

          <div className={styles.tagRow} onClick={e => e.stopPropagation()}>
            {resolvedTags.map(t => (
              <span
                key={t.id}
                className={styles.tagChip}
                style={{ background: t.color + '22', borderColor: t.color, color: t.color }}
              >
                {t.display_name}
              </span>
            ))}
            <button className={styles.addTagBtn} onClick={openTagDialog}>
              <Tag size={11} strokeWidth={2} />
              {resolvedTags.length === 0 ? 'Add Tag' : '+'}
            </button>
          </div>

          {actions.length > 0 && (
            <div className={styles.actions} onClick={e => e.stopPropagation()}>
              {actions.map(a => (
                <button key={a} className={styles.actionBtn} onClick={() => handleAction(a)}>
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTagDialog && (
        <TagDialog
          appt={appt}
          clinicTags={clinicTags}
          onClose={() => setShowTagDialog(false)}
          onSaved={onTagUpdate}
        />
      )}

      {showEdit && (
        <EditPatientModal
          appt={appt}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => setAppt(prev => ({ ...prev, ...updated }))}
        />
      )}
    </>
  );
}
