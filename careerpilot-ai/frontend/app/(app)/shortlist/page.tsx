"use client";
import { Sparkles } from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { JobList } from "@/features/jobs/job-list";
import { useAction } from "@/hooks/use-action";
import { matchApi } from "@/services";

export default function ShortlistPage() {
  const run = useAction(() => matchApi.run({ limit: 25 }), {
    success: (r) => `Scored ${r.scored} job(s)`, invalidate: [["shortlist"], ["jobs"], ["overview"]] });
  return (
    <>
      <PageHeader title="AI Shortlist"
        description="Jobs ranked by the matching engine: technical 25 · leadership 20 · architecture/Flutter 20 · compensation 15 · location 10 · company 10."
        actions={<Button loading={run.isPending} onClick={() => run.mutate(undefined)}><Sparkles />Score unscored jobs</Button>} />
      <Suspense><JobList mode="shortlist" /></Suspense>
    </>
  );
}
