'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Lightbulb, Smartphone, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ChartCard, Lines, StackedBars } from '@/components/app/charts';
import { defaultFilters, FilterBar, toQuery } from '@/components/app/filters';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader, Stat } from '@/components/app/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useOrg } from '@/hooks/use-session';
import { api } from '@/lib/api';
import { money, num, pct, titleCase } from '@/lib/format';

export interface Overview {
  range: { from: string; to: string; days: number }; currency: string; scope: string; scopeNote: string | null; hasData: boolean;
  totals: { installs: number; paidInstalls: number; organicInstalls: number | null; unattributedInstalls: number | null; aggregateAttributedInstalls: number; registrations: number; spend: string; cpi: string | null; costPerRegistration: string | null; clickToInstallRate: number | null; installToRegistrationRate: number | null; dailyAverageInstalls: number };
  target: { month: string; installs: number; achieved: number; achievementPct: number | null };
  budget: { monthlyLimit: string; spent: string; remaining: string; usedPct: number } | null;
  activeCampaigns: number; retention: { d1: number | null; d7: number | null; d30: number | null; cohortUsers: number };
  series: { date: string; installs: number; paid: number; organic: number; registrations: number; spend: string }[];
  recommendations: { id: string; kind: string; rationale: string; campaignId: string | null; createdAt: string }[];
}
const toMinor = (s: string | null) => (s === null ? null : Math.round(Number(s) * 100));

