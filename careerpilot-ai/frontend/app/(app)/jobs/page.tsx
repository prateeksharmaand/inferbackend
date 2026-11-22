"use client";
import { Play } from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { AddJobDialog } from "@/features/jobs/add-job";
import { JobList } from "@/features/jobs/job-list";
import { useAction } from "@/hooks/use-action";
import { automationApi } from "@/services";

export default function JobsPage() {
  const run = useAction(() => automationApi.run("discover_jobs"), {
    success: "Job search started — results appear here as sources respond", invalidate: [["runs"]] });
  return (
    <>
      <PageHeader title="Discover Jobs" description="Every job found by your sources or added by you. Duplicates across boards are merged automatically."
        actions={<><Button variant="outline" loading={run.isPending} onClick={() => run.mutate(undefined)}><Play />Search now</Button><AddJobDialog /></>} />
      <Suspense><JobList mode="discover" /></Suspense>
    </>
  );
}
