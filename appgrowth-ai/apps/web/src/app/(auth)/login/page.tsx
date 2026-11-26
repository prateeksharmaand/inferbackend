'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/app/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, ApiError, errorMessage } from '@/lib/api';

const schema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password'), mfaCode: z.string().optional() });
type F = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [needMfa, setNeedMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: F) => {
    setError(null);
    try {
      await api('/auth/login', { body: { email: v.email, password: v.password, ...(needMfa && v.mfaCode ? { mfaCode: v.mfaCode } : {}) }, org: false });
      const me = await api<{ platformRole: string; organizations: unknown[] }>('/auth/me', { org: false });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : me.platformRole !== 'NONE' && me.organizations.length === 0 ? '/admin' : '/dashboard');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') { setNeedMfa(true); setError(needMfa ? e.message : null); return; }
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">New here? <Link className="font-medium text-primary hover:underline" href="/register">Create an account</Link></p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Field label="Email" id="email" type="email" autoComplete="email" reg={register('email')} error={errors.email} />
        <Field label="Password" id="password" type="password" autoComplete="current-password" reg={register('password')} error={errors.password} />
        {needMfa && <Field label="Authenticator code" id="mfaCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus reg={register('mfaCode')} hint="Enter the 6-digit code from your authenticator app" />}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : needMfa ? 'Verify and sign in' : 'Sign in'}</Button>
        <p className="text-center text-sm"><Link href="/forgot-password" className="text-muted-foreground hover:text-foreground hover:underline">Forgot your password?</Link></p>
      </form>
    </>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }
