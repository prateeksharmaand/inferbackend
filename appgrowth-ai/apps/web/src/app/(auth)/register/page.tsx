'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, strongPassword, strongPasswordMsg } from '@/components/app/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage, setOrgId } from '@/lib/api';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  organizationName: z.string().trim().min(2, 'Enter your company or team name').max(120),
  email: z.string().email('Enter a valid email'),
  password: z.string().regex(strongPassword, strongPasswordMsg),
});
type F = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });
  const onSubmit = async (v: F) => {
    setError(null);
    try {
      const r = await api<{ organization: { id: string } }>('/auth/register', { body: v, org: false });
      setOrgId(r.organization.id);
      router.replace('/apps/new?welcome=1');
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">14-day free trial. Ad spend is billed by the ad platforms to your own accounts. Already registered? <Link className="font-medium text-primary hover:underline" href="/login">Sign in</Link></p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Field label="Your name" id="name" autoComplete="name" reg={register('name')} error={errors.name} />
        <Field label="Company or team" id="organizationName" autoComplete="organization" reg={register('organizationName')} error={errors.organizationName} />
        <Field label="Work email" id="email" type="email" autoComplete="email" reg={register('email')} error={errors.email} />
        <Field label="Password" id="password" type="password" autoComplete="new-password" reg={register('password')} error={errors.password} hint={strongPasswordMsg} />
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</Button>
      </form>
    </>
  );
}
