/**
 * useWallet - Custom React hook for wallet operations
 * Manages balance, pricing, and credit deductions
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/emr';

export const useWallet = () => {
  const [wallet, setWallet] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const token = localStorage.getItem('emr_token');

  // Fetch wallet details
  const fetchWallet = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/wallet`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setWallet(data.wallet);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching wallet:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch wallet summary (stats)
  const fetchSummary = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/wallet/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, [token]);

  // Check if balance is sufficient for a service
  const checkBalance = useCallback(async (serviceType, quantity = 1) => {
    if (!token) return { hasBalance: false };
    try {
      const response = await fetch(`${API_BASE}/wallet/check-balance`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ serviceType, quantity })
      });

      if (response.status === 402) {
        const data = await response.json();
        return {
          hasBalance: false,
          currentBalance: data.currentBalance,
          requiredCredits: data.requiredCredits,
          pricing: data.pricing
        };
      }

      const data = await response.json();
      return {
        hasBalance: data.hasBalance,
        currentBalance: data.currentBalance,
        requiredCredits: data.requiredCredits,
        pricing: data.pricing
      };
    } catch (err) {
      console.error('Error checking balance:', err);
      return { hasBalance: false, error: err.message };
    }
  }, [token]);

  // Deduct credits for a service
  const deductCredits = useCallback(
    async (serviceType, quantity = 1, referenceId = null, metadata = null) => {
      if (!token) throw new Error('Not authenticated');
      try {
        const response = await fetch(`${API_BASE}/wallet/deduct`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serviceType,
            quantity,
            referenceId: referenceId || `${serviceType}_${Date.now()}`,
            metadata
          })
        });

        if (response.status === 402) {
          throw new Error('Insufficient credits');
        }

        if (response.status === 403) {
          throw new Error('Subscription inactive or wallet locked');
        }

        const data = await response.json();
        if (data.success) {
          // Refresh wallet after deduction
          await fetchWallet();
          return { success: true, transactionId: data.transactionId };
        } else {
          throw new Error(data.error || 'Failed to deduct credits');
        }
      } catch (err) {
        console.error('Error deducting credits:', err);
        throw err;
      }
    },
    [token, fetchWallet]
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
