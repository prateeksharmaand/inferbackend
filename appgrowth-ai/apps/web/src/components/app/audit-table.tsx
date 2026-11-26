'use client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dateTime } from '@/lib/format';
import { EmptyBlock } from './states';

interface Row { id: string; action: string; actor: string; entityType: string | null; entityId: string | null; ip: string | null; security: boolean; createdAt: string; organizationId?: string | null; after?: unknown }
export function AuditTable({ data, page, setPage, showOrg }: { data: { items: Row[]; totalPages: number; total: number }; page: number; setPage: (p: number) => void; showOrg?: boolean }) {
  if (!data.items.length) return <EmptyBlock title="No activity yet" />;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Subject</TableHead>{showOrg && <TableHead>Organization</TableHead>}<TableHead>IP</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{dateTime(r.createdAt)}</TableCell>
                <TableCell><span className="font-mono text-xs">{r.action}</span>{r.security && <Badge variant="destructive" className="ml-2">security</Badge>}</TableCell>
                <TableCell className="font-mono text-xs">{r.actor}</TableCell>
                <TableCell className="text-xs">{r.entityType ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}` : '—'}</TableCell>
                {showOrg && <TableCell className="font-mono text-xs">{r.organizationId?.slice(0, 8) ?? 'platform'}</TableCell>}
                <TableCell className="text-xs">{r.ip ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data.total} events</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="px-2 py-1">Page {page} of {data.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
