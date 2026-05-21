import { useState } from 'react';
import { Settings as SettingsIcon, Hash, Tag, Stethoscope } from 'lucide-react';
import UhidSettings from './settings/UhidSettings';
import CustomAttributes from './settings/CustomAttributes';
import ServicesSettings from './settings/ServicesSettings';
import styles from './Settings.module.css';

const TABS = [
  { key: 'uhid',     Icon: Hash,        label: 'UHID Settings' },
  { key: 'tags',     Icon: Tag,         label: 'Custom Attributes' },
  { key: 'services', Icon: Stethoscope, label: 'Services' },
];

export default function Settings() {
  const [tab, setTab] = useState('uhid');

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
        {tab === 'uhid'     && <UhidSettings />}
        {tab === 'tags'     && <CustomAttributes />}
        {tab === 'services' && <ServicesSettings />}
      </div>
    </div>
  );
}
