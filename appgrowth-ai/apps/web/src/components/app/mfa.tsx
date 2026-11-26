'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Me } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';

/** TOTP enrolment (QR + code) or step-up verification for the current session. */
export function MfaSetup({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [secret, setSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const start = useMutation({ mutationFn: () => api<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', { method: 'POST', org: false }), onSuccess: setSecret, onError: (e) => toast.error(errorMessage(e)) });
  const enable = useMutation({
    mutationFn: () => api('/auth/mfa/enable', { body: { code }, org: false }),
    onSuccess: async () => { toast.success('Two-factor authentication is on'); await qc.invalidateQueries({ queryKey: ['me'] }); onDone?.(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!secret) return <Button onClick={() => start.mutate()} disabled={start.isPending}>{start.isPending ? 'Preparing…' : 'Set up authenticator app'}</Button>;
  return (
    <div className="grid gap-6 sm:grid-cols-[auto,1fr]">
      <div className="rounded-xl border bg-white p-3"><QRCodeSVG value={secret.otpauthUrl} size={168} /></div>
      <div className="space-y-3">
        <p className="text-sm">Scan the code with Google Authenticator, 1Password, Authy or a similar app. Can&apos;t scan? Enter this key:</p>
        <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{secret.secret}</code>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); enable.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="code">6-digit code</Label><Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-32" /></div>
          <Button type="submit" disabled={code.length !== 6 || enable.isPending}>Turn on</Button>
        </form>
      </div>
    </div>
  );
}

export function MfaVerify() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const verify = useMutation({
    mutationFn: () => api('/auth/mfa/verify', { body: { code }, org: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }), onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); verify.mutate(); }}>
      <div className="space-y-1.5"><Label htmlFor="vcode">Authenticator code</Label><Input id="vcode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-36" /></div>
      <Button type="submit" disabled={code.length !== 6 || verify.isPending}>Verify</Button>
    </form>
  );
}

export function MfaGate({ me }: { me: Me }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>{me.mfaEnabled ? 'Verify it’s you' : 'Two-factor authentication required'}</CardTitle>
        <CardDescription>{me.mfaEnabled ? 'Enter a code from your authenticator app to open the admin console.' : 'Platform administrators must use two-factor authentication. Set it up once to continue.'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!me.mfaEnabled && <Alert><AlertDescription>After this, every sign-in asks for a code from your phone.</AlertDescription></Alert>}
        {me.mfaEnabled ? <MfaVerify /> : <MfaSetup />}
      </CardContent>
    </Card>
  );
}
