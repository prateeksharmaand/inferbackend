'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, getOrgId, setOrgId } from '@/lib/api';

export interface Me {
  id: string; email: string; name: string; platformRole: 'SUPER_ADMIN' | 'SUPPORT' | 'NONE'; mfaEnabled: boolean; mfaVerified: boolean;
  organizations: { id: string; name: string; slug: string; status: string; role: string; roleName: string; permissions: string[] }[];
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me', { org: false }), staleTime: 60_000 });
}

/** The active organization (from localStorage, falling back to the first membership) and its permissions. */
export function useOrg() {
  const me = useMe();
  const qc = useQueryClient();
  const orgs = me.data?.organizations ?? [];
  const stored = typeof window !== 'undefined' ? getOrgId() : null;
  const org = orgs.find((o) => o.id === stored) ?? orgs[0] ?? null;
  useEffect(() => { if (org && org.id !== stored) setOrgId(org.id); }, [org, stored]);
  const can = (p: string) => !!org?.permissions.includes(p);
  const switchTo = (id: string) => { setOrgId(id); qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }); qc.invalidateQueries(); };
  return { me: me.data, isLoading: me.isLoading, error: me.error, org, orgs, can, switchTo };
}
