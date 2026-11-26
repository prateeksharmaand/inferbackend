'use client';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
}

export function ErrorBlock({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm">{errorMessage(error)}</p>
      {retry && <Button variant="outline" size="sm" onClick={retry}><RefreshCw /> Try again</Button>}
    </div>
  );
}

export function EmptyBlock({ icon: Icon = Inbox, title, description, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground"><Icon className="size-6" /></div>
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  const toneCls = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular">{value}</p>
      {hint && <p className={`mt-1 text-xs ${toneCls}`}>{hint}</p>}
    </div>
  );
}
