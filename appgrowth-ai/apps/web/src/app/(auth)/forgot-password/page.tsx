'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '@/components/app/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

const schema = z.object({ email: z.string().email('Enter a valid email') });

export default function ForgotPage() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a link that works for one hour.</p>
      {done ? <Alert className="mt-6"><AlertDescription>{done}</AlertDescription></Alert> : (
        <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
          setError(null);
          try { const r = await api<{ message: string }>('/auth/forgot-password', { body: v, org: false }); setDone(r.message); } catch (e) { setError(errorMessage(e)); }
        })}>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Field label="Email" id="email" type="email" autoComplete="email" reg={register('email')} error={errors.email} />
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send reset link'}</Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-muted-foreground hover:underline">Back to sign in</Link></p>
    </>
  );
}
