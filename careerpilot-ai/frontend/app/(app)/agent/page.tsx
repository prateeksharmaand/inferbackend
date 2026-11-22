"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, SendHorizonal, Trash2, User, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { agentApi } from "@/services";
import type { AgentMessage } from "@/types/api";

const SUGGESTIONS = [
  "Find Flutter Technical Lead jobs posted today.", "Find Mobile Architect jobs with a salary above 25 LPA.",
  "Show remote Flutter jobs in India.", "Find companies hiring Mobile Technical Leads in Bengaluru.",
  "Show all applications awaiting follow-up.", "Prepare me for a Mobile Architect interview.", "Compare my interview performance.",
];

/** Inline: **bold** and (#123) job references linked. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\(#\d+\)|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return <>{parts.map((p, i) => {
    const job = p.match(/^\(#(\d+)\)$/);
    if (job) return <a key={i} href={`/jobs?open=${job[1]}`} className="text-primary underline">(#{job[1]})</a>;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={i} className="rounded bg-background/70 px-1 text-[0.9em]">{p.slice(1, -1)}</code>;
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  })}</>;
}

/** Minimal Markdown for agent replies: headings, bullets, numbered items, rules, bold. */
function Rich({ text }: { text: string }) {
  return <div className="space-y-1">{text.split("\n").map((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) return <div key={i} className="h-1.5" />;
    if (/^-{3,}$|^\*{3,}$/.test(line.trim())) return <hr key={i} className="my-2 border-border" />;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) return <p key={i} className="pt-1 font-semibold"><Inline text={h[1].replace(/\*\*/g, "")} /></p>;
    const b = line.match(/^(\s*)[*-]\s+(.*)$/);
    if (b) return <p key={i} className="flex gap-2" style={{ paddingLeft: b[1].length * 6 }}><span aria-hidden>•</span><span><Inline text={b[2]} /></span></p>;
    const n = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (n) return <p key={i} className="flex gap-2" style={{ paddingLeft: n[1].length * 6 }}><span>{n[2]}.</span><span><Inline text={n[3]} /></span></p>;
    return <p key={i}><Inline text={line} /></p>;
  })}</div>;
}

export default function AgentPage() {
  const qc = useQueryClient();
  const convs = useQuery({ queryKey: ["conversations"], queryFn: agentApi.conversations });
  const [cid, setCid] = useState<number | null>(null);
  const msgs = useQuery({ queryKey: ["agent-msgs", cid], queryFn: () => agentApi.messages(cid!), enabled: !!cid });
  const [local, setLocal] = useState<AgentMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { setLocal(msgs.data ?? []); }, [msgs.data]);
  useEffect(() => { void end.current?.scrollIntoView({ behavior: "smooth" }); }, [local, busy]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setText("");
    setLocal((l) => [...l, { id: -Date.now(), role: "user", content: message, tool_calls: [], created_at: new Date().toISOString() }]);
    try {
      const r = await agentApi.chat(message, cid);
      setLocal((l) => [...l, r.message]);
      if (!cid) setCid(r.conversation_id);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="grid h-[calc(100vh-7.5rem)] gap-4 lg:grid-cols-[16rem_1fr]">
      <Card className="hidden flex-col overflow-hidden lg:flex">
        <div className="border-b p-2"><Button className="w-full" variant="outline" size="sm" onClick={() => { setCid(null); setLocal([]); }}><Plus />New chat</Button></div>
        <div className="flex-1 overflow-y-auto p-2">{convs.data?.map((c) => (
          <div key={c.id} className={cn("group flex items-center rounded-md hover:bg-muted", cid === c.id && "bg-muted")}>
            <button className="flex-1 truncate px-2 py-1.5 text-left text-sm" onClick={() => setCid(c.id)}>{c.title}</button>
            <button aria-label="Delete conversation" className="hidden p-1.5 text-muted-foreground group-hover:block"
              onClick={async () => { await agentApi.archive(c.id); if (cid === c.id) { setCid(null); setLocal([]); } qc.invalidateQueries({ queryKey: ["conversations"] }); }}><Trash2 className="size-3.5" /></button>
          </div>))}</div>
      </Card>
      <Card className="flex min-h-0 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          {!local.length && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <Bot className="mx-auto size-10 text-primary" />
              <h2 className="mt-3 font-semibold">Career Agent</h2>
              <p className="mt-1 text-sm text-muted-foreground">Asks your real job, application and profile data. It can prepare drafts, but never sends or applies without you.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted">{s}</button>))}</div>
            </div>)}
          {local.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-secondary" : "bg-primary text-primary-foreground")}>
                {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}</div>
              <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {m.tool_calls.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{m.tool_calls.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"><Wrench className="size-3" />{t.name}: {t.summary}</span>))}</div>}
                <div className="leading-relaxed">{m.role === "assistant" ? <Rich text={m.content} /> : <span className="whitespace-pre-wrap">{m.content}</span>}</div>
              </div>
            </div>))}
          {busy && <div className="flex gap-3"><div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot className="size-4" /></div>
            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Working…</div></div>}
          <div ref={end} />
        </div>
        <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <Textarea rows={1} className="min-h-10 resize-none" placeholder="Ask about jobs, applications, interviews…" value={text} aria-label="Message"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
          <Button type="submit" size="icon" className="h-10 w-10" aria-label="Send" loading={busy}>{!busy && <SendHorizonal />}</Button>
        </form>
      </Card>
    </div>
  );
}
