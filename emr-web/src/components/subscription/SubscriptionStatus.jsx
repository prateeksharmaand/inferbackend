import { useSubscription } from '../context/SubscriptionContext';
import { CreditBalance, SeatUsageBar } from './UsageDisplay';

export function SubscriptionStatus() {
  const { license, loading, isExpired } = useSubscription();

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.skeleton} />
      </div>
    );
  }

  if (!license) {
    return null;
  }

  const daysUntilExpiry = license.daysUntilExpiry;
  const isExpiringSoon = daysUntilExpiry && daysUntilExpiry < 7 && daysUntilExpiry > 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.planInfo}>
          <h3 style={styles.planName}>
            {license.planName || license.plan.toUpperCase()} Plan
          </h3>
          <p style={styles.planStatus}>
            {license.status === 'active' && 'Active'}
            {license.status === 'trial' && 'Trial (7 days)'}
            {license.status === 'expired' && 'Expired'}
            {license.status === 'cancelled' && 'Cancelled'}
          </p>
        </div>
        {isExpired() && (
          <a href="/settings/billing" style={styles.renewButton}>
            Renew Now
          </a>
        )}
        {isExpiringSoon && (
          <span style={styles.expiringWarning}>
            Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={styles.content}>
        {/* Seat Usage */}
        {license.seats && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Seat Usage</h4>
            {Object.entries(license.seats).map(([type, seats]) => (
              <SeatUsageBar key={type} seatType={type} />
            ))}
          </div>
        )}

        {/* AI Credits */}
        {license.aiCreditsRemaining !== undefined && (
          <div style={styles.section}>
            <CreditBalance />
          </div>
        )}

        {/* Subscription Details */}
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Details</h4>
          <div style={styles.details}>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Plan Type:</span>
              <span style={styles.detailValue}>
                {license.billingCycle === 'monthly' ? 'Monthly' : 'Annual'}
              </span>
            </div>
            {license.startedAt && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Started:</span>
                <span style={styles.detailValue}>
                  {new Date(license.startedAt).toLocaleDateString()}
                </span>
              </div>
            )}
            {license.expiresAt && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Expires:</span>
                <span style={styles.detailValue}>
                  {new Date(license.expiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '16px',
  },
  skeleton: {
    height: '200px',
    background: '#f3f4f6',
    borderRadius: '6px',
    animation: 'pulse 2s infinite',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '16px',
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    margin: '0',
    fontSize: '20px',
    fontWeight: '700',
    color: '#1f2937',
  },
  planStatus: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#6b7280',
  },
  renewButton: {
    padding: '8px 16px',
    background: '#2563eb',
    color: '#fff',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
  expiringWarning: {
    padding: '8px 12px',
    background: '#fef3c7',
    color: '#92400e',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  section: {
    paddingBottom: '12px',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  detailLabel: {
    color: '#6b7280',
    fontWeight: '500',
  },
  detailValue: {
    color: '#1f2937',
    fontWeight: '600',
  },
};
