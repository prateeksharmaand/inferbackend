'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/app/shell';
import { APP_NAV } from '@/components/app/nav';
import { ErrorBlock, LoadingBlock } from '@/components/app/states';
import { useOrg } from '@/hooks/use-session';
import { ApiError } from '@/lib/api';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, isLoading, error, orgs } = useOrg();
  const router = useRouter();
  const unauth = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (unauth) router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    else if (me && orgs.length === 0 && me.platformRole !== 'NONE') router.replace('/admin');
  }, [unauth, me, orgs.length, router]);
  if (isLoading || unauth) return <div className="mx-auto max-w-3xl p-10"><LoadingBlock /></div>;
  if (error) return <div className="mx-auto max-w-3xl p-10"><ErrorBlock error={error} retry={() => location.reload()} /></div>;
  return <AppShell nav={APP_NAV}>{children}</AppShell>;
}
