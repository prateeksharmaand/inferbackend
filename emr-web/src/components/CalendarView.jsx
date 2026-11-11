import { format, getDaysInMonth, startOfMonth, getDay, addMonths, subMonths } from 'date-fns';
import styles from './CalendarView.module.css';

const SLOT_OPTIONS = [2, 3, 5, 10, 15, 20];
const START_HOUR   = 8;
const END_HOUR     = 21;
const ROW_H        = 44;
const TIME_W       = 72;

const STATUS_COLOR = {
  booked:     '#3b82f6', checked_in: '#8b5cf6', ongoing:    '#f59e0b',
  completed:  '#16a34a', cancelled:  '#dc2626', parked:     '#64748b',
  no_show:    '#ef4444', follow_up:  '#06b6d4',
};

function parseTime(t) {
  if (!t) return null;
  t = String(t).trim();
  // "14:30" or "14:30:00" (PostgreSQL TIME columns come back with seconds)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  const [timePart, meridiem] = t.split(' ');
  if (!meridiem) return null;
  let [h, m] = timePart.split(':').map(Number);
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h * 60 + (m || 0);
}

function fmt12(t) {
  if (!t) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(t).trim())) {
    let [h, m] = t.split(':').map(Number);
    const mer = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')} ${mer}`;
  }
  return t;
}

function hourLabel(h) {
  if (h === 12) return '12:00 PM';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

export default function CalendarView({ board, slotDuration, setSlotDuration, selectedDate, setSelectedDate }) {
  const allAppts = [
    ...(board.booked    || []),
    ...(board.my_opd    || []),
    ...(board.completed || []),
  ];

  // Where an appointment sits on the day: its booked time, else (walk-ins) its check-in time
  const minuteOf = a => {
    const booked = parseTime(a.appointment_time);
    if (booked !== null) return { min: booked, label: fmt12(a.appointment_time) };
    const ts = a.checked_in_at || a.created_at;
    if (!ts) return { min: null, label: '' };
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return { min: null, label: '' };
    return { min: d.getHours() * 60 + d.getMinutes(), label: `Walk-in ${format(d, 'h:mm a')}` };
  };
  const startMin   = START_HOUR * 60;
  const offGrid = allAppts.filter(a => { const { min } = minuteOf(a); return min === null || min < START_HOUR * 60 || min >= END_HOUR * 60; });
  const totalSlots = Math.ceil((END_HOUR - START_HOUR) * 60 / slotDuration);

  const year           = selectedDate.getFullYear();
  const month          = selectedDate.getMonth();
  const daysInMonth    = getDaysInMonth(selectedDate);
  const firstDayOfWeek = getDay(startOfMonth(selectedDate));
  const today          = new Date();

  return (
    <div className={styles.root}>

      {/* ── Left: mini-calendar ───────────────────────────── */}
      <div className={styles.left}>
        <div className={styles.miniHeader}>
          <button className={styles.navBtn} onClick={() => setSelectedDate(subMonths(selectedDate, 1))}>‹</button>
          <span>{format(selectedDate, 'MMMM yyyy')}</span>
          <button className={styles.navBtn} onClick={() => setSelectedDate(addMonths(selectedDate, 1))}>›</button>
        </div>

        <div className={styles.miniGrid}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <span key={d} className={styles.dow}>{d}</span>
          ))}
          {Array.from({ length: firstDayOfWeek }, (_, i) => <span key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const isToday    = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
            const isSelected = selectedDate.getDate() === d && selectedDate.getMonth() === month;
            return (
              <button
                key={d}
                className={[styles.dayBtn, isToday ? styles.dayToday : '', isSelected ? styles.daySelected : ''].join(' ')}
                onClick={() => setSelectedDate(new Date(year, month, d))}
              >
                {d}
              </button>
            );
          })}
        </div>

        <label className={styles.freeSlots}>
          <span>Free slots only</span>
          <span className={styles.toggle} />
        </label>
      </div>

      {/* ── Right: schedule ───────────────────────────────── */}
      <div className={styles.right}>
        <div className={styles.slotBar}>
          <span className={styles.slotLabel}>Slot duration:</span>
          {SLOT_OPTIONS.map(s => (
            <button
              key={s}
              className={`${styles.slotBtn} ${slotDuration === s ? styles.slotBtnActive : ''}`}
              onClick={() => setSlotDuration(s)}
            >
              {s} mins
            </button>
          ))}
        </div>

        {offGrid.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border)', fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-2)' }}>Not on the schedule ({offGrid.length}):</span>
            {offGrid.map(a => {
              const color = STATUS_COLOR[a.status] || '#3b82f6';
              const { label } = minuteOf(a);
              return (
                <span key={a.id} style={{ border: `1px solid ${color}55`, background: color + '18', borderRadius: 999, padding: '3px 10px' }}>
                  {a.patient_name}{label ? ` · ${label}` : ' · no time'} · <span style={{ color }}>{String(a.status || '').replace('_', ' ')}</span>
                </span>
              );
            })}
          </div>
        )}
        <div className={styles.gridScroll}>
          {/* One container that everything is positioned inside */}
          <div className={styles.gridContainer}>

            {/* Slot rows (time column + grid cell) */}
            {Array.from({ length: totalSlots }, (_, i) => {
              const absMin     = startMin + i * slotDuration;
              const isHourLine = absMin % 60 === 0;
              const label      = isHourLine ? hourLabel(Math.floor(absMin / 60)) : '';
              return (
                <div key={i} className={styles.slotRow} style={{ height: ROW_H }}>
                  <div className={styles.timeCol}>
                    {label && <span className={styles.timeLabel}>{label}</span>}
                  </div>
                  <div className={`${styles.cellCol} ${isHourLine ? styles.cellHour : ''}`} />
                </div>
              );
            })}

            {/* Appointment blocks — positioned over the cell column */}
            {allAppts.map(a => {
              const { min, label: timeLabel } = minuteOf(a);
              if (min === null || min < startMin || min >= END_HOUR * 60) return null;
              const slotIdx = Math.floor((min - startMin) / slotDuration);
              const top     = slotIdx * ROW_H + 2;
              const height  = ROW_H - 4;
              const color   = STATUS_COLOR[a.status] || '#3b82f6';
              return (
                <div
                  key={a.id}
                  className={styles.apptBlock}
                  style={{
                    top,
                    height,
                    left: TIME_W,
                    right: 12,
                    borderLeftColor: color,
                    background: color + '22',
                  }}
                >
                  <span className={styles.apptDot} style={{ background: color }} />
                  <span className={styles.apptName}>{a.patient_name}</span>
                  <span className={styles.apptTime}>{timeLabel}</span>
                  <span className={styles.apptStatus} style={{ color }}>
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
              );
            })}

          </div>
        </div>
      </div>
    </div>
  );
}
