"use client";
import { useQuery } from "@tanstack/react-query";
import { Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { ChipsInput, PageHeader, Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { fmtDate } from "@/lib/utils";
import { automationApi } from "@/services";
import type { AutomationRun, AutomationSettings } from "@/types/api";

export default function AutomationPage() {
  const s = useQuery({ queryKey: ["auto-settings"], queryFn: automationApi.settings });
  const tasks = useQuery({ queryKey: ["auto-tasks"], queryFn: automationApi.tasks, refetchInterval: 10_000 });
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => automationApi.runs({ page_size: 40 }), refetchInterval: 5_000 });
  const [f, setF] = useState<AutomationSettings | null>(null);
  const [log, setLog] = useState<AutomationRun | null>(null);
  useEffect(() => { if (s.data) setF(s.data); }, [s.data]);
  const inv = [["auto-settings"], ["auto-tasks"], ["runs"]];
  const save = useAction((b: Partial<AutomationSettings>) => automationApi.updateSettings(b), { success: "Saved", invalidate: inv });
  const run = useAction((t: string) => automationApi.run(t), { success: "Started", invalidate: inv });
  const retry = useAction((id: number) => automationApi.retry(id), { success: "Retry started", invalidate: inv });
  if (!f) return <Skeleton className="h-96" />;
  return (
    <>
      <PageHeader title="Agent Automation" description="Daily pipeline in Asia/Kolkata time. Every step is idempotent and logged; failures notify you and can be retried."
        actions={<label className="flex items-center gap-2 text-sm font-medium"><Switch checked={f.automation_enabled}
          onCheckedChange={(v) => { setF({ ...f, automation_enabled: v }); save.mutate({ automation_enabled: v }); }} />Automation {f.automation_enabled ? "on" : "off"}</label>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Schedule</CardTitle><CardDescription>HH:MM (24h IST). Weekly report uses &quot;SUN HH:MM&quot;.</CardDescription></CardHeader>
          <CardContent>
            <Table><thead><tr><Th>Step</Th><Th>Time</Th><Th>Enabled</Th><Th>Last run</Th><Th /></tr></thead><tbody>
              {tasks.data?.map((t) => (
                <tr key={t.name}>
                  <Td className="font-medium">{t.label}</Td>
                  <Td><Input className="h-8 w-28" defaultValue={f.schedule[t.name]} aria-label={`${t.label} time`}
                    onBlur={(e) => e.target.value !== f.schedule[t.name] && save.mutate({ schedule: { [t.name]: e.target.value } })} /></Td>
                  <Td><Switch checked={!f.disabled_tasks.includes(t.name)} aria-label={`Enable ${t.label}`} onCheckedChange={(v) => {
                    const d = v ? f.disabled_tasks.filter((x) => x !== t.name) : [...f.disabled_tasks, t.name];
                    setF({ ...f, disabled_tasks: d }); save.mutate({ disabled_tasks: d }); }} /></Td>
                  <Td className="text-xs">{t.last_run ? <><StatusBadge status={t.last_run.status} /><span className="ml-1 text-muted-foreground">{fmtDate(t.last_run.at, true)}</span></> : "—"}</Td>
                  <Td><Button size="sm" variant="outline" loading={run.isPending && run.variables === t.name} onClick={() => run.mutate(t.name)}><Play />Run now</Button></Td>
                </tr>))}
            </tbody></Table>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Search preferences</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ keywords: f.keywords, locations: f.locations, work_modes: f.work_modes,
              min_ctc_lpa: f.min_ctc_lpa, min_match_score: f.min_match_score, posted_within_hours: f.posted_within_hours,
              max_ai_matches_per_run: f.max_ai_matches_per_run, max_research_per_run: f.max_research_per_run }); }}>
              <Field label="Job keywords"><ChipsInput value={f.keywords} onChange={(v) => setF({ ...f, keywords: v })} placeholder="Add keyword" /></Field>
              <Field label="Locations"><ChipsInput value={f.locations} onChange={(v) => setF({ ...f, locations: v })} placeholder="Add location" /></Field>
              <Field label="Work modes"><div className="flex gap-3 text-sm">{["remote", "hybrid", "office"].map((m) => (
                <label key={m} className="flex items-center gap-1.5"><input type="checkbox" checked={f.work_modes.includes(m)}
                  onChange={(e) => setF({ ...f, work_modes: e.target.checked ? [...f.work_modes, m] : f.work_modes.filter((x) => x !== m) })} />{m}</label>))}</div></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Min CTC (LPA)"><Input type="number" value={f.min_ctc_lpa ?? ""} onChange={(e) => setF({ ...f, min_ctc_lpa: e.target.value ? Number(e.target.value) : null })} /></Field>
                <Field label="Min match score"><Input type="number" min={0} max={100} value={f.min_match_score} onChange={(e) => setF({ ...f, min_match_score: Number(e.target.value) })} /></Field>
                <Field label="Posted within (hours)"><Input type="number" min={12} value={f.posted_within_hours} onChange={(e) => setF({ ...f, posted_within_hours: Number(e.target.value) })} /></Field>
                <Field label="AI matches per run"><Input type="number" min={1} value={f.max_ai_matches_per_run} onChange={(e) => setF({ ...f, max_ai_matches_per_run: Number(e.target.value) })} /></Field>
                <Field label="Companies researched per run"><Input type="number" min={0} value={f.max_research_per_run} onChange={(e) => setF({ ...f, max_research_per_run: Number(e.target.value) })} /></Field>
              </div>
              <Button type="submit" loading={save.isPending}>Save preferences</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Execution log</CardTitle></CardHeader>
        <CardContent>
          {runs.data?.items.length ? <Table><thead><tr><Th>Step</Th><Th>Trigger</Th><Th>Status</Th><Th>Queued</Th><Th>Duration</Th><Th>Result</Th><Th /></tr></thead><tbody>
            {runs.data.items.map((r) => (
              <tr key={r.id}>
                <Td>{r.task_name}{r.attempt > 1 && <span className="text-xs text-muted-foreground"> (attempt {r.attempt})</span>}</Td>
                <Td className="text-xs">{r.trigger}</Td><Td><StatusBadge status={r.status} /></Td>
                <Td className="text-xs">{fmtDate(r.queued_at, true)}</Td>
                <Td className="text-xs">{r.started_at && r.finished_at ? `${Math.round((+new Date(r.finished_at) - +new Date(r.started_at)) / 1000)}s` : "—"}</Td>
                <Td className="max-w-xs truncate text-xs text-muted-foreground">{r.error ? r.error.split("\n")[0] : Object.entries(r.stats).filter(([k]) => k !== "sources").map(([k, v]) => `${k}: ${typeof v === "object" ? "…" : v}`).join(" · ")}</Td>
                <Td className="whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => setLog(r)}>Logs</Button>
                  {r.status === "failed" && <Button size="sm" variant="outline" onClick={() => retry.mutate(r.id)}><RotateCcw />Retry</Button>}</Td>
              </tr>))}</tbody></Table> : <p className="text-xs text-muted-foreground">No runs yet. Use &quot;Run now&quot; or enable automation.</p>}
        </CardContent>
      </Card>
      {log && <Dialog open onOpenChange={(o) => !o && setLog(null)}><DialogContent title={`${log.task_name} — ${log.status}`} className="max-w-2xl">
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{[...log.log, log.error && `\nERROR:\n${log.error}`, `\nSTATS:\n${JSON.stringify(log.stats, null, 2)}`].filter(Boolean).join("\n")}</pre>
      </DialogContent></Dialog>}
    </>
  );
}
