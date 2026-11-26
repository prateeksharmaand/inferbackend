'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field } from '@/components/app/form';
import { ErrorBlock, LoadingBlock } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { date } from '@/lib/format';

interface Org {
  id: string; name: string; currency: string; country: string; timezone: string; status: string; memberCount: number;
  subscription: { status: string; currentPeriodEnd: string; trialEndsAt: string | null; plan: { name: string; maxApps: number; maxMembers: number; maxAdAccounts: number; aiGenerationsMonth: number } } | null;
  brandKit: { colors: string[]; voice: string; guidelines: string; bannedClaims: string[] } | null;
}
const orgSchema = z.object({ name: z.string().trim().min(2).max(120), currency: z.string().regex(/^[A-Z]{3}$/, '3-letter code, e.g. INR'), country: z.string().regex(/^[A-Z]{2}$/, '2-letter code, e.g. IN'), timezone: z.string().min(2).max(60) });
const brandSchema = z.object({
  colors: z.string().refine((s) => s.split(',').map((x) => x.trim()).filter(Boolean).every((c) => /^#[0-9a-fA-F]{6}$/.test(c)), 'Comma-separated hex colours like #4F46E5'),
  voice: z.string().max(2000), guidelines: z.string().max(8000), bannedClaims: z.string().max(5000),
});

export default function OrgSettings() {
  const { org, can } = useOrg();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['org', org?.id], queryFn: () => api<Org>(`/organizations/${org!.id}`), enabled: !!org });
  const f = useForm<z.infer<typeof orgSchema>>({ resolver: zodResolver(orgSchema) });
  const b = useForm<z.infer<typeof brandSchema>>({ resolver: zodResolver(brandSchema) });
  useEffect(() => {
    if (!q.data) return;
    f.reset({ name: q.data.name, currency: q.data.currency, country: q.data.country, timezone: q.data.timezone });
    const k = q.data.brandKit;
    b.reset({ colors: (k?.colors ?? []).join(', '), voice: k?.voice ?? '', guidelines: k?.guidelines ?? '', bannedClaims: (k?.bannedClaims ?? []).join('\n') });
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: (v: z.infer<typeof orgSchema>) => api(`/organizations/${org!.id}`, { method: 'PATCH', body: v }),
    onSuccess: () => { toast.success('Organization saved'); qc.invalidateQueries({ queryKey: ['org'] }); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveBrand = useMutation({
    mutationFn: (v: z.infer<typeof brandSchema>) => api(`/organizations/${org!.id}/brand-kit`, { method: 'PUT', body: {
      colors: v.colors.split(',').map((x) => x.trim()).filter(Boolean), voice: v.voice, guidelines: v.guidelines,
      bannedClaims: v.bannedClaims.split('\n').map((x) => x.trim()).filter(Boolean),
    } }),
    onSuccess: () => { toast.success('Brand kit saved'); qc.invalidateQueries({ queryKey: ['org'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} retry={() => q.refetch()} />;
  const d = q.data!; const editable = can('org.manage');
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Organization</CardTitle><CardDescription>Currency is used for budgets and reports. Ad platforms bill in each ad account&apos;s own currency.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={f.handleSubmit((v) => save.mutate(v))}>
              <div className="sm:col-span-2"><Field label="Name" id="name" reg={f.register('name')} error={f.formState.errors.name} disabled={!editable} /></div>
              <Field label="Currency" id="currency" reg={f.register('currency')} error={f.formState.errors.currency} disabled={!editable} />
              <Field label="Country" id="country" reg={f.register('country')} error={f.formState.errors.country} disabled={!editable} />
              <div className="sm:col-span-2"><Field label="Time zone" id="timezone" reg={f.register('timezone')} error={f.formState.errors.timezone} hint="IANA name, e.g. Asia/Kolkata" disabled={!editable} /></div>
              {editable && <div><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button></div>}
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Brand kit</CardTitle><CardDescription>The Creative agent follows these. Banned claims are checked on every generated creative.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={b.handleSubmit((v) => saveBrand.mutate(v))}>
              <Field label="Brand colours" id="colors" reg={b.register('colors')} error={b.formState.errors.colors} hint="Comma-separated, e.g. #4F46E5, #10B981" disabled={!editable} />
              <Field label="Brand voice" id="voice" textarea reg={b.register('voice')} error={b.formState.errors.voice} />
              <Field label="Marketing guidelines" id="guidelines" textarea reg={b.register('guidelines')} error={b.formState.errors.guidelines} />
              <Field label="Banned claims (one per line)" id="bannedClaims" textarea reg={b.register('bannedClaims')} error={b.formState.errors.bannedClaims} hint='e.g. "cures", "guaranteed results", "#1 app"' />
              {editable && <Button type="submit" disabled={saveBrand.isPending}>{saveBrand.isPending ? 'Saving…' : 'Save brand kit'}</Button>}
            </form>
          </CardContent>
        </Card>
      </div>
      <Card className="h-fit">
        <CardHeader><CardTitle>Subscription</CardTitle><CardDescription>Platform fee only — advertising spend is billed by each ad platform to your own account.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {d.subscription ? <>
            <div className="flex items-center justify-between"><span className="text-lg font-semibold">{d.subscription.plan.name}</span><Badge variant={d.subscription.status === 'ACTIVE' ? 'default' : 'secondary'}>{d.subscription.status.toLowerCase()}</Badge></div>
            <p className="text-muted-foreground">{d.subscription.trialEndsAt ? `Trial ends ${date(d.subscription.trialEndsAt)}` : `Renews ${date(d.subscription.currentPeriodEnd)}`}</p>
            <ul className="space-y-1">
              <li>Apps: {d.subscription.plan.maxApps}</li><li>Members: {d.memberCount} / {d.subscription.plan.maxMembers}</li>
              <li>Ad accounts: {d.subscription.plan.maxAdAccounts}</li><li>AI generations / month: {d.subscription.plan.aiGenerationsMonth}</li>
            </ul>
            <p className="text-xs text-muted-foreground">To change plan, contact Nous Healthcare Solutions support from the Support page.</p>
          </> : <p>No subscription.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
