'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OctagonX, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorBlock, LoadingBlock } from '@/components/app/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';

interface Policy {
  autonomyLevel: 'RECOMMENDATION' | 'APPROVED_AUTOMATION' | 'AUTONOMOUS'; currency: string;
  maxDailySpend: string | null; maxMonthlySpend: string | null; maxCampaignBudget: string | null;
  maxBudgetIncreasePct: number; maxConcurrentCampaigns: number; reservePct: number; allowedProviders: string[];
  autoPauseOnCpiMultiple: number; automationEnabled: boolean; emergencyStopAt: string | null;
}
const LEVELS = [
  { key: 'RECOMMENDATION', title: 'Level 1 · Recommendation', body: 'AI proposes changes. Your team applies them.' },
  { key: 'APPROVED_AUTOMATION', title: 'Level 2 · Approved automation', body: 'AI applies changes within the limits below; anything outside them waits for approval.' },
  { key: 'AUTONOMOUS', title: 'Level 3 · Autonomous', body: 'AI optimises continuously within approved budgets, channels and limits.' },
] as const;
const PROVIDERS = [{ key: 'GOOGLE_ADS', label: 'Google Ads' }, { key: 'APPLE_ADS', label: 'Apple Ads' }, { key: 'META_ADS', label: 'Meta Ads' }, { key: 'TIKTOK_ADS', label: 'TikTok Ads' }];

export default function AutomationSettings() {
  const { org, can } = useOrg();
  const qc = useQueryClient();
  const key = ['policy', org?.id];
  const q = useQuery({ queryKey: key, queryFn: () => api<Policy>(`/organizations/${org!.id}/automation-policy`), enabled: !!org });
  const [p, setP] = useState<Policy | null>(null);
  useEffect(() => { if (q.data) setP(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<Policy>(`/organizations/${org!.id}/automation-policy`, { method: 'PATCH', body: {
      autonomyLevel: p!.autonomyLevel, maxDailySpend: p!.maxDailySpend || null, maxMonthlySpend: p!.maxMonthlySpend || null, maxCampaignBudget: p!.maxCampaignBudget || null,
      maxBudgetIncreasePct: Number(p!.maxBudgetIncreasePct), maxConcurrentCampaigns: Number(p!.maxConcurrentCampaigns), reservePct: Number(p!.reservePct),
      allowedProviders: p!.allowedProviders, autoPauseOnCpiMultiple: Number(p!.autoPauseOnCpiMultiple),
    } }),
    onSuccess: (d) => { qc.setQueryData(key, d); toast.success('Automation policy saved'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api(`/organizations/${org!.id}/automation`, { body: { enabled, reason: enabled ? undefined : 'Emergency stop from settings' } }),
    onSuccess: (_, enabled) => { qc.invalidateQueries({ queryKey: key }); toast.success(enabled ? 'Automation resumed' : 'Emergency stop engaged — AI will not change any campaign'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading || !p) return q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : <LoadingBlock />;
  const edit = can('automation.manage');
  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setP({ ...p, [k]: v });
  const money = (k: 'maxDailySpend' | 'maxMonthlySpend' | 'maxCampaignBudget', label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label} ({p.currency})</Label>
      <Input id={k} inputMode="decimal" placeholder="No limit" value={p[k] ?? ''} disabled={!edit} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, '') || null)} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <div className="space-y-6">
      {p.automationEnabled ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">Emergency stop</p><p className="text-sm text-muted-foreground">Immediately stops every AI-initiated change across all campaigns. Campaigns keep running as they are on the ad platforms; pause them there or from Campaigns if needed.</p></div>
            {edit && <Button variant="destructive" onClick={() => confirm('Stop all automation for this organization now?') && toggle.mutate(false)} disabled={toggle.isPending}><OctagonX /> Stop automation</Button>}
          </CardContent>
        </Card>
      ) : (
        <Alert variant="destructive">
          <OctagonX />
          <AlertTitle>Automation is stopped</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Since {dateTime(p.emergencyStopAt)}. AI agents can still analyse and recommend, but change nothing.</span>
            {edit && <Button size="sm" variant="outline" onClick={() => toggle.mutate(true)} disabled={toggle.isPending}><Play /> Resume automation</Button>}
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Autonomy level</CardTitle><CardDescription>Higher levels may be limited by your plan.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Autonomy level">
            {LEVELS.map((l) => (
              <button type="button" key={l.key} role="radio" aria-checked={p.autonomyLevel === l.key} disabled={!edit} onClick={() => set('autonomyLevel', l.key)}
                className={`rounded-xl border p-4 text-left transition ${p.autonomyLevel === l.key ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'hover:bg-muted'}`}>
                <p className="font-medium">{l.title}</p><p className="mt-1 text-sm text-muted-foreground">{l.body}</p>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Spending limits</CardTitle><CardDescription>Hard limits. Automation never sets budgets above them; changes beyond them require a person.</CardDescription></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-3">
            {money('maxDailySpend', 'Max daily spend', 'Across all campaigns')}
            {money('maxMonthlySpend', 'Max monthly spend', 'Across all campaigns')}
            {money('maxCampaignBudget', 'Max daily budget per campaign', 'Any single campaign')}
            <div className="space-y-1.5"><Label htmlFor="inc">Max budget increase per change (%)</Label><Input id="inc" type="number" min={0} max={100} disabled={!edit} value={p.maxBudgetIncreasePct} onChange={(e) => set('maxBudgetIncreasePct', Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="conc">Max concurrent active campaigns</Label><Input id="conc" type="number" min={1} max={200} disabled={!edit} value={p.maxConcurrentCampaigns} onChange={(e) => set('maxConcurrentCampaigns', Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="res">Reserve (%)</Label><Input id="res" type="number" min={0} max={50} disabled={!edit} value={p.reservePct} onChange={(e) => set('reservePct', Number(e.target.value))} /><p className="text-xs text-muted-foreground">Held back for delayed spend reporting and billing differences.</p></div>
            <div className="space-y-1.5"><Label htmlFor="cpi">Auto-pause when CPI exceeds target by ×</Label><Input id="cpi" type="number" step="0.1" min={1} max={10} disabled={!edit} value={p.autoPauseOnCpiMultiple} onChange={(e) => set('autoPauseOnCpiMultiple', Number(e.target.value))} /></div>
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-sm font-medium">Channels automation may use</legend>
              <div className="flex flex-wrap gap-4">
                {PROVIDERS.map((x) => (
                  <label key={x.key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={p.allowedProviders.includes(x.key)} disabled={!edit} onCheckedChange={(c) => set('allowedProviders', c ? [...p.allowedProviders, x.key] : p.allowedProviders.filter((k) => k !== x.key))} />{x.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>
        {edit && <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save policy'}</Button>}
      </form>
    </div>
  );
}
