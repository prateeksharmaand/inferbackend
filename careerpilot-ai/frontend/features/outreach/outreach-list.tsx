"use client";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, Copy, MailCheck, Send, ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { ago, titleCase } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { outreachApi } from "@/services";
import type { Outreach } from "@/types/api";

export function OutreachList({ items: given }: { items?: Outreach[] }) {
  const q = useQuery({ queryKey: ["outreach"], queryFn: () => outreachApi.list({ status: "draft,approved,sent,failed,replied" }), enabled: !given });
  const items = given ?? q.data?.items;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!given && q.isLoading) return <Skeleton className="h-40" />;
  if (!items?.length) return <EmptyState title="No outreach drafts" description="Generate drafts from a contact or an application. Nothing is ever sent without your approval." />;
  return <div className="space-y-3">{items.map((o) => <OutreachCard key={o.id} o={o} />)}</div>;
}

function OutreachCard({ o }: { o: Outreach }) {
  const [subject, setSubject] = useState(o.subject);
  const [body, setBody] = useState(o.body);
  const [to, setTo] = useState(o.to_address);
  const dirty = subject !== o.subject || body !== o.body || to !== o.to_address;
  const inv = [["outreach"], ["application"]];
  const save = useAction(() => outreachApi.update(o.id, { subject, body, to_address: to }), { success: "Saved (needs re-approval)", invalidate: inv });
  const approve = useAction(() => outreachApi.approve(o.id), { success: "Approved", invalidate: inv });
  const send = useAction(() => outreachApi.send(o.id), { success: "Email sent", invalidate: inv });
  const marked = useAction(() => outreachApi.markSent(o.id), { success: "Marked as sent", invalidate: inv });
  const replied = useAction(() => outreachApi.replied(o.id), { success: "Reply logged", invalidate: inv });
  const del = useAction(() => outreachApi.archive(o.id), { success: "Archived", invalidate: inv });
  const linkedin = o.channel.startsWith("linkedin");
  const editable = ["draft", "approved", "failed"].includes(o.status);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge status={o.status} /><span className="font-medium">{titleCase(o.channel)}</span>
        {o.recruiter_name && <span className="text-muted-foreground">to {o.recruiter_name}</span>}
        <span className="ml-auto text-muted-foreground">{o.model ?? "manual"} · {ago(o.created_at)}</span>
      </div>
      {!linkedin && <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Recipient email" placeholder="recipient@company.com" value={to} disabled={!editable} onChange={(e) => setTo(e.target.value)} />
        <Input aria-label="Subject" placeholder="Subject" value={subject} disabled={!editable} onChange={(e) => setSubject(e.target.value)} />
      </div>}
      <Textarea aria-label="Message" rows={linkedin ? 3 : 7} value={body} disabled={!editable} onChange={(e) => setBody(e.target.value)} />
      {o.channel === "linkedin_connect" && <p className={`text-[11px] ${body.length > 300 ? "text-destructive" : "text-muted-foreground"}`}>{body.length}/300 characters</p>}
      {o.error && <p className="text-xs text-destructive">{o.error}</p>}
      <div className="flex flex-wrap gap-2">
        {dirty && <Button size="sm" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save changes</Button>}
        {o.status === "draft" && !dirty && <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(undefined)}><ThumbsUp />Approve</Button>}
        {o.status === "approved" && !linkedin && <Button size="sm" variant="success" loading={send.isPending} onClick={() => send.mutate(undefined)}><Send />Send email</Button>}
        {(linkedin || o.status === "approved") && ["draft", "approved"].includes(o.status) && (
          <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(body); toast.success("Copied — paste it on LinkedIn"); }}><Copy />Copy</Button>)}
        {["draft", "approved"].includes(o.status) && <Button size="sm" variant="outline" loading={marked.isPending} onClick={() => marked.mutate(undefined)}><CheckCheck />I sent it myself</Button>}
        {o.status === "sent" && <Button size="sm" variant="outline" loading={replied.isPending} onClick={() => replied.mutate(undefined)}><MailCheck />Log reply</Button>}
        <Button size="sm" variant="ghost" className="ml-auto" aria-label="Archive" loading={del.isPending} onClick={() => del.mutate(undefined)}><Trash2 /></Button>
      </div>
    </Card>
  );
}
