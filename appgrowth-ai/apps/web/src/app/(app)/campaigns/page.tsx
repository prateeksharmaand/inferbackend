'use client';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrg } from '@/hooks/use-session';
import { api } from '@/lib/api';
import { STATUS_VARIANT } from '@/lib/campaigns';
import { money, num, titleCase } from '@/lib/format';

interface CampaignRow { id: string; name: string; provider: string; platform: string; status: string; statusReason: string; dailyBudget: string; targetCpi: string | null; currency: string; application: { id: string; name: string }; account: { name: string; status: string } | null; last30d: { installs: number; spend: string; cpi: string | null } }
const m = (s: string | null) => (s == null ? null : Math.round(Number(s) * 100));

function CampaignsInner() {
  const { can } = useOrg(); const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? ''); const [provider, setProvider] = useState(''); const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['campaigns', status, provider, search], queryFn: () => api<{ items: CampaignRow[]; total: number }>(`/campaigns?pageSize=100${status ? `&status=${status}` : ''}${provider ? `&provider=${provider}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`) });
  return (
    <>
      <PageHeader title="Campaigns" description="App install campaigns across Google, Apple, Meta and TikTok. Nothing reaches an ad platform until a campaign is approved and launched." actions={can('campaigns.write') && <Link href="/campaigns/new"><Button><Plus /> New campaign</Button></Link>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input className="h-9 rounded-lg border bg-transparent px-2.5 text-sm sm:max-w-xs" placeholder="Search campaigns" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search campaigns" />
        <NativeSelect aria-label="Status" className="sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All (not archived)" options={['DRAFT', 'PENDING_APPROVAL', 'READY', 'ACTIVE', 'PAUSED', 'FAILED', 'COMPLETED', 'ARCHIVED'].map((s) => ({ value: s, label: titleCase(s) }))} />
        <NativeSelect aria-label="Channel" className="sm:w-40" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="All channels" options={['GOOGLE_ADS', 'APPLE_ADS', 'META_ADS', 'TIKTOK_ADS'].map((s) => ({ value: s, label: titleCase(s) }))} />
      </div>
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !q.data!.items.length ? (
        <EmptyBlock icon={Megaphone} title="No campaigns" description="Create one by hand, or approve a growth strategy and let AppGrowth draft its campaigns and creatives." action={<div className="flex gap-2">{can('campaigns.write') && <Link href="/campaigns/new"><Button>New campaign</Button></Link>}<Link href="/insights"><Button variant="outline">Growth strategies</Button></Link></div>} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card"><Table>
          <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Status</TableHead><TableHead>Channel</TableHead><TableHead className="text-right">Daily budget</TableHead><TableHead className="text-right">Installs (30d)</TableHead><TableHead className="text-right">Spend (30d)</TableHead><TableHead className="text-right">CPI</TableHead></TableRow></TableHeader>
          <TableBody>{q.data!.items.map((c) => {
            const over = c.targetCpi && c.last30d.cpi && Number(c.last30d.cpi) > Number(c.targetCpi);
            return (
              <TableRow key={c.id}>
                <TableCell><Link href={`/campaigns/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link><p className="text-xs text-muted-foreground">{c.application.name} · {c.platform === 'IOS' ? 'iOS' : 'Android'}</p></TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[c.status]}>{titleCase(c.status)}</Badge>{c.statusReason && <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={c.statusReason}>{c.statusReason}</p>}</TableCell>
                <TableCell>{titleCase(c.provider)}</TableCell>
                <TableCell className="text-right tabular">{money(m(c.dailyBudget), c.currency)}</TableCell>
                <TableCell className="text-right tabular">{num(c.last30d.installs)}</TableCell>
                <TableCell className="text-right tabular">{money(m(c.last30d.spend), c.currency)}</TableCell>
                <TableCell className={`text-right tabular ${over ? 'text-destructive' : ''}`}>{money(m(c.last30d.cpi), c.currency)}{c.targetCpi && <span className="block text-xs text-muted-foreground">target {money(m(c.targetCpi), c.currency)}</span>}</TableCell>
              </TableRow>
            );
          })}</TableBody>
        </Table></div>
      )}
    </>
  );
}
export default function CampaignsPage() { return <Suspense><CampaignsInner /></Suspense>; }