export default function Dashboard() {
  const { org } = useOrg();
  const [f, setF] = useState(defaultFilters);
  const apps = useQuery({ queryKey: ['apps', 'count'], queryFn: () => api<{ total: number }>('/apps?pageSize=1') });
  const q = useQuery({ queryKey: ['overview', org?.id, f], queryFn: () => api<Overview>(`/analytics/overview?${toQuery(f)}`), enabled: !!org });

  if (apps.data && apps.data.total === 0) {
    return (
      <>
        <PageHeader title={`Welcome${org ? `, ${org.name}` : ''}`} />
        <EmptyBlock icon={Smartphone} title="Add your first app" description="Paste its Google Play or App Store link. We’ll import what the store publishes, research your market and draft a growth plan." action={<Link href="/apps/new"><Button>Add an app <ArrowRight /></Button></Link>} />
      </>
    );
  }
  const d = q.data;
  const cur = d?.currency ?? 'INR';
  const pctOf = d?.target.achievementPct ?? null;
  return (
    <>
      <PageHeader title="Dashboard" description="Installs, spend and progress against this month’s target." />
      <FilterBar value={f} onChange={setF} />
      {q.isLoading ? <LoadingBlock rows={6} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : d && (
        <div className="space-y-6">
          {d.scopeNote && <Alert><AlertDescription>{d.scopeNote}</AlertDescription></Alert>}
          {!d.hasData && <Alert><AlertDescription>No install or spend data yet. Numbers appear after you connect an attribution source and launch campaigns — see <Link href="/integrations" className="font-medium text-primary underline">Integrations</Link>.</AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2 rounded-xl border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target · {d.target.month}</p>
              <p className="mt-1.5 text-3xl font-semibold tabular">{num(d.target.achieved)} <span className="text-base font-normal text-muted-foreground">of {num(d.target.installs)} installs</span></p>
              <Progress value={Math.min(100, pctOf ?? 0)} className="mt-3" aria-label="Target achievement" />
              <p className="mt-1.5 text-xs text-muted-foreground">{pct(pctOf)} achieved · <Link href="/budgets" className="text-primary hover:underline">see forecast</Link></p>
            </div>
            <Stat label="Installs" value={num(d.totals.installs)} hint={`${num(d.totals.dailyAverageInstalls)} / day avg`} />
            <Stat label="Ad spend" value={money(toMinor(d.totals.spend), cur)} hint={`CPI ${money(toMinor(d.totals.cpi), cur)}`} />
            <Stat label="Paid installs" value={num(d.totals.paidInstalls)} hint={d.totals.aggregateAttributedInstalls ? `incl. ${num(d.totals.aggregateAttributedInstalls)} iOS aggregate` : undefined} />
            <Stat label="Organic installs" value={num(d.totals.organicInstalls)} hint={d.totals.unattributedInstalls ? `${num(d.totals.unattributedInstalls)} unattributed` : undefined} />
            <Stat label="Registrations" value={num(d.totals.registrations)} hint={`${pct(d.totals.installToRegistrationRate)} of installs · ${money(toMinor(d.totals.costPerRegistration), cur)} each`} />
            <Stat label="Active campaigns" value={num(d.activeCampaigns)} hint={d.totals.clickToInstallRate !== null ? `${pct(d.totals.clickToInstallRate)} click → install` : undefined} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Daily installs" subtitle="Paid includes aggregate iOS attribution" series={[{ key: 'paid', label: 'Paid', color: 'var(--series-1)' }, { key: 'organic', label: 'Organic', color: 'var(--series-2)' }]} rows={d.series} fmt={(v) => num(v, true)}>
              <StackedBars rows={d.series} series={[{ key: 'organic', label: 'Organic', color: 'var(--series-2)' }, { key: 'paid', label: 'Paid', color: 'var(--series-1)' }]} fmt={(v) => num(v, true)} />
            </ChartCard>
            <ChartCard title="Daily ad spend" subtitle={cur} series={[{ key: 'spend', label: 'Spend', color: 'var(--series-1)' }]} rows={d.series} fmt={(v) => money(Math.round(v * 100), cur, { compact: true })}>
              <Lines rows={d.series.map((r) => ({ ...r, spend: Number(r.spend) }))} series={[{ key: 'spend', label: 'Spend', color: 'var(--series-1)' }]} fmt={(v) => money(Math.round(v * 100), cur, { compact: true })} />
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4" /> Budget this month</CardTitle></CardHeader>
              <CardContent>
                {d.budget ? <>
                  <p className="text-2xl font-semibold tabular">{money(toMinor(d.budget.remaining), cur)} <span className="text-sm font-normal text-muted-foreground">left</span></p>
                  <Progress value={Math.min(100, d.budget.usedPct)} className="mt-3" aria-label="Budget used" />
                  <p className="mt-1.5 text-xs text-muted-foreground">{money(toMinor(d.budget.spent), cur)} of {money(toMinor(d.budget.monthlyLimit), cur)} · {pct(d.budget.usedPct)}</p>
                </> : <p className="text-sm text-muted-foreground">No budget set. <Link href="/budgets" className="text-primary hover:underline">Set a monthly budget</Link> — automation can’t change spend without one.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Retention</CardTitle></CardHeader>
              <CardContent>
                {d.retention.cohortUsers ? (
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {(['d1', 'd7', 'd30'] as const).map((k) => <div key={k}><dt className="text-xs uppercase text-muted-foreground">{k.toUpperCase()}</dt><dd className="text-xl font-semibold tabular">{d.retention[k] === null ? '—' : pct(d.retention[k]! * 100, 0)}</dd></div>)}
                  </dl>
                ) : <p className="text-sm text-muted-foreground">Needs an analytics source that reports returning users (Firebase, AppsFlyer or Adjust).</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="size-4" /> AI recommendations</CardTitle></CardHeader>
              <CardContent>
                {d.recommendations.length ? (
                  <ul className="space-y-2 text-sm">{d.recommendations.map((r) => <li key={r.id}><span className="font-medium">{titleCase(r.kind)}</span> — <span className="text-muted-foreground">{r.rationale}</span></li>)}</ul>
                ) : <p className="text-sm text-muted-foreground">Recommendations appear once campaigns have a few days of results. Meanwhile, see <Link href="/insights" className="text-primary hover:underline">research & strategy</Link>.</p>}
                <Link href="/automation" className="mt-3 inline-block text-sm text-primary hover:underline">Review proposals</Link>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
