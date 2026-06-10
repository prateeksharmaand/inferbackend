import { useNavigate } from 'react-router-dom';
import { Monitor, Smartphone, ArrowRight, Activity, Users, ClipboardList, BarChart2 } from 'lucide-react';
import styles from './Home.module.css';

const EMR_HIGHLIGHTS = [
  { Icon: ClipboardList, label: 'Queue & OPD' },
  { Icon: Users,         label: 'Patient Records' },
  { Icon: Activity,      label: 'Voice AI & Scribe' },
  { Icon: BarChart2,     label: 'Analytics' },
];

const PHR_HIGHLIGHTS = [
  { Icon: Activity,   label: 'Health Records' },
  { Icon: Users,      label: 'Patient Profile' },
  { Icon: ClipboardList, label: 'Appointments' },
  { Icon: BarChart2,  label: 'Vitals & Trends' },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Infer Care Platform</h1>
        <p className={styles.subtitle}>Choose a product to get started</p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Products</h2>

        <div className={styles.grid}>
          {/* Infer EMR Card */}
          <button className={`${styles.card} ${styles.emrCard}`} onClick={() => navigate('/queue')}>
            <div className={styles.cardHeader}>
              <div className={`${styles.cardIcon} ${styles.emrIcon}`}>
                <Monitor size={28} strokeWidth={1.6} />
              </div>
              <div className={styles.cardBadge}>Clinic</div>
            </div>
            <h3 className={styles.cardTitle}>Infer EMR</h3>
            <p className={styles.cardDesc}>
              Complete clinic & hospital management — queues, prescriptions, lab, analytics and more.
            </p>
            <div className={styles.highlights}>
              {EMR_HIGHLIGHTS.map(({ Icon, label }) => (
                <span key={label} className={styles.chip}>
                  <Icon size={12} strokeWidth={2} /> {label}
                </span>
              ))}
            </div>
            <div className={styles.cardFooter}>
              Open EMR <ArrowRight size={14} strokeWidth={2} />
            </div>
          </button>

          {/* Infer PHR Card */}
          <button className={`${styles.card} ${styles.phrCard}`} onClick={() => navigate('/phr')}>
            <div className={styles.cardHeader}>
              <div className={`${styles.cardIcon} ${styles.phrIcon}`}>
                <Smartphone size={28} strokeWidth={1.6} />
              </div>
              <div className={`${styles.cardBadge} ${styles.phrBadge}`}>Patient</div>
            </div>
            <h3 className={styles.cardTitle}>Infer PHR</h3>
            <p className={styles.cardDesc}>
              Personal health records for patients — vitals, appointments, prescriptions and health insights.
            </p>
            <div className={styles.highlights}>
              {PHR_HIGHLIGHTS.map(({ Icon, label }) => (
                <span key={label} className={`${styles.chip} ${styles.phrChip}`}>
                  <Icon size={12} strokeWidth={2} /> {label}
                </span>
              ))}
            </div>
            <div className={`${styles.cardFooter} ${styles.phrFooter}`}>
              Open PHR <ArrowRight size={14} strokeWidth={2} />
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
