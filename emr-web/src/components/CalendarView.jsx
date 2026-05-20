import { format, getDaysInMonth, startOfMonth, getDay, addMonths, subMonths } from 'date-fns';
import styles from './CalendarView.module.css';

const SLOT_OPTIONS = [2, 3, 5, 10, 15, 20];
const START_HOUR   = 8;
const END_HOUR     = 21;
const ROW_H        = 44; // px per slot row

const STATUS_COLOR = {
  booked:     '#3b82f6', checked_in: '#8b5cf6', ongoing:    '#f59e0b',
  completed:  '#16a34a', cancelled:  '#dc2626', parked:     '#64748b',
  no_show:    '#ef4444', follow_up:  '#06b6d4',
};

function parseTime(t) {
  if (!t) return null;
  t = t.trim();
  // 24h "18:10" — from <input type="time">
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  // 12h "6:10 PM"
  const [timePart, meridiem] = t.split(' ');
  if (!meridiem) return null;
  let [h, m] = timePart.split(':').map(Number);
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h * 60 + (m || 0);
}

function fmt12(t) {
  if (!t) return '';
  if (/^\d{1,2}:\d{2}$/.test(t.trim())) {
    let [h, m] = t.split(':').map(Number);
    const mer = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')} ${mer}`;
  }
  return t;
}

function hourLabel(h) {
  if (h === 0)  return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

function slotTimeLabel(absoluteMin) {
  const h = Math.floor(absoluteMin / 60);
  const m = absoluteMin % 60;
  if (m === 0) return hourLabel(h);
  return null; // only label the top of each hour
}

export default function CalendarView({ board, slotDuration, setSlotDuration, selectedDate, setSelectedDate }) {
  const allAppts = [
    ...(board.booked    || []),
    ...(board.my_opd    || []),
    ...(board.completed || []),
  ];

  const startMin   = START_HOUR * 60;
  const totalSlots = Math.ceil((END_HOUR - START_HOUR) * 60 / slotDuration);

  // Mini-calendar
  const year           = selectedDate.getFullYear();
  const month          = selectedDate.getMonth();
  const daysInMonth    = getDaysInMonth(selectedDate);
  const firstDayOfWeek = getDay(startOfMonth(selectedDate));
  const today          = new Date();

  return (
    <div className={styles.root}>
      {/* ── Left ────────────────────────────────────────── */}
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

      {/* ── Right ───────────────────────────────────────── */}
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

        <div className={styles.gridScroll}>
          {/* Slot rows */}
          <div className={styles.grid}>
            {Array.from({ length: totalSlots }, (_, i) => {
              const absMin     = startMin + i * slotDuration;
              const timeLabel  = slotTimeLabel(absMin);
              const isHourLine = absMin % 60 === 0;
              return (
                <div
                  key={i}
                  className={`${styles.slotRow} ${isHourLine ? styles.slotRowHour : ''}`}
                  style={{ height: ROW_H }}
                >
                  <span className={styles.slotTimeLabel}>
                    {timeLabel || ''}
                  </span>
                  <div className={styles.slotCell} />
                </div>
              );
            })}

            {/* Appointment blocks — absolutely positioned over the grid */}
            {allAppts.map(a => {
              const min = parseTime(a.appointment_time);
              if (min === null || min < startMin || min >= END_HOUR * 60) return null;
              const slotIdx = Math.floor((min - startMin) / slotDuration);
              const top     = slotIdx * ROW_H;
              const height  = Math.max(ROW_H - 4, 28);
              const color   = STATUS_COLOR[a.status] || '#3b82f6';
              return (
                <div
                  key={a.id}
                  className={styles.apptBlock}
                  style={{ top: top + 2, height, borderLeftColor: color, background: color + '28' }}
                >
                  <span className={styles.apptDot} style={{ background: color }} />
                  <span className={styles.apptName}>{a.patient_name}</span>
                  {height >= 36 && (
                    <span className={styles.apptTime}>{fmt12(a.appointment_time)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
