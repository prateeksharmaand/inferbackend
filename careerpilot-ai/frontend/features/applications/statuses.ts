import type { AppStatus } from "@/types/api";

export const STATUSES: { key: AppStatus; label: string }[] = [
  { key: "discovered", label: "Discovered" }, { key: "shortlisted", label: "Shortlisted" },
  { key: "resume_prepared", label: "Resume Prepared" }, { key: "awaiting_approval", label: "Awaiting Approval" },
  { key: "applied", label: "Applied" }, { key: "recruiter_contacted", label: "Recruiter Contacted" },
  { key: "screening", label: "Screening" }, { key: "technical_interview", label: "Technical Interview" },
  { key: "management_interview", label: "Management Interview" }, { key: "hr_discussion", label: "HR Discussion" },
  { key: "offer_received", label: "Offer Received" }, { key: "rejected", label: "Rejected" }, { key: "on_hold", label: "On Hold" },
];
export const LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label])) as Record<AppStatus, string>;
