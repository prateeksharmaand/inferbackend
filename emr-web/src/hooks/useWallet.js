/**
 * useWallet - Custom React hook for wallet operations
 * Manages balance, pricing, and credit deductions
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

export const useWallet = () => {
  const [wallet, setWallet] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch wallet details
  const fetchWallet = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/wallet');
      if (data && data.wallet) {
        setWallet(data.wallet);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching wallet:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch wallet summary (stats)
  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.get('/wallet/summary');
      if (data && data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, []);

  // Check if balance is sufficient for a service
  const checkBalance = useCallback(async (serviceType, quantity = 1) => {
    try {
      const data = await api.post('/wallet/check-balance', { serviceType, quantity });
      return {
        hasBalance: data.hasBalance,
        currentBalance: data.currentBalance,
        requiredCredits: data.requiredCredits,
        pricing: data.pricing
      };
    } catch (err) {
      console.error('Error checking balance:', err);
      if (err.status === 402) {
        return {
          hasBalance: false,
          currentBalance: err.detail?.currentBalance || 0,
          requiredCredits: err.detail?.requiredCredits || 0,
          pricing: err.detail?.pricing
        };
      }
      return { hasBalance: false, error: err.message };
    }
  }, []);

  // Deduct credits for a service
  const deductCredits = useCallback(
    async (serviceType, quantity = 1, referenceId = null, metadata = null) => {
      try {
        const data = await api.post('/wallet/deduct', {
          serviceType,
          quantity,
          referenceId: referenceId || `${serviceType}_${Date.now()}`,
          metadata
        });

        // Refresh wallet after deduction
        await fetchWallet();
        return { success: true, transactionId: data.transactionId };
      } catch (err) {
        console.error('Error deducting credits:', err);
        throw err;
      }
    },
    [fetchWallet]
  );

  // Initialize wallet on mount and set up auto-refresh
  useEffect(() => {
    if (token) {
      fetchWallet();
      fetchSummary();

      // Auto-refresh every 30 seconds
      const interval = setInterval(() => {
        fetchWallet();
        fetchSummary();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [token, fetchWallet, fetchSummary]);

  return {
    wallet,
    summary,
    loading,
    error,
    fetchWallet,
    fetchSummary,
    checkBalance,
    deductCredits
  };
};
