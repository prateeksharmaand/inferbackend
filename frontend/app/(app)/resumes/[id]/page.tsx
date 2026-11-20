"use client";
import { useQuery } from "@tanstack/react-query";
import { Download, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ChipsInput, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { titleCase } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { resumeApi } from "@/services";
import type { ResumeContent } from "@/types/api";

export default function ResumeEditor({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const router = useRouter();
  const q = useQuery({ queryKey: ["resume", id], queryFn: () => resumeApi.get(id) });
  const [c, setC] = useState<ResumeContent | null>(null);
  useEffect(() => { if (q.data?.content?.experience) setC(q.data.content as ResumeContent); }, [q.data]);
  const save = useAction(() => resumeApi.update(id, { content: c }), { success: "Saved as a new version", invalidate: [["resumes"]] });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} />;
  const r = q.data;
  const report = r.content.tailoring_report;
  return (
    <>
      <PageHeader title={r.name} description={`${titleCase(r.category)} · v${r.version} · ${r.model ?? ""}`}
        actions={<>
          {r.has_pdf && <Button variant="outline" asChild><a href={resumeApi.downloadUrl(id, "pdf")}><Download />PDF</a></Button>}
          {r.has_docx && <Button variant="outline" asChild><a href={resumeApi.downloadUrl(id, "docx")}><Download />DOCX</a></Button>}
          {c && <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: (n) => router.replace(`/resumes/${n.id}`) })}><Save />Save new version</Button>}
        </>} />
      {report && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Tailoring report</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p>Method: <b>{report.method}</b>{report.note ? ` — ${report.note}` : ""}</p>
            {report.keywords_covered.length > 0 && <div className="flex flex-wrap gap-1">Covered: {report.keywords_covered.map((k) => <Badge key={k} variant="success">{k}</Badge>)}</div>}
            {report.keywords_missing.length > 0 && <div className="flex flex-wrap gap-1">Genuinely missing (not added): {report.keywords_missing.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}</div>}
            {report.reverted.length > 0 && <div><p className="font-medium">Fact-check reverted {report.reverted.length} AI edit(s):</p>
              <ul className="list-disc pl-5 text-muted-foreground">{report.reverted.map((x, i) => <li key={i}>{x.field}: {x.reason}</li>)}</ul></div>}
            {report.dropped_skills.length > 0 && <p className="text-muted-foreground">Dropped unconfirmed skills: {report.dropped_skills.join(", ")}</p>}
          </CardContent>
        </Card>
      )}
      {!c ? <ErrorState message="This resume has no structured content (it is an uploaded original). Generate a variant to edit." /> : (
        <div className="space-y-4">
          <Card><CardContent className="grid gap-3 pt-5 md:grid-cols-2">
            <Field label="Name"><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
            <Field label="Headline"><Input value={c.headline} onChange={(e) => setC({ ...c, headline: e.target.value })} /></Field>
            <Field label="Summary" className="md:col-span-2"><Textarea rows={4} value={c.summary} onChange={(e) => setC({ ...c, summary: e.target.value })} /></Field>
            <Field label="Skills (order matters)" className="md:col-span-2"><ChipsInput value={c.skills} onChange={(v) => setC({ ...c, skills: v })} /></Field>
          </CardContent></Card>
          {c.experience.map((e, i) => (
            <Card key={i}><CardHeader><CardTitle>{e.title} — {e.company} <span className="font-normal text-muted-foreground">({e.dates})</span></CardTitle></CardHeader>
              <CardContent><Textarea rows={Math.max(4, e.bullets.length + 1)} value={e.bullets.join("\n")} aria-label={`Bullets for ${e.company}`}
                onChange={(ev) => { const exp = [...c.experience]; exp[i] = { ...e, bullets: ev.target.value.split("\n").filter((x) => x.trim()) }; setC({ ...c, experience: exp }); }} />
                <p className="mt-1 text-[11px] text-muted-foreground">One bullet per line.</p></CardContent></Card>))}
        </div>
      )}
    </>
  );
}
