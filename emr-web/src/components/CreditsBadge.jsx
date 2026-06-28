/**
 * CreditsBadge - Top Navigation Bar Component
 * Shows current credit balance in the header
 * Click to navigate to wallet
 */

import React from 'react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';

export const CreditsBadge = () => {
  const { wallet, loading } = useWallet();
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/wallet');
  };

  const balance = parseFloat(wallet?.currentBalance || 0);

  return (
    <div
      onClick={handleClick}
      className="
        flex items-center gap-2 px-3 py-2 rounded-full cursor-pointer
        transition-all duration-200 bg-teal-500 hover:bg-teal-600
        text-white shadow-sm
      "
      title="Click to manage credits"
    >
      <div className="text-right">
        <div className="text-sm font-bold leading-tight">
          ₹{balance.toFixed(2)}
        </div>
        <div className="text-xs opacity-90 leading-tight">
          {Math.floor(balance)} credits
        </div>
      </div>
    </div>
  );
};
