"use client";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Play } from "lucide-react";
import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatusBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, PageHeader, Progress, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { fmtDate, titleCase } from "@/lib/utils";
import { coachApi } from "@/services";
import type { MockAnswer, MockSession } from "@/types/api";

export default function InterviewCoach() {
  const [active, setActive] = useState<number | null>(null);
  return (
    <>
      <PageHeader title="Interview Coach" description="Mock interviews for Flutter Lead and Mobile Architect roles with scored feedback and a progress history." />
      {active ? <SessionView id={active} onExit={() => setActive(null)} /> : (
        <Tabs defaultValue="practice">
          <TabsList><TabsTrigger value="practice">Practice</TabsTrigger><TabsTrigger value="bank">Question bank</TabsTrigger><TabsTrigger value="progress">Progress</TabsTrigger></TabsList>
          <TabsContent value="practice"><Start onStart={setActive} /></TabsContent>
          <TabsContent value="bank"><Bank /></TabsContent>
          <TabsContent value="progress"><ProgressView onOpen={setActive} /></TabsContent>
        </Tabs>
      )}
    </>
  );
}

function Start({ onStart }: { onStart: (id: number) => void }) {
  const topics = useQuery({ queryKey: ["topics"], queryFn: coachApi.topics });
  const [sel, setSel] = useState<string[]>(["flutter", "architecture", "leadership"]);
  const [count, setCount] = useState(6);
  const [role, setRole] = useState("Flutter Technical Lead");
  const start = useAction(() => coachApi.start({ topics: sel, count, target_role: role }), {});
  return (
    <Card className="max-w-2xl"><CardContent className="space-y-4 pt-5">
      <Field label="Target role"><Select value={role} onChange={(e) => setRole(e.target.value)}>
        {["Flutter Technical Lead", "Mobile Technical Lead", "Mobile Architect", "Engineering Manager – Mobile"].map((r) => <option key={r}>{r}</option>)}</Select></Field>
      <Field label="Topics"><div className="flex flex-wrap gap-2">{topics.data?.map((t) => (
        <button key={t} type="button" onClick={() => setSel(sel.includes(t) ? sel.filter((x) => x !== t) : [...sel, t])}
          className={`rounded-full border px-3 py-1 text-xs ${sel.includes(t) ? "border-primary bg-primary/10 text-primary" : ""}`}>{titleCase(t)}</button>))}</div></Field>
      <Field label="Number of questions"><Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-24" /></Field>
      <Button loading={start.isPending} onClick={() => start.mutate(undefined, { onSuccess: (s) => onStart(s.id) })}><Play />Start mock interview</Button>
    </CardContent></Card>
  );
}

function SessionView({ id, onExit }: { id: number; onExit: () => void }) {
  const q = useQuery({ queryKey: ["session", id], queryFn: () => coachApi.session(id) });
  const complete = useAction(() => coachApi.complete(id), { success: "Session completed", invalidate: [["session", id], ["sessions"], ["coach-progress"]] });
  if (!q.data) return <Skeleton className="h-96" />;
  const s = q.data;
  const answered = s.answers.filter((a) => a.score != null).length;
  return (
    <div className="space-y-4">
      <Card className="p-4"><div className="flex flex-wrap items-center gap-3">
        <div className="flex-1"><p className="font-semibold">{s.title}</p><p className="text-xs text-muted-foreground">{answered}/{s.answers.length} answered</p></div>
        <StatusBadge status={s.status === "completed" ? "completed" : "running"} />
        {s.status !== "completed" && <Button size="sm" loading={complete.isPending} disabled={!answered} onClick={() => complete.mutate(undefined)}>Finish & summarise</Button>}
        <Button size="sm" variant="ghost" onClick={onExit}>Back</Button></div>
        <Progress className="mt-3" value={(answered / Math.max(1, s.answers.length)) * 100} />
        {s.summary && <p className="mt-3 text-sm">{s.summary}</p>}</Card>
      {s.answers.map((a) => <AnswerCard key={a.id} s={s} a={a} />)}
    </div>
  );
}

