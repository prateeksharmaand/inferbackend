"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState, ErrorState, Pagination, Skeleton } from "@/components/ui/misc";
import { useDebounce } from "@/hooks/use-debounce";
import { errorMessage } from "@/services/client";
import { jobsApi, matchApi, sourcesApi } from "@/services";
import { JobCard } from "./job-card";
import { JobDetailDialog } from "./job-detail";

export interface JobFilters {
  search: string; location: string; work_mode: string; min_ctc: string; min_score: string; source: string;
  posted_within_hours: string; sort: string; status: string; skill: string; min_exp: string; max_exp: string;
}
const DEFAULTS: JobFilters = { search: "", location: "", work_mode: "", min_ctc: "", min_score: "", source: "",
  posted_within_hours: "", sort: "posted", status: "", skill: "", min_exp: "", max_exp: "" };

export function JobList({ mode }: { mode: "discover" | "shortlist" }) {
  const params = useSearchParams();
  const router = useRouter();
  const [f, setF] = useState<JobFilters>({ ...DEFAULTS, ...(mode === "shortlist" ? { sort: "score", min_score: "55" } : {}) });
  const [page, setPage] = useState(1);
  const [showMore, setShowMore] = useState(false);
  const openId = params.get("open") ? Number(params.get("open")) : null;
  const search = useDebounce(f.search);
  const location = useDebounce(f.location);
  const skill = useDebounce(f.skill);
  const sources = useQuery({ queryKey: ["sources"], queryFn: sourcesApi.list, enabled: mode === "discover" });
  const query = { page, page_size: 18, search, location, skill, work_mode: f.work_mode, min_ctc: f.min_ctc, min_score: f.min_score,
    source: f.source, posted_within_hours: f.posted_within_hours, sort: f.sort, status: f.status, min_exp: f.min_exp, max_exp: f.max_exp };
  const jobs = useQuery({
    queryKey: [mode === "discover" ? "jobs" : "shortlist", query],
    queryFn: () => mode === "discover" ? jobsApi.list(query) : matchApi.shortlist({ min_score: f.min_score || 0, page, page_size: 18 }),
    placeholderData: keepPreviousData,
  });
  const set = (k: keyof JobFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const open = (id: number | null) => {
    const u = new URLSearchParams(params.toString());
    if (id) u.set("open", String(id)); else u.delete("open");
    router.replace(`?${u.toString()}`, { scroll: false });
  };

  return (
    <>
      {mode === "discover" ? (
        <Card className="mb-4 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <Input className="lg:col-span-2" placeholder="Search title, company, description" value={f.search} onChange={set("search")} aria-label="Search jobs" />
            <Input placeholder="Location (e.g. Pune, Bengaluru)" value={f.location} onChange={set("location")} aria-label="Location" />
            <Select value={f.work_mode} onChange={set("work_mode")} aria-label="Work mode">
              <option value="">Any work mode</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option>
            </Select>
            <Select value={f.posted_within_hours} onChange={set("posted_within_hours")} aria-label="Posted within">
              <option value="">Any time</option><option value="24">Last 24 hours</option><option value="72">Last 3 days</option><option value="168">Last 7 days</option>
            </Select>
            <Select value={f.sort} onChange={set("sort")} aria-label="Sort">
              <option value="posted">Newest posted</option><option value="discovered">Recently found</option><option value="score">Best match</option>
              <option value="ctc">Highest CTC</option><option value="company">Company A–Z</option>
            </Select>
          </div>
          {showMore && (
            <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div><Label>Min CTC (LPA)</Label><Input type="number" value={f.min_ctc} onChange={set("min_ctc")} /></div>
              <div><Label>Min AI score</Label><Input type="number" value={f.min_score} onChange={set("min_score")} /></div>
              <div><Label>Skill</Label><Input placeholder="e.g. Riverpod" value={f.skill} onChange={set("skill")} /></div>
              <div><Label>Experience from (yrs)</Label><Input type="number" value={f.min_exp} onChange={set("min_exp")} /></div>
              <div><Label>Source</Label><Select value={f.source} onChange={set("source")}>
                <option value="">All sources</option>{sources.data?.filter((s) => s.kind !== "restricted").map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select></div>
              <div><Label>Listing status</Label><Select value={f.status} onChange={set("status")}>
                <option value="">Active & unverified</option><option value="active">Active</option><option value="unverified">Unverified</option><option value="expired">Expired</option></Select></div>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{jobs.data ? `${jobs.data.total} jobs` : " "}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setF(DEFAULTS); setPage(1); }}>Reset</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowMore(!showMore)}><SlidersHorizontal />{showMore ? "Fewer filters" : "More filters"}</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="mb-4 flex items-center gap-3">
          <Label htmlFor="minscore">Minimum score</Label>
          <Select id="minscore" className="w-40" value={f.min_score} onChange={set("min_score")}>
            <option value="85">Excellent (85+)</option><option value="70">Strong (70+)</option><option value="55">Potential (55+)</option><option value="0">All scored</option>
          </Select>
          <span className="text-xs text-muted-foreground">{jobs.data?.total ?? 0} jobs</span>
        </div>
      )}
      {jobs.isError && <ErrorState message={errorMessage(jobs.error)} onRetry={() => jobs.refetch()} />}
      {jobs.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : jobs.data?.items.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{jobs.data.items.map((j) => <JobCard key={j.id} job={j} onOpen={open} />)}</div>
      ) : (
        <EmptyState title={mode === "discover" ? "No jobs match these filters" : "No AI-scored jobs at this level yet"}
          description={mode === "discover" ? "Run a search from Agent Automation, add a job manually, or relax the filters."
            : "Score jobs with AI (button above) or lower the minimum score."} />
      )}
      {jobs.data && <Pagination page={page} pageSize={18} total={jobs.data.total} onChange={setPage} />}
      <JobDetailDialog jobId={openId} onClose={() => open(null)} />
    </>
  );
}
