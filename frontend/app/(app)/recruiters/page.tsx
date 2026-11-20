"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, Link2 as Linkedin, MailPlus, MessageSquareReply, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutreachList } from "@/features/outreach/outreach-list";
import { useAction } from "@/hooks/use-action";
import { useDebounce } from "@/hooks/use-debounce";
import { ago, titleCase } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { outreachApi, recruiterApi } from "@/services";
import type { Recruiter } from "@/types/api";

const ROLES = ["recruiter", "talent_acquisition", "hr_manager", "hiring_manager", "engineering_manager", "engineering_director", "cto", "founder", "other"];

export default function RecruitersPage() {
  const [search, setSearch] = useState("");
  const s = useDebounce(search);
  const q = useQuery({ queryKey: ["recruiters", s], queryFn: () => recruiterApi.list({ search: s }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Recruiters & outreach" description="Contacts come from you or from public sources found by research (always with a source link). Contact details are never guessed."
        actions={<AddRecruiter />} />
      <Tabs defaultValue="contacts">
        <TabsList><TabsTrigger value="contacts">Contacts</TabsTrigger><TabsTrigger value="outreach">Outreach drafts</TabsTrigger></TabsList>
        <TabsContent value="contacts">
          <Input className="mb-3 max-w-sm" placeholder="Search name, company, designation" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search contacts" />
          {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
          {q.isLoading ? <Skeleton className="h-48" /> : q.data?.items.length ? (
            <Table><thead><tr><Th>Name</Th><Th>Company</Th><Th>Contact</Th><Th>Source</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>{q.data.items.map((r) => <Row key={r.id} r={r} />)}</tbody></Table>
          ) : <EmptyState title="No contacts yet" description="Add contacts manually or use 'Find recruiters' on a company." />}
        </TabsContent>
        <TabsContent value="outreach"><OutreachList /></TabsContent>
      </Tabs>
    </>
  );
}

function Row({ r }: { r: Recruiter }) {
  const inv = [["recruiters"], ["outreach"]];
  const draft = useAction((channel: string) => outreachApi.create({ channel, recruiter_id: r.id }), { success: "Draft created in Outreach drafts", invalidate: inv });
  const verify = useAction((v: string) => recruiterApi.update(r.id, { verification_status: v as Recruiter["verification_status"] }), { invalidate: inv });
  const resp = useAction(() => recruiterApi.responded(r.id), { success: "Response logged", invalidate: inv });
  const del = useAction(() => recruiterApi.archive(r.id), { success: "Removed", invalidate: inv });
  return (
    <tr>
      <Td><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.designation || titleCase(r.role_type)}</p></Td>
      <Td>{r.company_name}</Td>
      <Td className="text-xs">
        {r.linkedin_url && <a className="flex items-center gap-1 text-primary hover:underline" href={r.linkedin_url} target="_blank" rel="noopener noreferrer"><Linkedin className="size-3" />LinkedIn</a>}
        {r.email && <p>{r.email}</p>}{r.phone && <p>{r.phone}</p>}
        {r.last_contacted_at && <p className="text-muted-foreground">Contacted {ago(r.last_contacted_at)}</p>}
      </Td>
      <Td className="max-w-[16rem] text-xs text-muted-foreground">
        {r.source_url ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={r.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3" />{r.discovered_by === "agent" ? "Found by research" : "Source"}</a> : "Added by you"}
        {r.source_description && <p className="line-clamp-2">{r.source_description}</p>}
      </Td>
      <Td><Select aria-label="Verification" className="h-8 w-32 text-xs" value={r.verification_status} onChange={(e) => verify.mutate(e.target.value)}>
        <option value="unverified">Unverified</option><option value="verified">Verified</option><option value="invalid">Invalid</option></Select>
        {r.responded_at && <div className="mt-1"><StatusBadge status="replied" /></div>}</Td>
      <Td>
        <Menu><MenuTrigger asChild><Button size="sm" variant="outline"><MailPlus />Draft</Button></MenuTrigger>
          <MenuContent>
            {["linkedin_connect", "linkedin_dm", "intro", "application_email", "followup_email"].map((c) => (
              <MenuItem key={c} onSelect={() => draft.mutate(c)}>{titleCase(c)}</MenuItem>))}
            <MenuItem onSelect={() => resp.mutate(undefined)}><MessageSquareReply />Log response</MenuItem>
            <MenuItem className="text-destructive" onSelect={() => del.mutate(undefined)}><Trash2 />Remove</MenuItem>
          </MenuContent></Menu>
      </Td>
    </tr>
  );
}

function AddRecruiter() {
  const [open, setOpen] = useState(false);
  const empty = { name: "", designation: "", role_type: "recruiter", company_name: "", linkedin_url: "", email: "", phone: "", source_url: "", notes: "" };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = useAction(() => recruiterApi.create(f as Partial<Recruiter>), { success: "Contact added", invalidate: [["recruiters"]] });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus />Add contact</Button>
      <DialogContent title="Add contact">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined, { onSuccess: () => { setOpen(false); setF(empty); } }); }}>
          <Field label="Name"><Input required value={f.name} onChange={set("name")} /></Field>
          <Field label="Designation"><Input value={f.designation} onChange={set("designation")} /></Field>
          <Field label="Role"><Select value={f.role_type} onChange={set("role_type")}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></Field>
          <Field label="Company"><Input value={f.company_name} onChange={set("company_name")} /></Field>
          <Field label="LinkedIn URL"><Input type="url" value={f.linkedin_url} onChange={set("linkedin_url")} /></Field>
          <Field label="Email (only if they shared it publicly or with you)"><Input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Where did you find them?"><Input type="url" placeholder="Source URL" value={f.source_url} onChange={set("source_url")} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={set("notes")} /></Field>
          <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={save.isPending}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
