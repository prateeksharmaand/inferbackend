'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrg } from '@/hooks/use-session';
import { api, errorMessage } from '@/lib/api';

export default function NewOrgPage() {
  const [name, setName] = useState(''); const [currency, setCurrency] = useState('INR'); const [country, setCountry] = useState('IN');
  const { switchTo } = useOrg(); const router = useRouter(); const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/organizations', { body: { name, currency, country }, org: false }),
    onSuccess: async (o) => { await qc.invalidateQueries({ queryKey: ['me'] }); switchTo(o.id); toast.success('Organization created'); router.push('/apps/new'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="New organization" description="Each organization has its own apps, ad accounts, budgets and team. You become its owner, on a 14-day trial." />
      <Card className="max-w-lg"><CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="n">Name</Label><Input id="n" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="c">Currency</Label><Input id="c" pattern="[A-Z]{3}" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label htmlFor="k">Country</Label><Input id="k" pattern="[A-Z]{2}" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></div>
          </div>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create organization'}</Button>
        </form>
      </CardContent></Card>
    </>
  );
}
