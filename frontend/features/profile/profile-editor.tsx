"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ChipsInput, ErrorState, Skeleton } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { errorMessage } from "@/services/client";
import { profileApi } from "@/services";
import type { Employment, Profile } from "@/types/api";

const num = (v: string) => (v === "" ? null : Number(v));

export function ProfileEditor() {
  const q = useQuery({ queryKey: ["profile"], queryFn: profileApi.get });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  return <Editor p={q.data} />;
}

function Editor({ p }: { p: Profile }) {
  const [f, setF] = useState(p);
  useEffect(() => { setF(p); }, [p]);
  const inv = [["profile"]];
  const save = useAction(() => profileApi.update({
    full_name: f.full_name, headline: f.headline, email: f.email, phone: f.phone, linkedin_url: f.linkedin_url, location: f.location,
    total_experience_years: f.total_experience_years, flutter_experience_years: f.flutter_experience_years,
    android_experience_years: f.android_experience_years, leadership_experience_years: f.leadership_experience_years,
    professional_summary: f.professional_summary, preferred_designations: f.preferred_designations, current_ctc_lpa: f.current_ctc_lpa,
    target_ctc_min_lpa: f.target_ctc_min_lpa, target_ctc_max_lpa: f.target_ctc_max_lpa, notice_period_days: f.notice_period_days,
    preferred_locations: f.preferred_locations, preferred_work_modes: f.preferred_work_modes, education: f.education,
    certifications: f.certifications, achievements: f.achievements,
  }), { success: "Profile saved", invalidate: inv });
  const text = (k: keyof Profile) => ({ value: (f[k] as string) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }) });
  const number = (k: keyof Profile) => ({ type: "number", step: "0.5", value: (f[k] as number | null) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: num(e.target.value) }) });
  return (
    <div className="space-y-6">
      {p.needs_confirmation.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle className="size-4 text-warning" />Please confirm or complete</CardTitle>
            <CardDescription>Nothing is invented. Fill gaps yourself; unconfirmed skills are excluded from matching and generated documents.</CardDescription></CardHeader>
          <CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{p.needs_confirmation.map((n, i) => <li key={i}>{n.message}</li>)}</ul></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Candidate profile</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
            <Field label="Full name"><Input {...text("full_name")} /></Field>
            <Field label="Headline"><Input {...text("headline")} /></Field>
            <Field label="Current location"><Input {...text("location")} /></Field>
            <Field label="Email"><Input type="email" {...text("email")} /></Field>
            <Field label="Phone"><Input {...text("phone")} /></Field>
            <Field label="LinkedIn"><Input {...text("linkedin_url")} /></Field>
            <Field label="Total experience (yrs)"><Input {...number("total_experience_years")} /></Field>
            <Field label="Flutter experience (yrs)"><Input {...number("flutter_experience_years")} /></Field>
            <Field label="Android experience (yrs)"><Input {...number("android_experience_years")} /></Field>
            <Field label="Leadership experience (yrs)"><Input {...number("leadership_experience_years")} /></Field>
            <Field label="Current CTC (LPA)"><Input {...number("current_ctc_lpa")} /></Field>
            <Field label="Notice period (days)"><Input type="number" value={f.notice_period_days ?? ""} onChange={(e) => setF({ ...f, notice_period_days: num(e.target.value) })} /></Field>
            <Field label="Target CTC from (LPA)"><Input {...number("target_ctc_min_lpa")} /></Field>
            <Field label="Target CTC to (LPA)"><Input {...number("target_ctc_max_lpa")} /></Field>
            <Field label="Preferred work modes"><div className="flex h-9 items-center gap-3 text-sm">{["remote", "hybrid", "office"].map((m) => (
              <label key={m} className="flex items-center gap-1.5"><input type="checkbox" checked={f.preferred_work_modes.includes(m)}
                onChange={(e) => setF({ ...f, preferred_work_modes: e.target.checked ? [...f.preferred_work_modes, m] : f.preferred_work_modes.filter((x) => x !== m) })} />{m}</label>))}</div></Field>
            <Field label="Professional summary" className="md:col-span-3"><Textarea rows={4} {...text("professional_summary")} /></Field>
            <Field label="Preferred designations" className="md:col-span-3"><ChipsInput value={f.preferred_designations} onChange={(v) => setF({ ...f, preferred_designations: v })} placeholder="Add a designation and press Enter" /></Field>
            <Field label="Preferred locations" className="md:col-span-3"><ChipsInput value={f.preferred_locations} onChange={(v) => setF({ ...f, preferred_locations: v })} placeholder="Add a city and press Enter" /></Field>
            <Field label="Achievements" className="md:col-span-3"><ChipsInput value={f.achievements} onChange={(v) => setF({ ...f, achievements: v })} placeholder="Add an achievement" /></Field>
            <Field label="Certifications"><ChipsInput value={f.certifications} onChange={(v) => setF({ ...f, certifications: v })} placeholder="Add" /></Field>
            <Field label="Education" className="md:col-span-2"><ChipsInput value={f.education} onChange={(v) => setF({ ...f, education: v })} placeholder="Add" /></Field>
            <div className="md:col-span-3"><Button type="submit" loading={save.isPending}>Save profile</Button></div>
          </form>
        </CardContent>
      </Card>
      <Skills p={p} />
      <EmploymentSection p={p} />
    </div>
  );
}

