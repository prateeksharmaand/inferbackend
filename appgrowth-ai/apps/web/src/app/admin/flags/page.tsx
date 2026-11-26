'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';

export default function Flags() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'flags'], queryFn: () => api<{ key: string; description: string; enabled: boolean }[]>('/admin/feature-flags', { org: false }) });
  const set = useMutation({ mutationFn: (v: { key: string; enabled: boolean }) => api(`/admin/feature-flags/${v.key}`, { method: 'PUT', body: { enabled: v.enabled }, org: false }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'flags'] }), onError: (e) => toast.error(errorMessage(e)) });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} />;
  return (
    <>
      <PageHeader title="Feature flags" description="Integrations stay off until their API access is approved and credentials are configured." />
      <Card><CardContent className="divide-y">
        {q.data!.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-4 py-3">
            <div><p className="font-mono text-sm">{f.key}</p><p className="text-sm text-muted-foreground">{f.description}</p></div>
            <Switch checked={f.enabled} onCheckedChange={(c) => set.mutate({ key: f.key, enabled: c })} aria-label={f.key} />
          </div>
        ))}
      </CardContent></Card>
    </>
  );
}
