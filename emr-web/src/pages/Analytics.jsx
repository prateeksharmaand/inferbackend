import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { BarChart3, Users, TrendingUp, Pill, FileText } from 'lucide-react';
import AppointmentDashboard from './analytics/AppointmentDashboard';
import PatientsDashboard from './analytics/PatientsDashboard';
import RealtimeReport from './analytics/RealtimeReport';
import PrescriptionAnalytics from './analytics/PrescriptionAnalytics';
import Form25Dashboard from './Form25Dashboard';
import styles from './Analytics.module.css';

const TABS = [
  { id: 'appointments', Icon: BarChart3,  label: 'Appointment Dashboard' },
  { id: 'patients',     Icon: Users,      label: 'Patients Dashboard' },
  { id: 'realtime',     Icon: TrendingUp, label: 'Real-Time Report' },
  { id: 'prescriptions',Icon: Pill,       label: 'Prescription Analytics' },
  { id: 'form25',       Icon: FileText,   label: 'Form 25' },
];

export default function Analytics() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('appointments');
  const [doctors, setDoctors] = useState([]);

  useEffect(() => {
    api.get('/auth/doctors').then(setDoctors).catch(() => {});
  }, []);

  return (
    <div className={styles.page}>
      {/* Tabs */}
      <div className={styles.tabBar}>
        {TABS.map(({ id, Icon, label }) => (
          <button
            key={id}
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(id)}
            title={label}
          >
            <Icon size={16} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'appointments'  && <AppointmentDashboard doctors={doctors} />}
        {activeTab === 'patients'      && <PatientsDashboard />}
        {activeTab === 'realtime'      && <RealtimeReport doctors={doctors} />}
        {activeTab === 'prescriptions' && <PrescriptionAnalytics />}
        {activeTab === 'form25'        && <Form25Dashboard />}
      </div>
    </div>
  );
}
