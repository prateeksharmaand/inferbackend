import { useState } from 'react';
import { Zap } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import UpgradeModal from './UpgradeModal';
import styles from './Banner.module.css';

export default function Banner() {
  const { license, loading, isActive } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const isPro = license?.plan === 'pro' && isActive();

  // Hide banner on Pro plan
  if (isPro || loading) return null;

  const maxPatients  = license?.limits?.maxPatients ?? 100;
  const usedPatients = license?.usage?.patients?.used ?? 0;
  const nearLimit    = maxPatients > 0 && usedPatients >= maxPatients * 0.8;

  return (
    <>
      <div className={`${styles.banner} ${nearLimit ? styles.bannerWarn : ''}`}>
        <span className={styles.text}>
          <Zap size={13} className={styles.icon} strokeWidth={2.5} />
          Welcome to Infer EMR. <strong>{license?.planName || 'Base Plan'}</strong> active
          &nbsp;·&nbsp; {usedPatients}/{maxPatients} patients used
          {nearLimit && <span className={styles.warnChip}> ⚠ Near limit</span>}
          &nbsp;·&nbsp; Upgrade for unlimited access.
        </span>
        <button className={styles.upgrade} onClick={() => setShowUpgrade(true)}>
          <Zap size={11} strokeWidth={2.5} /> Upgrade Now
        </button>
      </div>

      {showUpgrade && (
        <UpgradeModal onClose={() => setShowUpgrade(false)} />
      )}
    </>
  );
}
