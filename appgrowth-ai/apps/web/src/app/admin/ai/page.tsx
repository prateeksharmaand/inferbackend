'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { num, titleCase } from '@/lib/format';

interface Model { id: string; modelId: string; purpose: string; inputCostPerMTok: number; outputCostPerMTok: number; unitCost: number; enabled: boolean }
interface Provider { key: string; name: string; baseUrl: string; enabled: boolean; isDefault: boolean; hasStoredKey: boolean; envVar: string; models: Model[] }
interface Agent { key: string; name: string; enabled: boolean; schedule: string | null; timeoutSec: number; maxRetries: number; providerKey: string | null; modelId: string | null; manualReview: boolean }
interface Usage { byProvider: { provider: string; model: string; _sum: { requests: number; inputTokens: string; outputTokens: string; costMicros: string; generations: number } }[]; byOrganization: { name?: string; _sum: { costMicros: string; inputTokens: string; outputTokens: string } }[]; executions: { agentKey: string; status: string; _count: number }[] }

function ProviderCard({ p }: { p: Provider }) {
  const qc = useQueryClient(); const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'ai'] }); const fail = (e: unknown) => toast.error(errorMessage(e));
  const [key, setKey] = useState(''); const [base, setBase] = useState(p.baseUrl);
  const [model, setModel] = useState({ modelId: '', purpose: 'text', inputCostPerMTok: '', outputCostPerMTok: '', unitCost: '' });
  const upd = useMutation({ mutationFn: (body: Record<string, unknown>) => api(`/admin/ai/providers/${p.key}`, { method: 'PATCH', body, org: false }), onSuccess: () => { toast.success('Saved'); setKey(''); refresh(); }, onError: fail });
  const check = useMutation({ mutationFn: () => api<{ ok: boolean; error?: string; model?: string }>(`/admin/ai/providers/${p.key}/check`, { method: 'POST', org: false }), onSuccess: (r) => (r.ok ? toast.success(`${p.name} responded (${r.model})`) : toast.error(r.error ?? 'Failed')), onError: fail });
  const addModel = useMutation({ mutationFn: () => api(`/admin/ai/providers/${p.key}/models`, { method: 'PUT', body: { modelId: model.modelId, purpose: model.purpose, inputCostPerMTok: Number(model.inputCostPerMTok || 0), outputCostPerMTok: Number(model.outputCostPerMTok || 0), unitCost: Number(model.unitCost || 0) }, org: false }), onSuccess: () => { toast.success('Model saved'); setModel({ ...model, modelId: '' }); refresh(); }, onError: fail });
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2"><div><CardTitle>{p.name}</CardTitle><CardDescription>{p.hasStoredKey ? 'Key stored (encrypted)' : `Uses ${p.envVar} from the server environment`}{p.isDefault && ' · default'}</CardDescription></div>
        <Switch checked={p.enabled} onCheckedChange={(v) => upd.mutate({ enabled: v })} aria-label={`Enable ${p.name}`} /></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {!p.isDefault && <Button size="sm" variant="outline" onClick={() => upd.mutate({ isDefault: true, enabled: true })}>Make default</Button>}
          <Button size="sm" variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>Test connection</Button>
        </div>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); upd.mutate(p.key === 'ollama' ? { baseUrl: base } : { apiKey: key }); }}>
          {p.key === 'ollama' ? <div className="flex-1 space-y-1"><Label htmlFor={`b-${p.key}`} className="text-xs">Base URL</Label><Input id={`b-${p.key}`} value={base} onChange={(e) => setBase(e.target.value)} /></div>
            : <div className="flex-1 space-y-1"><Label htmlFor={`k-${p.key}`} className="text-xs">API key</Label><Input id={`k-${p.key}`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.hasStoredKey ? '•••••••• (replace)' : 'paste key'} /></div>}
          <Button size="sm" type="submit">Save</Button>
          {p.hasStoredKey && <Button size="sm" type="button" variant="ghost" onClick={() => upd.mutate({ apiKey: '' })}>Clear</Button>}
        </form>
        <Table><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Use</TableHead><TableHead className="text-right">$/M in</TableHead><TableHead className="text-right">$/M out</TableHead><TableHead className="text-right">$/unit</TableHead></TableRow></TableHeader>
          <TableBody>{p.models.map((m) => <TableRow key={m.id}><TableCell className="font-mono text-xs">{m.modelId}</TableCell><TableCell>{m.purpose}</TableCell><TableCell className="text-right">{m.inputCostPerMTok}</TableCell><TableCell className="text-right">{m.outputCostPerMTok}</TableCell><TableCell className="text-right">{m.unitCost}</TableCell></TableRow>)}</TableBody></Table>
        <form className="grid grid-cols-2 gap-2 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); addModel.mutate(); }}>
          <Input className="col-span-2" placeholder="model id" value={model.modelId} onChange={(e) => setModel({ ...model, modelId: e.target.value })} aria-label="Model id" />
          <NativeSelect aria-label="Purpose" value={model.purpose} onChange={(e) => setModel({ ...model, purpose: e.target.value })} options={['text', 'image', 'video'].map((x) => ({ value: x, label: x }))} />
          <Input placeholder="$/M in" value={model.inputCostPerMTok} onChange={(e) => setModel({ ...model, inputCostPerMTok: e.target.value })} aria-label="Input price" />
          <Input placeholder="$/M out" value={model.outputCostPerMTok} onChange={(e) => setModel({ ...model, outputCostPerMTok: e.target.value })} aria-label="Output price" />
          <Button size="sm" type="submit" disabled={!model.modelId}>Add / update</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AdminAi() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ['admin', 'ai', 'providers'], queryFn: () => api<Provider[]>('/admin/ai/providers', { org: false }) });
  const agents = useQuery({ queryKey: ['admin', 'ai', 'agents'], queryFn: () => api<Agent[]>('/admin/ai/agents', { org: false }) });
  const usage = useQuery({ queryKey: ['admin', 'ai', 'usage'], queryFn: () => api<Usage>('/admin/ai/usage?days=30', { org: false }) });
  const upd = useMutation({ mutationFn: (v: { key: string; body: Record<string, unknown> }) => api(`/admin/ai/agents/${v.key}`, { method: 'PATCH', body: v.body, org: false }), onSuccess: () => { toast.success('Agent updated (schedules re-sync within 5 minutes)'); qc.invalidateQueries({ queryKey: ['admin', 'ai'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  if (providers.isLoading) return <LoadingBlock />;
  if (providers.error) return <ErrorBlock error={providers.error} />;
  const failures = (usage.data?.executions ?? []).filter((e) => e.status === 'FAILED');
  return (
    <>
      <PageHeader title="AI providers & agents" description="No provider is hard-wired: choose the default, override per agent, and set prices so cost tracking is accurate." />
      <div className="grid gap-4 lg:grid-cols-2">{providers.data!.map((p) => <ProviderCard key={p.key} p={p} />)}</div>
      <Card className="mt-6"><CardHeader><CardTitle>Agents</CardTitle><CardDescription>Schedules are UTC cron. Manual review holds every result for a person before it counts.</CardDescription></CardHeader><CardContent className="overflow-x-auto">
        {agents.data && <Table><TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Enabled</TableHead><TableHead>Manual review</TableHead><TableHead>Schedule</TableHead><TableHead>Provider override</TableHead><TableHead>Timeout</TableHead><TableHead>Retries</TableHead></TableRow></TableHeader>
          <TableBody>{agents.data.map((a) => (
            <TableRow key={a.key}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell><Switch checked={a.enabled} onCheckedChange={(v) => upd.mutate({ key: a.key, body: { enabled: v } })} aria-label={`Enable ${a.name}`} /></TableCell>
              <TableCell><Switch checked={a.manualReview} onCheckedChange={(v) => upd.mutate({ key: a.key, body: { manualReview: v } })} aria-label={`Manual review ${a.name}`} /></TableCell>
              <TableCell><Input className="h-8 w-36 font-mono text-xs" defaultValue={a.schedule ?? ''} placeholder="none" onBlur={(e) => e.target.value !== (a.schedule ?? '') && upd.mutate({ key: a.key, body: { schedule: e.target.value } })} aria-label={`${a.name} schedule`} /></TableCell>
              <TableCell><NativeSelect className="h-8 w-32" aria-label={`${a.name} provider`} value={a.providerKey ?? ''} onChange={(e) => upd.mutate({ key: a.key, body: { providerKey: e.target.value || null, modelId: null } })} placeholder="default" options={providers.data!.map((p) => ({ value: p.key, label: p.name }))} /></TableCell>
              <TableCell><Input className="h-8 w-20" type="number" defaultValue={a.timeoutSec} onBlur={(e) => Number(e.target.value) !== a.timeoutSec && upd.mutate({ key: a.key, body: { timeoutSec: Number(e.target.value) } })} aria-label={`${a.name} timeout`} /></TableCell>
              <TableCell><Input className="h-8 w-16" type="number" defaultValue={a.maxRetries} onBlur={(e) => Number(e.target.value) !== a.maxRetries && upd.mutate({ key: a.key, body: { maxRetries: Number(e.target.value) } })} aria-label={`${a.name} retries`} /></TableCell>
            </TableRow>
          ))}</TableBody></Table>}
      </CardContent></Card>
      {usage.data && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Usage by model (30 days)</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Model</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Tokens</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader>
            <TableBody>{usage.data.byProvider.map((u) => <TableRow key={`${u.provider}${u.model}`}><TableCell className="text-xs">{u.provider}/{u.model}</TableCell><TableCell className="text-right">{num(u._sum.requests)}</TableCell><TableCell className="text-right">{num(Number(u._sum.inputTokens) + Number(u._sum.outputTokens), true)}</TableCell><TableCell className="text-right">${(Number(u._sum.costMicros) / 1e6).toFixed(2)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          <Card><CardHeader><CardTitle>Agent failures (30 days)</CardTitle></CardHeader><CardContent>{failures.length ? <ul className="space-y-1 text-sm">{failures.map((f) => <li key={f.agentKey} className="flex justify-between"><span>{titleCase(f.agentKey)}</span><Badge variant="destructive">{f._count}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">No failed runs.</p>}</CardContent></Card>
        </div>
      )}
    </>
  );
}
