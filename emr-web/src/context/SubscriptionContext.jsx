import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const [sub,     setSub]     = useState(null);  // subscription row
  const [usage,   setUsage]   = useState(null);  // { patients, appointments, prescriptions }
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/subscription');
      setSub(data.subscription);
      setUsage(data.usage);
    } catch {
      // Not logged in yet or no clinic — ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Returns true if resource is within limits (or plan is unlimited)
  const canUse = useCallback((resource) => {
    if (!sub || !usage) return true; // allow while loading
    if (sub.plan_key === 'pro' && sub.status === 'active') return true;
    const limitMap = {
      patients:      sub.max_patients,
      appointments:  sub.max_appointments,
      prescriptions: sub.max_prescriptions,
    };
    const limit = limitMap[resource];
    if (!limit || limit === -1) return true;
    return (usage[resource] || 0) < limit;
  }, [sub, usage]);

  // Returns { used, limit, pct } for a resource
  const usageStat = useCallback((resource) => {
    if (!sub || !usage) return { used: 0, limit: 0, pct: 0 };
    const limitMap = {
      patients:      sub.max_patients,
      appointments:  sub.max_appointments,
      prescriptions: sub.max_prescriptions,
    };
    const limit = limitMap[resource] || 0;
    const used  = usage[resource]  || 0;
    return { used, limit, pct: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0 };
  }, [sub, usage]);

  const isPro = sub?.plan_key === 'pro' && sub?.status === 'active';

  return (
    <SubscriptionContext.Provider value={{ sub, usage, loading, isPro, canUse, usageStat, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => useContext(SubscriptionContext);
