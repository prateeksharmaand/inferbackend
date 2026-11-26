'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, strongPassword, strongPasswordMsg } from '@/components/app/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage, setOrgId } from '@/lib/api';

const schema = z.object({ name: z.string().trim().max(80).optional(), password: z.string().optional() })
  .refine((v) => !v.password || strongPassword.test(v.password), { path: ['password'], message: strongPasswordMsg });

function AcceptForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (!token) return <Alert variant="destructive"><AlertDescription>This invitation link is incomplete.</AlertDescription></Alert>;
  if (joined) return <Alert><AlertDescription>You&apos;ve joined. <Link href="/login" className="font-medium text-primary underline">Sign in</Link> to continue.</AlertDescription></Alert>;
  return (
    <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
      setError(null);
      try {
        const r = await api<{ organizationId: string }>('/auth/accept-invite', { body: { token, name: v.name || undefined, password: v.password || undefined }, org: false });
        setOrgId(r.organizationId); setJoined(true); router.prefetch('/login');
      } catch (e) { setError(errorMessage(e)); }
    })}>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <p className="text-sm text-muted-foreground">Already have an AppGrowth account with the invited email? Leave these blank and press Join.</p>
      <Field label="Your name" id="name" autoComplete="name" reg={register('name')} error={errors.name} />
      <Field label="Password" id="password" type="password" autoComplete="new-password" reg={register('password')} error={errors.password} hint={strongPasswordMsg} />
      <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Joining…' : 'Join organization'}</Button>
    </form>
  );
}
export default function AcceptInvitePage() {
  return <><h1 className="text-2xl font-semibold tracking-tight">Accept invitation</h1><Suspense><AcceptForm /></Suspense></>;
}
