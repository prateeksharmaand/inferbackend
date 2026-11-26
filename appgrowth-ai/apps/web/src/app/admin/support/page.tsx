'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { Thread, Ticket } from '@/components/app/thread';
import { EmptyBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { ago, titleCase } from '@/lib/format';

export default function AdminSupport() {
  const qc = useQueryClient(); const [status, setStatus] = useState('OPEN'); const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin', 'tickets', status], queryFn: () => api<Ticket[]>(`/admin/support/tickets${status ? `?status=${status}` : ''}`, { org: false }) });
  const reply = useMutation({ mutationFn: (v: { id: string; body: string }) => api(`/admin/support/tickets/${v.id}/reply`, { body: { body: v.body }, org: false }), onSuccess: () => { toast.success('Reply sent'); qc.invalidateQueries({ queryKey: ['admin', 'tickets'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const upd = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/admin/support/tickets/${v.id}`, { method: 'PATCH', body: { status: v.status }, org: false }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tickets'] }), onError: (e) => toast.error(errorMessage(e)) });
  const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];
  return (
    <>
      <PageHeader title="Support" />
      <NativeSelect aria-label="Status" className="mb-4 w-48" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All" options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
      {q.isLoading ? <LoadingBlock /> : !q.data?.length ? <EmptyBlock title="No tickets" /> : (
        <div className="space-y-3">{q.data.map((t) => (
          <Card key={t.id}>
            <CardHeader><button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}><CardTitle className="text-base">{t.subject}</CardTitle><span className="flex items-center gap-1 text-xs text-muted-foreground">updated {ago(t.updatedAt)} <Badge variant={t.priority === 'urgent' || t.priority === 'high' ? 'destructive' : 'outline'}>{t.priority}</Badge><Badge variant="secondary">{titleCase(t.status)}</Badge></span></button></CardHeader>
            {open === t.id && <CardContent className="space-y-3">
              <NativeSelect aria-label="Set status" className="w-48" value={t.status} onChange={(e) => upd.mutate({ id: t.id, status: e.target.value })} options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
              <Thread t={t} onReply={(body) => reply.mutate({ id: t.id, body })} />
            </CardContent>}
          </Card>
        ))}</div>
      )}
    </>
  );
}
