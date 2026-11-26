'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Circle, Loader2, X, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { dateTime, titleCase } from '@/lib/format';

interface Decision { id: string; kind: string; outcome: string; rationale: string; blockedReason: string | null; before: Record<string, string>; after: Record<string, string>; createdAt: string; agentKey: string; campaign: { id: string; name: string; provider: string } | null }
const fmt = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${titleCase(k)} ${v}`).join(', ');

export function DecisionsCard({ campaignId }: { campaignId?: string }) {
  const { org, can } = useOrg(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['decisions', org?.id, 'proposed'], queryFn: () => api<Decision[]>('/automation/decisions?outcome=proposed'), enabled: !!org });
  const decide = useMutation({ mutationFn: (v: { id: string; ok: boolean }) => api(`/automation/decisions/${v.id}/${v.ok ? 'approve' : 'reject'}`, { method: 'POST' }), onSuccess: (_, v) => { toast.success(v.ok ? 'Approved — the change is being applied' : 'Rejected'); qc.invalidateQueries({ queryKey: ['decisions'] }); qc.invalidateQueries({ queryKey: ['campaign'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const items = (q.data ?? []).filter((d) => !campaignId || d.campaign?.id === campaignId);
  if (!items.length) return null;
  return (
    <Card className="mb-6 border-amber-500/40">
      <CardHeader><CardTitle>Waiting for your approval ({items.length})</CardTitle><CardDescription>Proposed by agents but outside what your autonomy level or limits allow them to do alone. Limits are re-checked when you approve.</CardDescription></CardHeader>
      <CardContent className="divide-y">
        {items.map((d) => (
          <div key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium">{titleCase(d.kind)}{d.campaign && <> · <Link className="text-primary hover:underline" href={`/campaigns/${d.campaign.id}`}>{d.campaign.name}</Link></>}</p>
              <p className="text-muted-foreground">{fmt(d.before)} → {fmt(d.after)} · {d.rationale}</p>
              {d.blockedReason && <p className="text-xs text-amber-600 dark:text-amber-400">{d.blockedReason}</p>}
              <p className="text-xs text-muted-foreground">{titleCase(d.agentKey)} · {dateTime(d.createdAt)}</p>
            </div>
            {can('campaigns.launch') && <div className="flex gap-2"><Button size="sm" onClick={() => decide.mutate({ id: d.id, ok: true })} disabled={decide.isPending}><Check /> Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ id: d.id, ok: false })}><X /> Reject</Button></div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface Run { id: string; workflowKey: string; status: string; currentStep: string | null; steps: { key: string; status: string; error?: string; note?: string }[]; error: string | null; createdAt: string; finishedAt: string | null }
export function WorkflowRuns() {
  const { org } = useOrg(); const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['workflow-runs', org?.id], queryFn: () => api<{ workflows: { key: string; name: string; description: string; schedule: string | null; enabled: boolean }[]; runs: Run[] }>('/automation/workflows'), enabled: !!org, refetchInterval: 10_000 });
  if (!q.data) return null;
  const name = new Map(q.data.workflows.map((w) => [w.key, w.name]));
  return (
    <Card className="mb-8">
      <CardHeader><CardTitle>Workflows</CardTitle><CardDescription>{q.data.workflows.filter((w) => w.schedule && w.enabled).map((w) => `${w.name} (${w.schedule} UTC)`).join(' · ')}</CardDescription></CardHeader>
      <CardContent>
        {!q.data.runs.length ? <p className="text-sm text-muted-foreground">No workflow runs yet. Onboarding starts when you add an app; scheduled workflows run once you have active apps.</p> : (
          <ul className="divide-y text-sm">
            {q.data.runs.slice(0, 15).map((r) => (
              <li key={r.id} className="py-2">
                <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  <span className="font-medium">{name.get(r.workflowKey) ?? r.workflowKey}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">{dateTime(r.createdAt)}<Badge variant={r.status === 'SUCCEEDED' ? 'secondary' : r.status === 'FAILED' ? 'destructive' : 'outline'}>{titleCase(r.status)}</Badge></span>
                </button>
                {open === r.id && (
                  <ol className="mt-2 space-y-1 pl-2">
                    {r.steps.map((s) => (
                      <li key={s.key} className="flex items-start gap-2 text-xs">
                        {s.status === 'SUCCEEDED' ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : s.status === 'FAILED' ? <XCircle className="size-3.5 text-destructive" /> : s.status === 'RUNNING' ? <Loader2 className="size-3.5 animate-spin" /> : <Circle className="size-3.5 text-muted-foreground" />}
                        <span>{titleCase(s.key)}{s.note && <span className="text-muted-foreground"> — {s.note}</span>}{s.error && <span className="text-destructive"> — {s.error}</span>}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
