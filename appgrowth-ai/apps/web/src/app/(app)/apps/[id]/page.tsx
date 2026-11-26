'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw, Sparkles, Star, Trash2, Upload, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ErrorBlock, LoadingBlock } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage, upload } from '@/lib/api';
import { ago, dateTime, num, titleCase } from '@/lib/format';

interface AppDetail {
  id: string; name: string; category: string; description: string; targetAudience: string; status: string; onboardingStatus: string; monthlyInstallTarget: number; targetCpi: string | null; currency: string;
  platforms: { id: string; platform: 'ANDROID' | 'IOS'; storeId: string; storeUrl: string; validatedAt: string | null; validationNote: string }[];
  countries: string[]; languages: string[];
  assets: { id: string; kind: string; url: string; width: number | null; height: number | null }[];
  targets: { month: string; installs: number; targetCpi: string | null }[];
  listings: { platform: string; title: string; subtitle: string; description: string; developer: string; rating: number | null; ratingCount: number | null; iconUrl: string; screenshotUrls: string[]; source: string; fetchedAt: string }[];
  playConsole: { name: string; status: string; lastSyncedAt: string | null } | null;
  onboarding: { id: string; status: string; currentStep: string | null; steps: { key: string; status: string; error?: string }[]; error: string | null; createdAt: string; finishedAt: string | null } | null;
}
const STEP_LABEL: Record<string, string> = { validate_identifiers: 'Validate store ids', fetch_store_metadata: 'Import store metadata', market_research: 'Market research', aso_audit: 'ASO audit', growth_strategy: 'Growth strategy', notify: 'Notify team' };
const ONBOARDING_STEPS = Object.keys(STEP_LABEL);

