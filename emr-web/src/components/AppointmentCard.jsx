import { useState, useRef, useEffect } from 'react';
import { Tag, Clock, Pencil, Bell, MoreVertical, CalendarClock, IndianRupee, Activity, Printer, Paperclip } from 'lucide-react';
import TagDialog from './TagDialog';
import EditPatientModal from './EditPatientModal';
import BookSlotModal from './BookSlotModal';
import ViewReceiptsModal from './ViewReceiptsModal';
import MedicalDocumentsModal from './MedicalDocumentsModal';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AppointmentSlipModal from './AppointmentSlipModal';
import MedicalDocModal from './MedicalDocModal';
import styles from './AppointmentCard.module.css';

const STATUS_COLOR = {
  booked: '#3b82f6', checked_in: '#8b5cf6', ongoing: '#f59e0b',
  completed: '#16a34a', cancelled: '#dc2626', parked: '#64748b',
  no_show: '#ef4444', follow_up: '#06b6d4',
};

const ACTIONS = {
  checked_in: ['Start', 'Write Rx', 'Park'],
  ongoing:    ['Resume', 'Complete'],
  parked:     ['Resume', 'Complete'],
};

const MORE_ACTIONS = ['Write Rx', 'Print Appointment Slip', 'Medical Document', 'No Show', 'Cancel'];

