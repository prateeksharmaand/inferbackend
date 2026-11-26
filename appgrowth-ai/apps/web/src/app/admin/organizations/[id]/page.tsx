'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { ago, date } from '@/lib/format';

interface Org {
  id: string; name: string; slug: string; status: string; suspendedReason: string | null; currency: string; automationEnabled: boolean; createdAt: string;
  members: { id: string; user: { email: string; name: string; lastLoginAt: string | null; mfaEnabledAt: string | null }; role: { key: string } }[];
  subscriptions: { id: string; status: string; currentPeriodEnd: string; plan: { key: string; name: string } }[];
  applications: { id: string; name: string; monthlyInstallTarget: number; platforms: { platform: string; storeId: string }[] }[];
  accounts: { id: string; providerKey: string; name: string; status: string; statusDetail: string; lastSyncedAt: string | null }[];
}

export default function AdminOrgDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'org', id], queryFn: () => api<Org>(`/admin/organizations/${id}`, { org: false }) });
  const plans = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api<{ key: string; name: string; isActive: boolean }[]>('/admin/plans', { org: false }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const suspend = useMutation({ mutationFn: () => api(`/admin/organizations/${id}/suspend`, { body: { reason }, org: false }), onSuccess: () => { toast.success('Suspended; automation stopped'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const reactivate = useMutation({ mutationFn: () => api(`/admin/organizations/${id}/reactivate`, { method: 'POST', org: false }), onSuccess: () => { toast.success('Reactivated (automation stays off until the customer resumes it)'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const invoice = useMutation({ mutationFn: () => api<{ number: string }>(`/admin/organizations/${id}/invoices`, { method: 'POST', org: false }), onSuccess: (r) => { toast.success(`Invoice ${r.number} issued`); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const plan = useMutation({ mutationFn: (planKey: string) => api(`/admin/organizations/${id}/plan`, { method: 'PUT', body: { planKey }, org: false }), onSuccess: () => { toast.success('Plan changed'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} />;
  const o = q.data!; const sub = o.subscriptions.find((s) => ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(s.status));
  return (
    <>
      <PageHeader title={o.name} description={`${o.slug} · created ${date(o.createdAt)} · ${o.currency}`} actions={<Badge variant={o.status === 'ACTIVE' ? 'secondary' : 'destructive'}>{o.status.toLowerCase()}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Applications ({o.applications.length})</CardTitle></CardHeader><CardContent>
          {o.applications.length ? <ul className="divide-y text-sm">{o.applications.map((a) => <li key={a.id} className="flex justify-between py-2"><span className="font-medium">{a.name}</span><span className="text-muted-foreground">{a.platforms.map((p) => `${p.platform}: ${p.storeId}`).join(' · ')} · target {a.monthlyInstallTarget}/mo</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No apps yet.</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Subscription</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          <p>{sub ? `${sub.plan.name} · ${sub.status.toLowerCase()} · until ${date(sub.currentPeriodEnd)}` : 'None'}</p>
          <Button size="sm" variant="outline" onClick={() => invoice.mutate()} disabled={invoice.isPending || sub?.status !== 'ACTIVE'}>Issue invoice for this period</Button>
          <NativeSelect aria-label="Change plan" value={sub?.plan.key ?? ''} placeholder="Change plan…" onChange={(e) => e.target.value && confirm(`Move ${o.name} to ${e.target.value}?`) && plan.mutate(e.target.value)} options={(plans.data ?? []).filter((p) => p.isActive).map((p) => ({ value: p.key, label: p.name }))} />
        </CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Members</CardTitle></CardHeader><CardContent>
          <ul className="divide-y text-sm">{o.members.map((m) => <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium">{m.user.name}</span> · {m.user.email}</span><span className="text-muted-foreground">{m.role.key} · last sign-in {ago(m.user.lastLoginAt)} · {m.user.mfaEnabledAt ? '2FA on' : '2FA off'}</span></li>)}</ul>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{o.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          {o.status === 'ACTIVE' ? <>
            <p className="text-muted-foreground">Members keep read access; all changes and automation stop immediately.</p>
            <Input placeholder="Reason (shown in audit log)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Suspension reason" />
            <Button variant="destructive" disabled={reason.length < 3 || suspend.isPending} onClick={() => suspend.mutate()}>Suspend organization</Button>
          </> : <>
            <p>Reason: {o.suspendedReason ?? '—'}</p>
            <Button onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>Reactivate</Button>
          </>}
        </CardContent></Card>
        <Card className="lg:col-span-3"><CardHeader><CardTitle>Connected accounts</CardTitle></CardHeader><CardContent>
          {o.accounts.length ? <ul className="divide-y text-sm">{o.accounts.map((a) => <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-medium">{a.providerKey} · {a.name}</span><span className={a.status === 'CONNECTED' ? 'text-muted-foreground' : 'text-destructive'}>{a.status.toLowerCase()} {a.statusDetail && `· ${a.statusDetail}`} · synced {ago(a.lastSyncedAt)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No accounts connected.</p>}
        </CardContent></Card>
      </div>
    </>
  );
}
