'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, strongPassword, strongPasswordMsg } from '@/components/app/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

const schema = z.object({ password: z.string().regex(strongPassword, strongPasswordMsg), confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (!token) return <Alert variant="destructive"><AlertDescription>This link is incomplete. Request a new reset link.</AlertDescription></Alert>;
  return done ? (
    <Alert><AlertDescription>Password changed. You were signed out on every device. <Link href="/login" className="font-medium text-primary underline">Sign in</Link></AlertDescription></Alert>
  ) : (
    <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
      setError(null);
      try { await api('/auth/reset-password', { body: { token, password: v.password }, org: false }); setDone(true); } catch (e) { setError(errorMessage(e)); }
    })}>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Field label="New password" id="password" type="password" autoComplete="new-password" reg={register('password')} error={errors.password} hint={strongPasswordMsg} />
      <Field label="Confirm password" id="confirm" type="password" autoComplete="new-password" reg={register('confirm')} error={errors.confirm} />
      <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Change password'}</Button>
    </form>
  );
}
export default function ResetPage() {
  return <><h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1><Suspense><ResetForm /></Suspense></>;
}
