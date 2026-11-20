"use client";
import { useQuery } from "@tanstack/react-query";
import { Download, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { cn, fmtDate } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { docApi } from "@/services";
import type { Doc } from "@/types/api";

export default function CoverLettersPage() {
  const q = useQuery({ queryKey: ["documents"], queryFn: docApi.list });
  const [sel, setSel] = useState<Doc | null>(null);
  useEffect(() => { if (!sel && q.data?.length) setSel(q.data[0]); }, [q.data, sel]);
  return (
    <>
      <PageHeader title="Cover Letters" description="Generated per job from your confirmed profile. Generate from a job's detail panel or an application." />
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.isLoading ? <Skeleton className="h-96" /> : !q.data?.length ? <EmptyState title="No cover letters yet" description="Open a job and click 'Cover letter', or prepare an application package." /> : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Card className="max-h-[70vh] overflow-y-auto p-2">{q.data.map((d) => (
            <button key={d.id} onClick={() => setSel(d)} className={cn("block w-full rounded-md p-2 text-left text-sm hover:bg-muted", sel?.id === d.id && "bg-muted")}>
              <p className="truncate font-medium">{d.title}</p><p className="text-xs text-muted-foreground">{fmtDate(d.created_at)} · {d.model}</p></button>))}</Card>
          {sel && <Editor key={sel.id} d={sel} />}
        </div>
      )}
    </>
  );
}

function Editor({ d }: { d: Doc }) {
  const [title, setTitle] = useState(d.title);
  const [body, setBody] = useState(d.body);
  const save = useAction(() => docApi.update(d.id, { title, body }), { success: "Saved and re-rendered", invalidate: [["documents"]] });
  return (
    <Card className="space-y-3 p-4">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
      <Textarea rows={20} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Letter body" className="font-[inherit] leading-relaxed" />
      <div className="flex flex-wrap gap-2">
        <Button loading={save.isPending} onClick={() => save.mutate(undefined)}><Save />Save</Button>
        {d.has_pdf && <Button variant="outline" asChild><a href={docApi.downloadUrl(d.id, "pdf")}><Download />PDF</a></Button>}
        {d.has_docx && <Button variant="outline" asChild><a href={docApi.downloadUrl(d.id, "docx")}><Download />DOCX</a></Button>}
      </div>
    </Card>
  );
}
