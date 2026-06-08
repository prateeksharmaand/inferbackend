import { useState } from 'react';
import { Zap, Check, Users, Calendar, FileText, HardDrive, TrendingUp } from 'lucide-react';
import { useSubscription } from '../../context/SubscriptionContext';
import UpgradeModal from '../../components/UpgradeModal';
import styles from './SubscriptionSettings.module.css';

function UsageBar({ label, icon: Icon, used, limit }) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const warn = pct >= 80;
  const full = pct >= 100;

  return (
    <div className={styles.usageItem}>
      <div className={styles.usageTop}>
        <div className={styles.usageLabel}>
          <Icon size={13} strokeWidth={2} />
          {label}
        </div>
        <div className={`${styles.usageCount} ${full ? styles.usageCountFull : warn ? styles.usageCountWarn : ''}`}>
          {unlimited ? `${used} / ∞` : `${used} / ${limit}`}
        </div>
      </div>
      {!unlimited && (
        <div className={styles.barBg}>
          <div
            className={`${styles.barFill} ${full ? styles.barFull : warn ? styles.barWarn : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function SubscriptionSettings() {
  const { sub, usage, isPro, loading } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (loading) return <div className={styles.loading}>Loading subscription…</div>;

  const expiresAt = sub?.expires_at ? new Date(sub.expires_at) : null;
  const daysLeft  = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className={styles.page}>
      {/* Current plan card */}
      <div className={`${styles.planCard} ${isPro ? styles.planCardPro : ''}`}>
        <div className={styles.planCardLeft}>
          {isPro && <Zap size={20} className={styles.proIcon} />}
          <div>
            <div className={styles.planName}>{sub?.display_name || 'Base Plan'}</div>
            <div className={styles.planTagline}>{sub?.tagline}</div>
            {expiresAt && (
              <div className={`${styles.expiry} ${daysLeft <= 30 ? styles.expiryWarn : ''}`}>
                {daysLeft === 0 ? 'Expires today' : `Valid till ${expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                {daysLeft <= 30 && daysLeft > 0 ? ` (${daysLeft} days left)` : ''}
              </div>
            )}
          </div>
        </div>
        {!isPro && (
          <button className={styles.upgradeBtn} onClick={() => setShowUpgrade(true)}>
            <Zap size={14} strokeWidth={2} /> Upgrade to Pro
          </button>
        )}
        {isPro && (
          <div className={styles.proBadge}><Check size={12} strokeWidth={2.5} /> Active</div>
        )}
      </div>

      {/* Usage */}
      {usage && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Usage</div>
          <div className={styles.usageGrid}>
            <UsageBar label="Patients"      icon={Users}     used={usage.patients}      limit={sub?.max_patients      || 0} />
            <UsageBar label="Appointments"  icon={Calendar}  used={usage.appointments}  limit={sub?.max_appointments  || 0} />
            <UsageBar label="Prescriptions" icon={FileText}  used={usage.prescriptions} limit={sub?.max_prescriptions || 0} />
          </div>
        </div>
      )}

      {/* Feature comparison */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Plan comparison</div>
        <div className={styles.comparison}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Feature</th>
                <th className={styles.colBase}>Base</th>
                <th className={styles.colPro}>Pro</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Users',               '1',       '∞'],
                ['Patients',            '100',     '∞'],
                ['Appointments',        '150',     '∞'],
                ['Prescriptions',       '150',     '∞'],
                ['Data storage',        '250 MB',  '∞'],
                ['AI DocAssist',        '—',       '✓'],
                ['Medical Scribe (AI)', '—',       '✓'],
                ['Vitals graphs',       '—',       '✓'],
                ['QR prescription',     '—',       '✓'],
                ['Analytics',           '—',       '✓'],
              ].map(([f, b, p]) => (
                <tr key={f}>
                  <td>{f}</td>
                  <td className={styles.colBase}>{b}</td>
                  <td className={styles.colPro}>{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isPro && (
        <button className={styles.upgradeBtnLg} onClick={() => setShowUpgrade(true)}>
          <Zap size={16} strokeWidth={2} /> Upgrade to Infer Pro — starting ₹400/seat/month
        </button>
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
