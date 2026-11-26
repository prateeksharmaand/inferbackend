'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Thread, Ticket } from '@/components/app/thread';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { titleCase } from '@/lib/format';

export default function SupportPage() {
  const { org } = useOrg(); const qc = useQueryClient();
  const [f, setF] = useState({ subject: '', body: '', priority: 'normal' }); const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['tickets', org?.id], queryFn: () => api<Ticket[]>('/support/tickets'), enabled: !!org });
  const create = useMutation({ mutationFn: () => api<Ticket>('/support/tickets', { body: f }), onSuccess: (t) => { toast.success('Ticket opened — our team will reply here and by email'); setF({ subject: '', body: '', priority: 'normal' }); setOpen(t.id); qc.invalidateQueries({ queryKey: ['tickets'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const reply = useMutation({ mutationFn: (v: { id: string; body: string }) => api(`/support/tickets/${v.id}/reply`, { body: { body: v.body } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title="Support" description="Questions about the product, billing or plan changes go to the Nous Healthcare Solutions team." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit"><CardHeader><CardTitle>New request</CardTitle></CardHeader><CardContent>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div className="space-y-1.5"><Label htmlFor="s-sub">Subject</Label><Input id="s-sub" required minLength={4} maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-pri">Priority</Label><NativeSelect id="s-pri" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} options={['low', 'normal', 'high', 'urgent'].map((p) => ({ value: p, label: titleCase(p) }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-body">Details</Label><Textarea id="s-body" required minLength={4} rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
            <Button type="submit" disabled={create.isPending}>Send</Button>
          </form>
        </CardContent></Card>
        <div className="space-y-3 lg:col-span-2">
          {q.isLoading ? <LoadingBlock /> : !q.data?.length ? <EmptyBlock icon={LifeBuoy} title="No requests yet" /> : q.data.map((t) => (
            <Card key={t.id}>
              <CardHeader><button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}><CardTitle className="text-base">{t.subject}</CardTitle><span className="flex gap-1"><Badge variant="outline">{t.priority}</Badge><Badge variant={t.status === 'WAITING_CUSTOMER' ? 'default' : 'secondary'}>{titleCase(t.status)}</Badge></span></button></CardHeader>
              {open === t.id && <CardContent><Thread t={t} onReply={(body) => reply.mutate({ id: t.id, body })} /></CardContent>}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
