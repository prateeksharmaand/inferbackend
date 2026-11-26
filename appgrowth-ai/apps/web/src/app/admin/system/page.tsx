'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ErrorBlock, LoadingBlock, PageHeader, Stat } from '@/components/app/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

interface H {
  services: Record<string, { ok: boolean; ms?: number; error?: string; lastHeartbeatSecondsAgo?: number | null }>;
  database: { sizeBytes: string }; errorsLast24h: number; providerErrorsLast24h: Record<string, number>;
}
const LABEL: Record<string, string> = { database: 'PostgreSQL', redis: 'Redis', aiService: 'AI service', worker: 'Background worker' };

export default function SystemHealth() {
  const q = useQuery({ queryKey: ['admin', 'health'], queryFn: () => api<H>('/admin/system/health', { org: false }), refetchInterval: 30_000 });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} retry={() => q.refetch()} />;
  const h = q.data!;
  return (
    <>
      <PageHeader title="System health" description="Refreshes every 30 seconds. Host CPU, memory and request latency are in Grafana when the monitoring stack is enabled." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(h.services).map(([k, s]) => (
          <Card key={k}><CardContent className="flex items-start gap-3">
            {s.ok ? <CheckCircle2 className="size-5 text-emerald-500" /> : <XCircle className="size-5 text-destructive" />}
            <div className="text-sm"><p className="font-medium">{LABEL[k] ?? k}</p>
              <p className="text-muted-foreground">{s.ok ? (s.ms !== undefined ? `${s.ms} ms` : `heartbeat ${s.lastHeartbeatSecondsAgo}s ago`) : (s.error ?? (s.lastHeartbeatSecondsAgo === null ? 'no heartbeat' : `last heartbeat ${s.lastHeartbeatSecondsAgo}s ago`))}</p></div>
          </CardContent></Card>
        ))}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Database size" value={`${(Number(h.database.sizeBytes) / 1048576).toFixed(1)} MB`} />
        <Stat label="Errors (24 h)" value={h.errorsLast24h} tone={h.errorsLast24h ? 'warn' : 'good'} hint={h.errorsLast24h ? 'See error log in the audit page' : 'none'} />
        <Stat label="Provider API errors (24 h)" value={Object.values(h.providerErrorsLast24h).reduce((a, b) => a + b, 0)} hint={Object.entries(h.providerErrorsLast24h).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'none'} />
      </div>
      <Card className="mt-6"><CardHeader><CardTitle>Monitoring stack</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">
        Prometheus scrapes <code>/api/v1/metrics</code> (token protected) for request latency, job outcomes and provider errors; Loki collects container logs; Grafana dashboards are provisioned from <code>infrastructure/monitoring</code>. See docs/OPERATIONS_RUNBOOK.md.
      </CardContent></Card>
    </>
  );
}
