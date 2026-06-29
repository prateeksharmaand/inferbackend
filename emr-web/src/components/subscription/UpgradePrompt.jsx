import { useSubscription } from '../context/SubscriptionContext';
import { useState } from 'react';

export function UpgradePrompt({ featureKey, onClose }) {
  const { getUpgradeSuggestions } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  const suggestions = getUpgradeSuggestions(featureKey);

  if (!suggestions.length || dismissed) {
    return null;
  }

  return (
    <div className="upgrade-prompt" style={styles.container}>
      <button
        className="close-btn"
        onClick={() => {
          setDismissed(true);
          onClose?.();
        }}
        style={styles.closeBtn}
      >
        ✕
      </button>

      <h4 style={styles.title}>Feature Not Available</h4>

      {suggestions.map((suggestion, idx) => (
        <div key={idx} style={styles.suggestion}>
          {suggestion.type === 'plan' && (
            <>
              <p>
                {suggestion.message}
              </p>
              <a
                href="/settings/billing"
                style={styles.link}
              >
                Upgrade to {suggestion.to.toUpperCase()} →
              </a>
            </>
          )}

          {suggestion.type === 'seat' && (
            <>
              <p>
                {suggestion.message}
              </p>
              <p style={styles.details}>
                Your current seat type: {suggestion.current}
              </p>
              <a
                href="/settings/seats"
                style={styles.link}
              >
                Manage Seats →
              </a>
            </>
          )}

          {suggestion.type === 'credits' && (
            <>
              <p>{suggestion.message}</p>
              <a
                href="/settings/billing"
                style={styles.link}
              >
                Add Credits →
              </a>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    maxWidth: '350px',
    zIndex: 1000,
    fontFamily: 'system-ui, sans-serif',
  },
  closeBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#999',
  },
  title: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
  },
  suggestion: {
    marginBottom: '12px',
  },
  details: {
    margin: '8px 0',
    fontSize: '12px',
    color: '#666',
  },
  link: {
    display: 'inline-block',
    marginTop: '8px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
};
