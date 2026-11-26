'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ImageIcon, Palette, Sparkles, Video, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useOrg } from '@/hooks/use-session';
import { api, ApiError, errorMessage } from '@/lib/api';
import { dateTime, money, num, titleCase } from '@/lib/format';

interface Content { headline?: string; body?: string; call_to_action?: string; image_prompt?: string; video_script?: string; mediaUrl?: string | null; mimeType?: string; rationale?: string; channel?: string }
interface Creative { id: string; type: string; title: string; approvalStatus: string; policyFlags: string[]; currentVersion: number; applicationId: string; content: Content; provider: string; model: string; costMicros: string; createdAt: string; project: { name: string }; performance: { impressions: number; clicks: number; installs: number; spend: string | null; ctr: number | null; cpi: string | null } }
interface CreativeDetail extends Creative { versions: { version: number; provider: string; model: string; createdAt: string; content: Content }[]; approvals: { status: string; comment: string; decidedAt: string; version: number }[] }
const TYPES = ['HEADLINE', 'DESCRIPTION', 'AD_COPY', 'VIDEO_SCRIPT', 'SOCIAL_POST', 'BANNER', 'SCREENSHOT_CONCEPT', 'IMAGE'];
const CHANNELS = ['GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS'];

function Generator({ apps, onQueued }: { apps: { id: string; name: string }[]; onQueued: () => void }) {
  const [f, setF] = useState({ applicationId: apps[0]?.id ?? '', channel: 'GOOGLE_ADS', variantsPerType: 3, brief: '' });
  const [types, setTypes] = useState<string[]>(['HEADLINE', 'DESCRIPTION']);
  useEffect(() => { if (!f.applicationId && apps[0]) setF((x) => ({ ...x, applicationId: apps[0].id })); }, [apps, f.applicationId]);
  const gen = useMutation({ mutationFn: () => api('/creatives/generate', { body: { ...f, types } }), onSuccess: () => { toast.success('Generating — new drafts appear in the library in a minute'); onQueued(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Generate creatives</CardTitle><CardDescription>Written in your brand voice from your app’s real features. Every variant is checked for banned and policy-restricted claims and saved as a draft for approval.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); gen.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="g-app">App</Label><NativeSelect id="g-app" value={f.applicationId} onChange={(e) => setF({ ...f, applicationId: e.target.value })} options={apps.map((a) => ({ value: a.id, label: a.name }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="g-ch">Channel</Label><NativeSelect id="g-ch" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} options={CHANNELS.map((c) => ({ value: c, label: titleCase(c) }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="g-n">Variants per type</Label><Input id="g-n" type="number" min={1} max={6} value={f.variantsPerType} onChange={(e) => setF({ ...f, variantsPerType: Number(e.target.value) })} /></div>
          <div className="space-y-1.5 md:col-span-4"><Label htmlFor="g-brief">Brief (optional)</Label><Textarea id="g-brief" rows={2} maxLength={2000} placeholder="e.g. focus on the new meal-photo logging; audience: new parents" value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} /></div>
          <fieldset className="md:col-span-4"><legend className="mb-2 text-sm font-medium">Types</legend>
            <div className="flex flex-wrap gap-3">{TYPES.map((t) => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={types.includes(t)} onCheckedChange={(c) => setTypes((x) => (c ? [...x, t] : x.filter((y) => y !== t)))} />{titleCase(t)}</label>)}</div>
          </fieldset>
          <div className="md:col-span-4"><Button type="submit" disabled={gen.isPending || !types.length || !f.applicationId}>{gen.isPending ? 'Queuing…' : 'Generate'}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function CreativeSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = useOrg(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['creative', id], queryFn: () => api<CreativeDetail>(`/creatives/${id}`), enabled: !!id });
  const [edit, setEdit] = useState<Content | null>(null); const [ack, setAck] = useState(false); const [comment, setComment] = useState('');
  useEffect(() => { setEdit(null); setAck(false); setComment(''); }, [id]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['creative', id] }); qc.invalidateQueries({ queryKey: ['creatives'] }); };
  const fail = (e: unknown) => toast.error(e instanceof ApiError && Array.isArray(e.details) ? `${e.message}` : errorMessage(e));
  const save = useMutation({ mutationFn: () => api<{ policyFlags: string[] }>(`/creatives/${id}`, { method: 'PATCH', body: { headline: edit?.headline, body: edit?.body, call_to_action: edit?.call_to_action, image_prompt: edit?.image_prompt, video_script: edit?.video_script } }), onSuccess: (r) => { toast.success(r.policyFlags.length ? `Saved as a new version — ${r.policyFlags.length} flag(s) to review` : 'Saved as a new version'); setEdit(null); refresh(); }, onError: fail });
  const decide = useMutation({ mutationFn: (ok: boolean) => api(`/creatives/${id}/${ok ? 'approve' : 'reject'}`, { body: { comment: comment || undefined, acknowledgeFlags: ack || undefined } }), onSuccess: (_, ok) => { toast.success(ok ? 'Approved' : 'Rejected'); refresh(); }, onError: fail });
  const media = useMutation({ mutationFn: (kind: 'image' | 'video') => api(`/creatives/${id}/${kind}`, { body: {} }), onSuccess: (_, k) => toast.success(`${k === 'image' ? 'Image' : 'Video'} generation queued — a new version appears when ready`), onError: fail });
  const c = q.data;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>{c ? c.title || titleCase(c.type) : 'Creative'}</SheetTitle><SheetDescription>{c && `${titleCase(c.type)} · v${c.currentVersion} · ${c.approvalStatus.toLowerCase()} · ${c.provider}/${c.model}`}</SheetDescription></SheetHeader>
        {q.isLoading ? <div className="p-4"><LoadingBlock rows={3} /></div> : c && (
          <div className="space-y-5 px-4 pb-8 text-sm">
            {c.policyFlags.length > 0 && <Alert variant="destructive"><AlertTriangle /><AlertDescription><ul className="list-disc pl-4">{c.policyFlags.map((f) => <li key={f}>{f}</li>)}</ul></AlertDescription></Alert>}
            {c.content.mediaUrl && (c.content.mimeType === 'video/mp4' ? <video src={c.content.mediaUrl} controls className="w-full rounded-lg border" /> : <img src={c.content.mediaUrl} alt="Generated creative" className="w-full rounded-lg border" />)}
            {edit ? (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                {(['headline', 'body', 'call_to_action', 'image_prompt', 'video_script'] as const).map((k) => (
                  <div key={k} className="space-y-1"><Label htmlFor={`e-${k}`}>{titleCase(k)}{k === 'headline' && <span className="ml-1 text-xs text-muted-foreground">({(edit[k] ?? '').length} chars)</span>}</Label>
                    {k === 'headline' || k === 'call_to_action' ? <Input id={`e-${k}`} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /> : <Textarea id={`e-${k}`} rows={k === 'video_script' ? 6 : 3} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />}
                  </div>
                ))}
                <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>Save new version</Button><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button></div>
              </form>
            ) : (
              <dl className="space-y-3">
                {(['headline', 'body', 'call_to_action', 'image_prompt', 'video_script', 'rationale'] as const).filter((k) => c.content[k]).map((k) => <div key={k}><dt className="text-xs uppercase text-muted-foreground">{titleCase(k)}</dt><dd className="whitespace-pre-line">{c.content[k]}</dd></div>)}
              </dl>
            )}
            <div className="flex flex-wrap gap-2">
              {can('creatives.write') && !edit && <Button size="sm" variant="outline" onClick={() => setEdit({ ...c.content })}>Edit</Button>}
              {can('creatives.write') && c.content.image_prompt && <Button size="sm" variant="outline" onClick={() => media.mutate('image')} disabled={media.isPending}><ImageIcon /> Generate image</Button>}
              {can('creatives.write') && c.content.video_script && <Button size="sm" variant="outline" onClick={() => media.mutate('video')} disabled={media.isPending}><Video /> Generate video</Button>}
            </div>
            {can('creatives.approve') && !edit && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="font-medium">Decision</p>
                <Input placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
                {c.policyFlags.length > 0 && <label className="flex items-start gap-2 text-xs"><Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} /> I reviewed the flags above and this creative makes only accurate, substantiated claims.</label>}
                <div className="flex gap-2"><Button size="sm" onClick={() => decide.mutate(true)} disabled={decide.isPending || (c.policyFlags.length > 0 && !ack)}><Check /> Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate(false)} disabled={decide.isPending}><X /> Reject</Button></div>
              </div>
            )}
            <section><p className="mb-1 font-medium">Performance</p><p className="text-muted-foreground">{c.performance.impressions ? `${num(c.performance.impressions, true)} impressions · CTR ${c.performance.ctr}% · ${num(c.performance.installs)} installs · CPI ${c.performance.cpi ?? '—'}` : 'No delivery data yet (appears once it runs in a campaign).'}</p></section>
            <section><p className="mb-1 font-medium">Versions</p><ul className="space-y-1 text-xs text-muted-foreground">{c.versions.map((v) => <li key={v.version}>v{v.version} · {v.provider}/{v.model} · {dateTime(v.createdAt)}</li>)}</ul></section>
            {c.approvals.length > 0 && <section><p className="mb-1 font-medium">Approvals</p><ul className="space-y-1 text-xs text-muted-foreground">{c.approvals.map((a, i) => <li key={i}>v{a.version} {a.status.toLowerCase()} · {dateTime(a.decidedAt)}{a.comment && ` · “${a.comment}”`}</li>)}</ul></section>}
            <p className="text-xs text-muted-foreground">Generation cost ${(Number(c.costMicros) / 1e6).toFixed(4)}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CreativesInner() {
  const { can } = useOrg(); const qc = useQueryClient(); const params = useSearchParams(); const router = useRouter();
  const apps = useQuery({ queryKey: ['apps', 'options'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/apps?pageSize=100') });
  const [filters, setFilters] = useState({ applicationId: '', approvalStatus: '', type: '' });
  const q = useQuery({ queryKey: ['creatives', filters], queryFn: () => api<{ items: Creative[]; total: number }>(`/creatives?pageSize=100${Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `&${k}=${v}`).join('')}`), refetchInterval: 15_000 });
  const open = params.get('open');
  if (apps.isLoading) return <LoadingBlock />;
  if (!apps.data?.items.length) return <><PageHeader title="Creative studio" /><EmptyBlock icon={Palette} title="Add an app first" action={<Link href="/apps/new"><Button>Add app</Button></Link>} /></>;
  return (
    <>
      <PageHeader title="Creative studio" description="Ad copy, headlines, scripts, images and video for your campaigns — versioned, policy-checked and approved by your team before use." />
      {can('creatives.write') && <Generator apps={apps.data.items} onQueued={() => setTimeout(() => qc.invalidateQueries({ queryKey: ['creatives'] }), 20_000)} />}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <NativeSelect aria-label="App" className="sm:w-48" value={filters.applicationId} onChange={(e) => setFilters({ ...filters, applicationId: e.target.value })} placeholder="All apps" options={apps.data.items.map((a) => ({ value: a.id, label: a.name }))} />
        <NativeSelect aria-label="Status" className="sm:w-40" value={filters.approvalStatus} onChange={(e) => setFilters({ ...filters, approvalStatus: e.target.value })} placeholder="Any status" options={['PENDING', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: titleCase(s) }))} />
        <NativeSelect aria-label="Type" className="sm:w-44" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} placeholder="All types" options={TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
      </div>
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !q.data!.items.length ? <EmptyBlock icon={Palette} title="No creatives yet" description="Generate a set above." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.items.map((c) => (
            <button key={c.id} onClick={() => router.replace(`/creatives?open=${c.id}`)} className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/40">
              <div className="mb-2 flex items-center justify-between gap-2"><Badge variant="secondary">{titleCase(c.type)}</Badge>
                <span className="flex items-center gap-1.5">{c.policyFlags.length > 0 && <AlertTriangle className="size-4 text-amber-500" aria-label={`${c.policyFlags.length} policy flags`} />}<Badge variant={c.approvalStatus === 'APPROVED' ? 'default' : c.approvalStatus === 'REJECTED' ? 'destructive' : 'outline'}>{c.approvalStatus.toLowerCase()}</Badge></span></div>
              {c.content.mediaUrl && c.content.mimeType !== 'video/mp4' && <img src={c.content.mediaUrl} alt="" className="mb-2 aspect-video w-full rounded-lg object-cover" />}
              <p className="line-clamp-2 font-medium">{c.content.headline || c.title}</p>
              {c.content.body && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{c.content.body}</p>}
              <p className="mt-2 text-xs text-muted-foreground">{c.project.name} · v{c.currentVersion}{c.performance.installs ? ` · ${num(c.performance.installs)} installs · CPI ${money(c.performance.cpi ? Math.round(Number(c.performance.cpi) * 100) : null)}` : ''}</p>
            </button>
          ))}
        </div>
      )}
      <CreativeSheet id={open} onClose={() => router.replace('/creatives')} />
    </>
  );
}
export default function CreativesPage() { return <Suspense><CreativesInner /></Suspense>; }
