'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';

interface Lookup { platform: 'ANDROID' | 'IOS'; storeId: string; storeUrl: string; validated: boolean; note: string; listing: { title: string; description: string; category: string; iconUrl: string; developer: string; rating: number | null } | null }
const csv = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

function NewApp() {
  const router = useRouter(); const welcome = useSearchParams().get('welcome'); const qc = useQueryClient();
  const [link, setLink] = useState('');
  const [found, setFound] = useState<Lookup[]>([]);
  const [f, setF] = useState({ name: '', category: '', description: '', targetAudience: '', monthlyInstallTarget: '10000', targetCpi: '', countries: 'IN', languages: 'en', androidPackage: '', iosBundle: '', runOnboarding: true });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const lookup = useMutation({
    mutationFn: () => api<Lookup>('/apps/lookup', { body: { url: link.trim() } }),
    onSuccess: (r) => {
      setFound((x) => [...x.filter((y) => y.platform !== r.platform), r]); setLink('');
      if (r.platform === 'ANDROID') set('androidPackage', r.storeId); else set('iosBundle', r.storeId);
      if (r.listing) setF((x) => ({ ...x, name: x.name || r.listing!.title, category: x.category || r.listing!.category, description: x.description || r.listing!.description }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/apps', { body: {
      name: f.name.trim(), category: f.category || undefined, description: f.description || undefined, targetAudience: f.targetAudience || undefined,
      monthlyInstallTarget: Number(f.monthlyInstallTarget), targetCpi: f.targetCpi || undefined, countries: csv(f.countries).map((c) => c.toUpperCase()), languages: csv(f.languages),
      android: f.androidPackage ? { packageName: f.androidPackage.trim() } : undefined, ios: f.iosBundle ? (found.find((x) => x.platform === 'IOS' && x.storeId === f.iosBundle) ? { storeUrl: found.find((x) => x.platform === 'IOS')!.storeUrl } : { bundleId: f.iosBundle.trim() }) : undefined,
      runOnboarding: f.runOnboarding,
    } }),
    onSuccess: (a) => { qc.invalidateQueries({ queryKey: ['apps'] }); toast.success(f.runOnboarding ? 'App added — AI research has started' : 'App added'); router.push(`/apps/${a.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title={welcome ? 'Welcome — add your first app' : 'Add an app'} description="Add one or both platforms. We check the identifiers against the stores before saving." />
      <div className="grid gap-6 lg:grid-cols-3">
        <form className="space-y-6 lg:col-span-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Card>
            <CardHeader><CardTitle>Find it in the store</CardTitle><CardDescription>Paste a Google Play or App Store link. iOS details are imported from Apple’s public lookup; Google doesn’t publish listing data, so Android text can be imported later through Play Console access.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input aria-label="Store link" placeholder="https://play.google.com/store/apps/details?id=…" value={link} onChange={(e) => setLink(e.target.value)} />
                <Button type="button" variant="outline" disabled={!link || lookup.isPending} onClick={() => lookup.mutate()}><Search /> {lookup.isPending ? 'Checking…' : 'Check'}</Button>
              </div>
              {found.map((r) => (
                <div key={r.platform} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  {r.listing?.iconUrl ? <img src={r.listing.iconUrl} alt="" className="size-10 rounded-lg" /> : <CheckCircle2 className="size-5 text-emerald-500" />}
                  <div className="min-w-0"><p className="font-medium">{r.platform === 'IOS' ? 'iOS' : 'Android'} · {r.storeId}</p><p className="truncate text-muted-foreground">{r.listing ? `${r.listing.title} · ${r.listing.developer}` : r.note}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>App details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="name">Name</Label><Input id="name" required minLength={2} maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="pkg">Android package name</Label><Input id="pkg" placeholder="com.example.app" value={f.androidPackage} onChange={(e) => set('androidPackage', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="bundle">iOS bundle identifier</Label><Input id="bundle" placeholder="com.example.app" value={f.iosBundle} onChange={(e) => set('iosBundle', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="cat">Category</Label><Input id="cat" maxLength={80} value={f.category} onChange={(e) => set('category', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="aud">Target audience</Label><Input id="aud" maxLength={2000} placeholder="e.g. working professionals 25–40 managing diabetes" value={f.targetAudience} onChange={(e) => set('targetAudience', e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="desc">Product description</Label><Textarea id="desc" rows={4} maxLength={8000} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Goals and markets</CardTitle><CardDescription>Targets guide planning. We forecast what your budget can realistically achieve — installs are never guaranteed.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="tgt">Monthly install target</Label><Input id="tgt" type="number" min={1} required value={f.monthlyInstallTarget} onChange={(e) => set('monthlyInstallTarget', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="cpi">Target cost per install (optional)</Label><Input id="cpi" inputMode="decimal" placeholder="e.g. 25.00" value={f.targetCpi} onChange={(e) => set('targetCpi', e.target.value.replace(/[^\d.]/g, ''))} /></div>
              <div className="space-y-1.5"><Label htmlFor="ctry">Target countries</Label><Input id="ctry" placeholder="IN, AE, GB" value={f.countries} onChange={(e) => set('countries', e.target.value)} /><p className="text-xs text-muted-foreground">2-letter codes, comma-separated</p></div>
              <div className="space-y-1.5"><Label htmlFor="lang">Languages</Label><Input id="lang" placeholder="en, hi" value={f.languages} onChange={(e) => set('languages', e.target.value)} /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={f.runOnboarding} onCheckedChange={(c) => set('runOnboarding', !!c)} /> Run AI market research, ASO audit and growth strategy after adding</label>
            </CardContent>
          </Card>
          {!f.androidPackage && !f.iosBundle && <Alert><AlertDescription>Add at least one platform: a store link above, or a package name / bundle id.</AlertDescription></Alert>}
          <Button type="submit" size="lg" disabled={create.isPending || !f.name || (!f.androidPackage && !f.iosBundle)}>{create.isPending ? 'Checking stores and saving…' : 'Add app'}</Button>
        </form>
        <Card className="h-fit">
          <CardHeader><CardTitle>What happens next</CardTitle></CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>We validate the identifiers and import store metadata.</li>
              <li>The Market Research agent studies your category, competitors and audiences.</li>
              <li>The ASO agent audits your listing and suggests keywords.</li>
              <li>The Strategy agent drafts a channel plan, CPI and budget estimate for your approval.</li>
              <li>Nothing is spent until you connect ad accounts, set a budget and approve campaigns.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
export default function NewAppPage() { return <Suspense><NewApp /></Suspense>; }
