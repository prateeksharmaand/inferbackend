'use client';
import { Table2, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Entity → series slot is fixed (never by rank), so filtering never repaints the survivors. */
export const CHANNEL_COLOR: Record<string, string> = { GOOGLE_ADS: 'var(--series-1)', APPLE_ADS: 'var(--series-2)', META_ADS: 'var(--series-3)', TIKTOK_ADS: 'var(--series-4)' };
export interface SeriesDef { key: string; label: string; color: string }

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const axisProps = { tick: { fill: 'var(--viz-axis)', fontSize: 11 }, tickLine: false, axisLine: false } as const;

function TipBox({ active, payload, label, fmt, series }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; fmt: (v: number) => string; series: SeriesDef[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label ? shortDate(label) : ''}</p>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return p ? <p key={s.key} className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: s.color }} />{s.label}<span className="ml-auto pl-4 font-medium text-foreground tabular">{fmt(Number(p.value))}</span></p> : null;
      })}
    </div>
  );
}

function Legend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">{series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}</div>;
}

/** Chart frame: title, legend, chart/table toggle (identity is never color-alone; a table view always exists). */
export function ChartCard({ title, subtitle, series, rows, fmt, children }: { title: string; subtitle?: string; series: SeriesDef[]; rows: Record<string, string | number | null>[]; fmt: (v: number) => string; children: React.ReactNode }) {
  const [table, setTable] = useState(false);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-medium">{title}</p>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>
        <div className="flex items-center gap-3"><Legend series={series} />
          <Button size="icon-sm" variant="ghost" aria-label={table ? 'Show chart' : 'Show as table'} onClick={() => setTable(!table)}>{table ? <BarChart3 /> : <Table2 />}</Button>
        </div>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto"><Table>
          <TableHeader><TableRow><TableHead>Date</TableHead>{series.map((s) => <TableHead key={s.key} className="text-right">{s.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{rows.map((r) => <TableRow key={String(r.date)}><TableCell>{shortDate(String(r.date))}</TableCell>{series.map((s) => <TableCell key={s.key} className="text-right tabular">{fmt(Number(r[s.key] ?? 0))}</TableCell>)}</TableRow>)}</TableBody>
        </Table></div>
      ) : <div className="h-60">{children}</div>}
    </div>
  );
}

/** Stacked daily bars (one axis). 2px surface gap between segments; rounded data-end on the top segment only. */
export function StackedBars({ rows, series, fmt }: { rows: Record<string, string | number | null>[]; series: SeriesDef[]; fmt: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axisProps} />
        <YAxis allowDecimals={false} tickFormatter={(v) => fmt(Number(v))} width={52} {...axisProps} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)' }} content={<TipBox fmt={fmt} series={series} />} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--card)" strokeWidth={2} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 2px lines, ≥8px active marker with a surface ring; crosshair tooltip. */
export function Lines({ rows, series, fmt }: { rows: Record<string, string | number | null>[]; series: SeriesDef[]; fmt: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axisProps} />
        <YAxis tickFormatter={(v) => fmt(Number(v))} width={60} {...axisProps} />
        <Tooltip cursor={{ stroke: 'var(--viz-axis)', strokeDasharray: '3 3' }} content={<TipBox fmt={fmt} series={series} />} />
        {series.map((s) => <Line key={s.key} dataKey={s.key} type="monotone" stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4.5, stroke: 'var(--card)', strokeWidth: 2 }} connectNulls isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
