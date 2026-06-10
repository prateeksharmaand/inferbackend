import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Smartphone, Download, Activity, Heart, Pill,
  CalendarCheck, FileText, Bell, UserCircle, TrendingUp
} from 'lucide-react';
import styles from './PHR.module.css';

const FEATURES = [
  {
    Icon: Activity,
    title: 'Vitals & Health Metrics',
    desc: 'Track blood pressure, glucose, SpO₂, weight and other LOINC-coded vitals over time.',
  },
  {
    Icon: Heart,
    title: 'Health Summary',
    desc: 'Personal health timeline including diagnoses, allergies, immunisations and chronic conditions.',
  },
  {
    Icon: Pill,
    title: 'Medications & Prescriptions',
    desc: 'View current and past prescriptions issued by your doctor through Infer EMR.',
  },
  {
    Icon: CalendarCheck,
    title: 'Appointments',
    desc: 'Book, reschedule or cancel appointments and receive reminders directly on the app.',
  },
  {
    Icon: FileText,
    title: 'Lab Reports',
    desc: 'Access uploaded lab results and view trends across multiple tests over time.',
  },
  {
    Icon: TrendingUp,
    title: 'Health Insights',
    desc: 'AI-powered insights and personalised health tips based on your health data.',
  },
  {
    Icon: Bell,
    title: 'Reminders & Notifications',
    desc: 'Medication reminders, follow-up alerts and health goal nudges.',
  },
  {
    Icon: UserCircle,
    title: 'Patient Profile',
    desc: 'Manage your personal health profile including ABHA integration.',
  },
];

export default function PHR() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/')}>
        <ArrowLeft size={16} strokeWidth={2} /> Home
      </button>

      <div className={styles.hero}>
        <div className={styles.heroIcon}>
          <Smartphone size={36} strokeWidth={1.5} />
        </div>
        <div>
          <h1 className={styles.heroTitle}>Infer PHR</h1>
          <p className={styles.heroSub}>Personal Health Records — Patient App</p>
        </div>
        <a
          href="https://play.google.com/store"
          target="_blank"
          rel="noreferrer"
          className={styles.downloadBtn}
        >
          <Download size={15} strokeWidth={2} /> Download App
        </a>
      </div>

      <p className={styles.intro}>
        Infer PHR gives patients a complete view of their health — vitals, prescriptions,
        lab reports and appointments — all in one place, synced with their clinic's EMR.
      </p>

      <h2 className={styles.sectionTitle}>Features</h2>
      <div className={styles.grid}>
        {FEATURES.map(({ Icon, title, desc }) => (
          <div key={title} className={styles.card}>
            <div className={styles.cardIcon}>
              <Icon size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>{title}</h3>
              <p className={styles.cardDesc}>{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
