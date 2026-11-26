'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMe } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { ago } from '@/lib/format';

interface U { id: string; email: string; name: string; status: string; platformRole: string; lastLoginAt: string | null; mfaEnabledAt: string | null; lockedUntil: string | null; _count: { memberships: number } }

export default function AdminUsers() {
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const { data: me } = useMe(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'users', search, page], queryFn: () => api<{ items: U[]; totalPages: number }>(`/admin/users?page=${page}&pageSize=25${search ? `&search=${encodeURIComponent(search)}` : ''}`, { org: false }) });
  const set = useMutation({ mutationFn: (v: { id: string; on: boolean }) => api(`/admin/users/${v.id}/${v.on ? 'enable' : 'disable'}`, { method: 'POST', org: false }), onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title="Users" description="Disabling a user signs them out everywhere." />
      <Input placeholder="Search email or name" className="mb-4 sm:max-w-xs" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search users" />
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><Table>
          <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Orgs</TableHead><TableHead>2FA</TableHead><TableHead>Last sign-in</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{q.data!.items.map((u) => (
            <TableRow key={u.id}>
              <TableCell><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></TableCell>
              <TableCell>{u.platformRole === 'NONE' ? 'customer' : <Badge>{u.platformRole.toLowerCase().replace('_', ' ')}</Badge>}</TableCell>
              <TableCell className="tabular">{u._count.memberships}</TableCell>
              <TableCell>{u.mfaEnabledAt ? 'on' : 'off'}</TableCell>
              <TableCell>{ago(u.lastLoginAt)}</TableCell>
              <TableCell><Badge variant={u.status === 'ACTIVE' ? 'secondary' : 'destructive'}>{u.status.toLowerCase()}</Badge>{u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge variant="outline" className="ml-1">locked</Badge>}</TableCell>
              <TableCell className="text-right">{u.id !== me?.id && <Button size="sm" variant="outline" onClick={() => set.mutate({ id: u.id, on: u.status !== 'ACTIVE' })}>{u.status === 'ACTIVE' ? 'Disable' : 'Enable'}</Button>}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></div>
      )}
      {q.data && <div className="mt-3 flex justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="px-2 py-1">Page {page} of {q.data.totalPages}</span><Button size="sm" variant="outline" disabled={page >= q.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </>
  );
}
