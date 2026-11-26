'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AuditTable } from '@/components/app/audit-table';
import { ErrorBlock, LoadingBlock } from '@/components/app/states';
import { useOrg } from '@/hooks/use-session';
import { api } from '@/lib/api';

export default function AuditPage() {
  const { org } = useOrg();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['audit', org?.id, page], queryFn: () => api<Parameters<typeof AuditTable>[0]['data']>(`/organizations/${org!.id}/audit-logs?page=${page}&pageSize=25`), enabled: !!org });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} retry={() => q.refetch()} />;
  return <AuditTable data={q.data!} page={page} setPage={setPage} />;
}
