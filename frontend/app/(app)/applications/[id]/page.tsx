"use client";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, Download, ExternalLink, FileText, Mail, Send, ShieldAlert, Wand2 } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { LABEL, STATUSES } from "@/features/applications/statuses";
import { OutreachList } from "@/features/outreach/outreach-list";
import { useAction } from "@/hooks/use-action";
import { fmtDate, titleCase } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { appApi, docApi, interviewApi, outreachApi, recruiterApi, resumeApi } from "@/services";
import type { AppStatus } from "@/types/api";

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const q = useQuery({ queryKey: ["application", id], queryFn: () => appApi.get(id) });
  const recruiters = useQuery({ queryKey: ["recruiters", "all"], queryFn: () => recruiterApi.list({ page_size: 200 }) });
  const inv = [["application", id], ["applications"], ["overview"], ["outreach"]];
  const [variant, setVariant] = useState("");
  const [note, setNote] = useState("");
  const [form, setForm] = useState({ expected_ctc_lpa: "", offered_ctc_lpa: "", follow_up_date: "", notes: "", recruiter_id: "" });
  const a = q.data;
  useEffect(() => {
    if (a) setForm({ expected_ctc_lpa: a.expected_ctc_lpa?.toString() ?? "", offered_ctc_lpa: a.offered_ctc_lpa?.toString() ?? "",
      follow_up_date: a.follow_up_date ?? "", notes: a.notes, recruiter_id: a.recruiter_id?.toString() ?? "" });
  }, [a]);
  const prepare = useAction(() => appApi.prepare(id, { variant: variant || undefined, cover_letter: true }), { success: "Package prepared — review and approve", invalidate: inv });
  const approve = useAction(() => appApi.approve(id), { success: "Approved. Apply on the employer's site, then mark as Applied.", invalidate: inv });
  const status = useAction((s: AppStatus) => appApi.status(id, s, note), { success: "Status updated", invalidate: inv });
  const save = useAction(() => appApi.update(id, {
    expected_ctc_lpa: form.expected_ctc_lpa ? Number(form.expected_ctc_lpa) : null, offered_ctc_lpa: form.offered_ctc_lpa ? Number(form.offered_ctc_lpa) : null,
    follow_up_date: form.follow_up_date || null, notes: form.notes, recruiter_id: form.recruiter_id ? Number(form.recruiter_id) : null,
  }), { success: "Saved", invalidate: inv });
  const draft = useAction((channel: string) => outreachApi.create({ channel, application_id: id, recruiter_id: a?.recruiter_id ?? undefined }),
    { success: "Draft created below", invalidate: inv });

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !a) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const letter = a.documents.find((d) => d.id === a.cover_letter_id) ?? a.documents.find((d) => d.kind === "cover_letter");
  return (
    <>
      <PageHeader title={a.job_title} description={`${a.company_name} · ${a.location || titleCase(a.work_mode)}`}
        actions={<>
          <ScoreBadge score={a.match_score} /><StatusBadge status={a.status} />
          <Button variant="outline" size="sm" asChild><Link href={`/jobs?open=${a.job_id}`}>View job</Link></Button>
          {a.apply_url && <Button size="sm" variant="outline" asChild><a href={a.apply_url} target="_blank" rel="noopener noreferrer"><ExternalLink />Employer site</a></Button>}
        </>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Application package</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Resume variant"><Select value={variant} onChange={(e) => setVariant(e.target.value)}>
                  <option value="">AI-suggested</option><option value="master">Master</option><option value="flutter_lead">Flutter Technical Lead</option>
                  <option value="mobile_architect">Mobile Architect</option><option value="engineering_leadership">Engineering Leadership</option></Select></Field>
                <Button loading={prepare.isPending} onClick={() => prepare.mutate(undefined)}><Wand2 />{a.resume_id ? "Regenerate package" : "Prepare resume + cover letter"}</Button>
              </div>
              {a.resume_id && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                  <FileText className="size-4" /><span className="flex-1">{a.resume_name}</span>
                  <Button size="sm" variant="outline" asChild><Link href={`/resumes/${a.resume_id}`}>Review & edit</Link></Button>
                  <Button size="sm" variant="ghost" asChild><a href={resumeApi.downloadUrl(a.resume_id, "pdf")}><Download />PDF</a></Button>
                  <Button size="sm" variant="ghost" asChild><a href={resumeApi.downloadUrl(a.resume_id, "docx")}><Download />DOCX</a></Button>
                </div>)}
              {letter && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2"><Mail className="size-4" /><span className="flex-1 font-medium">{letter.title}</span>
                    <Button size="sm" variant="ghost" asChild><a href={docApi.downloadUrl(letter.id, "pdf")}><Download />PDF</a></Button>
                    <Button size="sm" variant="ghost" asChild><a href={docApi.downloadUrl(letter.id, "docx")}><Download />DOCX</a></Button></div>
                  <p className="line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">{letter.body}</p>
                  <Link className="text-xs text-primary hover:underline" href="/cover-letters">Edit in Cover Letters</Link>
                </div>)}
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent/50 p-3 text-xs">
                <ShieldAlert className="size-4 text-accent-foreground" />
                <span className="flex-1">CareerPilot never submits applications. Approve the package, apply on the employer&apos;s site, then mark it Applied.</span>
                {a.approved_at ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="size-4" />Approved {fmtDate(a.approved_at)}</span>
                  : <Button size="sm" disabled={!a.resume_id} loading={approve.isPending} onClick={() => approve.mutate(undefined)}>Approve package</Button>}
                {a.approved_at && !a.applied_at && <Button size="sm" variant="success" loading={status.isPending} onClick={() => status.mutate("applied")}><Send />I&apos;ve applied</Button>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Outreach</CardTitle>
              <div className="flex gap-2">{["application_email", "followup_email", "linkedin_dm"].map((c) => (
                <Button key={c} size="sm" variant="outline" loading={draft.isPending && draft.variables === c} onClick={() => draft.mutate(c)}>{titleCase(c)}</Button>))}</div>
            </CardHeader>
            <CardContent><OutreachList items={a.outreach.filter((o) => o.status !== "archived")} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Interviews</CardTitle><InterviewDialog applicationId={id} /></CardHeader>
            <CardContent>{a.interviews.length ? <ul className="divide-y text-sm">{a.interviews.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2"><div className="flex-1"><p className="font-medium">{i.round_name}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(i.scheduled_at, true)} · {i.mode} · {i.interviewers || "interviewer n/a"}</p></div>
                <StatusBadge status={i.status} />{i.outcome !== "pending" && <StatusBadge status={i.outcome === "passed" ? "success" : "failed"} />}</li>))}</ul>
              : <p className="text-xs text-muted-foreground">No interviews yet.</p>}</CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Status</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Select value={a.status} onChange={(e) => status.mutate(e.target.value as AppStatus)} aria-label="Status">
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
              <Input placeholder="Optional note for the history" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Status note" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Expected CTC (LPA)"><Input type="number" step="0.5" value={form.expected_ctc_lpa} onChange={(e) => setForm({ ...form, expected_ctc_lpa: e.target.value })} /></Field>
                  <Field label="Offered CTC (LPA)"><Input type="number" step="0.5" value={form.offered_ctc_lpa} onChange={(e) => setForm({ ...form, offered_ctc_lpa: e.target.value })} /></Field>
                </div>
                <Field label="Follow-up date"><Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} /></Field>
                <Field label="Recruiter"><Select value={form.recruiter_id} onChange={(e) => setForm({ ...form, recruiter_id: e.target.value })}>
                  <option value="">None</option>{recruiters.data?.items.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.company_name}</option>)}</Select></Field>
                <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                <Button type="submit" size="sm" loading={save.isPending}>Save</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent><ol className="space-y-3 border-l pl-4 text-xs">{[...a.history].reverse().map((h) => (
              <li key={h.id} className="relative"><span className="absolute -left-[21px] top-1 size-2 rounded-full bg-primary" />
                <p className="font-medium">{LABEL[h.to_status as AppStatus] ?? h.to_status}</p>
                <p className="text-muted-foreground">{fmtDate(h.changed_at, true)} · {h.changed_by}{h.note ? ` · ${h.note}` : ""}</p></li>))}</ol></CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function InterviewDialog({ applicationId }: { applicationId: number }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ round_name: "", kind: "technical", scheduled_at: "", duration_minutes: "60", mode: "video", meeting_link: "", interviewers: "" });
  const save = useAction(() => interviewApi.create({ ...f, application_id: applicationId, duration_minutes: Number(f.duration_minutes),
    scheduled_at: new Date(f.scheduled_at).toISOString() }), { success: "Interview scheduled", invalidate: [["application", applicationId], ["interviews"], ["overview"]] });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><CalendarPlus />Schedule</Button>
      <DialogContent title="Schedule interview">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined, { onSuccess: () => setOpen(false) }); }}>
          <Field label="Round name" className="sm:col-span-2"><Input required value={f.round_name} onChange={set("round_name")} placeholder="Technical round 1" /></Field>
          <Field label="Type"><Select value={f.kind} onChange={set("kind")}>{["screening", "technical", "managerial", "hr", "other"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
          <Field label="Mode"><Select value={f.mode} onChange={set("mode")}>{["video", "phone", "onsite"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
          <Field label="Date & time (your local time)"><Input required type="datetime-local" value={f.scheduled_at} onChange={set("scheduled_at")} /></Field>
          <Field label="Duration (min)"><Input type="number" value={f.duration_minutes} onChange={set("duration_minutes")} /></Field>
          <Field label="Meeting link"><Input value={f.meeting_link} onChange={set("meeting_link")} /></Field>
          <Field label="Interviewers"><Input value={f.interviewers} onChange={set("interviewers")} /></Field>
          <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={save.isPending}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
