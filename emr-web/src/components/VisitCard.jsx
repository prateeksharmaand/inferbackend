import { Clock, MapPin, User, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import styles from './AppointmentCard.module.css';

const VISIT_TYPE_LABELS = {
  consultation: 'Consultation',
  lab: 'Lab Test',
  vaccination: 'Vaccination',
  pharmacy: 'Pharmacy',
  report_collection: 'Report Collection',
  registration: 'Registration',
  insurance: 'Insurance',
  procedure: 'Procedure',
  followup: 'Follow-up',
  other: 'Other'
};

const STATUS_COLORS = {
  waiting: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#10b981',
  cancelled: '#ef4444',
  no_show: '#f59e0b'
};

export default function VisitCard({ visit, onStatusChange, onCheckIn, onCheckOut, onOpen }) {
  if (!visit) return null;

  const handleCheckIn = () => {
    if (onCheckIn) onCheckIn(visit.id);
  };

  const handleCheckOut = () => {
    if (onCheckOut) onCheckOut(visit.id);
  };

  const visitTypeLabel = VISIT_TYPE_LABELS[visit.visit_type] || visit.visit_type;
  const statusColor = STATUS_COLORS[visit.status] || '#6b7280';

  return (
    <div className={styles.card} style={{ borderLeft: `4px solid ${statusColor}` }}>
      <div className={styles.header}>
        <div className={styles.title}>
          <div className={styles.name}>{visit.patient_name || 'Unknown Patient'}</div>
          <div className={styles.subtitle}>{visitTypeLabel}</div>
        </div>
        <div className={styles.badge} style={{ backgroundColor: statusColor }}>
          {visit.queue_number ? `#${visit.queue_number}` : 'No queue'}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.row}>
          <User size={13} />
          <span>{visit.patient_mobile || 'N/A'}</span>
        </div>

        {visit.doctor_name && (
          <div className={styles.row}>
            <User size={13} />
            <span>Dr. {visit.doctor_name}</span>
          </div>
        )}

        {visit.check_in_time && (
          <div className={styles.row}>
            <Clock size={13} />
            <span>Checked in at {new Date(visit.check_in_time).toLocaleTimeString()}</span>
          </div>
        )}

        {visit.notes && (
          <div className={styles.row}>
            <FileText size={13} />
            <span>{visit.notes}</span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.status}>{visit.status}</span>
        <div className={styles.actions}>
          {visit.status === 'waiting' && (
            <button className={styles.btn} onClick={handleCheckIn} title="Check in">
              <CheckCircle size={13} />
            </button>
          )}
          {visit.status === 'in_progress' && (
            <button className={styles.btn} onClick={handleCheckOut} title="Check out">
              <AlertCircle size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
