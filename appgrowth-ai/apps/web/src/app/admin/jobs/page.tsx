'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';

interface Q { name: string; ok: boolean; waiting?: number; active?: number; delayed?: number; failed?: number; completed?: number; error?: string }
interface F { id: string; name: string; attemptsMade: number; failedReason?: string; finishedOn?: number; orgId?: string }

export default function Jobs() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin', 'jobs'], queryFn: () => api<Q[]>('/admin/system/jobs', { org: false }), refetchInterval: 15_000 });
  const failed = useQuery({ queryKey: ['admin', 'jobs', sel], queryFn: () => api<F[]>(`/admin/system/jobs/${sel}/failed`, { org: false }), enabled: !!sel });
  const retry = useMutation({ mutationFn: (id: string) => api(`/admin/system/jobs/${sel}/${id}/retry`, { method: 'POST', org: false }), onSuccess: () => { toast.success('Job re-queued'); qc.invalidateQueries({ queryKey: ['admin', 'jobs'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} />;
  return (
    <>
      <PageHeader title="Background jobs" description="BullMQ queues. Failed jobs are kept 30 days as the dead-letter record and can be retried." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {q.data!.map((x) => (
          <button key={x.name} onClick={() => setSel(x.name)} className={`rounded-xl border bg-card p-4 text-left text-sm transition hover:bg-muted ${sel === x.name ? 'ring-2 ring-primary/40' : ''}`}>
            <p className="font-medium">{x.name}</p>
            {x.ok ? <p className="mt-1 text-muted-foreground tabular">{x.waiting} waiting · {x.active} active · {x.delayed} delayed<br /><span className={x.failed ? 'text-destructive' : ''}>{x.failed} failed</span> · {x.completed} done</p> : <p className="text-destructive">{x.error}</p>}
          </button>
        ))}
      </div>
      {sel && (
        <Card className="mt-6"><CardContent>
          <p className="mb-3 font-medium">Failed jobs in “{sel}”</p>
          {failed.isLoading ? <LoadingBlock rows={2} /> : !failed.data?.length ? <EmptyBlock title="No failed jobs" /> : (
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Org</TableHead><TableHead>Attempts</TableHead><TableHead>Reason</TableHead><TableHead>Failed</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{failed.data.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-mono text-xs">{j.name}#{j.id}</TableCell><TableCell className="font-mono text-xs">{j.orgId?.slice(0, 8) ?? '—'}</TableCell>
                  <TableCell>{j.attemptsMade}</TableCell><TableCell className="max-w-md truncate text-xs" title={j.failedReason}>{j.failedReason}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{j.finishedOn ? dateTime(new Date(j.finishedOn)) : '—'}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => retry.mutate(j.id)}>Retry</Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></div>
          )}
        </CardContent></Card>
      )}
    </>
  );
}
