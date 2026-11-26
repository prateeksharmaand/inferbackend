'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/app/native-select';
import { ErrorBlock, LoadingBlock } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';
import { date } from '@/lib/format';

interface Members { members: { id: string; user: { id: string; email: string; name: string }; role: { key: string; name: string }; joinedAt: string }[]; invitations: { id: string; email: string; roleKey: string; expiresAt: string }[] }
const ROLES = [{ value: 'owner', label: 'Owner' }, { value: 'admin', label: 'Admin' }, { value: 'marketer', label: 'Marketer' }, { value: 'analyst', label: 'Analyst' }, { value: 'viewer', label: 'Viewer' }];

export default function MembersPage() {
  const { org, me, can } = useOrg();
  const qc = useQueryClient();
  const [email, setEmail] = useState(''); const [role, setRole] = useState('marketer');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const key = ['members', org?.id];
  const q = useQuery({ queryKey: key, queryFn: () => api<Members>(`/organizations/${org!.id}/members`), enabled: !!org });
  const done = (msg: string) => () => { toast.success(msg); qc.invalidateQueries({ queryKey: key }); };
  const fail = (e: unknown) => toast.error(errorMessage(e));
  const invite = useMutation({
    mutationFn: () => api<{ emailSent: boolean; inviteUrl?: string }>(`/organizations/${org!.id}/invitations`, { body: { email, role } }),
    onSuccess: (r) => { setEmail(''); setInviteUrl(r.inviteUrl ?? null); done(r.emailSent ? 'Invitation emailed' : 'Invitation created — email is not configured, share the link below')(); },
    onError: fail,
  });
  const changeRole = useMutation({ mutationFn: (v: { id: string; role: string }) => api(`/organizations/${org!.id}/members/${v.id}`, { method: 'PATCH', body: { role: v.role } }), onSuccess: done('Role updated'), onError: fail });
  const remove = useMutation({ mutationFn: (id: string) => api(`/organizations/${org!.id}/members/${id}`, { method: 'DELETE' }), onSuccess: done('Member removed'), onError: fail });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/organizations/${org!.id}/invitations/${id}`, { method: 'DELETE' }), onSuccess: done('Invitation revoked'), onError: fail });
  const manage = can('members.manage');
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} retry={() => q.refetch()} />;
  return (
    <div className="space-y-6">
      {manage && (
        <Card>
          <CardHeader><CardTitle>Invite a teammate</CardTitle><CardDescription>Owners manage billing; admins manage everything else; marketers run apps, creatives and campaigns; analysts and viewers read.</CardDescription></CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}>
              <div className="flex-1 space-y-1.5"><Label htmlFor="inv-email">Email</Label><Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5 sm:w-40"><Label htmlFor="inv-role">Role</Label><NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value)} options={ROLES.filter((r) => r.value !== 'owner')} /></div>
              <Button type="submit" disabled={!email || invite.isPending}><UserPlus /> Invite</Button>
            </form>
            {inviteUrl && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                <code className="flex-1 truncate">{inviteUrl}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success('Link copied'); }}><Copy /> Copy</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Members</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Joined</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data!.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.user.name}{m.user.id === me?.id && <Badge variant="secondary" className="ml-2">you</Badge>}</TableCell>
                  <TableCell>{m.user.email}</TableCell>
                  <TableCell>{manage ? <NativeSelect aria-label={`Role for ${m.user.name}`} className="w-32" value={m.role.key} onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value })} options={ROLES} /> : m.role.name}</TableCell>
                  <TableCell>{date(m.joinedAt)}</TableCell>
                  <TableCell>{manage && m.user.id !== me?.id && <Button size="icon" variant="ghost" aria-label={`Remove ${m.user.name}`} onClick={() => confirm(`Remove ${m.user.name}?`) && remove.mutate(m.id)}><Trash2 /></Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {q.data!.invitations.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium">Pending invitations</p>
              <ul className="divide-y rounded-lg border text-sm">
                {q.data!.invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>{i.email} · {i.roleKey} · expires {date(i.expiresAt)}</span>
                    {manage && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>Revoke</Button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
