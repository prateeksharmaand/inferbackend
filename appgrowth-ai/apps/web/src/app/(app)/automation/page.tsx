'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Play } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { DecisionsCard, WorkflowRuns } from '@/components/app/automation';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { ago, dateTime, num, titleCase } from '@/lib/format';

interface Agent { key: string; name: string; description: string; enabled: boolean; schedule: string | null; manualReview: boolean; tools: string[]; lastRunAt: string | null; runs: number }
interface Exec { id: string; agentKey: string; applicationId: string | null; trigger: string; status: string; error: string | null; provider: string | null; model: string | null; inputTokens: number; outputTokens: number; costMicros: string; createdAt: string; finishedAt: string | null }
interface ExecDetail extends Exec { output: Record<string, unknown> | null; logs: { id: string; level: string; message: string; createdAt: string }[] }
const ORG_LEVEL = new Set(['analytics', 'growth', 'retention', 'reporting', 'budget_optimization']);
const statusVariant = (s: string) => (s === 'SUCCEEDED' ? 'secondary' : s === 'FAILED' ? 'destructive' : 'outline') as 'secondary' | 'destructive' | 'outline';

function Output({ value }: { value: unknown }): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(value)) return value.length ? <ul className="list-disc space-y-1 pl-5">{value.map((v, i) => <li key={i}><Output value={v} /></li>)}</ul> : <span className="text-muted-foreground">none</span>;
  if (typeof value === 'object') return <dl className="space-y-1">{Object.entries(value as Record<string, unknown>).filter(([k]) => !k.startsWith('_')).map(([k, v]) => <div key={k}><dt className="text-xs font-medium uppercase text-muted-foreground">{titleCase(k)}</dt><dd className="pl-2"><Output value={v} /></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}

export default function AutomationPage() {
  const { org, can } = useOrg(); const qc = useQueryClient();
  const [status, setStatus] = useState(''); const [agentKey, setAgentKey] = useState(''); const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const agents = useQuery({ queryKey: ['agents', org?.id], queryFn: () => api<Agent[]>('/ai/agents'), enabled: !!org });
  const execs = useQuery({ queryKey: ['executions', org?.id, status, agentKey, page], queryFn: () => api<{ items: Exec[]; totalPages: number }>(`/ai/executions?page=${page}&pageSize=20${status ? `&status=${status}` : ''}${agentKey ? `&agentKey=${agentKey}` : ''}`), enabled: !!org, refetchInterval: 8000 });
  const detail = useQuery({ queryKey: ['execution', open], queryFn: () => api<ExecDetail>(`/ai/executions/${open}`), enabled: !!open, refetchInterval: (q) => (q.state.data && ['QUEUED', 'RUNNING'].includes(q.state.data.status) ? 3000 : false) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['executions'] }); qc.invalidateQueries({ queryKey: ['execution'] }); };
  const run = useMutation({ mutationFn: (key: string) => api(key === 'budget_optimization' ? '/ai/campaign/recommend' : `/ai/agents/${key}/run`, { body: {} }), onSuccess: () => { toast.success('Agent queued'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const cancel = useMutation({ mutationFn: (id: string) => api(`/ai/executions/${id}/cancel`, { method: 'POST' }), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const review = useMutation({ mutationFn: (id: string) => api(`/ai/executions/${id}/review`, { method: 'POST' }), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title="AI & automation" description="What each agent does, when it last ran, and every run with its inputs, output, cost and log. Safety limits live in Settings → Automation & limits." actions={<Link href="/settings/automation"><Button variant="outline">Autonomy & limits</Button></Link>} />
      <DecisionsCard />
      {agents.isLoading ? <LoadingBlock /> : agents.error ? <ErrorBlock error={agents.error} /> : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {agents.data!.map((a) => (
            <Card key={a.key} size="sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="size-4 text-primary" /> {a.name}{!a.enabled && <Badge variant="outline">disabled</Badge>}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{a.description}</p>
                <p className="text-xs text-muted-foreground">{a.schedule ? `Scheduled (UTC cron ${a.schedule})` : 'Runs on demand or inside workflows'} · {a.runs} runs · last {ago(a.lastRunAt)}{a.manualReview ? ' · manual review' : ''}</p>
                {ORG_LEVEL.has(a.key) && can('ai.run') && a.enabled && <Button size="sm" variant="outline" onClick={() => run.mutate(a.key)} disabled={run.isPending}><Play /> Run now</Button>}
                {['market_research', 'aso', 'campaign_strategy'].includes(a.key) && <Link href="/insights" className="block text-xs text-primary hover:underline">Run from Research & strategy</Link>}
                {a.key === 'creative' && <Link href="/creatives" className="block text-xs text-primary hover:underline">Run from Creative studio</Link>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <WorkflowRuns />
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2"><CardTitle>Agent runs</CardTitle>
          <div className="flex gap-2">
            <NativeSelect aria-label="Agent" className="w-44" value={agentKey} onChange={(e) => { setAgentKey(e.target.value); setPage(1); }} placeholder="All agents" options={(agents.data ?? []).map((a) => ({ value: a.key, label: a.name }))} />
            <NativeSelect aria-label="Status" className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={['QUEUED', 'RUNNING', 'SUCCEEDED', 'AWAITING_REVIEW', 'FAILED', 'CANCELLED'].map((s) => ({ value: s, label: titleCase(s) }))} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {execs.isLoading ? <LoadingBlock rows={3} /> : !execs.data?.items.length ? <EmptyBlock title="No runs yet" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Status</TableHead><TableHead>Trigger</TableHead><TableHead>Model</TableHead><TableHead className="text-right">Tokens</TableHead><TableHead className="text-right">Cost</TableHead><TableHead>Started</TableHead></TableRow></TableHeader>
              <TableBody>{execs.data.items.map((e) => (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => setOpen(e.id)}>
                  <TableCell className="font-medium">{titleCase(e.agentKey)}</TableCell>
                  <TableCell><Badge variant={statusVariant(e.status)}>{titleCase(e.status)}</Badge></TableCell>
                  <TableCell>{e.trigger}</TableCell><TableCell className="text-xs">{e.provider ? `${e.provider}/${e.model}` : '—'}</TableCell>
                  <TableCell className="text-right tabular">{num(e.inputTokens + e.outputTokens, true)}</TableCell>
                  <TableCell className="text-right tabular">${(Number(e.costMicros) / 1e6).toFixed(4)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{dateTime(e.createdAt)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
          {execs.data && execs.data.totalPages > 1 && <div className="mt-3 flex justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="px-2 py-1">Page {page} of {execs.data.totalPages}</span><Button size="sm" variant="outline" disabled={page >= execs.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>}
        </CardContent>
      </Card>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader><SheetTitle>{detail.data ? titleCase(detail.data.agentKey) : 'Run'}</SheetTitle><SheetDescription>{detail.data && `${titleCase(detail.data.status)} · ${dateTime(detail.data.createdAt)}`}</SheetDescription></SheetHeader>
          {detail.data && (
            <div className="space-y-5 px-4 pb-6 text-sm">
              <div className="flex gap-2">
                {['QUEUED', 'RUNNING'].includes(detail.data.status) && can('ai.run') && <Button size="sm" variant="outline" onClick={() => cancel.mutate(detail.data!.id)}>Cancel</Button>}
                {detail.data.status === 'AWAITING_REVIEW' && can('ai.run') && <Button size="sm" onClick={() => review.mutate(detail.data!.id)}>Mark reviewed</Button>}
              </div>
              {detail.data.error && <p className="rounded-lg bg-destructive/10 p-3 text-destructive">{detail.data.error}</p>}
              {detail.data.output && <section><p className="mb-2 font-medium">Output</p><div className="rounded-lg border p-3"><Output value={detail.data.output} /></div>
                {Array.isArray(detail.data.output._warnings) && (detail.data.output._warnings as string[]).length > 0 && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{(detail.data.output._warnings as string[]).join(' · ')}</p>}</section>}
              <section><p className="mb-2 font-medium">Log</p><ol className="space-y-1 font-mono text-xs">{detail.data.logs.map((l) => <li key={l.id} className={l.level === 'error' ? 'text-destructive' : l.level === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>{new Date(l.createdAt).toLocaleTimeString()} {l.message}</li>)}</ol></section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