export default function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useOrg(); const qc = useQueryClient(); const router = useRouter();
  const key = ['app', id];
  const q = useQuery({ queryKey: key, queryFn: () => api<AppDetail>(`/apps/${id}`), refetchInterval: (query) => (query.state.data?.onboarding && ['QUEUED', 'RUNNING'].includes(query.state.data.onboarding.status) ? 4000 : false) });
  const fail = (e: unknown) => toast.error(errorMessage(e));
  const refresh = useMutation({ mutationFn: () => api<{ platform: string; status: string; detail: string }[]>(`/apps/${id}/refresh-metadata`, { method: 'POST' }), onSuccess: (r) => { r.forEach((x) => (x.status === 'error' ? toast.error(`${x.platform}: ${x.detail}`) : toast.message(`${x.platform}: ${x.status}`, { description: x.detail }))); qc.invalidateQueries({ queryKey: key }); }, onError: fail });
  const onboard = useMutation({ mutationFn: () => api<{ alreadyRunning: boolean }>(`/apps/${id}/onboarding`, { method: 'POST' }), onSuccess: (r) => { toast.success(r.alreadyRunning ? 'Analysis is already running' : 'AI analysis started'); qc.invalidateQueries({ queryKey: key }); }, onError: fail });
  const del = useMutation({ mutationFn: () => api(`/apps/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('App removed'); qc.invalidateQueries({ queryKey: ['apps'] }); router.push('/apps'); }, onError: fail });
  if (q.isLoading) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorBlock error={q.error} retry={() => q.refetch()} />;
  const a = q.data!;
  const icon = a.assets.find((x) => x.kind === 'icon')?.url ?? a.listings.find((l) => l.iconUrl)?.iconUrl;
  const write = can('apps.write');
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {icon ? <img src={icon} alt="" className="size-16 rounded-2xl border object-cover" /> : <div className="size-16 rounded-2xl bg-accent" />}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">{a.platforms.map((p) => <Badge key={p.id} variant="secondary">{p.platform === 'IOS' ? 'iOS' : 'Android'} · {p.storeId}</Badge>)}{a.status === 'paused' && <Badge variant="outline">paused</Badge>}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {write && <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw className={refresh.isPending ? 'animate-spin' : ''} /> Refresh store data</Button>}
          {can('ai.run') && <Button onClick={() => onboard.mutate()} disabled={onboard.isPending || a.onboardingStatus === 'running'}><Sparkles /> {a.onboardingStatus === 'done' ? 'Re-run AI analysis' : 'Run AI analysis'}</Button>}
        </div>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="listing">Store listing</TabsTrigger>
          <TabsTrigger value="settings">Settings & targets</TabsTrigger><TabsTrigger value="assets">Assets</TabsTrigger>
          {a.platforms.some((p) => p.platform === 'ANDROID') && <TabsTrigger value="play">Play Console</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview"><Overview a={a} /></TabsContent>
        <TabsContent value="listing"><Listings a={a} /></TabsContent>
        <TabsContent value="settings"><SettingsForm a={a} canWrite={write} onDelete={() => confirm(`Remove ${a.name}? Campaign history is kept.`) && del.mutate()} /></TabsContent>
        <TabsContent value="assets"><Assets a={a} canWrite={write} /></TabsContent>
        <TabsContent value="play"><PlayConsole a={a} canManage={can('integrations.manage')} /></TabsContent>
      </Tabs>
    </>
  );
}

function Overview({ a }: { a: AppDetail }) {
  const o = a.onboarding;
  const stepState = (k: string) => o?.steps.find((s) => s.key === k)?.status ?? (o?.currentStep === k ? 'RUNNING' : 'PENDING');
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>AI onboarding</CardTitle><CardDescription>{o ? `Started ${dateTime(o.createdAt)}${o.finishedAt ? ` · finished ${dateTime(o.finishedAt)}` : ''}` : 'Not run yet.'}</CardDescription></CardHeader>
        <CardContent>
          {o ? (
            <ol className="space-y-2.5">
              {ONBOARDING_STEPS.map((k) => {
                const st = stepState(k); const err = o.steps.find((s) => s.key === k)?.error;
                return (
                  <li key={k} className="flex items-start gap-3 text-sm">
                    {st === 'SUCCEEDED' ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" /> : st === 'FAILED' ? <XCircle className="mt-0.5 size-4 text-destructive" /> : st === 'RUNNING' ? <Loader2 className="mt-0.5 size-4 animate-spin text-primary" /> : st === 'SKIPPED' ? <Circle className="mt-0.5 size-4 text-muted-foreground/50" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
                    <div><p className={st === 'PENDING' ? 'text-muted-foreground' : ''}>{STEP_LABEL[k]}{st === 'SKIPPED' && <span className="text-muted-foreground"> · skipped</span>}</p>{err && <p className="text-xs text-destructive">{err}</p>}</div>
                  </li>
                );
              })}
            </ol>
          ) : <p className="text-sm text-muted-foreground">Run the AI analysis to get market research, an ASO audit and a growth strategy.</p>}
          {o?.status === 'SUCCEEDED' && <Link href={`/insights?app=${a.id}`}><Button className="mt-4" variant="outline">View research & strategy</Button></Link>}
          {o?.error && !o.steps.some((s) => s.error) && <p className="mt-3 text-sm text-destructive">{o.error}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Goals</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Monthly target:</span> {num(a.monthlyInstallTarget)} installs</p>
          <p><span className="text-muted-foreground">Target CPI:</span> {a.targetCpi ? `${a.currency} ${a.targetCpi}` : 'not set'}</p>
          <p><span className="text-muted-foreground">Countries:</span> {a.countries.join(', ')}</p>
          <p><span className="text-muted-foreground">Languages:</span> {a.languages.join(', ')}</p>
          {a.platforms.map((p) => <p key={p.id} className="text-xs text-muted-foreground">{p.platform === 'IOS' ? 'iOS' : 'Android'}: {p.validatedAt ? `verified ${ago(p.validatedAt)}` : p.validationNote}</p>)}
          <Link href={`/dashboard`} className="inline-block pt-2 text-primary hover:underline">Performance on the dashboard</Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Listings({ a }: { a: AppDetail }) {
  if (!a.listings.length) return <Card><CardContent className="text-sm text-muted-foreground">No store listing imported yet. iOS listings import automatically from the App Store. For Android, connect Play Console access in its tab — Google doesn’t publish listing data publicly.</CardContent></Card>;
  return (
    <div className="space-y-6">
      {a.listings.map((l) => {
        const p = a.platforms.find((x) => x.platform === l.platform);
        return (
          <Card key={l.platform}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">{l.title}<Badge variant="secondary">{l.platform === 'IOS' ? 'App Store' : 'Google Play'}</Badge></CardTitle>
              <CardDescription>{l.developer} · imported {ago(l.fetchedAt)} via {l.source.replace(/_/g, ' ')}{l.rating !== null && <> · <Star className="inline size-3.5" /> {l.rating} ({num(l.ratingCount)} ratings)</>}{p?.storeUrl && <> · <a className="text-primary hover:underline" href={p.storeUrl} target="_blank" rel="noreferrer">open <ExternalLink className="inline size-3" /></a></>}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {l.subtitle && <p className="font-medium">{l.subtitle}</p>}
              <p className="max-h-60 overflow-y-auto whitespace-pre-line text-sm text-muted-foreground">{l.description}</p>
              {l.screenshotUrls.length > 0 && <div className="flex gap-3 overflow-x-auto pb-2">{l.screenshotUrls.map((s) => <img key={s} src={s} alt="Store screenshot" className="h-64 rounded-lg border" />)}</div>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SettingsForm({ a, canWrite, onDelete }: { a: AppDetail; canWrite: boolean; onDelete: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: a.name, category: a.category, description: a.description, targetAudience: a.targetAudience, monthlyInstallTarget: String(a.monthlyInstallTarget), targetCpi: a.targetCpi ?? '', countries: a.countries.join(', '), languages: a.languages.join(', '), status: a.status });
  useEffect(() => setF({ name: a.name, category: a.category, description: a.description, targetAudience: a.targetAudience, monthlyInstallTarget: String(a.monthlyInstallTarget), targetCpi: a.targetCpi ?? '', countries: a.countries.join(', '), languages: a.languages.join(', '), status: a.status }), [a]);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); });
  const [mTarget, setMTarget] = useState('');
  const csv = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () => api(`/apps/${a.id}`, { method: 'PATCH', body: { name: f.name, category: f.category, description: f.description, targetAudience: f.targetAudience, monthlyInstallTarget: Number(f.monthlyInstallTarget), targetCpi: f.targetCpi || null, countries: csv(f.countries).map((c) => c.toUpperCase()), languages: csv(f.languages), status: f.status === 'archived' ? undefined : f.status } }),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['app', a.id] }); }, onError: (e) => toast.error(errorMessage(e)),
  });
  const setTarget = useMutation({ mutationFn: () => api(`/apps/${a.id}/targets/${month}`, { method: 'PUT', body: { installs: Number(mTarget) } }), onSuccess: () => { toast.success('Target set'); setMTarget(''); qc.invalidateQueries({ queryKey: ['app', a.id] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="n">Name</Label><Input id="n" value={f.name} onChange={s('name')} disabled={!canWrite} /></div>
          <div className="space-y-1.5"><Label htmlFor="c">Category</Label><Input id="c" value={f.category} onChange={s('category')} disabled={!canWrite} /></div>
          <div className="space-y-1.5"><Label htmlFor="au">Target audience</Label><Input id="au" value={f.targetAudience} onChange={s('targetAudience')} disabled={!canWrite} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="d">Description</Label><Textarea id="d" rows={5} value={f.description} onChange={s('description')} disabled={!canWrite} /></div>
          <div className="space-y-1.5"><Label htmlFor="t">Monthly install target (this month)</Label><Input id="t" type="number" min={1} value={f.monthlyInstallTarget} onChange={s('monthlyInstallTarget')} disabled={!canWrite} /></div>
          <div className="space-y-1.5"><Label htmlFor="cp">Target CPI ({a.currency})</Label><Input id="cp" inputMode="decimal" value={f.targetCpi} onChange={s('targetCpi')} disabled={!canWrite} /></div>
          <div className="space-y-1.5"><Label htmlFor="co">Countries</Label><Input id="co" value={f.countries} onChange={s('countries')} disabled={!canWrite} /></div>
          <div className="space-y-1.5"><Label htmlFor="la">Languages</Label><Input id="la" value={f.languages} onChange={s('languages')} disabled={!canWrite} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.status === 'paused'} disabled={!canWrite} onChange={(e) => setF({ ...f, status: e.target.checked ? 'paused' : 'active' })} /> Pause growth activity for this app (agents stop proposing new campaigns)</label>
          {canWrite && <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={save.isPending}>Save</Button><Button type="button" variant="destructive" onClick={onDelete}><Trash2 /> Remove app</Button></div>}
        </form>
      </CardContent></Card>
      <Card className="h-fit">
        <CardHeader><CardTitle>Future months</CardTitle><CardDescription>Set targets ahead; monthly planning uses them.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm">{a.targets.map((t) => <li key={t.month} className="flex justify-between"><span>{t.month.slice(0, 7)}</span><span className="tabular">{num(t.installs)}</span></li>)}</ul>
          {canWrite && <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setTarget.mutate(); }}>
            <div className="space-y-1"><Label htmlFor="mm" className="text-xs">Month</Label><Input id="mm" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-36" /></div>
            <div className="space-y-1"><Label htmlFor="mi" className="text-xs">Installs</Label><Input id="mi" type="number" min={1} value={mTarget} onChange={(e) => setMTarget(e.target.value)} className="w-28" /></div>
            <Button type="submit" size="sm" disabled={!mTarget}>Set</Button>
          </form>}
        </CardContent>
      </Card>
    </div>
  );
}

function Assets({ a, canWrite }: { a: AppDetail; canWrite: boolean }) {
  const qc = useQueryClient(); const ref = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<'icon' | 'screenshot' | 'logo'>('screenshot');
  const up = useMutation({ mutationFn: (file: File) => upload(`/apps/${a.id}/assets?kind=${kind}`, file), onSuccess: () => { toast.success('Uploaded'); qc.invalidateQueries({ queryKey: ['app', a.id] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const rm = useMutation({ mutationFn: (assetId: string) => api(`/apps/${a.id}/assets/${assetId}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['app', a.id] }), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card>
      <CardHeader><CardTitle>Brand assets</CardTitle><CardDescription>Icons, logos and screenshots the Creative agent can use. PNG, JPEG or WebP up to 10 MB; icons must be square.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {canWrite && <div className="flex flex-wrap items-center gap-2">
          {(['screenshot', 'icon', 'logo'] as const).map((k) => <Button key={k} size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)}>{titleCase(k)}</Button>)}
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ''; }} />
          <Button size="sm" onClick={() => ref.current?.click()} disabled={up.isPending}><Upload /> {up.isPending ? 'Uploading…' : `Upload ${kind}`}</Button>
        </div>}
        {a.assets.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {a.assets.map((x) => (
              <figure key={x.id} className="group relative rounded-lg border p-2">
                <img src={x.url} alt={`${x.kind}`} className="aspect-square w-full rounded object-contain" />
                <figcaption className="mt-1 text-xs text-muted-foreground">{x.kind}{x.width ? ` · ${x.width}×${x.height}` : ''}</figcaption>
                {canWrite && <Button size="icon-sm" variant="destructive" className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${x.kind}`} onClick={() => rm.mutate(x.id)}><Trash2 /></Button>}
              </figure>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">No assets uploaded.</p>}
      </CardContent>
    </Card>
  );
}

function PlayConsole({ a, canManage }: { a: AppDetail; canManage: boolean }) {
  const qc = useQueryClient(); const [json, setJson] = useState('');
  const save = useMutation({ mutationFn: () => api<{ serviceAccount: string; listingImported: boolean }>(`/apps/${a.id}/play-credentials`, { method: 'PUT', body: { serviceAccountJson: json } }), onSuccess: (r) => { setJson(''); toast.success(`Connected as ${r.serviceAccount}${r.listingImported ? ' · listing imported' : ''}`); qc.invalidateQueries({ queryKey: ['app', a.id] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>Google Play Developer API</CardTitle><CardDescription>Lets us read your Android listing (title, short and full description, languages) for ASO. Read-only use: we never change your listing.</CardDescription></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {a.playConsole && <p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Connected as <code>{a.playConsole.name}</code> · {a.playConsole.status.toLowerCase()} · last used {ago(a.playConsole.lastSyncedAt)}</p>}
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>In Google Cloud, create a service account and a JSON key.</li>
          <li>In Play Console → Users and permissions, invite the service account email with “View app information” for this app.</li>
          <li>Paste the JSON key below. It is encrypted at rest and never shown again.</li>
        </ol>
        {canManage && <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Label htmlFor="sa">Service account JSON</Label>
          <Textarea id="sa" rows={6} className="font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"type": "service_account", ...}' />
          <Button type="submit" disabled={json.length < 50 || save.isPending}>{save.isPending ? 'Verifying with Google…' : a.playConsole ? 'Replace credentials' : 'Connect'}</Button>
        </form>}
      </CardContent>
    </Card>
  );
}
