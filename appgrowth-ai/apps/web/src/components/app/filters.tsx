'use client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { NativeSelect } from './native-select';

export interface Filters { from: string; to: string; applicationId: string; platform: string; country: string; campaignId: string; channel: string }
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const defaultFilters = (): Filters => { const to = new Date(); const from = new Date(to.getTime() - 29 * 86400000); return { from: iso(from), to: iso(to), applicationId: '', platform: '', country: '', campaignId: '', channel: '' }; };
export const toQuery = (f: Filters) => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

const PRESETS = [{ label: '7 days', d: 7 }, { label: '30 days', d: 30 }, { label: '90 days', d: 90 }];

/** One row of filters above the charts: date range, app, platform, country, campaign, channel. */
export function FilterBar({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const apps = useQuery({ queryKey: ['apps', 'options'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/apps?pageSize=100') });
  const camps = useQuery({ queryKey: ['campaigns', 'options'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/campaigns?pageSize=100') });
  const set = (k: keyof Filters, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3" role="group" aria-label="Filters">
      <div className="flex rounded-lg border p-0.5">
        {PRESETS.map((p) => {
          const from = iso(new Date(new Date(value.to).getTime() - (p.d - 1) * 86400000));
          const on = value.from === from;
          return <button key={p.d} onClick={() => onChange({ ...value, from })} className={`rounded-md px-2.5 py-1 text-xs ${on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{p.label}</button>;
        })}
      </div>
      <Input type="date" aria-label="From" value={value.from} max={value.to} onChange={(e) => e.target.value && set('from', e.target.value)} className="w-36" />
      <Input type="date" aria-label="To" value={value.to} min={value.from} onChange={(e) => e.target.value && set('to', e.target.value)} className="w-36" />
      <NativeSelect aria-label="Application" className="w-40" value={value.applicationId} onChange={(e) => set('applicationId', e.target.value)} placeholder="All apps" options={(apps.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }))} />
      <NativeSelect aria-label="Platform" className="w-32" value={value.platform} onChange={(e) => set('platform', e.target.value)} placeholder="All platforms" options={[{ value: 'ANDROID', label: 'Android' }, { value: 'IOS', label: 'iOS' }]} />
      <NativeSelect aria-label="Channel" className="w-36" value={value.channel} onChange={(e) => set('channel', e.target.value)} placeholder="All channels" options={[{ value: 'GOOGLE_ADS', label: 'Google Ads' }, { value: 'APPLE_ADS', label: 'Apple Ads' }, { value: 'META_ADS', label: 'Meta Ads' }, { value: 'TIKTOK_ADS', label: 'TikTok Ads' }]} />
      <NativeSelect aria-label="Campaign" className="w-40" value={value.campaignId} onChange={(e) => set('campaignId', e.target.value)} placeholder="All campaigns" options={(camps.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      <Input aria-label="Country code" placeholder="Country (IN)" maxLength={2} value={value.country} onChange={(e) => set('country', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} className="w-28" />
    </div>
  );
}