function durationText(from, to) {
  if (!from || !to) return null;
  const mins = Math.round((new Date(to) - new Date(from)) / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmt12(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

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
      <Clock size={11} strokeWidth={2} /> Since {text}
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

export default function AppointmentCard({ appt: initialAppt, clinicTags = [], onStatusChange, onTagUpdate, onOpen, onDragStart }) {
  const { user } = useAuth();
  const [appt,           setAppt]           = useState(initialAppt);
  useEffect(() => { setAppt(initialAppt); }, [initialAppt.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showTagDialog,  setShowTagDialog]  = useState(false);
  const [showEdit,       setShowEdit]       = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showMore,       setShowMore]       = useState(false);
  const [reminding,      setReminding]      = useState(false);
  const [receipts,       setReceipts]       = useState(null);
  const [showReceipts,   setShowReceipts]   = useState(false);
  const [showDocs,       setShowDocs]       = useState(false);
  const [showSlip,       setShowSlip]       = useState(false);
  const [showMedDoc,     setShowMedDoc]     = useState(false);
  const moreRef = useRef(null);

  const color   = STATUS_COLOR[appt.status] || '#94a3b8';
  const actions = ACTIONS[appt.status] || [];

  const resolvedTags = Array.isArray(appt.tags) ? appt.tags.map(idOrObj => {
    if (typeof idOrObj === 'object' && idOrObj !== null) return idOrObj;
    return clinicTags.find(t => t.id === idOrObj);
  }).filter(Boolean) : [];

  useEffect(() => {
    if (!showMore) return;
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMore]);

  useEffect(() => {
    if (!['completed', 'ongoing', 'parked'].includes(appt.status)) return;
    api.get(`/receipts?appointment_id=${appt.id}`)
      .then(rows => setReceipts(rows))
      .catch(() => setReceipts([]));
  }, [appt.id, appt.status]);

  const receiptTotal    = receipts?.reduce((s, r) => s + parseFloat(r.grand_total || 0), 0) || 0;
  const receiptPaymodes = receipts?.length
    ? [...new Set(receipts.map(r => r.paymode).filter(Boolean))].join(' / ')
    : '';

  const handleAction = (action) => {
    setShowMore(false);
    const map = {
      'Check In': 'checked_in', 'Start': 'ongoing',
      'Complete': 'completed',  'Park': 'parked',
      'Resume':   'ongoing',    'No Show': 'no_show',
      'Cancel':   'cancelled',
    };
    if (map[action]) onStatusChange(appt.id, map[action]);
    if (action === 'Write Rx' || action === 'Resume') onOpen('rx');
    if (action === 'Print Appointment Slip') setShowSlip(true);
    if (action === 'Medical Document')       setShowMedDoc(true);
  };

  const handleSendReminder = async (e) => {
    e.stopPropagation();
    setReminding(true);
    try { await api.post(`/appointments/${appt.id}/reminder`, {}); } catch (_) {}
    setReminding(false);
  };

  const openTagDialog  = (e) => { e.stopPropagation(); setShowTagDialog(true); };
  const openEditDialog = (e) => { e.stopPropagation(); setShowEdit(true); };
  const openReschedule = (e) => { e.stopPropagation(); setShowReschedule(true); };

  const reminder = appt.status === 'booked' ? reminderTime(appt.appointment_time) : null;
  const gender   = appt.patient_gender === 'M' ? 'Male' : appt.patient_gender === 'F' ? 'Female' : appt.patient_gender;
  const age      = appt.patient_dob
    ? Math.floor((Date.now() - new Date(appt.patient_dob)) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <>
      <div
        className={styles.card}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('apptId', String(appt.id));
          e.dataTransfer.effectAllowed = 'move';
          onDragStart?.(appt);
        }}
        style={{ cursor: 'grab' }}
      >
        <div className={styles.stripe} style={{ background: color }} />
        <div className={styles.body}>

          {/* ── Row 1: token · name · status · edit ── */}
          <div className={styles.row1}>
            <span className={styles.token}>#{appt.token_number}</span>
            <span className={styles.name}>
              <span className={styles.nameLink} onClick={e => { e.stopPropagation(); onOpen('profile'); }}>
                {appt.patient_name}
              </span>
              {(appt.patient_gender || age !== null) && (
                <span className={styles.nameMeta}>
                  {appt.patient_gender && appt.patient_gender}{age !== null && `, ${age}y`}
                </span>
              )}
            </span>
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

          {/* ── Info grid: 2 columns fill full width ── */}
          <div className={styles.infoGrid}>
            {/* Left col: patient identifiers */}
            <div className={styles.infoCol}>
              {appt.uhid && <span className={styles.uhid}>{appt.uhid}</span>}
              {appt.patient_mobile && <span className={styles.infoText}>{appt.patient_mobile}</span>}
              {gender && <span className={styles.infoText}>{gender}</span>}
              {appt.visit_type && <span className={styles.infoText}>{appt.visit_type}</span>}
            </div>
            {/* Right col: time / channel / reminder / completed duration */}
            <div className={styles.infoCol}>
              {appt.appointment_time && (
                <span className={styles.infoText}>⏰ {appt.appointment_time}</span>
              )}
              {appt.channel && (['sms','whatsapp','ivr','chat'].includes(appt.channel) ? (
                <span className={styles.inboundBadge}>
                  {appt.channel === 'sms' ? '💬' : appt.channel === 'whatsapp' ? '📲' : appt.channel === 'ivr' ? '📞' : '💻'}
                  {' '}{appt.channel.toUpperCase()}
                </span>
              ) : (
                <span className={styles.infoText}>{appt.channel.replace('_', ' ')}</span>
              ))}
              {reminder && (
                <span className={styles.reminderBadge}>
                  <Bell size={10} strokeWidth={2.5} /> {reminder}
                </span>
              )}
              {appt.status === 'completed' && appt.completed_at && (
                <span className={styles.durationBadge}>
                  <Clock size={10} strokeWidth={2.5} />
                  {durationText(appt.checked_in_at, appt.completed_at)
                    ? `${durationText(appt.checked_in_at, appt.completed_at)} · `
                    : ''}
                  Done {fmt12(appt.completed_at)}
                </span>
              )}
            </div>
          </div>

          {/* ── Badges row: payment pill · new patient · receipt ── */}
          <div className={styles.badgeRow}>
            <span className={`${styles.pill} ${appt.payment_status === 'billed' ? styles.billed : styles.unbilled}`}>
              {appt.payment_status}
            </span>
            {appt.is_new_patient && <span className={styles.newBadge}>New</span>}
            {receipts !== null && (
              <button
                className={`${styles.receiptBadge} ${receipts.length === 0 ? styles.receiptBadgeEmpty : ''}`}
                onClick={e => { e.stopPropagation(); setShowReceipts(true); }}
              >
                <IndianRupee size={10} strokeWidth={2.5} />
                {receiptTotal.toFixed(0)}
                <span className={styles.receiptPaymode}>· {receiptPaymodes || 'Cash'}</span>
                {receipts.length > 0 && (
                  <span className={styles.receiptCount}>{receipts.length}</span>
                )}
              </button>
            )}
            {/* Tags inline */}
            {resolvedTags.map(t => (
              <span key={t.id} className={styles.tagChip}
                style={{ background: t.color + '22', borderColor: t.color, color: t.color }}>
                {t.display_name}
              </span>
            ))}
            <button className={styles.addTagBtn} onClick={openTagDialog}>
              <Tag size={10} strokeWidth={2} />
              {resolvedTags.length === 0 ? 'Tag' : '+'}
            </button>
          </div>

          {/* ── Booked actions ── */}
          {appt.status === 'booked' && (
            <div className={styles.actions} onClick={e => e.stopPropagation()}>
              <button className={styles.actionBtn} onClick={() => handleAction('Check In')}>Check In</button>
              <button className={`${styles.actionBtn} ${styles.actionBtnReminder}`}
                onClick={handleSendReminder} disabled={reminding}>
                <Bell size={11} strokeWidth={2} />{reminding ? 'Sending…' : 'Remind'}
              </button>
              <button className={`${styles.actionBtn} ${styles.actionBtnReschedule}`} onClick={openReschedule}>
                <CalendarClock size={11} strokeWidth={2} />Reschedule
              </button>
              <div className={styles.moreWrap} ref={moreRef}>
                <button className={styles.moreBtn}
                  onClick={e => { e.stopPropagation(); setShowMore(v => !v); }} title="More options">
                  <MoreVertical size={14} strokeWidth={2} />
                </button>
                {showMore && (
                  <ul className={styles.moreMenu}>
                    {MORE_ACTIONS.map(a => <li key={a} onClick={e => { e.stopPropagation(); handleAction(a); }}>{a}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── Other status actions ── */}
          {appt.status !== 'booked' && appt.status !== 'completed' && actions.length > 0 && (
            <div className={styles.actions} onClick={e => e.stopPropagation()}>
              {actions.map(a => (
                <button key={a} className={styles.actionBtn} onClick={() => handleAction(a)}>{a}</button>
              ))}
              <button className={`${styles.actionBtn} ${styles.actionBtnPrint}`}
                onClick={e => { e.stopPropagation(); setShowSlip(true); }}>
                <Printer size={12} strokeWidth={2} /> Slip
              </button>
              <button className={`${styles.actionBtn} ${styles.actionBtnDoc}`}
                onClick={e => { e.stopPropagation(); setShowDocs(true); }}>
                <Paperclip size={12} strokeWidth={2} /> Docs
              </button>
              <div className={styles.moreWrap} ref={moreRef}>
                <button className={styles.moreBtn}
                  onClick={e => { e.stopPropagation(); setShowMore(v => !v); }} title="More options">
                  <MoreVertical size={14} strokeWidth={2} />
                </button>
                {showMore && (
                  <ul className={styles.moreMenu}>
                    <li onClick={e => { e.stopPropagation(); setShowMore(false); setShowMedDoc(true); }}>Medical Document</li>
                    <li onClick={e => { e.stopPropagation(); setShowMore(false); setShowSlip(true); }}>Print Appointment Slip</li>
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── Completed actions ── */}
          {appt.status === 'completed' && (
            <div className={styles.actions} onClick={e => e.stopPropagation()}>
              <button className={`${styles.actionBtn} ${styles.actionBtnVitals}`}
                onClick={e => { e.stopPropagation(); onOpen('vitals'); }}>
                <Activity size={12} strokeWidth={2} /> Add Vitals
              </button>
              <button className={`${styles.actionBtn} ${styles.actionBtnPrint}`}
                onClick={e => { e.stopPropagation(); onOpen('print'); }}>
                <Printer size={12} strokeWidth={2} /> Rx Print
              </button>
              <button className={`${styles.actionBtn} ${styles.actionBtnPrint}`}
                onClick={e => { e.stopPropagation(); setShowSlip(true); }}>
                <Printer size={12} strokeWidth={2} /> Slip
              </button>
              <button className={`${styles.actionBtn} ${styles.actionBtnDoc}`}
                onClick={e => { e.stopPropagation(); setShowDocs(true); }}>
                <Paperclip size={12} strokeWidth={2} /> Docs
              </button>
              <div className={styles.moreWrap} ref={moreRef}>
                <button className={styles.moreBtn}
                  onClick={e => { e.stopPropagation(); setShowMore(v => !v); }} title="More options">
                  <MoreVertical size={14} strokeWidth={2} />
                </button>
                {showMore && (
                  <ul className={styles.moreMenu}>
                    <li onClick={e => { e.stopPropagation(); setShowMore(false); setShowMedDoc(true); }}>Medical Document</li>
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showDocs && (
        <MedicalDocumentsModal appt={appt} onClose={() => setShowDocs(false)} />
      )}
      {showSlip && (
        <AppointmentSlipModal appt={appt} onClose={() => setShowSlip(false)} />
      )}
      {showMedDoc && (
        <MedicalDocModal appt={appt} user={user} onClose={() => setShowMedDoc(false)} />
      )}
      {showReceipts && (
        <ViewReceiptsModal
          appt={appt}
          receipts={receipts || []}
          onClose={() => setShowReceipts(false)}
          onReceiptsChange={(updated) => setReceipts(updated)}
        />
      )}
      {showTagDialog && (
        <TagDialog appt={appt} clinicTags={clinicTags}
          onClose={() => setShowTagDialog(false)} onSaved={onTagUpdate} />
      )}
      {showEdit && (
        <EditPatientModal appt={appt}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => setAppt(prev => ({ ...prev, ...updated }))} />
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
          onBooked={() => { onStatusChange(appt.id, 'cancelled'); setShowReschedule(false); }}
        />
      )}
    </>
  );
}