function AnswerCard({ s, a }: { s: MockSession; a: MockAnswer }) {
  const [text, setText] = useState(a.answer);
  const submit = useAction(() => coachApi.answer(s.id, a.id, text), { invalidate: [["session", s.id]] });
  return (
    <Card>
      <CardHeader><div className="flex items-start gap-2"><Badge variant="secondary">{titleCase(a.topic)}</Badge><CardTitle className="flex-1 leading-snug">{a.question}</CardTitle>
        {a.score != null && <Badge variant={a.score >= 7 ? "success" : a.score >= 5 ? "warning" : "destructive"}>{a.score}/10</Badge>}</div></CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={5} placeholder="Answer as you would in the interview…" value={text} disabled={s.status === "completed"} onChange={(e) => setText(e.target.value)} aria-label="Your answer" />
        {s.status !== "completed" && <Button size="sm" disabled={!text.trim()} loading={submit.isPending} onClick={() => submit.mutate(undefined)}>{a.score != null ? "Re-evaluate" : "Submit answer"}</Button>}
        {a.score != null && (
          <div className="space-y-2 rounded-md bg-muted/50 p-3 text-xs">
            <p>{a.feedback}</p>
            {a.strengths.length > 0 && <p><b>Strengths:</b> {a.strengths.join("; ")}</p>}
            {a.gaps.length > 0 && <p><b>Gaps:</b> {a.gaps.join("; ")}</p>}
            <details><summary className="cursor-pointer font-medium">Suggested answer</summary><p className="mt-1 whitespace-pre-wrap">{a.suggested_answer}</p></details>
            <p className="text-muted-foreground">Evaluated by {a.evaluated_by}</p>
          </div>)}
      </CardContent>
    </Card>
  );
}

function Bank() {
  const [topic, setTopic] = useState("");
  const q = useQuery({ queryKey: ["questions", topic], queryFn: () => coachApi.questions({ topic }) });
  return (
    <div className="space-y-3">
      <Select className="w-48" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
        <option value="">All topics</option>{["flutter", "architecture", "security", "firebase", "android", "ios", "devops", "leadership"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
      {q.isLoading ? <Skeleton className="h-64" /> : q.data?.map((x) => (
        <Card key={x.id} className="p-4"><div className="flex flex-wrap gap-1.5"><Badge variant="secondary">{titleCase(x.topic)}</Badge><Badge variant="outline">{x.subtopic}</Badge><Badge variant="outline">{x.kind}</Badge></div>
          <p className="mt-2 text-sm font-medium">{x.question}</p>
          <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Key points</summary><ul className="mt-1 list-disc pl-5">{x.key_points.map((k) => <li key={k}>{k}</li>)}</ul></details></Card>))}
    </div>
  );
}

function ProgressView({ onOpen }: { onOpen: (id: number) => void }) {
  const p = useQuery({ queryKey: ["coach-progress"], queryFn: coachApi.progress });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: coachApi.sessions });
  if (!p.data?.sessions_completed && !sessions.data?.length) return <EmptyState icon={GraduationCap} title="No mock interviews yet" description="Complete a session to see your weaknesses and trend." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Average score by topic</CardTitle></CardHeader><CardContent className="space-y-2">{p.data?.by_topic.map((t) => (
        <div key={t.topic}><div className="mb-1 flex justify-between text-xs"><span>{titleCase(t.topic)} ({t.answers})</span><span>{t.avg_score}/10</span></div>
          <Progress value={t.avg_score * 10} indicatorClass={t.avg_score >= 7 ? "bg-success" : t.avg_score >= 5 ? "bg-warning" : "bg-destructive"} /></div>))}</CardContent></Card>
      <Card><CardHeader><CardTitle>Trend</CardTitle></CardHeader><CardContent className="h-56">
        <ResponsiveContainer><LineChart data={p.data?.trend.map((t) => ({ date: fmtDate(t.date).slice(0, 6), score: t.score }))}>
          <XAxis dataKey="date" fontSize={11} /><YAxis domain={[0, 10]} fontSize={11} width={24} /><Tooltip /><Line dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} /></LineChart></ResponsiveContainer></CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader><CardTitle>Interview history</CardTitle></CardHeader><CardContent><ul className="divide-y text-sm">{sessions.data?.map((s) => (
        <li key={s.id} className="flex items-center gap-3 py-2"><button className="flex-1 text-left hover:text-primary" onClick={() => onOpen(s.id)}>{s.title}</button>
          <span className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</span>{s.overall_score != null && <Badge>{s.overall_score}/10</Badge>}
          {s.weaknesses.length > 0 && <span className="hidden text-xs text-muted-foreground md:inline">Weak: {s.weaknesses.join(", ")}</span>}</li>))}</ul></CardContent></Card>
    </div>
  );
}
