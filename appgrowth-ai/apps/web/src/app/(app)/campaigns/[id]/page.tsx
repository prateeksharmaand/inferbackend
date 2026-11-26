'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, Pause, Play, RefreshCw, Rocket, Send, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DecisionsCard } from '@/components/app/automation';
import { ChartCard, Lines, StackedBars } from '@/components/app/charts';
import { ErrorBlock, LoadingBlock, Stat } from '@/components/app/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrg } from '@/hooks/use-session';
import { api, ApiError, errorMessage } from '@/lib/api';
import { dateTime, money, num, titleCase } from '@/lib/format';
import { STATUS_VARIANT } from '@/lib/campaigns';

interface Detail {
  id: string; name: string; provider: string; platform: string; objective: string; countries: string[]; languages: string[]; status: string; statusReason: string; dailyBudget: string; monthlyBudget: string | null; targetCpi: string | null; currency: string;
  startDate: string; endDate: string | null; externalCampaignId: string | null; externalStatus: string | null; automationEnabled: boolean; lastSyncedAt: string | null;
  application: { id: string; name: string }; account: { id: string; name: string; status: string } | null;
  actions: { id: string; action: string; actor: string; status: string; error: string | null; createdAt: string }[];
  budgetHistory: { daily: string; changedBy: string; reason: string; effectiveFrom: string }[];
  creatives: { id: string; title: string; type: string; approvalStatus: string; uploaded: boolean }[];
  daily: { date: string; impressions: number; clicks: number; installs: number; spend: string; cpi: string | null }[];
  decisions: { id: string; kind: string; outcome: string; rationale: string; blockedReason: string | null; createdAt: string }[];
}
const m = (s: string | null) => (s == null ? null : Math.round(Number(s) * 100));

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>(); const { can } = useOrg(); const qc = useQueryClient();
  const key = ['campaign', id];
  const q = useQuery({ queryKey: key, queryFn: () => api<Detail>(`/campaigns/${id}`), refetchInterval: (x) => (x.state.data?.actions.some((a) => a.status === 'pending') ? 3000 : false) });
  const [budget, setBudget] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['campaigns'] }); };
  const fail = (e: unknown) => toast.error(e instanceof ApiError && e.code.startsWith('policy_') ? `Blocked by your spending limits: ${e.message}` : errorMessage(e));
  const act = useMutation({ mutationFn: (v: { path: string; body?: unknown; msg: string }) => api(`/campaigns/${id}/${v.path}`, { method: 'POST', body: v.body }), onSuccess: (_, v) => { toast.success(v.msg); refresh(); }, onError: fail });
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api(`/campaigns/${id}`, { method: 'PATCH', body }), onSuccess: () => { toast.success('Saved'); setBudget(''); refresh(); }, onError: fail });
  if (q.isLoading) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorBlock error={q.error} retry={() => q.refetch()} />;
  const c = q.data!; const cur = c.currency;
  const totals = c.daily.reduce((s, d) => ({ installs: s.installs + d.installs, spend: s.spend + Number(d.spend), clicks: s.clicks + d.clicks, impressions: s.impressions + d.impressions }), { installs: 0, spend: 0, clicks: 0, impressions: 0 });
  const launchPerm = can('campaigns.launch'); const writePerm = can('campaigns.write');
  const pending = c.actions.find((a) => a.status === 'pending');
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground"><Link href="/campaigns" className="hover:underline">Campaigns</Link> / {titleCase(c.provider)}</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">{c.name}<Badge variant={STATUS_VARIANT[c.status]}>{titleCase(c.status)}</Badge></h1>
          <p className="mt-1 text-sm text-muted-foreground"><Link className="hover:underline" href={`/apps/${c.application.id}`}>{c.application.name}</Link> · {c.platform === 'IOS' ? 'iOS' : 'Android'} · {c.countries.join(', ')} · {c.account ? `${c.account.name}${c.account.status !== 'CONNECTED' ? ` (${c.account.status.toLowerCase()})` : ''}` : 'no ad account'}{c.externalCampaignId && ` · platform id ${c.externalCampaignId} (${c.externalStatus})`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === 'DRAFT' && writePerm && <Button onClick={() => act.mutate({ path: 'submit', msg: 'Submitted for approval' })}><Send /> Submit for approval</Button>}
          {c.status === 'PENDING_APPROVAL' && launchPerm && <Button onClick={() => act.mutate({ path: 'approve', msg: 'Approved — ready to launch' })}><CheckCircle2 /> Approve</Button>}
          {['PENDING_APPROVAL', 'READY'].includes(c.status) && writePerm && <Button variant="outline" onClick={() => act.mutate({ path: 'return-to-draft', body: {}, msg: 'Back to draft' })}><Undo2 /> Back to draft</Button>}
          {['READY', 'FAILED'].includes(c.status) && launchPerm && c.account && <Button disabled={!!pending} onClick={() => confirm(`Launch “${c.name}” at ${cur} ${c.dailyBudget}/day? It will start spending on ${titleCase(c.provider)}.`) && act.mutate({ path: 'launch', msg: 'Launching…' })}><Rocket /> Launch</Button>}
          {c.status === 'ACTIVE' && launchPerm && <Button variant="outline" disabled={!!pending} onClick={() => act.mutate({ path: 'pause', body: { reason: 'Paused from dashboard' }, msg: 'Pausing…' })}><Pause /> Pause</Button>}
          {c.status === 'PAUSED' && launchPerm && <Button disabled={!!pending} onClick={() => act.mutate({ path: 'resume', msg: 'Resuming…' })}><Play /> Resume</Button>}
          {c.externalCampaignId && <Button variant="ghost" size="icon" aria-label="Refresh status from platform" onClick={() => act.mutate({ path: 'refresh', msg: 'Refreshing' })}><RefreshCw /></Button>}
          {['DRAFT', 'FAILED', 'PAUSED', 'COMPLETED', 'PENDING_APPROVAL', 'READY'].includes(c.status) && writePerm && <Button variant="ghost" size="icon" aria-label="Archive" onClick={() => confirm('Archive this campaign?') && act.mutate({ path: 'archive', msg: 'Archived' })}><Archive /></Button>}
        </div>
      </div>
      {pending && <Alert className="mb-4"><AlertDescription>{titleCase(pending.action)} in progress…</AlertDescription></Alert>}
      {c.statusReason && <Alert className="mb-4" variant={c.status === 'FAILED' ? 'destructive' : 'default'}><AlertDescription>{c.statusReason}</AlertDescription></Alert>}
      <DecisionsCard campaignId={c.id} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Installs (60d)" value={num(totals.installs)} hint="platform-reported" />
        <Stat label="Spend (60d)" value={money(Math.round(totals.spend * 100), cur)} />
        <Stat label="CPI" value={totals.installs ? money(Math.round((totals.spend / totals.installs) * 100), cur) : '—'} hint={c.targetCpi ? `target ${money(m(c.targetCpi), cur)}` : undefined} tone={c.targetCpi && totals.installs && totals.spend / totals.installs > Number(c.targetCpi) ? 'bad' : undefined} />
        <Stat label="Click → install" value={totals.clicks ? `${((totals.installs / totals.clicks) * 100).toFixed(1)}%` : '—'} hint={`${num(totals.impressions, true)} impressions`} />
      </div>
      {c.daily.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Installs per day" series={[{ key: 'installs', label: 'Installs', color: 'var(--series-1)' }]} rows={c.daily} fmt={(v) => num(v)}><StackedBars rows={c.daily} series={[{ key: 'installs', label: 'Installs', color: 'var(--series-1)' }]} fmt={(v) => num(v)} /></ChartCard>
          <ChartCard title="Cost per install" subtitle={cur} series={[{ key: 'cpi', label: 'CPI', color: 'var(--series-1)' }]} rows={c.daily.map((d) => ({ ...d, cpi: d.cpi ? Number(d.cpi) : 0 }))} fmt={(v) => money(Math.round(v * 100), cur)}><Lines rows={c.daily.map((d) => ({ ...d, cpi: d.cpi ? Number(d.cpi) : (null as unknown as number) }))} series={[{ key: 'cpi', label: 'CPI', color: 'var(--series-1)' }]} fmt={(v) => money(Math.round(v * 100), cur)} /></ChartCard>
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Budget</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-2xl font-semibold tabular">{money(m(c.dailyBudget), cur)} <span className="text-sm font-normal text-muted-foreground">/ day</span></p>
            {writePerm && c.status !== 'ARCHIVED' && c.status !== 'COMPLETED' && (
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); patch.mutate({ dailyBudget: budget }); }}>
                <div className="flex-1 space-y-1"><Label htmlFor="nb" className="text-xs">New daily budget</Label><Input id="nb" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} /></div>
                <Button type="submit" size="sm" disabled={!budget || patch.isPending}>Apply</Button>
              </form>
            )}
            <label className="flex items-center justify-between gap-2 pt-2"><span>AI automation for this campaign</span><Switch checked={c.automationEnabled} disabled={!writePerm} onCheckedChange={(v) => patch.mutate({ automationEnabled: v })} aria-label="Automation for this campaign" /></label>
            <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">{c.budgetHistory.slice(0, 6).map((b, i) => <li key={i}>{dateTime(b.effectiveFrom)}: {money(m(b.daily), cur)} — {b.changedBy.startsWith('agent:') ? titleCase(b.changedBy.slice(6)) : 'user'}{b.reason ? ` · ${b.reason}` : ''}</li>)}</ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Creatives</CardTitle></CardHeader>
          <CardContent>{c.creatives.length ? <ul className="space-y-2 text-sm">{c.creatives.map((x) => <li key={x.id} className="flex justify-between gap-2"><Link href={`/creatives?open=${x.id}`} className="truncate hover:underline">{x.title || titleCase(x.type)}</Link><span className="text-xs text-muted-foreground">{x.approvalStatus.toLowerCase()}{x.uploaded ? ' · uploaded' : ''}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">{c.provider === 'APPLE_ADS' ? 'Apple Ads uses the App Store listing.' : 'None attached.'}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Optimization history</CardTitle></CardHeader>
          <CardContent>{c.decisions.length ? <ul className="space-y-2 text-sm">{c.decisions.slice(0, 8).map((d) => <li key={d.id}><Badge variant={d.outcome === 'executed' ? 'default' : d.outcome === 'blocked' || d.outcome === 'failed' ? 'destructive' : 'outline'}>{d.outcome}</Badge> {titleCase(d.kind)}<p className="text-xs text-muted-foreground">{d.rationale}{d.blockedReason ? ` — ${d.blockedReason}` : ''}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No automated decisions yet.</p>}</CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {c.actions.length ? <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>By</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
            <TableBody>{c.actions.map((a) => <TableRow key={a.id}><TableCell className="whitespace-nowrap text-xs">{dateTime(a.createdAt)}</TableCell><TableCell>{titleCase(a.action)}</TableCell><TableCell className="text-xs">{a.actor.startsWith('agent:') ? `AI · ${titleCase(a.actor.slice(6))}` : 'person'}</TableCell><TableCell><Badge variant={a.status === 'succeeded' ? 'secondary' : a.status === 'failed' ? 'destructive' : 'outline'}>{a.status}</Badge>{a.error && <p className="mt-1 max-w-md text-xs text-destructive">{a.error}</p>}</TableCell></TableRow>)}</TableBody></Table>
            : <p className="text-sm text-muted-foreground">No platform actions yet.</p>}
        </CardContent>
      </Card>
    </>
  );
}
