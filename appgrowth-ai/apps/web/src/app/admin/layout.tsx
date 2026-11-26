'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ADMIN_NAV } from '@/components/app/nav';
import { AppShell } from '@/components/app/shell';
import { MfaGate } from '@/components/app/mfa';
import { ErrorBlock, LoadingBlock } from '@/components/app/states';
import { useMe } from '@/hooks/use-session';
import { ApiError } from '@/lib/api';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const router = useRouter();
  const unauth = error instanceof ApiError && error.status === 401;
  useEffect(() => { if (unauth) router.replace('/login?next=/admin'); }, [unauth, router]);
  if (isLoading || unauth) return <div className="mx-auto max-w-3xl p-10"><LoadingBlock /></div>;
  if (error) return <div className="mx-auto max-w-3xl p-10"><ErrorBlock error={error} /></div>;
  if (!me || me.platformRole === 'NONE') return <div className="mx-auto max-w-xl p-10"><ErrorBlock error={new Error('The admin console is only for platform administrators.')} /></div>;
  return <AppShell nav={ADMIN_NAV} admin>{me.adminMfaRequired && (!me.mfaEnabled || !me.mfaVerified) ? <MfaGate me={me} /> : children}</AppShell>;
}
