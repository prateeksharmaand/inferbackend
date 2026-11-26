'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { PageHeader } from '@/components/app/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';
import { titleCase } from '@/lib/format';

interface App { id: string; name: string; platforms: { platform: string }[] }
interface Acc { id: string; providerKey: string; name: string; status: string; currency: string | null }
interface Creative { id: string; title: string; type: string; approvalStatus: string; content: { headline?: string; body?: string } }
const PK: Record<string, string> = { GOOGLE_ADS: 'google_ads', APPLE_ADS: 'apple_ads', META_ADS: 'meta_ads', TIKTOK_ADS: 'tiktok_ads' };

function NewCampaign() {
  const router = useRouter(); const qc = useQueryClient(); const strategy = useSearchParams().get('strategy');
  const apps = useQuery({ queryKey: ['apps', 'full'], queryFn: () => api<{ items: App[] }>('/apps?pageSize=100') });
  const integ = useQuery({ queryKey: ['integrations'], queryFn: () => api<{ accounts: Acc[] }>('/integrations') });
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ applicationId: '', provider: 'GOOGLE_ADS', platform: 'ANDROID', connectedAccountId: '', name: '', countries: 'IN', languages: 'en', dailyBudget: '', targetCpi: '', startDate: tomorrow, endDate: '' });
  const [creativeIds, setCreativeIds] = useState<string[]>([]);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const app = apps.data?.items.find((a) => a.id === f.applicationId);
  const accounts = (integ.data?.accounts ?? []).filter((a) => a.providerKey === PK[f.provider] && a.status === 'CONNECTED');
  const creatives = useQuery({ queryKey: ['creatives', 'approved', f.applicationId], queryFn: () => api<{ items: Creative[] }>(`/creatives?applicationId=${f.applicationId}&approvalStatus=APPROVED&pageSize=100`), enabled: !!f.applicationId });
  const platforms = useMemo(() => (app?.platforms ?? []).map((p) => p.platform).filter((p) => f.provider !== 'APPLE_ADS' || p === 'IOS'), [app, f.provider]);
  const fromStrategy = useMutation({ mutationFn: () => api<{ executionId: string }>(`/campaigns/from-strategy/${strategy}`, { method: 'POST' }), onSuccess: () => { toast.success('Drafting campaigns and creatives from the plan — you’ll be notified when they’re ready to review'); router.push('/automation'); }, onError: (e) => toast.error(errorMessage(e)) });
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/campaigns', { body: { ...f, connectedAccountId: f.connectedAccountId || undefined, targetCpi: f.targetCpi || undefined, endDate: f.endDate || undefined, countries: f.countries.split(/[,\s]+/).filter(Boolean).map((c) => c.toUpperCase()), languages: f.languages.split(/[,\s]+/).filter(Boolean), creativeIds } }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Draft created'); router.push(`/campaigns/${c.id}`); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="New campaign" description="Creates a draft. It goes to the ad platform only after approval and launch, and only within your spending limits." />
      {strategy && (
        <Card className="mb-6 border-primary/40"><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Draft every campaign in the approved plan, with AI-generated creatives for review.</p>
          <Button onClick={() => fromStrategy.mutate()} disabled={fromStrategy.isPending}><Sparkles /> Draft from plan</Button>
        </CardContent></Card>
      )}
      <form className="grid gap-6 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Setup</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="name">Campaign name</Label><Input id="name" required minLength={3} maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="app">App</Label><NativeSelect id="app" required value={f.applicationId} onChange={(e) => { set('applicationId', e.target.value); setCreativeIds([]); }} placeholder="Choose an app" options={(apps.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="ch">Channel</Label><NativeSelect id="ch" value={f.provider} onChange={(e) => { set('provider', e.target.value); set('connectedAccountId', ''); if (e.target.value === 'APPLE_ADS') set('platform', 'IOS'); }} options={Object.keys(PK).map((k) => ({ value: k, label: titleCase(k) }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="pf">Platform</Label><NativeSelect id="pf" value={f.platform} onChange={(e) => set('platform', e.target.value)} options={(platforms.length ? platforms : ['ANDROID', 'IOS']).map((p) => ({ value: p, label: p === 'IOS' ? 'iOS' : 'Android' }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="acc">Ad account</Label><NativeSelect id="acc" value={f.connectedAccountId} onChange={(e) => set('connectedAccountId', e.target.value)} placeholder={accounts.length ? 'Choose account' : 'None connected'} options={accounts.map((a) => ({ value: a.id, label: `${a.name}${a.currency ? ` (${a.currency})` : ''}` }))} />
            {!accounts.length && <p className="text-xs text-muted-foreground"><Link href="/integrations" className="text-primary hover:underline">Connect {titleCase(f.provider)}</Link> to launch; you can draft without one.</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="ct">Countries</Label><Input id="ct" required value={f.countries} onChange={(e) => set('countries', e.target.value)} placeholder="IN, AE" /></div>
          <div className="space-y-1.5"><Label htmlFor="lg">Languages</Label><Input id="lg" value={f.languages} onChange={(e) => set('languages', e.target.value)} placeholder="en, hi" /></div>
        </CardContent></Card>
        <Card className="h-fit"><CardHeader><CardTitle>Budget & schedule</CardTitle><CardDescription>Checked against your monthly budget and automation limits at launch.</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="db">Daily budget</Label><Input id="db" required inputMode="decimal" value={f.dailyBudget} onChange={(e) => set('dailyBudget', e.target.value.replace(/[^\d.]/g, ''))} /></div>
          <div className="space-y-1.5"><Label htmlFor="tc">Target CPI (optional)</Label><Input id="tc" inputMode="decimal" value={f.targetCpi} onChange={(e) => set('targetCpi', e.target.value.replace(/[^\d.]/g, ''))} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="sd">Start</Label><Input id="sd" type="date" required value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="ed">End</Label><Input id="ed" type="date" value={f.endDate} min={f.startDate} onChange={(e) => set('endDate', e.target.value)} /></div></div>
        </CardContent></Card>
        {f.provider !== 'APPLE_ADS' && f.applicationId && (
          <Card className="lg:col-span-3"><CardHeader><CardTitle>Approved creatives</CardTitle><CardDescription>At least one is required before approval. <Link href="/creatives" className="text-primary hover:underline">Generate more</Link></CardDescription></CardHeader><CardContent>
            {!creatives.data?.items.length ? <p className="text-sm text-muted-foreground">No approved creatives for this app yet.</p> : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{creatives.data.items.map((c) => (
                <label key={c.id} className="flex cursor-pointer gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary">
                  <Checkbox checked={creativeIds.includes(c.id)} onCheckedChange={(v) => setCreativeIds((x) => (v ? [...x, c.id] : x.filter((y) => y !== c.id)))} />
                  <span><span className="block text-xs uppercase text-muted-foreground">{titleCase(c.type)}</span>{c.content.headline || c.content.body || c.title}</span>
                </label>
              ))}</div>
            )}
          </CardContent></Card>
        )}
        {f.provider === 'APPLE_ADS' && <Alert className="lg:col-span-3"><AlertDescription>Apple Ads search results ads use your App Store listing as the creative.</AlertDescription></Alert>}
        <div className="lg:col-span-3"><Button type="submit" size="lg" disabled={create.isPending || !f.applicationId || !f.dailyBudget || !f.name}>{create.isPending ? 'Saving…' : 'Create draft'}</Button></div>
      </form>
    </>
  );
}
export default function NewCampaignPage() { return <Suspense><NewCampaign /></Suspense>; }
