'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AuditTable } from '@/components/app/audit-table';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function AdminAudit() {
  const [page, setPage] = useState(1); const [sec, setSec] = useState(false); const [action, setAction] = useState('');
  const q = useQuery({ queryKey: ['admin', 'audit', page, sec, action], queryFn: () => api<Parameters<typeof AuditTable>[0]['data']>(`/admin/audit-logs?page=${page}&pageSize=50${sec ? '&securityOnly=true' : ''}${action ? `&action=${encodeURIComponent(action)}` : ''}`, { org: false }) });
  return (
    <>
      <PageHeader title="Audit & security logs" description="Every change by people and agents across the platform. Credentials are redacted before they are written." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input className="sm:max-w-xs" placeholder="Action prefix, e.g. auth." value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filter by action" />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={sec} onCheckedChange={(c) => { setSec(!!c); setPage(1); }} /> Security events only</label>
      </div>
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} /> : <AuditTable data={q.data!} page={page} setPage={setPage} showOrg />}
    </>
  );
}
