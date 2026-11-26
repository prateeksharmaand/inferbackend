'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ErrorBlock, LoadingBlock } from '@/components/app/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrg } from '@/hooks/use-session';
import { api } from '@/lib/api';
import { date, money, num } from '@/lib/format';

interface Billing {
  subscription: { status: string; currentPeriodEnd: string; trialEndsAt: string | null; plan: { key: string; name: string } } | null;
  plans: { key: string; name: string; description: string; priceMinor: string; currency: string; maxApps: number; maxMembers: number; maxAdAccounts: number; aiGenerationsMonth: number }[];
  invoices: { id: string; number: string; status: string; total: string; currency: string; periodStart: string; periodEnd: string; issuedAt: string }[];
  usage: { aiTokens: string; aiTokensLimit?: string; mediaGenerations: number }; note: string;
}

export default function BillingPage() {
  const { org } = useOrg();
  const q = useQuery({ queryKey: ['billing', org?.id], queryFn: () => api<Billing>('/billing'), enabled: !!org });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} />;
  const b = q.data!; const used = Number(b.usage.aiTokens); const limit = Number(b.usage.aiTokensLimit ?? 0);
  return (
    <div className="space-y-6">
      <Alert><AlertDescription>{b.note}</AlertDescription></Alert>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Current plan</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          {b.subscription ? <><p className="text-xl font-semibold">{b.subscription.plan.name} <Badge variant="secondary">{b.subscription.status.toLowerCase()}</Badge></p><p className="text-muted-foreground">{b.subscription.trialEndsAt ? `Trial ends ${date(b.subscription.trialEndsAt)}` : `Current period ends ${date(b.subscription.currentPeriodEnd)}`}</p></> : <p>No subscription</p>}
          <div className="pt-2"><p className="text-xs text-muted-foreground">AI tokens this month: {num(used, true)} of {num(limit, true)}</p><Progress value={limit ? Math.min(100, (used / limit) * 100) : 0} className="mt-1" aria-label="AI usage" /><p className="mt-1 text-xs text-muted-foreground">{b.usage.mediaGenerations} images/videos generated</p></div>
          <Link href="/support"><Button size="sm" variant="outline" className="mt-2">Request a plan change</Button></Link>
        </CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Plans</CardTitle><CardDescription>Plan changes are made by our team on request (online payment is coming).</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          {b.plans.map((p) => (
            <div key={p.key} className={`rounded-lg border p-3 text-sm ${b.subscription?.plan.key === p.key ? 'border-primary bg-primary/5' : ''}`}>
              <p className="font-medium">{p.name}</p><p className="text-lg font-semibold">{Number(p.priceMinor) ? `${money(p.priceMinor, p.currency)}/mo` : 'Free'}</p>
              <p className="text-xs text-muted-foreground">{p.maxApps} apps · {p.maxMembers} members · {p.maxAdAccounts} ad accounts · {p.aiGenerationsMonth} AI generations/mo</p>
            </div>
          ))}
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Invoices</CardTitle></CardHeader><CardContent className="overflow-x-auto">
        {b.invoices.length ? <Table><TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Period</TableHead><TableHead>Issued</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{b.invoices.map((i) => <TableRow key={i.id}><TableCell>{i.number}</TableCell><TableCell>{date(i.periodStart)} – {date(i.periodEnd)}</TableCell><TableCell>{date(i.issuedAt)}</TableCell><TableCell className="text-right tabular">{money(Math.round(Number(i.total) * 100), i.currency)}</TableCell><TableCell><Badge variant={i.status === 'paid' ? 'secondary' : 'outline'}>{i.status}</Badge></TableCell></TableRow>)}</TableBody></Table>
          : <p className="text-sm text-muted-foreground">No invoices yet.</p>}
      </CardContent></Card>
    </div>
  );
}
