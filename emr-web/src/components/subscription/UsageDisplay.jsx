import { useSubscription } from '../context/SubscriptionContext';

export function SeatUsageBar({ seatType = 'premium' }) {
  const { license } = useSubscription();

  if (!license?.seats) {
    return null;
  }

  const seats = license.seats[seatType];
  if (!seats) {
    return null;
  }

  const percentage = seats.purchased > 0
    ? Math.round((seats.used / seats.purchased) * 100)
    : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>
          {seatType.charAt(0).toUpperCase() + seatType.slice(1)} Seats
        </span>
        <span style={styles.count}>
          {seats.used} / {seats.purchased}
        </span>
      </div>
      <div style={styles.barContainer}>
        <div
          style={{
            ...styles.bar,
            width: `${percentage}%`,
            backgroundColor:
              percentage > 90
                ? '#ef4444'
                : percentage > 70
                  ? '#f59e0b'
                  : '#10b981',
          }}
        />
      </div>
      <div style={styles.footer}>
        {seats.available} available
      </div>
    </div>
  );
}

export function CreditBalance() {
  const { license } = useSubscription();

  if (license?.aiCreditsRemaining === undefined) {
    return null;
  }

  const isLow = license.aiCreditsRemaining < 10;

  return (
    <div style={styles.creditContainer}>
      <div style={styles.creditLabel}>AI Credits</div>
      <div
        style={{
          ...styles.creditValue,
          color: isLow ? '#ef4444' : '#10b981',
        }}
      >
        {license.aiCreditsRemaining}
      </div>
      {isLow && (
        <a href="/settings/billing" style={styles.creditLink}>
          Add credits
        </a>
      )}
    </div>
  );
}

export function UsageStats({ resourceType }) {
  const { license } = useSubscription();

  const usage = license?.usage?.[resourceType];
  if (!usage) {
    return null;
  }

  const percentage = usage.limit > 0
    ? Math.round((usage.used / usage.limit) * 100)
    : 0;

  return (
    <div style={styles.statContainer}>
      <div style={styles.statHeader}>
        <span style={styles.statLabel}>
          {resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}
        </span>
        <span style={styles.statCount}>
          {usage.used} / {usage.limit || '∞'}
        </span>
      </div>
      {usage.limit > 0 && (
        <div style={styles.barContainer}>
          <div
            style={{
              ...styles.bar,
              width: `${percentage}%`,
              backgroundColor:
                percentage > 90
                  ? '#ef4444'
                  : percentage > 70
                    ? '#f59e0b'
                    : '#10b981',
            }}
          />
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    marginBottom: '16px',
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  count: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
  },
  barContainer: {
    width: '100%',
    height: '8px',
    background: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '6px',
  },
  bar: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  footer: {
    fontSize: '12px',
    color: '#6b7280',
  },

  creditContainer: {
    padding: '12px',
    background: '#f0fdf4',
    borderRadius: '6px',
    border: '1px solid #86efac',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  creditLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#16a34a',
  },
  creditValue: {
    fontSize: '24px',
    fontWeight: '700',
  },
  creditLink: {
    fontSize: '12px',
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: '500',
  },

  statContainer: {
    marginBottom: '12px',
  },
  statHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  statLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#374151',
  },
  statCount: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#1f2937',
  },
};
