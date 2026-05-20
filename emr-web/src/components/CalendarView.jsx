import { format, getDaysInMonth, startOfMonth, getDay, addMonths, subMonths } from 'date-fns';
import styles from './CalendarView.module.css';

const SLOT_OPTIONS = [2, 3, 5, 10, 15, 20];
const START_HOUR = 8;
const END_HOUR = 21;
const PX_PER_MIN = 2.5;

const STATUS_COLOR = {
  booked: '#3b82f6', checked_in: '#8b5cf6', ongoing: '#f59e0b',
  completed: '#16a34a', cancelled: '#dc2626', parked: '#64748b',
  no_show: '#ef4444', follow_up: '#06b6d4',
};

function parseTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(' ');
  if (parts.length < 2) return null;
  const [h, m] = parts[0].split(':').map(Number);
  let hour = h;
  if (parts[1] === 'PM' && h !== 12) hour += 12;
  if (parts[1] === 'AM' && h === 12) hour = 0;
  return hour * 60 + (m || 0);
}

function hourLabel(h) {
  if (h === 0 || h === 24) return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

export default function CalendarView({ board, slotDuration, setSlotDuration, selectedDate, setSelectedDate }) {
  const allAppts = [
    ...(board.booked    || []),
    ...(board.my_opd    || []),
    ...(board.completed || []),
  ];

  const startMin   = START_HOUR * 60;
  const totalMin   = (END_HOUR - START_HOUR) * 60;
  const totalH     = totalMin * PX_PER_MIN;
  const hours      = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  // Mini-calendar helpers
  const year           = selectedDate.getFullYear();
  const month          = selectedDate.getMonth();
  const daysInMonth    = getDaysInMonth(selectedDate);
  const firstDayOfWeek = getDay(startOfMonth(selectedDate)); // 0 = Sun
  const today          = new Date();

  return (
    <div className={styles.root}>
      {/* ── Left: mini-calendar ─────────────────────────────── */}
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
                className={[
                  styles.dayBtn,
                  isToday    ? styles.dayToday    : '',
                  isSelected ? styles.daySelected : '',
                ].join(' ')}
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

      {/* ── Right: time grid ────────────────────────────────── */}
      <div className={styles.right}>
        {/* Slot duration bar */}
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

        {/* Scrollable grid */}
        <div className={styles.gridScroll}>
          <div className={styles.grid} style={{ height: totalH }}>
            {hours.map(h => (
              <div
                key={h}
                className={styles.hourRow}
                style={{ top: (h * 60 - startMin) * PX_PER_MIN }}
              >
                <span className={styles.hourLabel}>{hourLabel(h)}</span>
                <div className={styles.hourLine} />
              </div>
            ))}

            {allAppts.map(a => {
              const min = parseTime(a.appointment_time);
              if (min === null || min < startMin || min >= END_HOUR * 60) return null;
              const top    = (min - startMin) * PX_PER_MIN;
              const height = Math.max(slotDuration * PX_PER_MIN, 28);
              const color  = STATUS_COLOR[a.status] || '#3b82f6';
              return (
                <div
                  key={a.id}
                  className={styles.apptBlock}
                  style={{ top, height, borderLeftColor: color, background: color + '18' }}
                >
                  <span className={styles.apptDot} style={{ background: color }} />
                  <span className={styles.apptName}>{a.patient_name}</span>
                  {height >= 36 && (
                    <span className={styles.apptTime}>{a.appointment_time}</span>
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
