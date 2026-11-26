'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

interface P { key: string; name: string; category: string; readiness: string; readinessNote: string; featureEnabled: boolean | null; accounts: Record<string, number>; errors7d: { code: string | null; count: number }[] }

export default function AdminIntegrations() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'integrations'], queryFn: () => api<{ providers: P[] }>('/admin/integrations', { org: false }) });
  const set = useMutation({ mutationFn: (v: { key: string; readiness: string; note: string }) => api(`/admin/integrations/${v.key}/readiness`, { method: 'PUT', body: { readiness: v.readiness, note: v.note }, org: false }), onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['admin', 'integrations'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} />;
  return (
    <>
      <PageHeader title="Integrations" description="Readiness is shown to customers. Mark a provider verified only after a live test against its API. Turn availability on with the integration.* feature flags." />
      <div className="grid gap-4 lg:grid-cols-2">
        {q.data!.providers.map((p) => (
          <Card key={p.key}>
            <CardHeader><CardTitle className="flex flex-wrap items-center gap-2">{p.name}<Badge variant="outline">{p.category}</Badge>{p.featureEnabled !== null && <Badge variant={p.featureEnabled ? 'default' : 'secondary'}>{p.featureEnabled ? 'available' : 'flag off'}</Badge>}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">Accounts: {Object.entries(p.accounts).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(', ') || 'none'}</p>
              {p.errors7d.length > 0 && <p className="text-destructive">Errors (7d): {p.errors7d.map((e) => `${e.code ?? 'unknown'} ×${e.count}`).join(', ')}</p>}
              <div className="flex flex-wrap gap-2">
                <NativeSelect aria-label={`${p.name} readiness`} className="w-56" value={p.readiness} onChange={(e) => set.mutate({ key: p.key, readiness: e.target.value, note: p.readinessNote })} options={['not_configured', 'configured', 'implemented_unverified', 'verified'].map((r) => ({ value: r, label: r.replace(/_/g, ' ') }))} />
                <Input className="flex-1" defaultValue={p.readinessNote} placeholder="Note shown to customers" onBlur={(e) => e.target.value !== p.readinessNote && set.mutate({ key: p.key, readiness: p.readiness, note: e.target.value })} aria-label={`${p.name} note`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
