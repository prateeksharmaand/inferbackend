'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChartCard, Lines } from '@/components/app/charts';
import { ErrorBlock, LoadingBlock, PageHeader, Stat } from '@/components/app/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { money, num, pct, titleCase } from '@/lib/format';

interface Budget { id: string; month: string; monthlyLimit: string; dailyLimit: string | null; currency: string; alertThresholds: number[] }
interface Spend { month: string; currency: string; budget: Budget | null; spent: string; remaining: string | null; spendableAfterReserve: string | null; reservePct: number; usedPct: number | null; daily: { date: string; spend: string }[]; byCampaign: { campaignId: string | null; name: string; provider: string | null; spend: string }[]; byProvider: { provider: string; spend: string }[]; discrepancy: { campaignMetricsSpend: string; accountSpend: string; difference: string; flagged: boolean } }
interface Forecast { month: string; target: number; expected: number; low: number; high: number; onTrack: boolean; projectedSpend: string; recentCpi: string | null; requiredBudget: string | null; requiredDailyInstalls: number; confidence: string; notes: string[]; disclaimer: string }
const m = (s: string | null | undefined) => (s == null ? null : Math.round(Number(s) * 100));
const ym = (offset = 0) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7); };

export default function BudgetsPage() {
  const { org, can } = useOrg(); const qc = useQueryClient();
  const [month, setMonth] = useState(ym());
  const spend = useQuery({ queryKey: ['spend', org?.id, month], queryFn: () => api<Spend>(`/budgets/spend?month=${month}`), enabled: !!org });
  const fc = useQuery({ queryKey: ['forecast', org?.id], queryFn: () => api<Forecast>('/budgets/forecast'), enabled: !!org && month === ym() });
  const [f, setF] = useState({ monthlyLimit: '', dailyLimit: '', thresholds: '50, 75, 90' });
  useEffect(() => { const b = spend.data?.budget; setF(b ? { monthlyLimit: b.monthlyLimit, dailyLimit: b.dailyLimit ?? '', thresholds: b.alertThresholds.join(', ') } : { monthlyLimit: '', dailyLimit: '', thresholds: '50, 75, 90' }); }, [spend.data]);
  const save = useMutation({
    mutationFn: () => {
      const body = { monthlyLimit: f.monthlyLimit, dailyLimit: f.dailyLimit || undefined, alertThresholds: f.thresholds.split(/[,\s]+/).filter(Boolean).map(Number) };
      const b = spend.data?.budget;
      return b ? api(`/budgets/${b.id}`, { method: 'PATCH', body: { ...body, dailyLimit: f.dailyLimit || null } }) : api('/budgets', { body: { ...body, month } });
    },
    onSuccess: () => { toast.success('Budget saved'); qc.invalidateQueries({ queryKey: ['spend'] }); qc.invalidateQueries({ queryKey: ['forecast'] }); qc.invalidateQueries({ queryKey: ['overview'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const s = spend.data; const cur = s?.currency ?? 'INR';
  const editable = can('budgets.write') && month >= ym();
  return (
    <>
      <PageHeader title="Budgets" description="Your advertising budget, separate from the AppGrowth subscription. Ad platforms bill your own ad accounts; these limits stop automation from spending more." actions={
        <div className="flex rounded-lg border p-0.5">{[-1, 0, 1].map((o) => <button key={o} onClick={() => setMonth(ym(o))} className={`rounded-md px-3 py-1 text-sm ${month === ym(o) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{ym(o)}</button>)}</div>
      } />
      {spend.isLoading ? <LoadingBlock /> : spend.error ? <ErrorBlock error={spend.error} retry={() => spend.refetch()} /> : s && (
        <div className="space-y-6">
          {s.discrepancy.flagged && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Spend discrepancy</AlertTitle><AlertDescription>Campaign-level spend ({money(m(s.discrepancy.campaignMetricsSpend), cur)}) differs from account spend ({money(m(s.discrepancy.accountSpend), cur)}) by more than 5%. Platforms often finalise spend a day or two late; the reserve covers this. If it persists, check the ad account billing page.</AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Monthly budget" value={s.budget ? money(m(s.budget.monthlyLimit), cur) : 'Not set'} hint={s.budget?.dailyLimit ? `${money(m(s.budget.dailyLimit), cur)} / day max` : undefined} />
            <Stat label="Spent" value={money(m(s.spent), cur)} hint={s.usedPct !== null ? `${pct(s.usedPct)} of budget` : undefined} tone={s.usedPct !== null && s.usedPct >= 90 ? 'bad' : s.usedPct !== null && s.usedPct >= 75 ? 'warn' : undefined} />
            <Stat label="Remaining" value={money(m(s.remaining), cur)} />
            <Stat label="Available to automation" value={money(m(s.spendableAfterReserve), cur)} hint={`after ${s.reservePct}% reserve`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle>{s.budget ? 'Edit budget' : 'Set budget'} · {month}</CardTitle><CardDescription>Alerts are sent at each threshold of the monthly budget.</CardDescription></CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                  <div className="space-y-1.5"><Label htmlFor="ml">Monthly limit ({cur})</Label><Input id="ml" inputMode="decimal" required disabled={!editable} value={f.monthlyLimit} onChange={(e) => setF({ ...f, monthlyLimit: e.target.value.replace(/[^\d.]/g, '') })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="dl">Daily limit ({cur}, optional)</Label><Input id="dl" inputMode="decimal" disabled={!editable} value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: e.target.value.replace(/[^\d.]/g, '') })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="th">Alert thresholds (%)</Label><Input id="th" disabled={!editable} value={f.thresholds} onChange={(e) => setF({ ...f, thresholds: e.target.value })} /></div>
                  {editable && <Button type="submit" disabled={save.isPending || !f.monthlyLimit}>{save.isPending ? 'Saving…' : 'Save budget'}</Button>}
                  {!editable && month < ym() && <p className="text-xs text-muted-foreground">Past months are closed.</p>}
                </form>
              </CardContent>
            </Card>
            <div className="lg:col-span-2">
              <ChartCard title="Daily spend" subtitle={`${month} · ${cur}`} series={[{ key: 'spend', label: 'Spend', color: 'var(--series-1)' }]} rows={s.daily} fmt={(v) => money(Math.round(v * 100), cur, { compact: true })}>
                {s.daily.length ? <Lines rows={s.daily.map((r) => ({ ...r, spend: Number(r.spend) }))} series={[{ key: 'spend', label: 'Spend', color: 'var(--series-1)' }]} fmt={(v) => money(Math.round(v * 100), cur, { compact: true })} /> : <p className="grid h-full place-items-center text-sm text-muted-foreground">No spend reported for {month}.</p>}
              </ChartCard>
            </div>
          </div>
          {month === ym() && fc.data && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="size-4" /> Month-end forecast <Badge variant="outline">{fc.data.confidence} confidence</Badge></CardTitle><CardDescription>{fc.data.disclaimer}</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <div><p className="text-xs uppercase text-muted-foreground">Expected installs</p><p className="text-2xl font-semibold tabular">{num(fc.data.expected)}</p><p className="text-xs text-muted-foreground">range {num(fc.data.low)}–{num(fc.data.high)}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Target</p><p className="text-2xl font-semibold tabular">{num(fc.data.target)}</p><p className={`text-xs ${fc.data.onTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{fc.data.target === 0 ? 'no target set' : fc.data.onTrack ? 'on track' : `needs ${num(fc.data.requiredDailyInstalls)} / day`}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Projected spend</p><p className="text-2xl font-semibold tabular">{money(m(fc.data.projectedSpend), cur)}</p><p className="text-xs text-muted-foreground">recent CPI {money(m(fc.data.recentCpi), cur)}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Budget to reach target</p><p className="text-2xl font-semibold tabular">{fc.data.requiredBudget ? money(m(fc.data.requiredBudget), cur) : '—'}</p><p className="text-xs text-muted-foreground">at recent CPI, if it holds</p></div>
                {fc.data.notes.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground md:col-span-4">{fc.data.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              </CardContent>
            </Card>
          )}
          {(s.byCampaign.length > 0 || s.byProvider.length > 0) && (
            <Card>
              <CardHeader><CardTitle>Where it went</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader>
                  <TableBody>{s.byCampaign.map((c) => <TableRow key={c.campaignId ?? 'acct'}><TableCell>{c.name}</TableCell><TableCell>{c.provider ? titleCase(c.provider) : '—'}</TableCell><TableCell className="text-right tabular">{money(m(c.spend), cur)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
