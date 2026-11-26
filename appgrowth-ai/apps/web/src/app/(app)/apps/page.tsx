'use client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useOrg } from '@/hooks/use-session';
import { api } from '@/lib/api';
import { money, num } from '@/lib/format';

interface AppRow { id: string; name: string; category: string; status: string; onboardingStatus: string; monthlyInstallTarget: number; currency: string; iconUrl: string | null; platforms: { platform: string; storeId: string; validated: boolean }[]; activeCampaigns: number; monthToDate: { installs: number; spendMinor: string } }

export default function AppsPage() {
  const { can } = useOrg();
  const [search, setSearch] = useState(''); const [platform, setPlatform] = useState('');
  const q = useQuery({ queryKey: ['apps', search, platform], queryFn: () => api<{ items: AppRow[]; total: number }>(`/apps?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}${platform ? `&platform=${platform}` : ''}`) });
  return (
    <>
      <PageHeader title="Applications" description="Your Android and iOS apps, their monthly install targets and progress." actions={can('apps.write') && <Link href="/apps/new"><Button><Plus /> Add app</Button></Link>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search apps" className="sm:max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search apps" />
        <NativeSelect aria-label="Platform" className="sm:w-40" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="All platforms" options={[{ value: 'ANDROID', label: 'Android' }, { value: 'IOS', label: 'iOS' }]} />
      </div>
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !q.data!.items.length ? (
        <EmptyBlock icon={Smartphone} title={search || platform ? 'No apps match' : 'No apps yet'} description="Add an app by its store link, package name or bundle id." action={can('apps.write') && <Link href="/apps/new"><Button>Add app</Button></Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.items.map((a) => {
            const p = a.monthlyInstallTarget ? (a.monthToDate.installs / a.monthlyInstallTarget) * 100 : 0;
            return (
              <Link key={a.id} href={`/apps/${a.id}`} className="rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm">
                <div className="flex items-start gap-3">
                  {a.iconUrl ? <img src={a.iconUrl} alt="" className="size-12 rounded-xl border object-cover" /> : <div className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground"><Smartphone className="size-6" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.category || 'Uncategorised'}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">{a.platforms.map((pl) => <Badge key={pl.platform} variant="secondary">{pl.platform === 'IOS' ? 'iOS' : 'Android'}</Badge>)}{a.status === 'paused' && <Badge variant="outline">paused</Badge>}{a.onboardingStatus === 'running' && <Badge variant="outline">analysing…</Badge>}</div>
                  </div>
                </div>
                <div className="mt-4 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">This month</span><span className="tabular">{num(a.monthToDate.installs)} / {num(a.monthlyInstallTarget)}</span></div>
                  <Progress value={Math.min(100, p)} className="mt-1.5" aria-label={`${a.name} target progress`} />
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{a.activeCampaigns} active campaign{a.activeCampaigns === 1 ? '' : 's'}</span><span>{money(a.monthToDate.spendMinor, a.currency)} spent</span></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
