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

  if (loading || !wallet) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
        <span className="text-sm">...</span>
      </div>
    );
  }

  const balance = parseFloat(wallet.currentBalance || 0);
  const isLowBalance = balance < 50;

  return (
    <div
      onClick={handleClick}
      className={`
        flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer
        transition-colors duration-200
        ${
          isLowBalance
            ? 'bg-red-50 hover:bg-red-100 border border-red-200'
            : 'bg-gray-50 hover:bg-blue-50 border border-gray-200'
        }
      `}
      title="Click to manage credits"
    >
      <div className="text-right">
        <div className={`text-sm font-bold ${isLowBalance ? 'text-red-700' : 'text-gray-900'}`}>
          ₹{balance.toFixed(2)}
        </div>
        <div className={`text-xs ${isLowBalance ? 'text-red-600' : 'text-gray-500'}`}>
          {Math.floor(balance)} credits
        </div>
      </div>
      <div className="text-2xl">💳</div>
    </div>
  );
};
