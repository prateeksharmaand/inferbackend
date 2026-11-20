"use client";
import { Link2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { errorMessage } from "@/services/client";
import { jobsApi } from "@/services";

const EMPTY = { title: "", company_name: "", url: "", location: "", work_mode: "unknown", ctc_min_lpa: "", ctc_max_lpa: "", description: "" };

export function AddJobDialog() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = useAction(() => jobsApi.create({
    ...f, url: f.url || null, ctc_min_lpa: f.ctc_min_lpa ? Number(f.ctc_min_lpa) : null, ctc_max_lpa: f.ctc_max_lpa ? Number(f.ctc_max_lpa) : null,
  }), { success: "Job added", invalidate: [["jobs"], ["overview"]] });

  async function doImport() {
    setImporting(true);
    try {
      const r = await jobsApi.importUrl(importUrl);
      const p = r.preview as Record<string, string | number | null>;
      setF({ title: String(p.title ?? ""), company_name: String(p.company_name ?? ""), url: String(p.url ?? importUrl),
        location: String(p.location ?? ""), work_mode: String(p.work_mode ?? "unknown"),
        ctc_min_lpa: p.ctc_min_lpa != null ? String(p.ctc_min_lpa) : "", ctc_max_lpa: p.ctc_max_lpa != null ? String(p.ctc_max_lpa) : "",
        description: String(p.description ?? "") });
      if (r.duplicate_of) toast.warning(`This posting is already in your list (job #${r.duplicate_of}).`);
      else toast.success("Imported — review and save");
    } catch (e) {
      toast.error(errorMessage(e));
      setF((x) => ({ ...x, url: importUrl }));
    } finally { setImporting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setF(EMPTY); setImportUrl(""); } }}>
      <Button onClick={() => setOpen(true)}><Plus />Add job</Button>
      <DialogContent title="Add a job" description="Paste a public posting URL to import it, or fill in the details manually.">
        <div className="flex gap-2">
          <Input placeholder="https://… job posting URL" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} aria-label="Posting URL" />
          <Button variant="outline" loading={importing} disabled={!importUrl.startsWith("http")} onClick={doImport}><Link2 />Import</Button>
        </div>
        <p className="-mt-2 text-[11px] text-muted-foreground">Sites that need sign-in (e.g. LinkedIn) can&apos;t be read automatically. Paste the description below instead.</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined, { onSuccess: () => { setOpen(false); setF(EMPTY); } }); }}>
          <Field label="Job title" className="sm:col-span-2"><Input required value={f.title} onChange={set("title")} /></Field>
          <Field label="Company"><Input required value={f.company_name} onChange={set("company_name")} /></Field>
          <Field label="Location"><Input value={f.location} onChange={set("location")} /></Field>
          <Field label="Work mode"><Select value={f.work_mode} onChange={set("work_mode")}>
            {["unknown", "remote", "hybrid", "office"].map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
          <Field label="Posting URL"><Input type="url" value={f.url} onChange={set("url")} /></Field>
          <Field label="Min CTC (LPA)"><Input type="number" min={0} step="0.5" value={f.ctc_min_lpa} onChange={set("ctc_min_lpa")} /></Field>
          <Field label="Max CTC (LPA)"><Input type="number" min={0} step="0.5" value={f.ctc_max_lpa} onChange={set("ctc_max_lpa")} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea rows={8} value={f.description} onChange={set("description")} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="submit" loading={save.isPending}>Save job</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
