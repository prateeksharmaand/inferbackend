'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MfaSetup } from '@/components/app/mfa';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMe } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';

export default function SecurityPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const disable = useMutation({
    mutationFn: () => api('/auth/mfa/disable', { body: { code }, org: false }),
    onSuccess: () => { toast.success('Two-factor authentication turned off'); setCode(''); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Two-factor authentication</CardTitle><CardDescription>Protects your account with a code from an authenticator app at every sign-in.</CardDescription></CardHeader>
      <CardContent>
        {me?.mfaEnabled ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400"><ShieldCheck className="size-5" /> On</p>
            {(me.platformRole === 'NONE' || !me.adminMfaRequired) && (
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); disable.mutate(); }}>
                <div className="space-y-1.5"><Label htmlFor="dcode">Code to turn it off</Label><Input id="dcode" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-36" /></div>
                <Button variant="destructive" type="submit" disabled={code.length !== 6 || disable.isPending}>Turn off</Button>
              </form>
            )}
          </div>
        ) : <MfaSetup />}
      </CardContent>
    </Card>
  );
}
