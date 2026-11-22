"use client";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { fmtDate, titleCase } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { analyticsApi } from "@/services";
import type { NamedCount } from "@/types/api";

const COLORS = ["hsl(243 75% 58%)", "hsl(152 60% 36%)", "hsl(35 92% 45%)", "hsl(199 89% 48%)", "hsl(330 70% 55%)", "hsl(262 60% 60%)", "hsl(0 72% 51%)", "hsl(180 50% 40%)"];

export default function AnalyticsPage() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const q = useQuery({ queryKey: ["report", start, end], queryFn: () => analyticsApi.report({ start, end }) });
  const r = q.data;
  const kpis = r ? [
    ["Application → interview", `${r.summary.application_conversion_rate}%`], ["Interview → offer", `${r.summary.interview_to_offer_rate}%`],
    ["Recruiter response rate", `${r.summary.recruiter_response_rate}%`], ["Avg. offered CTC", r.avg_offered_ctc_lpa ? `₹${r.avg_offered_ctc_lpa} LPA` : "—"],
    ["Avg. time to recruiter reply", r.avg_recruiter_response_hours ? `${r.avg_recruiter_response_hours} h` : "—"], ["Jobs discovered", String(r.summary.jobs_discovered)],
  ] : [];
  return (
    <>
      <PageHeader title="Analytics" description="Where your jobs come from and how your funnel converts."
        actions={<>
          <Field label="From"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          {["jobs", "applications", "outreach"].map((d) => <Button key={d} variant="outline" size="sm" className="self-end" asChild>
            <a href={analyticsApi.exportUrl(d, start, end)}><Download />{titleCase(d)} CSV</a></Button>)}
        </>} />
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.isLoading || !r ? <Skeleton className="h-96" /> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{kpis.map(([k, v]) => (
            <Card key={k} className="p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-xl font-semibold">{v}</p></Card>))}</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Jobs by source"><PieChart><Pie data={r.by_source} dataKey="count" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
              {r.by_source.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ChartCard>
            <BarCard title="Jobs by location" data={r.by_location} />
            <BarCard title="Jobs by designation" data={r.by_designation} />
            <BarCard title="Jobs by match score" data={r.by_score} />
            <BarCard title="Applications by status" data={r.by_status.map((s) => ({ ...s, name: titleCase(s.name) }))} />
            <ChartCard title="Weekly progress"><LineChart data={r.weekly_jobs.map((w) => ({ week: fmtDate(w.week).slice(0, 6), jobs: w.count,
              applications: r.weekly_applications.find((a) => a.week === w.week)?.count ?? 0 }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" /><XAxis dataKey="week" fontSize={11} /><YAxis fontSize={11} width={28} allowDecimals={false} /><Tooltip />
              <Line dataKey="jobs" stroke={COLORS[0]} strokeWidth={2} /><Line dataKey="applications" stroke={COLORS[1]} strokeWidth={2} /></LineChart></ChartCard>
          </div>
        </>
      )}
    </>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer>{children}</ResponsiveContainer></CardContent></Card>;
}
function BarCard({ title, data }: { title: string; data: NamedCount[] }) {
  return <ChartCard title={title}><BarChart data={data} layout="vertical" margin={{ left: 20 }}><XAxis type="number" fontSize={11} allowDecimals={false} />
    <YAxis type="category" dataKey="name" fontSize={11} width={120} /><Tooltip /><Bar dataKey="count" fill={COLORS[0]} radius={[0, 3, 3, 0]} /></BarChart></ChartCard>;
}
