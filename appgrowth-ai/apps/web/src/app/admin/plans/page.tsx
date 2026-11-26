'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';
import { majorFromMinor, money } from '@/lib/format';

interface Plan { key: string; name: string; description: string; priceMinor: string; currency: string; trialDays: number; maxApps: number; maxMembers: number; maxAdAccounts: number; aiGenerationsMonth: number; aiTokensMonth: string; isActive: boolean; isPublic: boolean; _count: { subscriptions: number } }

function PlanCard({ p }: { p: Plan }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ name: p.name, price: majorFromMinor(p.priceMinor), trialDays: p.trialDays, maxApps: p.maxApps, maxMembers: p.maxMembers, maxAdAccounts: p.maxAdAccounts, aiGenerationsMonth: p.aiGenerationsMonth, aiTokensMonth: p.aiTokensMonth, isActive: p.isActive });
  const save = useMutation({ mutationFn: () => api(`/admin/plans/${p.key}`, { method: 'PATCH', body: { ...v, trialDays: Number(v.trialDays), maxApps: Number(v.maxApps), maxMembers: Number(v.maxMembers), maxAdAccounts: Number(v.maxAdAccounts), aiGenerationsMonth: Number(v.aiGenerationsMonth) }, org: false }), onSuccess: () => { toast.success(`${v.name} saved`); qc.invalidateQueries({ queryKey: ['admin', 'plans'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const f = (k: keyof typeof v, label: string, type = 'number') => (
    <div className="space-y-1"><Label htmlFor={`${p.key}-${k}`} className="text-xs">{label}</Label><Input id={`${p.key}-${k}`} type={type} value={String(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{p.name}</CardTitle><div className="flex gap-1"><Badge variant="secondary">{p._count.subscriptions} active</Badge>{!p.isPublic && <Badge variant="outline">private</Badge>}</div></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{money(p.priceMinor, p.currency)} / month</p>
        <div className="grid grid-cols-2 gap-3">
          {f('name', 'Name', 'text')}{f('price', `Price (${p.currency})`, 'text')}{f('trialDays', 'Trial days')}{f('maxApps', 'Apps')}{f('maxMembers', 'Members')}{f('maxAdAccounts', 'Ad accounts')}{f('aiGenerationsMonth', 'AI generations / mo')}{f('aiTokensMonth', 'AI tokens / mo', 'text')}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Available for new subscriptions</label>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </CardContent>
    </Card>
  );
}

interface Inv { id: string; number: string; organizationId: string; status: string; total: string; currency: string; issuedAt: string; payments: { amountMinor: string; method: string }[] }
function Invoices() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'invoices'], queryFn: () => api<Inv[]>('/admin/invoices', { org: false }) });
  const pay = useMutation({ mutationFn: (v: { invoiceId: string; amount: string; reference: string }) => api('/admin/payments', { body: { ...v, method: 'bank_transfer' }, org: false }), onSuccess: () => { toast.success('Payment recorded'); qc.invalidateQueries({ queryKey: ['admin', 'invoices'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  if (!q.data?.length) return <p className="mt-8 text-sm text-muted-foreground">No invoices issued yet. Issue them from an organization’s page.</p>;
  return (
    <Card className="mt-8"><CardHeader><CardTitle>Invoices</CardTitle></CardHeader><CardContent className="divide-y text-sm">
      {q.data.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span><span className="font-medium">{i.number}</span> · {money(Math.round(Number(i.total) * 100), i.currency)} · {new Date(i.issuedAt).toLocaleDateString()} <Badge variant={i.status === 'paid' ? 'secondary' : 'outline'}>{i.status}</Badge></span>
          {i.status !== 'paid' && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); pay.mutate({ invoiceId: i.id, amount: String(f.get('amount')), reference: String(f.get('ref')) }); }}>
            <Input name="amount" defaultValue={i.total} className="h-8 w-28" aria-label="Amount" /><Input name="ref" placeholder="Bank reference" className="h-8 w-40" aria-label="Reference" /><Button size="sm" type="submit">Record payment</Button>
          </form>}
        </div>
      ))}
    </CardContent></Card>
  );
}

export default function Plans() {
  const q = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api<Plan[]>('/admin/plans', { org: false }) });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} />;
  return (
    <>
      <PageHeader title="Plans & billing" description="Subscription pricing and limits. Changes apply to new periods; ad spend is never billed through these plans." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data!.map((p) => <PlanCard key={p.key} p={p} />)}</div>
      <Invoices />
    </>
  );
}
