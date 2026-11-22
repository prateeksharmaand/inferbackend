"use client";
import { useQuery } from "@tanstack/react-query";
import { Columns3, List } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LABEL, STATUSES } from "@/features/applications/statuses";
import { useAction } from "@/hooks/use-action";
import { useDebounce } from "@/hooks/use-debounce";
import { ago, fmtDate } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { appApi } from "@/services";
import type { AppStatus, Application } from "@/types/api";

export default function ApplicationsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("-updated");
  const s = useDebounce(search);
  const q = useQuery({ queryKey: ["applications", s, status, sort], queryFn: () => appApi.list({ search: s, status, sort, page_size: 500 }) });
  const move = useAction(({ id, to }: { id: number; to: AppStatus }) => appApi.status(id, to), { invalidate: [["applications"], ["overview"]] });
  const grouped = useMemo(() => {
    const g: Record<string, Application[]> = {};
    q.data?.items.forEach((a) => (g[a.status] ??= []).push(a));
    return g;
  }, [q.data]);
  const [drag, setDrag] = useState<number | null>(null);
  const [allStages, setAllStages] = useState(false);
  const columns = STATUSES.filter((c) => (status ? c.key === status : allStages || (grouped[c.key]?.length ?? 0) > 0));
  return (
    <>
      <PageHeader title="Applications" description="Track every opportunity from shortlist to offer. Status changes are recorded in each application's history." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search job or company" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search applications" />
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>{STATUSES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select>
      </div>
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      <Tabs defaultValue="board">
        <TabsList><TabsTrigger value="board"><Columns3 className="size-3.5" />Kanban</TabsTrigger><TabsTrigger value="table"><List className="size-3.5" />Table</TabsTrigger></TabsList>
        <TabsContent value="board">
          {!status && <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={allStages}
            onChange={(e) => setAllStages(e.target.checked)} />Show all 13 stages (drag a card onto any stage)</label>}
          {q.isLoading ? <Skeleton className="h-72" /> : !q.data?.items.length ? <EmptyState title="No applications yet" description="Shortlist a job to start tracking it here." /> : (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {columns.map((col) => (
                <div key={col.key} className="flex w-64 shrink-0 flex-col rounded-lg bg-muted/50 p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (drag) move.mutate({ id: drag, to: col.key }); setDrag(null); }}>
                  <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">{col.label}<span className="text-muted-foreground">{grouped[col.key]?.length ?? 0}</span></div>
                  <div className="flex min-h-16 flex-col gap-2">
                    {grouped[col.key]?.map((a) => (
                      <Card key={a.id} draggable onDragStart={() => setDrag(a.id)} className="cursor-grab p-3 active:cursor-grabbing">
                        <div className="flex items-start gap-2">
                          <Link href={`/applications/${a.id}`} className="flex-1 text-[13px] font-medium leading-snug hover:text-primary">{a.job_title}</Link>
                          <ScoreBadge score={a.match_score} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{a.company_name}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">Updated {ago(a.updated_at)}{a.follow_up_date ? ` · follow up ${fmtDate(a.follow_up_date)}` : ""}</p>
                        <Select aria-label="Move to" className="mt-2 h-7 text-xs" value={a.status} onChange={(e) => move.mutate({ id: a.id, to: e.target.value as AppStatus })}>
                          {STATUSES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select>
                      </Card>))}
                  </div>
                </div>))}
            </div>)}
        </TabsContent>
        <TabsContent value="table">
          <div className="mb-2 flex justify-end"><Select className="w-48" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="-updated">Recently updated</option><option value="-applied">Recently applied</option><option value="-score">Best match</option>
            <option value="company">Company</option><option value="follow_up">Follow-up date</option></Select></div>
          {q.data?.items.length ? (
            <Table><thead><tr><Th>Job</Th><Th>Status</Th><Th>Score</Th><Th>Applied</Th><Th>Expected / offered</Th><Th>Follow-up</Th><Th>Recruiter</Th></tr></thead>
              <tbody>{q.data.items.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <Td><Link href={`/applications/${a.id}`} className="font-medium hover:text-primary">{a.job_title}</Link><p className="text-xs text-muted-foreground">{a.company_name} · {a.location}</p></Td>
                  <Td><StatusBadge status={a.status} /><span className="sr-only">{LABEL[a.status]}</span></Td>
                  <Td><ScoreBadge score={a.match_score} /></Td>
                  <Td className="text-xs">{fmtDate(a.applied_at)}</Td>
                  <Td className="text-xs">{a.expected_ctc_lpa ?? "—"} / {a.offered_ctc_lpa ?? "—"} LPA</Td>
                  <Td className="text-xs">{fmtDate(a.follow_up_date)}</Td>
                  <Td className="text-xs">{a.recruiter_name ?? "—"}</Td>
                </tr>))}</tbody></Table>
          ) : !q.isLoading && <EmptyState title="No applications" />}
        </TabsContent>
      </Tabs>
    </>
  );
}
