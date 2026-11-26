'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader, Stat } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { STATUS_VARIANT } from '@/lib/campaigns';
import { ago, money, titleCase } from '@/lib/format';

interface Row { id: string; name: string; provider: string; platform: string; status: string; statusReason: string; dailyBudgetMinor: string; currency: string; externalStatus: string | null; lastSyncedAt: string | null; automationEnabled: boolean; organization: { name: string }; application: { name: string } }

export default function AdminCampaigns() {
  const [status, setStatus] = useState(''); const [provider, setProvider] = useState(''); const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'campaigns', status, provider, page], queryFn: () => api<{ items: Row[]; total: number; totalPages: number; failedActionsLast7d: number }>(`/admin/campaigns?page=${page}&pageSize=50${status ? `&status=${status}` : ''}${provider ? `&provider=${provider}` : ''}`, { org: false }), refetchInterval: 30_000 });
  return (
    <>
      <PageHeader title="Campaign monitoring" description="Every customer campaign. Failed launches and platform errors surface here first." />
      {q.data && <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label="Campaigns (filtered)" value={q.data.total} /><Stat label="Failed platform actions (7d)" value={q.data.failedActionsLast7d} tone={q.data.failedActionsLast7d ? 'bad' : 'good'} /></div>}
      <div className="mb-4 flex gap-2">
        <NativeSelect aria-label="Status" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All but archived" options={['ACTIVE', 'PAUSED', 'FAILED', 'READY', 'PENDING_APPROVAL', 'DRAFT', 'COMPLETED'].map((s) => ({ value: s, label: titleCase(s) }))} />
        <NativeSelect aria-label="Channel" className="w-40" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }} placeholder="All channels" options={['GOOGLE_ADS', 'APPLE_ADS', 'META_ADS', 'TIKTOK_ADS'].map((s) => ({ value: s, label: titleCase(s) }))} />
      </div>
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} /> : !q.data!.items.length ? <EmptyBlock title="No campaigns" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><Table>
          <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Organization</TableHead><TableHead>Status</TableHead><TableHead>Platform status</TableHead><TableHead className="text-right">Daily</TableHead><TableHead>Synced</TableHead></TableRow></TableHeader>
          <TableBody>{q.data!.items.map((c) => (
            <TableRow key={c.id}>
              <TableCell><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.application.name} · {titleCase(c.provider)} · {c.platform}</p></TableCell>
              <TableCell>{c.organization.name}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[c.status]}>{titleCase(c.status)}</Badge>{c.statusReason && <p className="max-w-56 truncate text-xs text-muted-foreground" title={c.statusReason}>{c.statusReason}</p>}</TableCell>
              <TableCell className="text-xs">{c.externalStatus ?? '—'}{!c.automationEnabled && <Badge variant="outline" className="ml-1">manual</Badge>}</TableCell>
              <TableCell className="text-right tabular">{money(c.dailyBudgetMinor, c.currency)}</TableCell>
              <TableCell className="text-xs">{ago(c.lastSyncedAt)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></div>
      )}
      {q.data && q.data.totalPages > 1 && <div className="mt-3 flex justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="px-2 py-1">Page {page} of {q.data.totalPages}</span><Button size="sm" variant="outline" disabled={page >= q.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </>
  );
}
