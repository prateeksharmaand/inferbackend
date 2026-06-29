import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const [license, setLicense] = useState(null);  // EffectiveLicense from backend
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('emr_token')) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      // Fetch EffectiveLicense (resolved by enforceSubscription middleware)
      const data = await api.get('/subscription/license');
      setLicense(data);
    } catch (err) {
      console.warn('[SubscriptionContext] Failed to fetch license:', err.message);
      setError(err);
      // Graceful degradation: assume base plan on error
      setLicense({ plan: 'base', status: 'error', subscriptionValid: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Refresh every 5 minutes to catch plan changes
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Check if feature is available in plan
  const hasFeature = useCallback((featureKey) => {
    if (!license) return false;
    return license.planFeatures?.[featureKey] === true;
  }, [license]);

  // Check if can use resource (within usage limits)
  const canUseResource = useCallback((resourceType) => {
    if (!license) return false;
    const usage = license.usage?.[resourceType];
    if (!usage) return true; // No limit defined
    if (usage.limit === -1) return true; // Unlimited
    return usage.used < usage.limit;
  }, [license]);

  // Get usage stats for resource
  const getUsageStat = useCallback((resourceType) => {
    if (!license) return { used: 0, limit: 0, pct: 0 };
    const usage = license.usage?.[resourceType];
    if (!usage) return { used: 0, limit: 0, pct: 0 };
    const pct = usage.limit > 0 ? Math.round((usage.used / usage.limit) * 100) : 0;
    return { used: usage.used, limit: usage.limit, pct: Math.min(100, pct) };
  }, [license]);

  // Check if seat type is sufficient
  const hasSeatType = useCallback((requiredSeatType) => {
    if (!license) return false;
    const seatHierarchy = { scribe: 0, basic: 1, premium: 2 };
    const userLevel = seatHierarchy[license.primarySeatType] || 0;
    const requiredLevel = seatHierarchy[requiredSeatType] || 0;
    return userLevel >= requiredLevel;
  }, [license]);

  // Check if subscription is active
  const isActive = useCallback(() => {
    return license?.subscriptionValid === true && ['active', 'trial'].includes(license?.status);
  }, [license]);

  // Check if subscription is expired
  const isExpired = useCallback(() => {
    return license?.status === 'expired';
  }, [license]);

  // Get upgrade suggestions
  const getUpgradeSuggestions = useCallback((featureKey) => {
    if (!license) return [];
    const suggestions = [];

    if (!license.planFeatures?.[featureKey]) {
      if (license.plan !== 'pro') {
        suggestions.push({
          type: 'plan',
          from: license.plan,
          to: 'pro',
          message: 'This feature is available on the Pro plan',
        });
      }
    }

    // Check seat type requirements
    const premiumFeatures = ['prescriptions', 'billing', 'analytics'];
    if (premiumFeatures.includes(featureKey) && license.primarySeatType !== 'premium') {
      suggestions.push({
        type: 'seat',
        required: 'premium',
        current: license.primarySeatType,
        message: 'This feature requires a Premium seat',
      });
    }

    // Check credits
    if (featureKey.startsWith('ai_') && license.aiCreditsRemaining === 0) {
      suggestions.push({
        type: 'credits',
        current: license.aiCreditsRemaining,
        message: 'You are out of AI credits',
      });
    }

    return suggestions;
  }, [license]);

  return (
    <SubscriptionContext.Provider
      value={{
        license,
        loading,
        error,
        refresh,
        hasFeature,
        canUseResource,
        getUsageStat,
        hasSeatType,
        isActive,
        isExpired,
        getUpgradeSuggestions,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};
