import { useState } from 'react';
import { Settings as SettingsIcon, Hash, Tag, Stethoscope, LayoutList, FlaskConical, Zap, KeyRound, Palette, ShieldCheck, ClipboardList, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import UhidSettings from './settings/UhidSettings';
import CustomAttributes from './settings/CustomAttributes';
import ServicesSettings from './settings/ServicesSettings';
import ClinicalTermsSettings from './settings/ClinicalTermsSettings';
import QueuesSettings from './settings/QueuesSettings';
import LabStaffSettings from './settings/LabStaffSettings';
import SubscriptionSettings from './settings/SubscriptionSettings';
import ChangePassword from './settings/ChangePassword';
import ThemeSettings from './settings/ThemeSettings';
import StaffManagement from './settings/StaffManagement';
import ClinicalTemplateBuilder from './settings/ClinicalTemplateBuilder';
import ClinicWebsiteSettings from './settings/ClinicWebsiteSettings';
import styles from './Settings.module.css';

const ALL_TABS = [
  { key: 'subscription', Icon: Zap,           label: 'Subscription',         adminOnly: false },
  { key: 'staff',        Icon: ShieldCheck,    label: 'Staff & Access',       adminOnly: true  },
  { key: 'queues',       Icon: LayoutList,     label: 'Queues',               adminOnly: false },
  { key: 'labstaff',     Icon: FlaskConical,   label: 'Lab Staff',            adminOnly: false },
  { key: 'uhid',         Icon: Hash,           label: 'UHID Settings',        adminOnly: false },
  { key: 'tags',         Icon: Tag,            label: 'Custom Attributes',    adminOnly: false },
  { key: 'services',     Icon: Stethoscope,    label: 'Services',             adminOnly: false },
  { key: 'templates',    Icon: ClipboardList,  label: 'Clinical Templates',   adminOnly: false },
  { key: 'website',      Icon: Globe,          label: 'Clinic Website',       adminOnly: false },
  { key: 'terms',        Icon: ClipboardList,  label: 'Symptoms & Diagnoses', adminOnly: false },
  { key: 'theme',        Icon: Palette,        label: 'Theme',                adminOnly: false },
  { key: 'password',     Icon: KeyRound,       label: 'Change Password',      adminOnly: false },
];

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const TABS = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  const [tab, setTab] = useState('subscription');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <SettingsIcon size={20} strokeWidth={1.8} className={styles.headerIcon} />
        <div>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.sub}>Manage clinic-wide configuration and custom attribute values.</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map(({ key, Icon, label }) => (
          <button
            key={key}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {tab === 'subscription' && <SubscriptionSettings />}
        {tab === 'staff'        && <StaffManagement />}
        {tab === 'queues'       && <QueuesSettings />}
        {tab === 'labstaff'     && <LabStaffSettings />}
        {tab === 'uhid'         && <UhidSettings />}
        {tab === 'tags'         && <CustomAttributes />}
        {tab === 'services'     && <ServicesSettings />}
        {tab === 'templates'    && <ClinicalTemplateBuilder />}
        {tab === 'website'      && <ClinicWebsiteSettings />}
        {tab === 'terms'        && <ClinicalTermsSettings />}
        {tab === 'theme'        && <ThemeSettings />}
        {tab === 'password'     && <ChangePassword />}
      </div>
    </div>
  );
}
