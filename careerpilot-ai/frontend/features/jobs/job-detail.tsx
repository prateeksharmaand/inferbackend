"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, FileText, Mail, RefreshCw, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ErrorState, Progress, Skeleton } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { errorMessage } from "@/services/client";
import { fmtDate, fmtLpa, titleCase } from "@/lib/utils";
import { jobsApi, matchApi } from "@/services";

const CATS = [
  ["technical_score", "Technical skills", 25], ["leadership_score", "Seniority & leadership", 20],
  ["architecture_score", "Architecture & Flutter", 20], ["compensation_score", "Compensation", 15],
  ["location_score", "Location & work mode", 10], ["company_score", "Company quality", 10],
] as const;

export function JobDetailDialog({ jobId, onClose }: { jobId: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => jobsApi.get(jobId!), enabled: !!jobId });
  const matches = useQuery({ queryKey: ["match", jobId], queryFn: () => matchApi.history(jobId!), enabled: !!jobId });
  const inv = [["jobs"], ["shortlist"], ["job", jobId], ["match", jobId], ["applications"], ["overview"]];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["job", jobId] }); qc.invalidateQueries({ queryKey: ["match", jobId] }); };
  const score = useAction(() => matchApi.score(jobId!), { success: (m) => `Scored ${m.overall_score}/100 (${m.model})`, invalidate: inv });
  const verify = useAction(() => jobsApi.verify(jobId!), { success: (j) => `Listing status: ${j.status}`, invalidate: inv });
  const shortlist = useAction(() => jobsApi.shortlist(jobId!), { success: "Shortlisted", invalidate: inv });
  const resume = useAction(() => jobsApi.tailoredResume(jobId!), { success: "Tailored resume ready in Applications", invalidate: inv });
  const letter = useAction(() => jobsApi.coverLetter(jobId!), { success: "Cover letter generated", invalidate: [["documents"]] });
  const m = matches.data?.find((x) => x.is_current);
  const j = job.data;
  return (
    <Dialog open={!!jobId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side title={j?.title ?? "Job"} description={j ? `${j.company_name} · ${j.location || "Location n/a"}` : undefined}>
        {job.isLoading && <div className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-40" /></div>}
        {job.isError && <ErrorState message={errorMessage(job.error)} onRetry={refresh} />}
        {j && (
          <div className="space-y-6 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={j.status} />
              {j.work_mode !== "unknown" && <Badge variant="secondary">{titleCase(j.work_mode)}</Badge>}
              <Badge variant="outline">{fmtLpa(j.ctc_min_lpa, j.ctc_max_lpa)}</Badge>
              {(j.experience_min_years || j.experience_max_years) && <Badge variant="outline">{j.experience_min_years ?? "?"}–{j.experience_max_years ?? "?"} yrs</Badge>}
              <Badge variant="outline">{j.source_name ?? "Manual"}</Badge>
              <Badge variant="outline">Posted {fmtDate(j.posted_at)}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {!j.application_id && <Button size="sm" loading={shortlist.isPending} onClick={() => shortlist.mutate(undefined)}><Sparkles />Shortlist</Button>}
              {j.application_id && <Button size="sm" variant="secondary" asChild><Link href={`/applications/${j.application_id}`}>Open application</Link></Button>}
              <Button size="sm" variant="outline" loading={score.isPending} onClick={() => score.mutate(undefined)}><RefreshCw />{m ? "Re-score" : "Score with AI"}</Button>
              <Button size="sm" variant="outline" loading={resume.isPending} onClick={() => resume.mutate(undefined)}><FileText />Tailored resume</Button>
              <Button size="sm" variant="outline" loading={letter.isPending} onClick={() => letter.mutate(undefined)}><Mail />Cover letter</Button>
              <Button size="sm" variant="ghost" loading={verify.isPending} onClick={() => verify.mutate(undefined)}><ShieldCheck />Verify link</Button>
              {(j.apply_url || j.url) && <Button size="sm" variant="ghost" asChild><a href={j.apply_url || j.url!} target="_blank" rel="noopener noreferrer"><ExternalLink />Open posting</a></Button>}
            </div>

            <section className="rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <ScoreBadge large score={m?.overall_score} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m ? m.classification : "Not scored yet"}</p>
                  <p className="text-xs text-muted-foreground">{m ? `${m.model} · ${m.prompt_version} · ${fmtDate(m.created_at, true)}` : "Run AI matching to evaluate this job against your profile."}</p>
                </div>
              </div>
              {m && (
                <div className="mt-4 space-y-4">
                  <p className="text-muted-foreground">{m.explanation}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CATS.map(([k, label, max]) => (
                      <div key={k}>
                        <div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="font-medium">{m[k]}/{max}</span></div>
                        <Progress value={(m[k] / max) * 100} />
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <List title="Reasons to apply" items={m.reasons_to_apply} icon={<CheckCircle2 className="size-3.5 text-success" />} />
                    <List title="Reasons not to apply" items={m.reasons_not_to_apply} icon={<XCircle className="size-3.5 text-destructive" />} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {m.matching_skills.map((s) => <Badge key={s} variant="success">{s}</Badge>)}
                    {m.missing_skills.map((s) => <Badge key={s} variant="outline">Missing: {s}</Badge>)}
                  </div>
                  {m.experience_gaps.length > 0 && <List title="Experience gaps" items={m.experience_gaps} />}
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div><dt className="font-medium">Leadership</dt><dd className="text-muted-foreground">{m.leadership_relevance}</dd></div>
                    <div><dt className="font-medium">Architecture</dt><dd className="text-muted-foreground">{m.architecture_relevance}</dd></div>
                    <div><dt className="font-medium">Compensation</dt><dd className="text-muted-foreground">{m.compensation_compatibility}</dd></div>
                    <div><dt className="font-medium">Suggested resume</dt><dd className="text-muted-foreground">{titleCase(m.suggested_resume)}</dd></div>
                  </dl>
                  <p className="rounded-md bg-accent p-3 text-xs text-accent-foreground"><b>Next step:</b> {m.recommended_action}</p>
                  {m.adjustments.length > 0 && (
                    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Guardrail adjustments ({m.adjustments.length})</summary>
                      <ul className="mt-1 list-disc pl-5">{m.adjustments.map((a) => <li key={a}>{a}</li>)}</ul></details>
                  )}
                </div>
              )}
            </section>
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h4>
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{j.description || "No description captured. Edit the job to paste it."}</div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function List({ title, items, icon }: { title: string; items: string[]; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold">{title}</p>
      {items.length ? <ul className="space-y-1 text-xs text-muted-foreground">{items.map((x) => <li key={x} className="flex gap-1.5">{icon}<span>{x}</span></li>)}</ul>
        : <p className="text-xs text-muted-foreground">—</p>}
    </div>
  );
}
