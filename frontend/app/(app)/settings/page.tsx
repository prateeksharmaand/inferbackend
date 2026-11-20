"use client";
import { useQuery } from "@tanstack/react-query";
import { Download, FlaskConical, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { ago, titleCase } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { authApi, automationApi, notificationApi, settingsApi, sourcesApi } from "@/services";
import type { Source } from "@/types/api";

function SettingsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") ?? "integrations";
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onValueChange={(t) => router.replace(`?tab=${t}`)}>
        <TabsList><TabsTrigger value="integrations">Integrations</TabsTrigger><TabsTrigger value="sources">Job sources</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger><TabsTrigger value="account">Account & privacy</TabsTrigger></TabsList>
        <TabsContent value="integrations"><Integrations /></TabsContent>
        <TabsContent value="sources"><Sources /></TabsContent>
        <TabsContent value="notifications"><Notifications /></TabsContent>
        <TabsContent value="account"><Account /></TabsContent>
      </Tabs>
    </>
  );
}
export default function SettingsPage() { return <Suspense><SettingsInner /></Suspense>; }

function Integrations() {
  const [check, setCheck] = useState(false);
  const q = useQuery({ queryKey: ["integrations", check], queryFn: () => settingsApi.integrations(check) });
  return (
    <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Service status</CardTitle>
      <CardDescription>Credentials are set as environment variables on the server (see .env.example) and are never sent to the browser.</CardDescription></div>
      <Button size="sm" variant="outline" loading={q.isFetching && check} onClick={() => setCheck(true)}><FlaskConical />Test Claude connection</Button></CardHeader>
      <CardContent>{q.isLoading ? <Skeleton className="h-64" /> : <ul className="divide-y">{q.data?.map((i) => (
        <li key={i.key} className="flex items-center gap-3 py-2.5 text-sm"><div className="flex-1"><p className="font-medium">{i.name}</p>
          <p className="text-xs text-muted-foreground">{i.detail}{i.model ? ` · model ${i.model}` : ""}</p></div><StatusBadge status={i.state} /></li>))}</ul>}</CardContent></Card>
  );
}

function Sources() {
  const q = useQuery({ queryKey: ["sources"], queryFn: sourcesApi.list });
  return (
    <div className="space-y-3">{q.data?.map((s) => <SourceCard key={s.key} s={s} />)}
      <p className="text-xs text-muted-foreground">LinkedIn, Naukri, Indeed, Foundit, Instahyre, Wellfound, Cutshort and Hirist offer no authorised search API for individuals.
        CareerPilot doesn&apos;t scrape them. Their public postings arrive through JSearch (Google for Jobs), and you can import any posting by URL.</p></div>
  );
}

function SourceCard({ s }: { s: Source }) {
  const boards = (s.config.boards as { token: string; company: string }[] | undefined) ?? null;
  const [token, setToken] = useState("");
  const [company, setCompany] = useState("");
  const inv = [["sources"], ["integrations"]];
  const update = useAction((b: { enabled?: boolean; config?: Record<string, unknown> }) => sourcesApi.update(s.key, b), { invalidate: inv });
  const test = useAction(() => sourcesApi.test(s.key), { success: (r) => (r.ok ? "Connected: " : "Failed: ") + r.detail, invalidate: inv });
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1"><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.status_detail || s.last_error || titleCase(s.kind)}{s.last_run_at ? ` · last run ${ago(s.last_run_at)}` : ""}</p></div>
        <StatusBadge status={s.status} />
        {s.kind !== "restricted" && s.kind !== "manual" && <>
          <Button size="sm" variant="outline" loading={test.isPending} onClick={() => test.mutate(undefined)}>Test</Button>
          <Switch checked={s.enabled} aria-label={`Enable ${s.name}`} onCheckedChange={(v) => update.mutate({ enabled: v })} /></>}
      </div>
      {boards && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">{boards.map((b) => (
            <span key={b.token} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs">{b.company} <code className="text-muted-foreground">{b.token}</code>
              <button aria-label={`Remove ${b.company}`} onClick={() => update.mutate({ config: { boards: boards.filter((x) => x.token !== b.token) } })}><Trash2 className="size-3" /></button></span>))}</div>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!token) return;
            update.mutate({ config: { boards: [...boards, { token: token.trim(), company: company.trim() || token }] } }, { onSuccess: () => { setToken(""); setCompany(""); } }); }}>
            <Input className="h-8 w-40" placeholder="Board token" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Board token" />
            <Input className="h-8 w-40" placeholder="Company name" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company name" />
            <Button size="sm" variant="outline" type="submit"><Plus />Add company</Button></form>
          <p className="text-[11px] text-muted-foreground">Token = the company slug in its careers URL (e.g. boards.greenhouse.io/<b>groww</b>, jobs.lever.co/<b>cred</b>).</p>
        </div>)}
    </Card>
  );
}