function Skills({ p }: { p: Profile }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("technical");
  const inv = [["profile"]];
  const add = useAction(() => profileApi.addSkill({ name, category: cat, confirmed: true }), { success: "Skill added", invalidate: inv });
  const confirm = useAction((s: Profile["skills"][number]) => profileApi.updateSkill(s.id, { name: s.name, category: s.category, confirmed: true }), { invalidate: inv });
  const del = useAction((id: number) => profileApi.deleteSkill(id), { invalidate: inv });
  const cats = Array.from(new Set(p.skills.map((s) => s.category)));
  return (
    <Card>
      <CardHeader><CardTitle>Skills</CardTitle><CardDescription>Green = from your resume or confirmed by you. Amber = unconfirmed (not used anywhere until confirmed).</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {cats.map((c) => (
          <div key={c}><p className="mb-1.5 text-xs font-semibold capitalize text-muted-foreground">{c}</p>
            <div className="flex flex-wrap gap-1.5">{p.skills.filter((s) => s.category === c).map((s) => (
              <span key={s.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${s.confirmed ? "border-success/30 bg-success/10" : "border-warning/40 bg-warning/10"}`}>
                {s.name}
                {!s.confirmed && <button aria-label={`Confirm ${s.name}`} onClick={() => confirm.mutate(s)} className="text-success"><Check className="size-3" /></button>}
                <button aria-label={`Remove ${s.name}`} onClick={() => del.mutate(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button>
              </span>))}</div></div>))}
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name) add.mutate(undefined, { onSuccess: () => setName("") }); }}>
          <Input className="max-w-xs" placeholder="Add a skill you really have" value={name} onChange={(e) => setName(e.target.value)} aria-label="New skill" />
          <Select className="w-36" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">{["technical", "platform", "tool", "leadership", "domain"].map((c) => <option key={c}>{c}</option>)}</Select>
          <Button type="submit" variant="outline" loading={add.isPending}><Plus />Add</Button>
        </form>
      </CardContent>
    </Card>
  );
}

const EMPTY_JOB: Omit<Employment, "id" | "sort_order"> = { company: "", title: "", location: "", start_date: "", end_date: "", is_current: false, description: "", highlights: [] };

function EmploymentSection({ p }: { p: Profile }) {
  const [edit, setEdit] = useState<(Omit<Employment, "id" | "sort_order"> & { id?: number }) | null>(null);
  const inv = [["profile"]];
  const save = useAction(() => {
    const { id, ...body } = edit!;
    return id ? profileApi.updateEmployment(id, body) : profileApi.addEmployment(body);
  }, { success: "Saved", invalidate: inv });
  const del = useAction((id: number) => profileApi.deleteEmployment(id), { success: "Removed", invalidate: inv });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between"><CardTitle>Employment history</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEdit({ ...EMPTY_JOB })}><Plus />Add role</Button></CardHeader>
      <CardContent className="space-y-3">
        {p.employment.map((e) => (
          <div key={e.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-medium">{e.title} — {e.company}</p>
              <Badge variant="outline">{e.start_date || "?"} → {e.is_current ? "Present" : e.end_date || "?"}</Badge>
              <Button size="sm" variant="ghost" onClick={() => setEdit({ ...e })}>Edit</Button>
              <Button size="sm" variant="ghost" aria-label="Delete role" onClick={() => del.mutate(e.id)}><Trash2 /></Button></div>
            {e.highlights.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{e.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>}
          </div>))}
        {!p.employment.length && <p className="text-xs text-muted-foreground">Upload your resume or add roles manually.</p>}
      </CardContent>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent title={edit.id ? "Edit role" : "Add role"}>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined, { onSuccess: () => setEdit(null) }); }}>
              <Field label="Company"><Input required value={edit.company} onChange={(e) => setEdit({ ...edit, company: e.target.value })} /></Field>
              <Field label="Title"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
              <Field label="Start (YYYY-MM)"><Input pattern="\d{4}(-\d{2})?" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} /></Field>
              <Field label="End (YYYY-MM)"><Input pattern="\d{4}(-\d{2})?" disabled={edit.is_current} value={edit.end_date} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.is_current} onChange={(e) => setEdit({ ...edit, is_current: e.target.checked, end_date: "" })} />Current role</label>
              <Field label="Location"><Input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></Field>
              <Field label="Highlights (one per line)" className="sm:col-span-2"><Textarea rows={6} value={edit.highlights.join("\n")}
                onChange={(e) => setEdit({ ...edit, highlights: e.target.value.split("\n").filter((x) => x.trim()) })} /></Field>
              <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={save.isPending}>Save</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
