'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Lightbulb, Loader2, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { dateTime, money, num, titleCase } from '@/lib/format';

type J = Record<string, unknown>;
interface Insights {
  app: { id: string; name: string; currency: string; platforms: { platform: string }[] };
  research: { id: string; summary: string; markets: { country: string; opportunity: string; reasoning: string; confidence: number }[]; audiences: J[]; opportunities: { items: { title: string; detail: string; confidence: number }[]; strategies: string[]; limitations: string[]; grounded: boolean }; evidence: { claim: string; source_url: string }[]; confidence: string; createdAt: string } | null;
  competitors: { id: string; name: string; website: string; notes: string; apps: { platform: string; storeId: string }[] }[];
  keywords: { id: string; keyword: string; relevance: number; estimatedPopularity: string; competition: string; source: string }[];
  audiences: { id: string; name: string; description: string; countries: string[]; ageRange: string; interests: string[] }[];
  aso: { id: string; platform: string; score: number; findings: { area: string; issue: string; recommendation: string; impact: string }[]; suggestedTitle: string; suggestedSubtitle: string; suggestedKeywords: string[]; localization: { items: { language: string; recommendation: string }[]; screenshot_feedback: string; limitations: string[]; had_listing: boolean }; createdAt: string }[];
  strategies: { id: string; title: string; summary: string; status: string; channels: { provider: string; share_pct: number; platforms: string[]; rationale: string }[]; countryAllocations: { country: string; share_pct: number; rationale: string }[]; estimatedCpi: string | null; estimatedBudget: string | null; forecastInstalls: { low: number; expected: number; high: number; cpi_low: number; cpi_high: number }; campaignPlan: { name: string; provider: string; platform: string; countries: string[]; daily_budget: number; duration_days: number; objective: string }[]; assumptions: { assumptions: string[]; risks: string[] }; createdAt: string; decidedAt: string | null }[];
}
const m = (s: string | null) => (s == null ? null : Math.round(Number(s) * 100));
const impactVariant = (i: string) => (i === 'high' ? 'destructive' : i === 'medium' ? 'default' : 'secondary') as 'destructive' | 'default' | 'secondary';

