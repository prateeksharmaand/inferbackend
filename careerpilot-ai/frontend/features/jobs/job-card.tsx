"use client";
import { Building2, CalendarClock, ExternalLink, FileText, MapPin, Star, StarOff, Wallet, X } from "lucide-react";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAction } from "@/hooks/use-action";
import { ago, fmtLpa, titleCase } from "@/lib/utils";
import { jobsApi } from "@/services";
import type { Job } from "@/types/api";

export function JobCard({ job, onOpen }: { job: Job; onOpen: (id: number) => void }) {
  const inv = [["jobs"], ["shortlist"], ["overview"], ["applications"]];
  const shortlist = useAction(() => (job.shortlisted_at ? jobsApi.unshortlist(job.id) : jobsApi.shortlist(job.id)),
    { success: job.shortlisted_at ? "Removed from shortlist" : "Shortlisted — added to Applications", invalidate: inv });
  const dismiss = useAction(() => jobsApi.dismiss(job.id), { success: "Dismissed", invalidate: inv });
  const resume = useAction(() => jobsApi.tailoredResume(job.id), {
    success: "Tailored resume generated — see Applications", invalidate: [...inv, ["resumes"]] });
  const link = job.apply_url || job.url;
  return (
    <Card className="group flex flex-col gap-3 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <button className="text-left text-sm font-semibold leading-snug hover:text-primary" onClick={() => onOpen(job.id)}>
            {job.title}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" />{job.company_name}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{job.location || "Location n/a"}</span>
            <span className="inline-flex items-center gap-1"><Wallet className="size-3.5" />{fmtLpa(job.ctc_min_lpa, job.ctc_max_lpa)}</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{job.posted_at ? `Posted ${ago(job.posted_at)}` : `Found ${ago(job.discovered_at)}`}</span>
          </div>
        </div>
        <ScoreBadge score={job.match?.overall_score} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {job.work_mode !== "unknown" && <Badge variant="secondary">{titleCase(job.work_mode)}</Badge>}
        <Badge variant="outline">{job.source_name?.split(" (")[0] ?? "Manual"}</Badge>
        {job.status !== "active" && <StatusBadge status={job.status} />}
        {job.application_status && <StatusBadge status={job.application_status} />}
        {job.match && <Badge variant="outline">{job.match.classification}</Badge>}
      </div>
      {job.match?.explanation && <p className="line-clamp-2 text-xs text-muted-foreground">{job.match.explanation}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" variant={job.shortlisted_at ? "secondary" : "outline"} loading={shortlist.isPending} onClick={() => shortlist.mutate(undefined)}>
          {job.shortlisted_at ? <StarOff /> : <Star />}{job.shortlisted_at ? "Shortlisted" : "Shortlist"}
        </Button>
        <Button size="sm" variant="outline" loading={resume.isPending} onClick={() => resume.mutate(undefined)}><FileText />Generate resume</Button>
        {link && <Button size="sm" variant="ghost" asChild><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink />Apply link</a></Button>}
        <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" aria-label="Dismiss job" loading={dismiss.isPending} onClick={() => dismiss.mutate(undefined)}><X /></Button>
      </div>
    </Card>
  );
}
