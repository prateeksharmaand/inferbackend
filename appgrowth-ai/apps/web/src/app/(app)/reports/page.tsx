'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { date, dateTime, titleCase } from '@/lib/format';

interface Report { id: string; kind: string; title: string; periodStart: string; periodEnd: string; status: string; error: string | null; createdAt: string }
const KINDS = ['daily', 'weekly', 'monthly', 'budget', 'campaign', 'installs', 'recommendations'];

export default function ReportsPage() {
  const { org, can } = useOrg(); const qc = useQueryClient();
  const [kind, setKind] = useState('weekly'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const q = useQuery({ queryKey: ['reports', org?.id], queryFn: () => api<{ items: Report[] }>('/reports?pageSize=50'), enabled: !!org, refetchInterval: (x) => (x.state.data?.items.some((r) => r.status === 'queued') ? 4000 : false) });
  const gen = useMutation({ mutationFn: () => api('/reports/generate', { body: { kind, ...(from && to ? { from, to } : {}) } }), onSuccess: () => { toast.success('Report queued'); qc.invalidateQueries({ queryKey: ['reports'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const download = async (id: string, format: 'pdf' | 'csv') => { try { const r = await api<{ url: string }>(`/reports/${id}/download?format=${format}`); location.href = r.url; } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <>
      <PageHeader title="Reports" description="Daily reports are generated and emailed automatically. Create any report on demand; download as PDF or CSV." />
      {can('reports.write') && (
        <Card className="mb-6"><CardHeader><CardTitle>Generate a report</CardTitle><CardDescription>Leave the dates empty to use the standard period for the report type.</CardDescription></CardHeader><CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); gen.mutate(); }}>
            <div className="space-y-1.5"><Label htmlFor="rk">Type</Label><NativeSelect id="rk" className="w-44" value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS.map((k) => ({ value: k, label: titleCase(k) }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="rf">From</Label><Input id="rf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="rt">To</Label><Input id="rt" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
            <Button type="submit" disabled={gen.isPending}>Generate</Button>
          </form>
        </CardContent></Card>
      )}
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !q.data!.items.length ? <EmptyBlock icon={FileText} title="No reports yet" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><Table>
          <TableHeader><TableRow><TableHead>Report</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{q.data!.items.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.title}</TableCell><TableCell>{date(r.periodStart)} – {date(r.periodEnd)}</TableCell>
              <TableCell><Badge variant={r.status === 'ready' ? 'secondary' : r.status === 'failed' ? 'destructive' : 'outline'}>{r.status}</Badge>{r.error && <p className="max-w-xs truncate text-xs text-destructive" title={r.error}>{r.error}</p>}</TableCell>
              <TableCell className="text-xs">{dateTime(r.createdAt)}</TableCell>
              <TableCell className="text-right">{r.status === 'ready' && <div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => download(r.id, 'pdf')}><Download /> PDF</Button><Button size="sm" variant="outline" onClick={() => download(r.id, 'csv')}><Download /> CSV</Button></div>}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></div>
      )}
    </>
  );
}
