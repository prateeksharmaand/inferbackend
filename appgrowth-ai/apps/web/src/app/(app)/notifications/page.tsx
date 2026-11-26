'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { ago } from '@/lib/format';

interface N { id: string; kind: string; severity: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }
interface Pref { kind: string; label: string; inApp: boolean; email: boolean }

export default function NotificationsPage() {
  const { org } = useOrg(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ items: N[]; unreadCount: number }>('/notifications', { org: false }) });
  const prefs = useQuery({ queryKey: ['notification-prefs', org?.id], queryFn: () => api<Pref[]>('/notifications/preferences'), enabled: !!org });
  const [p, setP] = useState<Pref[]>([]);
  useEffect(() => { if (prefs.data) setP(prefs.data); }, [prefs.data]);
  const read = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST', org: false }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST', org: false }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const save = useMutation({ mutationFn: () => api('/notifications/preferences', { method: 'PUT', body: { preferences: p.map(({ kind, inApp, email }) => ({ kind, inApp, email })) } }), onSuccess: () => toast.success('Preferences saved'), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title="Notifications" actions={q.data?.unreadCount ? <Button variant="outline" onClick={() => readAll.mutate()}><CheckCheck /> Mark all read</Button> : undefined} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} /> : !q.data!.items.length ? <EmptyBlock icon={Bell} title="Nothing yet" description="Budget alerts, campaign problems, approvals and reports appear here." /> : (
            <ul className="divide-y rounded-xl border bg-card">
              {q.data!.items.map((n) => (
                <li key={n.id} className={`flex gap-3 p-4 ${n.readAt ? 'opacity-70' : ''}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : n.severity === 'critical' ? 'bg-destructive' : n.severity === 'warning' ? 'bg-amber-500' : 'bg-primary'}`} aria-hidden />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{n.title} {n.severity !== 'info' && <Badge variant={n.severity === 'critical' ? 'destructive' : 'outline'}>{n.severity}</Badge>}</p>
                    <p className="text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ago(n.createdAt)}{n.link && <> · <Link href={n.link} className="text-primary hover:underline" onClick={() => !n.readAt && read.mutate(n.id)}>Open</Link></>}</p>
                  </div>
                  {!n.readAt && <Button size="sm" variant="ghost" onClick={() => read.mutate(n.id)}>Mark read</Button>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card className="h-fit"><CardHeader><CardTitle>Preferences</CardTitle><CardDescription>For {org?.name}. Email goes to your account address.</CardDescription></CardHeader><CardContent>
          {prefs.isLoading ? <LoadingBlock rows={3} /> : (
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs font-medium text-muted-foreground"><span /><span>In app</span><span>Email</span></div>
              {p.map((x, i) => (
                <div key={x.kind} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-1.5 text-sm">
                  <span>{x.label}</span>
                  <Switch checked={x.inApp} onCheckedChange={(v) => setP(p.map((y, j) => (j === i ? { ...y, inApp: v } : y)))} aria-label={`${x.label} in app`} />
                  <Switch checked={x.email} onCheckedChange={(v) => setP(p.map((y, j) => (j === i ? { ...y, email: v } : y)))} aria-label={`${x.label} email`} />
                </div>
              ))}
              <Button type="submit" size="sm" className="mt-3" disabled={save.isPending}>Save</Button>
            </form>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
