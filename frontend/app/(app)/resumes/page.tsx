"use client";
import { useQuery } from "@tanstack/react-query";
import { Download, FileUp, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileEditor } from "@/features/profile/profile-editor";
import { useAction } from "@/hooks/use-action";
import { fmtDate, titleCase } from "@/lib/utils";
import { errorMessage } from "@/services/client";
import { resumeApi } from "@/services";
import { useQueryClient } from "@tanstack/react-query";

const VARIANTS = [
  ["master", "Master Resume"], ["flutter_lead", "Flutter Technical Lead"], ["mobile_architect", "Mobile Architect"], ["engineering_leadership", "Engineering Leadership"],
] as const;

export default function ResumeStudio() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"fill_empty" | "replace">("fill_empty");
  const [uploading, setUploading] = useState(false);
  const [cat, setCat] = useState("");
  const list = useQuery({ queryKey: ["resumes", cat], queryFn: () => resumeApi.list({ category: cat }) });
  const variant = useAction((c: string) => resumeApi.variant(c), { success: "Variant generated", invalidate: [["resumes"]] });
  const primary = useAction((id: number) => resumeApi.update(id, { is_primary: true }), { invalidate: [["resumes"]] });
  const archive = useAction((id: number) => resumeApi.archive(id), { success: "Archived", invalidate: [["resumes"]] });

  async function upload(file: File) {
    setUploading(true);
    try {
      const r = await resumeApi.upload(file, mode);
      toast.success(`Parsed with ${r.parsed_by}. ${r.profile_update ? `Updated: ${r.profile_update.changed_fields.join(", ") || "nothing new"}; ${r.profile_update.skills_added} skills added.` : ""}`);
      qc.invalidateQueries({ queryKey: ["resumes"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) { toast.error(errorMessage(e)); } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <PageHeader title="Resume Studio" description="Your resume is the single source of truth. Variants and tailored resumes only re-order and re-word what is already there." />
      <Tabs defaultValue="resumes">
        <TabsList><TabsTrigger value="resumes">Resumes</TabsTrigger><TabsTrigger value="profile">Profile & skills</TabsTrigger></TabsList>
        <TabsContent value="resumes" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Upload resume</CardTitle><CardDescription>PDF or DOCX, up to 10 MB. Text is extracted and your profile is updated.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <Button loading={uploading} onClick={() => fileRef.current?.click()}><FileUp />Choose file</Button>
                <Select className="w-56" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Profile update mode">
                  <option value="fill_empty">Fill empty profile fields only</option><option value="replace">Replace profile with this resume</option></Select>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Generate a variant</CardTitle><CardDescription>ATS-friendly DOCX + PDF built from your confirmed profile.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap gap-2">{VARIANTS.map(([k, label]) => (
                <Button key={k} size="sm" variant="outline" loading={variant.isPending && variant.variables === k} onClick={() => variant.mutate(k)}><Plus />{label}</Button>))}</CardContent>
            </Card>
          </div>
          <div className="flex items-center gap-2"><Select className="w-56" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter category">
            <option value="">All categories</option>{VARIANTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="tailored">Tailored (per job)</option></Select></div>
          {list.isLoading ? <Skeleton className="h-40" /> : list.data?.length ? (
            <Table><thead><tr><Th>Name</Th><Th>Category</Th><Th>Version</Th><Th>Created</Th><Th>Made by</Th><Th>Files</Th><Th /></tr></thead>
              <tbody>{list.data.map((r) => (
                <tr key={r.id}>
                  <Td><Link className="font-medium hover:text-primary" href={`/resumes/${r.id}`}>{r.name}</Link>{r.is_primary && <Badge className="ml-2">Primary</Badge>}</Td>
                  <Td><Badge variant="secondary">{titleCase(r.category)}</Badge></Td><Td>v{r.version}</Td>
                  <Td className="text-xs">{fmtDate(r.created_at, true)}</Td><Td className="text-xs text-muted-foreground">{r.model}</Td>
                  <Td className="space-x-1 whitespace-nowrap">
                    {r.has_pdf && <Button size="sm" variant="ghost" asChild><a href={resumeApi.downloadUrl(r.id, "pdf")}><Download />PDF</a></Button>}
                    {r.has_docx && <Button size="sm" variant="ghost" asChild><a href={resumeApi.downloadUrl(r.id, "docx")}><Download />DOCX</a></Button>}
                    {r.has_original && <Button size="sm" variant="ghost" asChild><a href={resumeApi.downloadUrl(r.id, "original")}><Download />Original</a></Button>}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {!r.is_primary && r.category !== "tailored" && <Button size="sm" variant="ghost" aria-label="Make primary" onClick={() => primary.mutate(r.id)}><Star /></Button>}
                    <Button size="sm" variant="ghost" aria-label="Archive" onClick={() => archive.mutate(r.id)}><Trash2 /></Button>
                  </Td>
                </tr>))}</tbody></Table>
          ) : <EmptyState title="No resumes yet" description="Upload your current resume to get started." />}
        </TabsContent>
        <TabsContent value="profile"><ProfileEditor /></TabsContent>
      </Tabs>
    </>
  );
}
