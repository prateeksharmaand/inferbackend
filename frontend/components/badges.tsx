import { Badge } from "@/components/ui/badge";
import { cn, titleCase } from "@/lib/utils";

export function scoreTone(score: number) {
  return score >= 85 ? "success" : score >= 70 ? "default" : score >= 55 ? "warning" : "secondary";
}

export function ScoreBadge({ score, className, large }: { score?: number | null; className?: string; large?: boolean }) {
  if (score == null) return <Badge variant="outline" className={className}>Not scored</Badge>;
  const tone = scoreTone(score);
  const colors: Record<string, string> = {
    success: "bg-success/12 text-success ring-success/30", default: "bg-primary/10 text-primary ring-primary/30",
    warning: "bg-warning/15 text-warning ring-warning/30", secondary: "bg-muted text-muted-foreground ring-border",
  };
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full font-semibold ring-1", colors[tone],
      large ? "size-14 text-lg" : "h-6 min-w-9 px-2 text-xs", className)} aria-label={`Match score ${score} of 100`}>
      {score}
    </span>
  );
}

const STATUS_TONE: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  discovered: "outline", shortlisted: "secondary", resume_prepared: "secondary", awaiting_approval: "warning",
  applied: "default", recruiter_contacted: "default", screening: "default", technical_interview: "default",
  management_interview: "default", hr_discussion: "default", offer_received: "success", rejected: "destructive",
  on_hold: "outline", active: "success", expired: "destructive", unverified: "outline", archived: "outline",
  draft: "warning", approved: "default", sent: "success", failed: "destructive", replied: "success",
  connected: "success", configured: "default", awaiting_credentials: "warning", unavailable: "outline",
  failing: "destructive", disabled: "outline", success: "success", running: "default", queued: "outline",
  verified: "success", invalid: "destructive", scheduled: "default", completed: "success", cancelled: "outline",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_TONE[status] ?? "outline"}>{titleCase(status)}</Badge>;
}
