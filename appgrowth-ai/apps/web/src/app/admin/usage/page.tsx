'use client';
import { useQuery } from '@tanstack/react-query';
import { ErrorBlock, LoadingBlock, PageHeader, Stat } from '@/components/app/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { dateTime, num } from '@/lib/format';

interface U { byOrganization: { organization: string; requests: number; avgMs: number }[]; byRoute: { route: string; requests: number; avgMs: number }[]; slowRequests: number; serverErrors: number; storage: { bytes: number; objects: number } }
interface E { id: string; service: string; message: string; createdAt: string; organizationId: string | null }

export default function AdminUsage() {
  const q = useQuery({ queryKey: ['admin', 'usage'], queryFn: () => api<U>('/admin/usage', { org: false }) });
  const errs = useQuery({ queryKey: ['admin', 'errors'], queryFn: () => api<E[]>('/admin/system/errors', { org: false }) });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} />;
  const d = q.data!;
  return (
    <>
      <PageHeader title="API & storage usage" description="Last 7 days of API requests. p95 latency per route is in Grafana." />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Requests (7d)" value={num(d.byOrganization.reduce((s, o) => s + o.requests, 0))} />
        <Stat label="Slow (>800 ms)" value={num(d.slowRequests)} tone={d.slowRequests ? 'warn' : 'good'} />
        <Stat label="Server errors" value={num(d.serverErrors)} tone={d.serverErrors ? 'bad' : 'good'} />
        <Stat label="Stored files" value={d.storage.bytes < 0 ? 'unavailable' : `${(d.storage.bytes / 1048576).toFixed(1)} MB`} hint={d.storage.objects >= 0 ? `${num(d.storage.objects)} objects` : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>By organization</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Organization</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Avg ms</TableHead></TableRow></TableHeader><TableBody>{d.byOrganization.map((o) => <TableRow key={o.organization}><TableCell>{o.organization}</TableCell><TableCell className="text-right">{num(o.requests)}</TableCell><TableCell className="text-right">{o.avgMs}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle>Busiest routes</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Route</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Avg ms</TableHead></TableRow></TableHeader><TableBody>{d.byRoute.map((r) => <TableRow key={r.route}><TableCell className="font-mono text-xs">{r.route}</TableCell><TableCell className="text-right">{num(r.requests)}</TableCell><TableCell className={`text-right ${r.avgMs > 500 ? 'text-amber-600' : ''}`}>{r.avgMs}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      </div>
      <Card className="mt-6"><CardHeader><CardTitle>Recent errors</CardTitle></CardHeader><CardContent>{errs.data?.length ? <ul className="space-y-1 font-mono text-xs">{errs.data.slice(0, 50).map((e) => <li key={e.id}><span className="text-muted-foreground">{dateTime(e.createdAt)} [{e.service}]</span> {e.message}</li>)}</ul> : <p className="text-sm text-muted-foreground">No errors logged.</p>}</CardContent></Card>
    </>
  );
}
