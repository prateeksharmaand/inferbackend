'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, ExternalLink, Link2, RefreshCw, Unplug } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { ago, titleCase } from '@/lib/format';

interface Provider { key: string; name: string; category: string; docsUrl: string; available: boolean; readiness: string; readinessNote: string; authType: string | null; setupChecklist: string[]; featureEnabled: boolean | null; platformConfigured: boolean | null }
interface Account { id: string; providerKey: string; externalAccountId: string; name: string; currency: string | null; status: string; statusDetail: string; automationEnabled: boolean; lastSyncedAt: string | null; tokenExpiresAt: string | null; liveCampaigns: number; applications: { applicationId: string; externalAppId: string | null }[]; permissions: Record<string, boolean> }
interface Source { id: string; provider: string; status: string; statusDetail: string; lastSyncedAt: string | null; hasSecret: boolean; webhookUrl: string; config: Record<string, string> }
const AD = ['google_ads', 'apple_ads', 'meta_ads', 'tiktok_ads'];
const READINESS: Record<string, string> = { implemented_unverified: 'Implemented · awaiting live verification', verified: 'Verified', configured: 'Configured', not_configured: 'Not configured' };

function AppleConnect({ onDone }: { onDone: () => void }) {
  const [pub, setPub] = useState<string | null>(null); const [f, setF] = useState({ clientId: '', teamId: '', keyId: '' });
  const key = useMutation({ mutationFn: () => api<{ publicKey: string }>('/integrations/apple_ads/keypair', { method: 'POST' }), onSuccess: (r) => setPub(r.publicKey), onError: (e) => toast.error(errorMessage(e)) });
  const save = useMutation({ mutationFn: () => api<{ connected: number }>('/integrations/apple_ads/credentials', { body: f }), onSuccess: (r) => { toast.success(`Connected ${r.connected} Apple Ads organization(s)`); onDone(); }, onError: (e) => toast.error(errorMessage(e)) });
  if (!pub) return <Button size="sm" onClick={() => key.mutate()} disabled={key.isPending}>Generate API key pair</Button>;
  return (
    <div className="space-y-3 text-sm">
      <p>1. In Apple Ads → Account Settings → API, upload this public key:</p>
      <div className="relative"><Textarea readOnly rows={5} className="font-mono text-xs" value={pub} /><Button size="icon-sm" variant="ghost" className="absolute right-1 top-1" aria-label="Copy public key" onClick={() => { navigator.clipboard.writeText(pub); toast.success('Copied'); }}><Copy /></Button></div>
      <p>2. Paste the identifiers Apple shows. The private key never leaves AppGrowth.</p>
      <div className="grid gap-2 sm:grid-cols-3">{(['clientId', 'teamId', 'keyId'] as const).map((k) => <div key={k} className="space-y-1"><Label htmlFor={`ap-${k}`} className="text-xs">{titleCase(k.replace('Id', ' ID'))}</Label><Input id={`ap-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.trim() })} /></div>)}</div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !f.clientId || !f.teamId || !f.keyId}>{save.isPending ? 'Verifying with Apple…' : 'Connect'}</Button>
    </div>
  );
}

function AccountRow({ a, apps, canManage }: { a: Account; apps: { id: string; name: string }[]; canManage: boolean }) {
  const qc = useQueryClient(); const refresh = () => qc.invalidateQueries({ queryKey: ['integrations'] }); const fail = (e: unknown) => toast.error(errorMessage(e));
  const [links, setLinks] = useState(a.applications);
  const auto = useMutation({ mutationFn: (enabled: boolean) => api(`/integrations/${a.id}/automation`, { method: 'PATCH', body: { enabled } }), onSuccess: refresh, onError: fail });
  const sync = useMutation({ mutationFn: () => api(`/integrations/${a.id}/sync`, { method: 'POST' }), onSuccess: () => toast.success('Sync queued'), onError: fail });
  const map = useMutation({ mutationFn: () => api(`/integrations/${a.id}/applications`, { method: 'PUT', body: { links } }), onSuccess: () => { toast.success('App mapping saved'); refresh(); }, onError: fail });
  const disc = useMutation({ mutationFn: () => api<{ activeCampaignsLeftRunning: number }>(`/integrations/${a.id}`, { method: 'DELETE' }), onSuccess: (r) => { toast.success(r.activeCampaignsLeftRunning ? `Disconnected. ${r.activeCampaignsLeftRunning} campaign(s) keep running on the platform — manage them there.` : 'Disconnected'); refresh(); }, onError: fail });
  const needsAppId = a.providerKey === 'meta_ads' || a.providerKey === 'tiktok_ads';
  return (
    <div className="rounded-lg border p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-medium">{a.name} <span className="text-muted-foreground">· {a.externalAccountId}{a.currency ? ` · ${a.currency}` : ''}</span></p>
          <p className="text-xs text-muted-foreground">Synced {ago(a.lastSyncedAt)}{a.tokenExpiresAt ? ` · access until ${new Date(a.tokenExpiresAt).toLocaleDateString()}` : ''} · {a.liveCampaigns} live campaign(s){Object.keys(a.permissions).length > 0 && ` · ${Object.entries(a.permissions).map(([k, v]) => `${k.replace('_', ' ')} ${v ? '✓' : '✗'}`).join(', ')}`}</p></div>
        <Badge variant={a.status === 'CONNECTED' ? 'secondary' : 'destructive'}>{a.status.toLowerCase()}</Badge>
      </div>
      {a.statusDetail && <p className="mt-2 text-xs text-destructive">{a.statusDetail}</p>}
      {canManage && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Apps promoted from this account{needsAppId && ' (with the app’s id in this ad platform)'}</p>
            {apps.map((app) => { const l = links.find((x) => x.applicationId === app.id); return (
              <div key={app.id} className="flex flex-wrap items-center gap-2">
                <label className="flex w-48 items-center gap-2"><input type="checkbox" checked={!!l} onChange={(e) => setLinks(e.target.checked ? [...links, { applicationId: app.id, externalAppId: null }] : links.filter((x) => x.applicationId !== app.id))} />{app.name}</label>
                {l && needsAppId && <Input className="h-8 w-56" placeholder={a.providerKey === 'meta_ads' ? 'Meta application id' : 'TikTok app id'} value={l.externalAppId ?? ''} onChange={(e) => setLinks(links.map((x) => (x.applicationId === app.id ? { ...x, externalAppId: e.target.value } : x)))} aria-label={`${app.name} platform app id`} />}
              </div>
            ); })}
            <Button size="sm" variant="outline" onClick={() => map.mutate()} disabled={map.isPending}>Save mapping</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <label className="flex items-center gap-2"><Switch checked={a.automationEnabled} disabled={a.status !== 'CONNECTED'} onCheckedChange={(v) => auto.mutate(v)} aria-label="Automation for this account" />Allow automation</label>
            <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={a.status !== 'CONNECTED'}><RefreshCw /> Sync now</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(`Disconnect ${a.name}? Running campaigns stay live on the platform but AppGrowth stops managing them.`) && disc.mutate()}><Unplug /> Disconnect</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Attribution({ apps, canManage }: { apps: { id: string; name: string }[]; canManage: boolean }) {
  const qc = useQueryClient(); const [appId, setAppId] = useState(apps[0]?.id ?? '');
  const [prov, setProv] = useState('APPSFLYER'); const [cfg, setCfg] = useState(''); const [secret, setSecret] = useState(''); const [shown, setShown] = useState<{ webhookUrl: string; webhookSecret?: string } | null>(null);
  const q = useQuery({ queryKey: ['attribution', appId], queryFn: () => api<Source[]>(`/apps/${appId}/attribution`), enabled: !!appId });
  const cfgKey = { APPSFLYER: 'appId', ADJUST: 'appToken', GA4: 'propertyId', FIREBASE: 'propertyId' }[prov]!;
  const save = useMutation({ mutationFn: () => api<{ webhookUrl: string; webhookSecret?: string }>(`/apps/${appId}/attribution/${prov}`, { method: 'PUT', body: { config: { [cfgKey]: cfg.trim() }, ...(secret ? { secret } : {}) } }), onSuccess: (r) => { setShown(r); setSecret(''); qc.invalidateQueries({ queryKey: ['attribution', appId] }); toast.success('Saved'); }, onError: (e) => toast.error(errorMessage(e)) });
  const pull = useMutation({ mutationFn: (id: string) => api(`/attribution/${id}/pull`, { method: 'POST' }), onSuccess: () => toast.success('Pull queued'), onError: (e) => toast.error(errorMessage(e)) });
  if (!apps.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Install attribution</CardTitle><CardDescription>Where installs and in-app events come from. Events are de-duplicated; device ids are stored only as salted hashes; iOS SKAdNetwork / AdAttributionKit stay aggregate.</CardDescription></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <NativeSelect aria-label="App" className="w-56" value={appId} onChange={(e) => { setAppId(e.target.value); setShown(null); }} options={apps.map((a) => ({ value: a.id, label: a.name }))} />
        {q.data?.length ? <ul className="divide-y rounded-lg border">{q.data.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span><span className="font-medium">{titleCase(s.provider)}</span> · {Object.values(s.config).join(', ')} · last data {ago(s.lastSyncedAt)}{s.statusDetail && <span className="block text-xs text-destructive">{s.statusDetail}</span>}</span><span className="flex items-center gap-2"><Badge variant={s.status === 'CONNECTED' ? 'secondary' : s.status === 'ERROR' ? 'destructive' : 'outline'}>{s.status.toLowerCase()}</Badge>{s.hasSecret && canManage && <Button size="sm" variant="outline" onClick={() => pull.mutate(s.id)}>Pull now</Button>}</span></li>)}</ul> : <p className="text-muted-foreground">No attribution source for this app yet.</p>}
        {canManage && (
          <form className="grid gap-3 rounded-lg border p-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1"><Label htmlFor="at-p" className="text-xs">Source</Label><NativeSelect id="at-p" value={prov} onChange={(e) => setProv(e.target.value)} options={[{ value: 'APPSFLYER', label: 'AppsFlyer' }, { value: 'ADJUST', label: 'Adjust' }, { value: 'FIREBASE', label: 'Firebase (GA4 property)' }, { value: 'GA4', label: 'Google Analytics 4' }]} /></div>
            <div className="space-y-1"><Label htmlFor="at-c" className="text-xs">{titleCase(cfgKey.replace(/([A-Z])/g, ' $1'))}</Label><Input id="at-c" required value={cfg} onChange={(e) => setCfg(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="at-s" className="text-xs">{prov === 'GA4' || prov === 'FIREBASE' ? 'Service account JSON (optional)' : 'API token (optional, enables pull)'}</Label><Input id="at-s" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></div>
            <div className="md:col-span-3"><Button type="submit" size="sm" disabled={save.isPending}>Save source</Button></div>
          </form>
        )}
        {shown && (
          <Alert><AlertTitle>Webhook for server-to-server events</AlertTitle><AlertDescription className="space-y-1">
            <code className="block break-all text-xs">{shown.webhookUrl}</code>
            {shown.webhookSecret && <><p>Signing secret (shown once):</p><code className="block break-all text-xs">{shown.webhookSecret}</code><p className="text-xs">Send header <code>X-AppGrowth-Signature: t=&lt;unix&gt;,v1=&lt;hex HMAC-SHA256(secret, &quot;t.body&quot;)&gt;</code>. See docs/ADVERTISING_INTEGRATIONS.md.</p></>}
          </AlertDescription></Alert>
        )}
      </CardContent>
    </Card>
  );
}

function IntegrationsInner() {
  const { can } = useOrg(); const qc = useQueryClient(); const params = useSearchParams(); const router = useRouter();
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api<{ providers: Provider[]; accounts: Account[] }>('/integrations') });
  const apps = useQuery({ queryKey: ['apps', 'options'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/apps?pageSize=100') });
  const [appleOpen, setAppleOpen] = useState(false);
  useEffect(() => {
    const ok = params.get('connected'); const err = params.get('error');
    if (ok) toast.success(`${titleCase(ok)} connected (${params.get('count')} account${params.get('count') === '1' ? '' : 's'})`);
    if (err) toast.error(`Connection failed: ${err}`);
    if (ok || err) router.replace('/integrations');
  }, [params, router]);
  const connect = useMutation({ mutationFn: (key: string) => api<{ authorizeUrl: string }>(`/integrations/${key}/connect`, { method: 'POST' }), onSuccess: (r) => { location.href = r.authorizeUrl; }, onError: (e) => toast.error(errorMessage(e)) });
  if (q.isLoading) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorBlock error={q.error} retry={() => q.refetch()} />;
  const d = q.data!; const manage = can('integrations.manage');
  return (
    <>
      <PageHeader title="Integrations" description="Connect ad accounts with each platform’s official sign-in. We never see your passwords; tokens are encrypted and you can disconnect any time." />
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {d.providers.filter((p) => AD.includes(p.key)).map((p) => {
            const accounts = d.accounts.filter((a) => a.providerKey === p.key);
            return (
              <Card key={p.key}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div><CardTitle>{p.name}</CardTitle><CardDescription>{READINESS[p.readiness] ?? p.readiness}{p.readinessNote ? ` · ${p.readinessNote}` : ''}</CardDescription></div>
                  {accounts.some((a) => a.status === 'CONNECTED') ? <CheckCircle2 className="size-5 text-emerald-500" /> : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {accounts.map((a) => <AccountRow key={a.id} a={a} apps={apps.data?.items ?? []} canManage={manage} />)}
                  {p.available ? (manage && (p.authType === 'apple_client_credentials'
                    ? (appleOpen ? <AppleConnect onDone={() => { setAppleOpen(false); qc.invalidateQueries({ queryKey: ['integrations'] }); }} /> : <Button size="sm" onClick={() => setAppleOpen(true)}><Link2 /> {accounts.length ? 'Connect another' : 'Connect Apple Ads'}</Button>)
                    : <Button size="sm" onClick={() => connect.mutate(p.key)} disabled={connect.isPending}><Link2 /> {accounts.length ? 'Connect another login' : `Sign in with ${p.name.split(' ')[0]}`}</Button>))
                    : (
                      <Alert><AlertTitle>Not available yet</AlertTitle><AlertDescription>
                        <p>{p.featureEnabled === false ? 'Nous Healthcare is completing this platform’s API approval.' : 'Platform credentials are not configured.'} You can still draft campaigns for it.</p>
                        <details className="mt-1"><summary className="cursor-pointer text-xs">Setup checklist (for administrators)</summary><ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs">{p.setupChecklist.map((s) => <li key={s}>{s}</li>)}</ol></details>
                      </AlertDescription></Alert>
                    )}
                  {p.docsUrl && <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" href={p.docsUrl} target="_blank" rel="noreferrer">API documentation <ExternalLink className="size-3" /></a>}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Attribution apps={apps.data?.items ?? []} canManage={manage} />
        <Card><CardHeader><CardTitle>Store data</CardTitle><CardDescription>App Store metadata is read from Apple’s public lookup automatically. Google Play listing access is connected per app on the app’s <em>Play Console</em> tab.</CardDescription></CardHeader></Card>
      </div>
    </>
  );
}
export default function IntegrationsPage() { return <Suspense><IntegrationsInner /></Suspense>; }