const EVENTS = ["daily_digest", "excellent_match", "recruiter_response", "interview", "follow_up", "status_change", "automation_failure", "weekly_report"];

function Notifications() {
  const s = useQuery({ queryKey: ["auto-settings"], queryFn: automationApi.settings });
  const list = useQuery({ queryKey: ["notifications"], queryFn: () => notificationApi.list({ page_size: 50 }) });
  const inv = [["auto-settings"], ["notifications"], ["unread"]];
  const save = useAction((b: Record<string, unknown>) => automationApi.updateSettings(b), { success: "Saved", invalidate: inv });
  const test = useAction(() => notificationApi.test(), { success: (r) => `Delivery: ${Object.entries(r.delivery).map(([k, v]) => `${k} ${v}`).join(", ")}`, invalidate: inv });
  const readAll = useAction(() => notificationApi.readAll(), { invalidate: inv });
  useEffect(() => { if (list.data?.items.some((n) => !n.read_at)) readAll.mutate(undefined); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [list.data]);
  if (!s.data) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Preferences</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
        <div className="flex gap-6">{["email", "telegram"].map((c) => (
          <label key={c} className="flex items-center gap-2"><Switch checked={s.data.notify_channels.includes(c)} onCheckedChange={(v) =>
            save.mutate({ notify_channels: v ? [...s.data.notify_channels, c] : s.data.notify_channels.filter((x) => x !== c) })} />{titleCase(c)}</label>))}</div>
        <div className="grid grid-cols-2 gap-2">{EVENTS.map((e) => (
          <label key={e} className="flex items-center gap-2"><Switch checked={s.data.notify_events[e] !== false} onCheckedChange={(v) =>
            save.mutate({ notify_events: { ...s.data.notify_events, [e]: v } })} />{titleCase(e)}</label>))}</div>
        <Button size="sm" variant="outline" loading={test.isPending} onClick={() => test.mutate(undefined)}>Send test notification</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Recent notifications</CardTitle></CardHeader><CardContent className="max-h-[32rem] overflow-y-auto">
        <ul className="divide-y text-sm">{list.data?.items.map((n) => (
          <li key={n.id} className="py-2"><div className="flex items-center gap-2"><p className="flex-1 font-medium">{n.title}</p><span className="text-xs text-muted-foreground">{ago(n.created_at)}</span></div>
            <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{n.body}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{Object.entries(n.delivery).map(([k, v]) => `${k}: ${v}`).join(" · ") || "in-app only"}</p></li>))}</ul>
        {!list.data?.items.length && <p className="text-xs text-muted-foreground">No notifications yet.</p>}</CardContent></Card>
    </div>
  );
}

function Account() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [delPw, setDelPw] = useState("");
  const change = useAction(() => authApi.changePassword(cur, next), { success: "Password updated" });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Change password</CardTitle></CardHeader><CardContent>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); change.mutate(undefined, { onSuccess: () => { setCur(""); setNext(""); } }); }}>
          <Field label="Current password"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="New password (10+ characters)"><Input type="password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
          <Button type="submit" loading={change.isPending}>Update</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>Your data</CardTitle><CardDescription>Export everything (profile, jobs, applications, resumes and files) as a ZIP, or delete your account permanently.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" asChild><a href={settingsApi.exportUrl}><Download />Export all data</a></Button>
          <div className="space-y-2 rounded-md border border-destructive/30 p-3">
            <p className="text-sm font-medium text-destructive">Delete account</p>
            <p className="text-xs text-muted-foreground">Removes all your records and files. This cannot be undone.</p>
            <Input type="password" placeholder="Confirm with your password" value={delPw} onChange={(e) => setDelPw(e.target.value)} aria-label="Password to confirm deletion" />
            <Button variant="destructive" disabled={!delPw} onClick={async () => {
              if (!window.confirm("Permanently delete your account and all data?")) return;
              try { await settingsApi.deleteAccount(delPw); window.location.href = "/login"; } catch (e) { toast.error(errorMessage(e)); }
            }}><Trash2 />Delete my account</Button>
          </div>
        </CardContent></Card>
    </div>
  );
}
