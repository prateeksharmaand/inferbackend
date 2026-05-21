import { useState, useRef, useEffect } from 'react';
import { Tag, Clock, Pencil, Bell, MoreVertical, CalendarClock, IndianRupee } from 'lucide-react';
import TagDialog from './TagDialog';
import EditPatientModal from './EditPatientModal';
import BookSlotModal from './BookSlotModal';
import ViewReceiptsModal from './ViewReceiptsModal';
import { api } from '../api/client';
import styles from './AppointmentCard.module.css';

const STATUS_COLOR = {
  booked: '#3b82f6', checked_in: '#8b5cf6', ongoing: '#f59e0b',
  completed: '#16a34a', cancelled: '#dc2626', parked: '#64748b',
  no_show: '#ef4444', follow_up: '#06b6d4',
};

const ACTIONS = {
  checked_in: ['Start', 'Write Rx', 'Park'],
  ongoing:    ['Write Rx', 'Complete'],
  parked:     ['Resume', 'Complete'],
};

const MORE_ACTIONS = ['Write Rx', 'No Show', 'Cancel'];

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

function reminderTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = h * 60 + m - 120;
  if (totalMins < 0) return null;
  const rh = Math.floor(totalMins / 60);
  const rm = totalMins % 60;
  const ampm = rh >= 12 ? 'PM' : 'AM';
  const rh12 = rh > 12 ? rh - 12 : rh === 0 ? 12 : rh;
  return `${rh12}:${String(rm).padStart(2, '0')} ${ampm}`;
}

