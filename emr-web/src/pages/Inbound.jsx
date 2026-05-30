import { useState } from 'react';
import { MessageSquare, Calendar, BarChart2 } from 'lucide-react';
import InboundConversations from './InboundConversations';
import InboundAvailability  from './InboundAvailability';
import InboundAnalytics     from './InboundAnalytics';
import styles from './Inbound.module.css';

const TABS = [
  { key: 'conversations', Icon: MessageSquare, label: 'Conversations' },
  { key: 'availability',  Icon: Calendar,      label: 'Availability & Channels' },
  { key: 'analytics',     Icon: BarChart2,     label: 'Analytics' },
];

export default function Inbound() {
  const [tab, setTab] = useState('conversations');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Inbound Appointments</h1>
          <p className={styles.sub}>AI-powered booking via SMS, WhatsApp, IVR & chat — powered by Twilio + Gemini</p>
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

      <div className={styles.body}>
        {tab === 'conversations' && <InboundConversations />}
        {tab === 'availability'  && <InboundAvailability />}
        {tab === 'analytics'     && <InboundAnalytics />}
      </div>
    </div>
  );
}
