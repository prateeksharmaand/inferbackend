'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { NativeSelect } from '@/components/app/native-select';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Row { id: string; name: string; slug: string; status: string; createdAt: string; apps: number; members: number; activeCampaigns: number; subscription: { status: string; plan: { name: string } } | null }
interface Page { items: Row[]; total: number; totalPages: number }

export default function AdminOrgs() {
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'orgs', search, status, page], queryFn: () => api<Page>(`/admin/organizations?page=${page}&pageSize=25${search ? `&search=${encodeURIComponent(search)}` : ''}${status ? `&status=${status}` : ''}`, { org: false }) });
  return (
    <>
      <PageHeader title="Customer organizations" />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search name or slug" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="sm:max-w-xs" aria-label="Search organizations" />
        <NativeSelect aria-label="Status" className="sm:w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }, { value: 'CLOSED', label: 'Closed' }]} />
      </div>
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} retry={() => q.refetch()} /> : !q.data!.items.length ? <EmptyBlock title="No organizations match" /> : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Organization</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Apps</TableHead><TableHead className="text-right">Members</TableHead><TableHead className="text-right">Active campaigns</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.data!.items.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell><Link href={`/admin/organizations/${o.id}`} className="font-medium text-primary hover:underline">{o.name}</Link><p className="text-xs text-muted-foreground">{o.slug}</p></TableCell>
                    <TableCell>{o.subscription ? `${o.subscription.plan.name} · ${o.subscription.status.toLowerCase()}` : '—'}</TableCell>
                    <TableCell><Badge variant={o.status === 'ACTIVE' ? 'secondary' : 'destructive'}>{o.status.toLowerCase()}</Badge></TableCell>
                    <TableCell className="text-right tabular">{o.apps}</TableCell><TableCell className="text-right tabular">{o.members}</TableCell><TableCell className="text-right tabular">{o.activeCampaigns}</TableCell>
                    <TableCell>{date(o.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex justify-end gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="px-2 py-1">Page {page} of {q.data!.totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= q.data!.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </>
      )}
    </>
  );
}
