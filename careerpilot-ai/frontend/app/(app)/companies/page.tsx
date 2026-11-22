"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, Search, Telescope, Users } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { useDebounce } from "@/hooks/use-debounce";
import { fmtDate } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { companyApi } from "@/services";
import type { Company } from "@/types/api";

export default function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Company | null>(null);
  const s = useDebounce(search);
  const q = useQuery({ queryKey: ["companies", s, page], queryFn: () => companyApi.list({ search: s, page }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Companies" description="Employers behind your discovered jobs. Research uses Claude with live web search; every fact links to its source." />
      <div className="relative mb-4 max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search companies" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search companies" /></div>
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.isLoading ? <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        : q.data?.items.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{q.data.items.map((c) => (
            <Card key={c.id} className="flex cursor-pointer flex-col gap-2 p-4 hover:shadow-md" onClick={() => setOpen(c)}>
              <div className="flex items-start justify-between gap-2"><p className="font-semibold">{c.name}</p>
                {c.quality_score != null && <Badge variant="secondary">Quality {c.quality_score}/10</Badge>}</div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{c.overview || c.industry || "Not researched yet."}</p>
              <div className="mt-auto flex items-center gap-2 text-xs"><Badge variant="outline">{c.open_jobs} open job{c.open_jobs === 1 ? "" : "s"}</Badge>
                <StatusBadge status={c.research_status === "done" ? "completed" : c.research_status} /></div>
            </Card>))}</div>
        ) : <EmptyState title="No companies yet" description="Companies appear automatically as jobs are discovered." />}
      {q.data && <Pagination page={page} pageSize={30} total={q.data.total} onChange={setPage} />}
      {open && <CompanyDialog id={open.id} onClose={() => setOpen(null)} />}
    </>
  );
}

function CompanyDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ["company", id], queryFn: () => companyApi.get(id) });
  const research = useAction(() => companyApi.research(id), { success: "Research complete", invalidate: [["company", id], ["companies"]] });
  const contacts = useAction(() => companyApi.discoverContacts(id), {
    success: (r) => `${r.added} contact(s) added${r.skipped.length ? `, ${r.skipped.length} skipped (unverifiable)` : ""}`,
    invalidate: [["recruiters"]] });
  const c = q.data;
  const rows: [string, string | undefined][] = c ? [["Industry", c.industry], ["Size", c.size], ["Headquarters", c.headquarters],
    ["Funding & growth", c.funding], ["Engineering culture", c.engineering_culture], ["Employee reviews", c.employee_reviews],
    ["Hiring activity", c.hiring_activity]] : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent side title={c?.name ?? "Company"} description={c?.researched_at ? `Researched ${fmtDate(c.researched_at, true)}` : "Not researched yet"}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={research.isPending} onClick={() => research.mutate(undefined)}><Telescope />{c?.research_status === "done" ? "Refresh research" : "Research company"}</Button>
          <Button size="sm" variant="outline" loading={contacts.isPending} onClick={() => contacts.mutate(undefined)}><Users />Find recruiters & hiring managers</Button>
          {c?.website && <Button size="sm" variant="ghost" asChild><a href={c.website} target="_blank" rel="noopener noreferrer"><ExternalLink />Website</a></Button>}
        </div>
        {c && (
          <div className="space-y-4 text-sm">
            {c.overview && <p>{c.overview}</p>}
            <dl className="grid gap-3">{rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="text-xs font-semibold">{k}</dt><dd className="text-muted-foreground">{v}</dd></div>))}</dl>
            {c.tech_stack.length > 0 && <div className="flex flex-wrap gap-1.5">{c.tech_stack.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>}
            {c.risks.length > 0 && <div><p className="text-xs font-semibold text-destructive">Potential risks</p><ul className="list-disc pl-5 text-muted-foreground">{c.risks.map((r) => <li key={r}>{r}</li>)}</ul></div>}
            {c.sources.length > 0 && <div><p className="text-xs font-semibold">Sources</p><ul className="space-y-1 text-xs">{c.sources.map((s) => (
              <li key={s.url}><a className="text-primary hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a></li>))}</ul></div>}
            {c.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{c.notes}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
