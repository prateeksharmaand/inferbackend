/**
 * CreditsBadge - Top Navigation Bar Component
 * Shows current credit balance in the header
 * Click to navigate to wallet
 */

import React from 'react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';
import styles from './CreditsBadge.module.css';

export const CreditsBadge = () => {
  const { wallet, loading } = useWallet();
  const navigate = useNavigate();
  const [showTooltip, setShowTooltip] = React.useState(false);

  const handleClick = () => {
    navigate('/wallet');
  };

  const balance = parseFloat(wallet?.currentBalance || 0);

  return (
    <div className={styles.badgeWrapper} onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <button
        onClick={handleClick}
        className={styles.badge}
      >
        <span className={styles.icon}>💰</span>
        <span>{Math.floor(balance)}</span>
      </button>
      {showTooltip && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipContent}>View Credits</div>
          <div className={styles.tooltipArrow} />
        </div>
      )}
    </div>
  );
};
