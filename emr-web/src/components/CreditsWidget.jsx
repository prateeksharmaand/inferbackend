/**
 * CreditsWidget - Sidebar Component
 * Shows wallet summary with low balance alert
 */

import React from 'react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';

export const CreditsWidget = () => {
  const { summary, loading } = useWallet();
  const navigate = useNavigate();

  const balance = parseFloat(summary?.currentBalance || 0);
  const monthUsed = parseFloat(summary?.monthCreditsUsed || 0);
  const daysRemaining = summary?.daysRemaining > 0 ? summary?.daysRemaining : null;
  const isLowBalance = balance < 100;
  const isCritical = balance < 50;

  return (
    <div
      className={`
        m-3 p-4 rounded-lg border-2 transition-colors
        ${
          isCritical
            ? 'bg-red-50 border-red-300'
            : isLowBalance
            ? 'bg-yellow-50 border-yellow-300'
            : 'bg-blue-50 border-blue-200'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">
          Your Credits
        </div>
        <div className="text-2xl">💳</div>
      </div>

      {/* Main Balance */}
      <div className="mb-3">
        <div className={`text-3xl font-bold ${
          isCritical ? 'text-red-700' : isLowBalance ? 'text-yellow-700' : 'text-gray-900'
        }`}>
          {balance.toFixed(2)}
        </div>
        <div className="text-xs text-gray-600">
          {Math.floor(balance)} credits available
        </div>
      </div>

      {/* Alert Banner */}
      {(isCritical || isLowBalance) && (
        <div className={`
          text-xs p-2 rounded mb-3 border
          ${
            isCritical
              ? 'bg-red-100 text-red-800 border-red-300'
              : 'bg-yellow-100 text-yellow-800 border-yellow-300'
          }
        `}>
          {isCritical ? '🚨' : '⚠️'} {isCritical ? 'Critical' : 'Low'} balance!
          Only {Math.floor(balance)} credits left.
        </div>
      )}

      {/* Stats */}
      <div className="space-y-2 mb-4 text-xs text-gray-700 border-t border-gray-300 pt-3">
        <div className="flex justify-between">
          <span className="text-gray-600">This month:</span>
          <span className="font-semibold">₹{monthUsed.toFixed(2)}</span>
        </div>
        {daysRemaining && (
          <div className="flex justify-between">
            <span className="text-gray-600">Days left:</span>
            <span className="font-semibold">~{daysRemaining} days</span>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="space-y-2">
        <button
          onClick={() => navigate('/wallet/recharge')}
          className={`
            w-full py-2 px-3 rounded font-semibold text-white text-sm
            transition-colors duration-200
            ${
              isCritical
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                : isLowBalance
                ? 'bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }
          `}
        >
          {isCritical || isLowBalance ? '⚡ Recharge Now!' : 'Recharge'}
        </button>

        <button
          onClick={() => navigate('/wallet')}
          className="
            w-full py-2 px-3 rounded font-semibold text-gray-700 text-sm
            border border-gray-300 hover:bg-gray-100
            transition-colors duration-200 active:bg-gray-200
          "
        >
          View Details
        </button>
      </div>
    </div>
  );
};
