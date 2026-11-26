'use client';
import { useQuery } from '@tanstack/react-query';
import { ErrorBlock, LoadingBlock, PageHeader, Stat } from '@/components/app/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { money, num } from '@/lib/format';

interface Dash {
  period: { from: string; currency: string }; customers: { total: number; active: number }; applications: { total: number; android: number; ios: number };
  installs: { total: number; paid: number; organic: number; aggregateAttributed: number }; advertisingSpendMinor: string; campaigns: { active: number; failed: number };
  ai: { inputTokens: string; outputTokens: string; generations: number; costMicrosUsd: string }; integrations: Record<string, number>;
  revenue: { collectedThisMonthMinor: string; mrrMinor: string; activeSubscriptions: number };
  queues: { name: string; ok: boolean; waiting?: number; active?: number; failed?: number; delayed?: number }[];
}

export default function AdminDashboard() {
  const q = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api<Dash>('/admin/dashboard', { org: false }), refetchInterval: 60_000 });
  if (q.isLoading) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorBlock error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  const tokens = BigInt(d.ai.inputTokens) + BigInt(d.ai.outputTokens);
  const intHealthy = d.integrations.CONNECTED ?? 0;
  const intBad = (d.integrations.EXPIRED ?? 0) + (d.integrations.REVOKED ?? 0) + (d.integrations.ERROR ?? 0);
  return (
    <>
      <PageHeader title="Platform dashboard" description={`Month to date since ${d.period.from}. Install and spend totals come from computed analytics rollups.`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Customers" value={num(d.customers.total)} hint={`${d.customers.active} active`} />
        <Stat label="Connected apps" value={num(d.applications.total)} hint={`${d.applications.android} Android · ${d.applications.ios} iOS`} />
        <Stat label="Installs (MTD)" value={num(d.installs.total)} hint={`${num(d.installs.paid)} paid · ${num(d.installs.organic)} organic`} />
        <Stat label="Ad spend (MTD)" value={money(d.advertisingSpendMinor, d.period.currency, { compact: true })} hint="Customer ad accounts" />
        <Stat label="Active campaigns" value={num(d.campaigns.active)} hint={d.campaigns.failed ? `${d.campaigns.failed} failed` : 'none failed'} tone={d.campaigns.failed ? 'bad' : 'good'} />
        <Stat label="AI tokens (MTD)" value={num(tokens.toString(), true)} hint={`$${(Number(d.ai.costMicrosUsd) / 1e6).toFixed(2)} provider cost · ${d.ai.generations} media`} />
        <Stat label="Integrations" value={num(intHealthy)} hint={intBad ? `${intBad} need attention` : 'all healthy'} tone={intBad ? 'warn' : 'good'} />
        <Stat label="Subscription MRR" value={money(d.revenue.mrrMinor, 'INR', { compact: true })} hint={`${money(d.revenue.collectedThisMonthMinor, 'INR', { compact: true })} collected · ${d.revenue.activeSubscriptions} paying`} />
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Background queues</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {d.queues.map((x) => (
            <div key={x.name} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{x.name}</p>
              {x.ok ? <p className="text-muted-foreground tabular">{x.waiting} waiting · {x.active} active · <span className={x.failed ? 'text-destructive' : ''}>{x.failed} failed</span></p> : <p className="text-destructive">unreachable</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
