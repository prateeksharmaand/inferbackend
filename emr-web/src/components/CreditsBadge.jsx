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

  const handleClick = () => {
    navigate('/wallet');
  };

  const balance = parseFloat(wallet?.currentBalance || 0);

  return (
    <button
      onClick={handleClick}
      className={styles.badge}
      title="Click to manage credits"
    >
      <div className={styles.badgeContent}>
        <span className={styles.amount}>₹{balance.toFixed(2)}</span>
        <span className={styles.credits}>{Math.floor(balance)} credits</span>
      </div>
    </button>
  );
};
