'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChartCard, CHANNEL_COLOR, Lines, StackedBars } from '@/components/app/charts';
import { defaultFilters, FilterBar, toQuery } from '@/components/app/filters';
import { ErrorBlock, LoadingBlock, PageHeader, Stat } from '@/components/app/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrg } from '@/hooks/use-session';
import { api } from '@/lib/api';
import { money, num, pct, titleCase } from '@/lib/format';

interface Overview { currency: string; scopeNote: string | null; totals: Record<string, number | string | null>; series: { date: string; installs: number; paid: number; organic: number; registrations: number; spend: string }[] }
interface Camp { id: string; name: string; provider: string; platform: string; status: string; installs: number; attributedInstalls: number; registrations: number; spend: string; cpi: string | null; targetCpi: string | null; ctr: number | null; cvr: number | null; currency: string }
interface Country { country: string; installs: number; paidInstalls: number; registrations: number; spend: string; cpi: string | null }
interface Ret { cohortDate: string; source: string; cohortSize: number; d1: number | null; d7: number | null; d30: number | null }
interface Cpi { date: string; byChannel: Record<string, { cpi: string | null }> }
const m = (s: string | number | null | undefined) => (s == null ? null : Math.round(Number(s) * 100));

export default function AnalyticsPage() {
  const { org } = useOrg(); const [f, setF] = useState(defaultFilters); const qs = toQuery(f);
  const ov = useQuery({ queryKey: ['overview', org?.id, f], queryFn: () => api<Overview>(`/analytics/overview?${qs}`), enabled: !!org });
  const camps = useQuery({ queryKey: ['an-campaigns', org?.id, f], queryFn: () => api<Camp[]>(`/analytics/campaigns?${qs}`), enabled: !!org });
  const countries = useQuery({ queryKey: ['an-countries', org?.id, f], queryFn: () => api<Country[]>(`/analytics/countries?${qs}`), enabled: !!org });
  const ret = useQuery({ queryKey: ['an-retention', org?.id, f], queryFn: () => api<Ret[]>(`/analytics/retention?${qs}`), enabled: !!org });
  const cpi = useQuery({ queryKey: ['an-cpi', org?.id, f], queryFn: () => api<Cpi[]>(`/analytics/cpi?${qs}`), enabled: !!org });
  const cur = ov.data?.currency ?? 'INR';
  const channels = [...new Set((cpi.data ?? []).flatMap((d) => Object.keys(d.byChannel)))].sort((a, b) => Object.keys(CHANNEL_COLOR).indexOf(a) - Object.keys(CHANNEL_COLOR).indexOf(b));
  const cpiRows = (cpi.data ?? []).map((d) => ({ date: d.date, ...Object.fromEntries(channels.map((c) => [c, d.byChannel[c]?.cpi ? Number(d.byChannel[c].cpi) : null])) }));
  const retAll = (ret.data ?? []).filter((r) => r.source === 'all');
  const t = ov.data?.totals;
  return (
    <>
      <PageHeader title="Analytics" description="First installs, reinstalls, organic and paid acquisition, CPI, conversion, countries and retention. iOS SKAdNetwork/AdAttributionKit results are aggregate and shown separately." />
      <FilterBar value={f} onChange={setF} />
      {ov.isLoading ? <LoadingBlock rows={6} /> : ov.error ? <ErrorBlock error={ov.error} retry={() => ov.refetch()} /> : t && (
        <div className="space-y-6">
          {ov.data!.scopeNote && <Alert><AlertDescription>{ov.data!.scopeNote}</AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Installs" value={num(t.installs as number)} />
            <Stat label="Paid" value={num(t.paidInstalls as number)} hint={t.aggregateAttributedInstalls ? `${num(t.aggregateAttributedInstalls as number)} iOS aggregate` : undefined} />
            <Stat label="Organic" value={num(t.organicInstalls as number | null)} hint={t.unattributedInstalls ? `${num(t.unattributedInstalls as number)} unattributed` : undefined} />
            <Stat label="Reinstalls" value={num(t.reinstalls as number | null)} hint="not counted as installs" />
            <Stat label="CPI" value={money(m(t.cpi as string | null), cur)} hint={`${money(m(t.spend as string), cur)} spent`} />
            <Stat label="Registrations" value={num(t.registrations as number)} hint={`${pct(t.installToRegistrationRate as number | null)} of installs`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Installs by source" series={[{ key: 'paid', label: 'Paid', color: 'var(--series-1)' }, { key: 'organic', label: 'Organic', color: 'var(--series-2)' }]} rows={ov.data!.series} fmt={(v) => num(v, true)}>
              <StackedBars rows={ov.data!.series} series={[{ key: 'organic', label: 'Organic', color: 'var(--series-2)' }, { key: 'paid', label: 'Paid', color: 'var(--series-1)' }]} fmt={(v) => num(v, true)} />
            </ChartCard>
            <ChartCard title="CPI by channel" subtitle={cur} series={channels.map((c) => ({ key: c, label: titleCase(c), color: CHANNEL_COLOR[c] }))} rows={cpiRows} fmt={(v) => money(Math.round(v * 100), cur)}>
              {channels.length ? <Lines rows={cpiRows} series={channels.map((c) => ({ key: c, label: titleCase(c), color: CHANNEL_COLOR[c] }))} fmt={(v) => money(Math.round(v * 100), cur)} /> : <p className="grid h-full place-items-center text-sm text-muted-foreground">No campaign spend in this range.</p>}
            </ChartCard>
          </div>
          <Card><CardHeader><CardTitle>Campaigns</CardTitle><CardDescription>Installs are platform-reported; “attributed” are installs your attribution source credits to the campaign.</CardDescription></CardHeader><CardContent className="overflow-x-auto">
            {camps.data?.length ? <Table><TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Installs</TableHead><TableHead className="text-right">Attributed</TableHead><TableHead className="text-right">CPI</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">Click→install</TableHead><TableHead className="text-right">Registrations</TableHead></TableRow></TableHeader>
              <TableBody>{camps.data.map((c) => <TableRow key={c.id}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{titleCase(c.provider)}</TableCell><TableCell className="text-right tabular">{money(m(c.spend), c.currency)}</TableCell><TableCell className="text-right tabular">{num(c.installs)}</TableCell><TableCell className="text-right tabular">{num(c.attributedInstalls)}</TableCell><TableCell className={`text-right tabular ${c.targetCpi && c.cpi && Number(c.cpi) > Number(c.targetCpi) ? 'text-destructive' : ''}`}>{money(m(c.cpi), c.currency)}</TableCell><TableCell className="text-right tabular">{pct(c.ctr)}</TableCell><TableCell className="text-right tabular">{pct(c.cvr)}</TableCell><TableCell className="text-right tabular">{num(c.registrations)}</TableCell></TableRow>)}</TableBody></Table>
              : <p className="text-sm text-muted-foreground">No campaigns match these filters.</p>}
          </CardContent></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Countries</CardTitle></CardHeader><CardContent className="overflow-x-auto">
              {countries.data?.length ? <Table><TableHeader><TableRow><TableHead>Country</TableHead><TableHead className="text-right">Installs</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">CPI</TableHead></TableRow></TableHeader>
                <TableBody>{countries.data.map((c) => <TableRow key={c.country}><TableCell>{c.country === 'ZZ' ? 'Unknown' : c.country}</TableCell><TableCell className="text-right tabular">{num(c.installs)}</TableCell><TableCell className="text-right tabular">{num(c.paidInstalls)}</TableCell><TableCell className="text-right tabular">{money(m(c.spend), cur)}</TableCell><TableCell className="text-right tabular">{money(m(c.cpi), cur)}</TableCell></TableRow>)}</TableBody></Table>
                : <p className="text-sm text-muted-foreground">No country data in this range.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Retention by install cohort</CardTitle><CardDescription>Share of each day’s new users seen again on day 1, 7 and 30 (needs user-level events from your attribution source).</CardDescription></CardHeader><CardContent className="overflow-x-auto">
              {retAll.length ? <Table><TableHeader><TableRow><TableHead>Cohort</TableHead><TableHead className="text-right">Users</TableHead><TableHead className="text-right">D1</TableHead><TableHead className="text-right">D7</TableHead><TableHead className="text-right">D30</TableHead></TableRow></TableHeader>
                <TableBody>{retAll.slice(-21).reverse().map((r) => <TableRow key={r.cohortDate}><TableCell>{r.cohortDate}</TableCell><TableCell className="text-right tabular">{num(r.cohortSize)}</TableCell>{(['d1', 'd7', 'd30'] as const).map((k) => <TableCell key={k} className="text-right tabular">{r[k] === null ? '—' : pct(r[k]! * 100, 0)}</TableCell>)}</TableRow>)}</TableBody></Table>
                : <p className="text-sm text-muted-foreground">No retention cohorts yet.</p>}
            </CardContent></Card>
          </div>
        </div>
      )}
    </>
  );
}
