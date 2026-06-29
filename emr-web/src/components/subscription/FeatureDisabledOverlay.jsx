import { useSubscription } from '../context/SubscriptionContext';

export function FeatureDisabledOverlay({ featureKey, children, showOverlay = true }) {
  const { hasFeature, isActive, getUpgradeSuggestions } = useSubscription();

  const isAvailable = isActive() && hasFeature(featureKey);
  const suggestions = getUpgradeSuggestions(featureKey);

  if (isAvailable) {
    return children;
  }

  if (!showOverlay) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.overlay} />
      <div style={styles.message}>
        <div style={styles.icon}>🔒</div>
        <h3 style={styles.title}>Feature Not Available</h3>
        <p style={styles.description}>
          {suggestions[0]?.message || 'This feature is not available on your current plan.'}
        </p>
        {suggestions[0]?.type === 'plan' && (
          <a href="/settings/billing" style={styles.button}>
            Upgrade Plan
          </a>
        )}
        {suggestions[0]?.type === 'credits' && (
          <a href="/settings/billing" style={styles.button}>
            Add Credits
          </a>
        )}
        {suggestions[0]?.type === 'seat' && (
          <a href="/settings/seats" style={styles.button}>
            Manage Seats
          </a>
        )}
      </div>
    </div>
  );
}

export function DisableFeatureIfUnavailable({
  featureKey,
  children,
  disabled = false,
}) {
  const { hasFeature, isActive } = useSubscription();

  const isAvailable = isActive() && hasFeature(featureKey);
  const isDisabled = disabled || !isAvailable;

  return (
    <div
      style={{
        ...children?.props?.style,
        opacity: isDisabled ? 0.5 : 1,
        pointerEvents: isDisabled ? 'none' : 'auto',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
      }}
      title={isDisabled ? `Feature not available: ${featureKey}` : ''}
    >
      {children}
      {isDisabled && (
        <div style={styles.badge}>
          Upgrade to use
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(2px)',
    borderRadius: '8px',
  },
  message: {
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    padding: '20px',
  },
  icon: {
    fontSize: '32px',
    marginBottom: '12px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
  },
  description: {
    margin: '0 0 16px 0',
    fontSize: '14px',
    color: '#6b7280',
  },
  button: {
    display: 'inline-block',
    padding: '8px 16px',
    background: '#2563eb',
    color: '#fff',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background 0.2s',
  },
  badge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: '#fbbf24',
    color: '#78350f',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
  },
};