export default function AppointmentCard({ appt: initialAppt, clinicTags = [], onStatusChange, onTagUpdate, onOpen }) {
  const [appt,           setAppt]           = useState(initialAppt);
  const [showTagDialog,  setShowTagDialog]  = useState(false);
  const [showEdit,       setShowEdit]       = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showMore,       setShowMore]       = useState(false);
  const [reminding,      setReminding]      = useState(false);
  const [receipts,       setReceipts]       = useState(null);   // null = not loaded
  const [showReceipts,   setShowReceipts]   = useState(false);
  const moreRef = useRef(null);

  // Load receipt summary for completed/ongoing appointments
  useEffect(() => {
    if (!['completed', 'ongoing', 'parked'].includes(appt.status)) return;
    api.get(`/receipts?appointment_id=${appt.id}`)
      .then(rows => setReceipts(rows))
      .catch(() => setReceipts([]));
  }, [appt.id, appt.status]);

  const receiptTotal = receipts?.reduce((s, r) => s + parseFloat(r.grand_total || 0), 0) || 0;
  const receiptPaymodes = receipts?.length
    ? [...new Set(receipts.map(r => r.paymode).filter(Boolean))].join(' / ')
    : '';

  const color   = STATUS_COLOR[appt.status] || '#94a3b8';
  const actions = ACTIONS[appt.status] || [];

  const resolvedTags = Array.isArray(appt.tags) ? appt.tags.map(idOrObj => {
    if (typeof idOrObj === 'object' && idOrObj !== null) return idOrObj;
    return clinicTags.find(t => t.id === idOrObj);
  }).filter(Boolean) : [];

  // Close more-menu on outside click
  useEffect(() => {
    if (!showMore) return;
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMore]);

  const handleAction = (action) => {
    setShowMore(false);
    const map = {
      'Check In': 'checked_in', 'Start': 'ongoing',
      'Complete': 'completed',  'Park': 'parked',
      'Resume':   'ongoing',    'No Show': 'no_show',
      'Cancel':   'cancelled',
    };
    if (map[action]) onStatusChange(appt.id, map[action]);
    if (action === 'Write Rx') onOpen();
  };

  const handleSendReminder = async (e) => {
    e.stopPropagation();
    setReminding(true);
    try {
      await api.post(`/appointments/${appt.id}/reminder`, {});
    } catch (_) { /* silent — show sent state regardless */ }
    setReminding(false);
  };

  const openTagDialog  = (e) => { e.stopPropagation(); setShowTagDialog(true); };
  const openEditDialog = (e) => { e.stopPropagation(); setShowEdit(true); };
  const openReschedule = (e) => { e.stopPropagation(); setShowReschedule(true); };

  const reminder = appt.status === 'booked' ? reminderTime(appt.appointment_time) : null;

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
              <button className={styles.editBtn} onClick={openEditDialog} title="Edit patient details">
                <Pencil size={12} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className={styles.row2}>
            {appt.uhid && <span className={styles.uhid}>{appt.uhid}</span>}
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
              {reminder && (
                <span className={styles.reminderBadge}>
                  <Bell size={10} strokeWidth={2.5} /> Reminder at {reminder}
                </span>
              )}
            </div>
          )}

          {/* Receipt badge */}
          {receipts && receipts.length > 0 && (
            <div className={styles.row2} onClick={e => e.stopPropagation()}>
              <button className={styles.receiptBadge} onClick={() => setShowReceipts(true)}>
                <IndianRupee size={11} strokeWidth={2.5} />
                {receiptTotal.toFixed(0)}
                {receiptPaymodes && <span className={styles.receiptPaymode}>• {receiptPaymodes}</span>}
                <span className={styles.receiptCount}>{receipts.length} receipt{receipts.length > 1 ? 's' : ''}</span>
              </button>
            </div>
          )}

          <div className={styles.tagRow} onClick={e => e.stopPropagation()}>
            {resolvedTags.map(t => (
              <span key={t.id} className={styles.tagChip}
                style={{ background: t.color + '22', borderColor: t.color, color: t.color }}>
                {t.display_name}
              </span>
            ))}
            <button className={styles.addTagBtn} onClick={openTagDialog}>
              <Tag size={11} strokeWidth={2} />
              {resolvedTags.length === 0 ? 'Add Tag' : '+'}
            </button>
          </div>

          {/* Booked-specific actions row */}
          {appt.status === 'booked' && (
            <div className={styles.actions} onClick={e => e.stopPropagation()}>
              <button className={styles.actionBtn} onClick={() => handleAction('Check In')}>
                Check In
              </button>
              <button className={`${styles.actionBtn} ${styles.actionBtnReminder}`}
                onClick={handleSendReminder} disabled={reminding}>
                <Bell size={11} strokeWidth={2} />
                {reminding ? 'Sending…' : 'Send Reminder'}
              </button>
              <button className={`${styles.actionBtn} ${styles.actionBtnReschedule}`}
                onClick={openReschedule}>
                <CalendarClock size={11} strokeWidth={2} />
                Reschedule
              </button>
              <div className={styles.moreWrap} ref={moreRef}>
                <button className={styles.moreBtn} onClick={e => { e.stopPropagation(); setShowMore(v => !v); }}
                  title="More options">
                  <MoreVertical size={14} strokeWidth={2} />
                </button>
                {showMore && (
                  <ul className={styles.moreMenu}>
                    {MORE_ACTIONS.map(a => (
                      <li key={a} onClick={() => handleAction(a)}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Standard actions for other statuses */}
          {appt.status !== 'booked' && actions.length > 0 && (
            <div className={styles.actions} onClick={e => e.stopPropagation()}>
              {actions.map(a => (
                <button key={a} className={styles.actionBtn} onClick={() => handleAction(a)}>{a}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTagDialog && (
        <TagDialog appt={appt} clinicTags={clinicTags}
          onClose={() => setShowTagDialog(false)} onSaved={onTagUpdate} />
      )}
      {showEdit && (
        <EditPatientModal appt={appt}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => setAppt(prev => ({ ...prev, ...updated }))} />
      )}
      {showReceipts && (
        <ViewReceiptsModal
          appt={appt}
          receipts={receipts || []}
          onClose={() => setShowReceipts(false)}
          onReceiptsChange={(updated) => setReceipts(updated)}
        />
      )}
      {showReschedule && (
        <BookSlotModal
          prefill={{
            patient_name:   appt.patient_name,
            patient_mobile: appt.patient_mobile || '',
            patient_abha:   appt.patient_abha   || '',
            channel:        appt.channel        || 'walk_in',
          }}
          onClose={() => setShowReschedule(false)}
          onBooked={() => {
            onStatusChange(appt.id, 'cancelled');
            setShowReschedule(false);
          }}
        />
      )}
    </>
  );
}