function InsightsInner() {
  const params = useSearchParams(); const router = useRouter(); const { can } = useOrg(); const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['apps', 'options'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/apps?pageSize=100') });
  const appId = params.get('app') ?? apps.data?.items[0]?.id ?? '';
  useEffect(() => { if (!params.get('app') && appId) router.replace(`/insights?app=${appId}`); }, [appId, params, router]);
  const running = useQuery({ queryKey: ['executions', 'running', appId], queryFn: () => api<{ items: { id: string; agentKey: string; status: string }[] }>(`/ai/executions?applicationId=${appId}&pageSize=20`), enabled: !!appId, refetchInterval: 5000 });
  const active = (running.data?.items ?? []).filter((e) => ['QUEUED', 'RUNNING'].includes(e.status));
  const q = useQuery({ queryKey: ['insights', appId, active.length], queryFn: () => api<Insights>(`/ai/insights/${appId}`), enabled: !!appId });
  const fail = (e: unknown) => toast.error(errorMessage(e));
  const queued = () => { toast.success('Queued — results appear here when the agent finishes'); qc.invalidateQueries({ queryKey: ['executions'] }); };
  const runResearch = useMutation({ mutationFn: () => api('/ai/research', { body: { applicationId: appId } }), onSuccess: queued, onError: fail });
  const runStrategy = useMutation({ mutationFn: () => api('/ai/strategy', { body: { applicationId: appId } }), onSuccess: queued, onError: fail });
  const runAso = useMutation({ mutationFn: (platform: string) => api('/ai/agents/aso/run', { body: { applicationId: appId, platform } }), onSuccess: queued, onError: fail });
  const decide = useMutation({ mutationFn: (v: { id: string; ok: boolean }) => api(`/ai/strategies/${v.id}/${v.ok ? 'approve' : 'reject'}`, { body: {} }), onSuccess: (_, v) => { toast.success(v.ok ? 'Strategy approved — you can now create its campaigns' : 'Strategy rejected'); qc.invalidateQueries({ queryKey: ['insights'] }); }, onError: fail });

  if (apps.isLoading) return <LoadingBlock />;
  if (!apps.data?.items.length) return <><PageHeader title="Research & strategy" /><EmptyBlock icon={Lightbulb} title="Add an app first" action={<Link href="/apps/new"><Button>Add app</Button></Link>} /></>;
  const d = q.data; const cur = d?.app.currency ?? 'INR'; const canRun = can('ai.run');
  return (
    <>
      <PageHeader title="Research & strategy" description="AI market research, ASO audits and growth plans. Everything here is a recommendation; nothing runs until you approve it." actions={
        <NativeSelect aria-label="Application" className="w-56" value={appId} onChange={(e) => router.replace(`/insights?app=${e.target.value}`)} options={apps.data.items.map((a) => ({ value: a.id, label: a.name }))} />
      } />
      {active.length > 0 && <Alert className="mb-4"><Loader2 className="animate-spin" /><AlertDescription>Running: {active.map((a) => titleCase(a.agentKey)).join(', ')}. This page refreshes when they finish.</AlertDescription></Alert>}
      {q.isLoading ? <LoadingBlock rows={6} /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : d && (
        <Tabs defaultValue="strategy">
          <TabsList className="mb-4 flex-wrap"><TabsTrigger value="strategy">Growth strategy</TabsTrigger><TabsTrigger value="research">Market research</TabsTrigger><TabsTrigger value="aso">ASO</TabsTrigger><TabsTrigger value="keywords">Keywords & audiences</TabsTrigger></TabsList>

          <TabsContent value="strategy" className="space-y-4">
            {canRun && <Button onClick={() => runStrategy.mutate()} disabled={runStrategy.isPending}><Sparkles /> Generate a new strategy</Button>}
            {!d.strategies.length ? <EmptyBlock title="No strategy yet" description="The Strategy agent uses your research, budget and any campaign results to propose a channel mix, budget and a realistic forecast." /> : d.strategies.map((s, i) => (
              <Card key={s.id} className={i > 0 ? 'opacity-80' : ''}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">{s.title}<Badge variant={s.status === 'APPROVED' ? 'default' : s.status === 'PENDING' ? 'outline' : 'secondary'}>{s.status.toLowerCase()}</Badge></CardTitle>
                  <CardDescription>Proposed {dateTime(s.createdAt)}{s.decidedAt ? ` · decided ${dateTime(s.decidedAt)}` : ''}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="whitespace-pre-line text-sm">{s.summary}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-3"><p className="text-xs uppercase text-muted-foreground">Estimated CPI</p><p className="text-xl font-semibold tabular">{money(m(s.estimatedCpi), cur)}</p><p className="text-xs text-muted-foreground">range {money(Math.round(s.forecastInstalls.cpi_low * 100), cur)}–{money(Math.round(s.forecastInstalls.cpi_high * 100), cur)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs uppercase text-muted-foreground">Monthly budget</p><p className="text-xl font-semibold tabular">{money(m(s.estimatedBudget), cur)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs uppercase text-muted-foreground">Forecast installs</p><p className="text-xl font-semibold tabular">{num(s.forecastInstalls.expected)}</p><p className="text-xs text-muted-foreground">range {num(s.forecastInstalls.low)}–{num(s.forecastInstalls.high)} · estimate, not guaranteed</p></div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div><p className="mb-2 text-sm font-medium">Channels</p><ul className="space-y-1.5 text-sm">{s.channels.map((c) => <li key={c.provider}><span className="font-medium">{titleCase(c.provider)}</span> · {c.share_pct}% · {c.platforms.join(', ')}<p className="text-muted-foreground">{c.rationale}</p></li>)}</ul></div>
                    <div><p className="mb-2 text-sm font-medium">Countries</p><ul className="space-y-1.5 text-sm">{s.countryAllocations.map((c) => <li key={c.country}><span className="font-medium">{c.country}</span> · {c.share_pct}%<p className="text-muted-foreground">{c.rationale}</p></li>)}</ul></div>
                  </div>
                  {s.campaignPlan.length > 0 && (
                    <div className="overflow-x-auto"><p className="mb-2 text-sm font-medium">Proposed campaigns</p><Table>
                      <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead>Platform</TableHead><TableHead>Countries</TableHead><TableHead className="text-right">Daily budget</TableHead><TableHead className="text-right">Days</TableHead></TableRow></TableHeader>
                      <TableBody>{s.campaignPlan.map((c) => <TableRow key={c.name}><TableCell>{c.name}</TableCell><TableCell>{titleCase(c.provider)}</TableCell><TableCell>{c.platform}</TableCell><TableCell>{c.countries.join(', ')}</TableCell><TableCell className="text-right tabular">{money(Math.round(c.daily_budget * 100), cur)}</TableCell><TableCell className="text-right">{c.duration_days}</TableCell></TableRow>)}</TableBody>
                    </Table></div>
                  )}
                  <div className="grid gap-4 text-sm lg:grid-cols-2">
                    <div><p className="font-medium">Assumptions</p><ul className="list-disc pl-5 text-muted-foreground">{s.assumptions.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>
                    <div><p className="font-medium">Risks</p><ul className="list-disc pl-5 text-muted-foreground">{s.assumptions.risks.map((a) => <li key={a}>{a}</li>)}</ul></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status === 'PENDING' && can('campaigns.launch') && <><Button onClick={() => decide.mutate({ id: s.id, ok: true })}><Check /> Approve plan</Button><Button variant="outline" onClick={() => decide.mutate({ id: s.id, ok: false })}><X /> Reject</Button></>}
                    {s.status === 'APPROVED' && can('campaigns.write') && <Link href={`/campaigns/new?strategy=${s.id}`}><Button>Create campaigns from this plan</Button></Link>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="research" className="space-y-4">
            {canRun && <Button onClick={() => runResearch.mutate()} disabled={runResearch.isPending}><Sparkles /> {d.research ? 'Refresh research' : 'Run market research'}</Button>}
            {!d.research ? <EmptyBlock title="No research yet" /> : <>
              <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2">Summary <Badge variant="outline">confidence {Math.round(Number(d.research.confidence) * 100)}%</Badge>{!d.research.opportunities.grounded && <Badge variant="secondary">not web-grounded</Badge>}</CardTitle><CardDescription>{dateTime(d.research.createdAt)}</CardDescription></CardHeader>
                <CardContent className="space-y-3 text-sm"><p className="whitespace-pre-line">{d.research.summary}</p>
                  {d.research.opportunities.limitations?.length > 0 && <Alert><AlertDescription>Limitations: {d.research.opportunities.limitations.join(' · ')}</AlertDescription></Alert>}</CardContent></Card>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader><CardTitle>Markets</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{d.research.markets.map((mk) => <li key={mk.country}><span className="font-medium">{mk.country}</span> <Badge variant={mk.opportunity === 'high' ? 'default' : 'secondary'}>{mk.opportunity}</Badge> <span className="text-muted-foreground">· {Math.round(mk.confidence * 100)}%</span><p className="text-muted-foreground">{mk.reasoning}</p></li>)}</ul></CardContent></Card>
                <Card><CardHeader><CardTitle>Opportunities</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{d.research.opportunities.items.map((o) => <li key={o.title}><span className="font-medium">{o.title}</span><p className="text-muted-foreground">{o.detail}</p></li>)}</ul>
                  {d.research.opportunities.strategies.length > 0 && <><p className="mt-4 text-sm font-medium">Strategies</p><ul className="list-disc pl-5 text-sm text-muted-foreground">{d.research.opportunities.strategies.map((x) => <li key={x}>{x}</li>)}</ul></>}</CardContent></Card>
                <Card><CardHeader><CardTitle>Competitors</CardTitle></CardHeader><CardContent><ul className="divide-y text-sm">{d.competitors.map((c) => <li key={c.id} className="py-2"><span className="font-medium">{c.name}</span>{c.website && <a className="ml-2 text-primary hover:underline" href={c.website} target="_blank" rel="noreferrer">site <ExternalLink className="inline size-3" /></a>}<p className="text-muted-foreground">{c.notes}</p>{c.apps.length > 0 && <p className="text-xs text-muted-foreground">{c.apps.map((a) => `${a.platform}: ${a.storeId}`).join(' · ')}</p>}</li>)}</ul></CardContent></Card>
                <Card><CardHeader><CardTitle>Evidence</CardTitle><CardDescription>Only sources returned by web search are linked.</CardDescription></CardHeader><CardContent><ul className="space-y-2 text-sm">{d.research.evidence.length ? d.research.evidence.map((e, i) => <li key={i}>{e.claim}{e.source_url && <a className="ml-1 text-primary hover:underline" href={e.source_url} target="_blank" rel="noreferrer">source <ExternalLink className="inline size-3" /></a>}</li>) : <li className="text-muted-foreground">No evidenced claims.</li>}</ul></CardContent></Card>
              </div>
            </>}
          </TabsContent>

          <TabsContent value="aso" className="space-y-4">
            {canRun && <div className="flex flex-wrap gap-2">{d.app.platforms.map((p) => <Button key={p.platform} variant="outline" onClick={() => runAso.mutate(p.platform)} disabled={runAso.isPending}><Sparkles /> Audit {p.platform === 'IOS' ? 'App Store' : 'Google Play'} listing</Button>)}</div>}
            {!d.aso.length ? <EmptyBlock title="No ASO audit yet" description="Needs an imported store listing. iOS imports automatically; Android needs Play Console access on the app page." /> : d.aso.map((a) => (
              <Card key={a.id}>
                <CardHeader><CardTitle className="flex items-center gap-3">{a.platform === 'IOS' ? 'App Store' : 'Google Play'} listing <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-lg text-primary tabular">{a.score}/100</span></CardTitle><CardDescription>{dateTime(a.createdAt)} · we never change your listing; apply suggestions in the store console.</CardDescription></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-3"><p className="text-xs uppercase text-muted-foreground">Suggested title</p><p className="font-medium">{a.suggestedTitle}</p><p className="text-xs text-muted-foreground">{a.suggestedTitle.length}/30 characters</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs uppercase text-muted-foreground">{a.platform === 'IOS' ? 'Suggested subtitle' : 'Suggested short description'}</p><p className="font-medium">{a.suggestedSubtitle}</p><p className="text-xs text-muted-foreground">{a.suggestedSubtitle.length}/{a.platform === 'IOS' ? 30 : 80} characters</p></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{a.suggestedKeywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}</div>
                  <ul className="divide-y">{a.findings.map((f, i) => <li key={i} className="py-2"><Badge variant={impactVariant(f.impact)}>{f.impact}</Badge> <span className="font-medium">{titleCase(f.area)}</span> — {f.issue}<p className="text-muted-foreground">→ {f.recommendation}</p></li>)}</ul>
                  {a.localization.screenshot_feedback && <p><span className="font-medium">Screenshots:</span> <span className="text-muted-foreground">{a.localization.screenshot_feedback}</span></p>}
                  {a.localization.items.length > 0 && <p><span className="font-medium">Localization:</span> <span className="text-muted-foreground">{a.localization.items.map((l) => `${l.language}: ${l.recommendation}`).join(' · ')}</span></p>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="keywords" className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Keywords</CardTitle><CardDescription>Popularity is an AI estimate unless a keyword data vendor is connected.</CardDescription></CardHeader><CardContent className="overflow-x-auto">
              {d.keywords.length ? <Table><TableHeader><TableRow><TableHead>Keyword</TableHead><TableHead className="text-right">Relevance</TableHead><TableHead>Popularity</TableHead><TableHead>Competition</TableHead></TableRow></TableHeader>
                <TableBody>{d.keywords.map((k) => <TableRow key={k.id}><TableCell>{k.keyword}</TableCell><TableCell className="text-right tabular">{Math.round(k.relevance * 100)}%</TableCell><TableCell>{k.estimatedPopularity}</TableCell><TableCell>{k.competition}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">Run market research to get keywords.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Audience segments</CardTitle></CardHeader><CardContent>
              {d.audiences.length ? <ul className="space-y-3 text-sm">{d.audiences.map((a) => <li key={a.id}><p className="font-medium">{a.name}{a.ageRange && <span className="text-muted-foreground"> · {a.ageRange}</span>}</p><p className="text-muted-foreground">{a.description}</p><p className="text-xs text-muted-foreground">{[a.countries.join(', '), a.interests.join(', ')].filter(Boolean).join(' · ')}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No segments yet.</p>}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
export default function InsightsPage() { return <Suspense><InsightsInner /></Suspense>; }
