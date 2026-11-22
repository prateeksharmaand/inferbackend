"use client";
import { useQuery } from "@tanstack/react-query";
import { Activity, Award, Briefcase, CalendarCheck, MessageSquareReply, Search, Sparkles, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { ago, fmtDate, fmtLpa } from "@/lib/utils";
import { analyticsApi, profileApi } from "@/services";
import { errorMessage } from "@/services/client";

export default function OverviewPage() {
  const q = useQuery({ queryKey: ["overview"], queryFn: analyticsApi.overview });
  const profile = useQuery({ queryKey: ["profile"], queryFn: profileApi.get });
  const t = q.data?.totals;
  const tiles = t ? [
    { label: "Jobs discovered", value: t.jobs_discovered, icon: Search },
    { label: "Shortlisted", value: t.shortlisted, icon: Star },
    { label: "Excellent matches", value: t.excellent_matches, icon: Sparkles },
    { label: "Applications submitted", value: t.applications_submitted, icon: Briefcase },
    { label: "Recruiter responses", value: t.recruiter_responses, icon: MessageSquareReply },
    { label: "Interviews", value: t.interviews_scheduled, icon: CalendarCheck },
    { label: "Offers", value: t.offers, icon: Award },
    { label: "Application → interview", value: `${t.application_conversion_rate}%`, icon: TrendingUp },
  ] : [];
  const weekly = (q.data?.weekly_jobs ?? []).map((w) => ({
    week: fmtDate(w.week).slice(0, 6), jobs: w.count,
    applications: q.data?.weekly_applications.find((a) => a.week === w.week)?.count ?? 0,
  }));
  return (
    <>
      <PageHeader title={`Welcome${profile.data?.full_name ? `, ${profile.data.full_name.split(" ")[0]}` : ""}`}
        description={profile.data?.target_ctc_min_lpa
          ? `Your search for a ${fmtLpa(profile.data.target_ctc_min_lpa, profile.data.target_ctc_max_lpa)} ${profile.data.preferred_designations[0] ?? "role"} role at a glance.`
            .replace(" role role", " role")
          : "Your job search at a glance."}
        actions={<Button asChild><Link href="/jobs"><Search />Discover jobs</Link></Button>} />
      {profile.data && !profile.data.employment.length && (
        <Card className="mb-6 border-primary/40 bg-accent/40 p-4 text-sm">
          <b>Start here:</b> upload your resume in <Link className="text-primary underline" href="/resumes">Resume Studio</Link> so matching and resume generation use your real experience.
        </Card>
      )}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {q.isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[84px]" />) : tiles.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">{label}<Icon className="size-4" /></div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Top matching opportunities</CardTitle><CardDescription>Highest AI scores among open jobs</CardDescription></CardHeader>
          <CardContent>
            {q.isLoading ? <Skeleton className="h-40" /> : q.data?.top_matches.length ? (
              <ul className="divide-y">{q.data.top_matches.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <ScoreBadge score={m.score} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/jobs?open=${m.id}`} className="block truncate text-sm font-medium hover:text-primary">{m.title}</Link>
                    <p className="truncate text-xs text-muted-foreground">{m.company} · {m.location || m.work_mode} · {fmtLpa(m.ctc_min_lpa, m.ctc_max_lpa)}</p>
                  </div>
                </li>))}
              </ul>
            ) : <EmptyState title="No scored jobs yet" description="Discover jobs, then run AI matching from AI Shortlist or Agent Automation." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Upcoming interviews</CardTitle></CardHeader>
          <CardContent>
            {q.data?.upcoming_interviews.length ? <ul className="space-y-3">{q.data.upcoming_interviews.map((i) => (
              <li key={i.id} className="text-sm"><p className="font-medium">{i.company} — {i.round_name}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(i.scheduled_at, true)} · {i.title}</p></li>))}</ul>
              : <p className="text-xs text-muted-foreground">No interviews scheduled.</p>}
          </CardContent>
          <CardHeader className="pt-2"><CardTitle>Pending follow-ups</CardTitle></CardHeader>
          <CardContent>
            {q.data?.pending_follow_ups.length ? <ul className="space-y-2">{q.data.pending_follow_ups.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/applications/${f.id}`} className="truncate hover:text-primary">{f.company} — {f.title}</Link>
                <StatusBadge status={f.status} /></li>))}</ul>
              : <p className="text-xs text-muted-foreground">Nothing due.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent discoveries</CardTitle></CardHeader>
          <CardContent>
            {q.data?.recent_jobs.length ? <ul className="space-y-2">{q.data.recent_jobs.map((j) => (
              <li key={j.id} className="text-sm"><Link href={`/jobs?open=${j.id}`} className="font-medium hover:text-primary">{j.title}</Link>
                <p className="text-xs text-muted-foreground">{j.company} · found {ago(j.discovered_at)}</p></li>))}</ul>
              : <p className="text-xs text-muted-foreground">No jobs yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Weekly performance</CardTitle><CardDescription>Jobs discovered vs applications sent</CardDescription></CardHeader>
          <CardContent className="h-56">
            {weekly.length ? (
              <ResponsiveContainer><BarChart data={weekly}><CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="week" fontSize={11} tickLine={false} /><YAxis fontSize={11} allowDecimals={false} tickLine={false} width={28} />
                <Tooltip /><Bar dataKey="jobs" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} /><Bar dataKey="applications" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
              </BarChart></ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground">Data appears after your first week of activity.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4" />Recent activity</CardTitle></CardHeader>
          <CardContent>
            {q.data?.recent_activity.length ? <ul className="space-y-2 text-xs">{q.data.recent_activity.map((a) => (
              <li key={a.id}><span className="text-muted-foreground">{ago(a.created_at)} · {a.actor}</span><p>{a.summary || a.action}</p></li>))}</ul>
              : <p className="text-xs text-muted-foreground">No activity yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
