// Types mirror the FastAPI schemas (backend/app/schemas). Salaries are INR LPA; timestamps are UTC ISO strings.
export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface ApiErrorBody { error: { code: string; message: string; details?: unknown } }

export interface User { id: number; email: string; full_name: string }

export interface Skill { id: number; name: string; category: string; years: number | null; source: string; confirmed: boolean }
export interface Employment {
  id: number; company: string; title: string; location: string; start_date: string; end_date: string;
  is_current: boolean; description: string; highlights: string[]; sort_order: number;
}
export interface Project { id: number; name: string; employer: string; tech_stack: string[]; description: string; metrics: string; url: string }
export interface Profile {
  id: number; full_name: string; headline: string; email: string; phone: string; linkedin_url: string; location: string;
  total_experience_years: number | null; flutter_experience_years: number | null; android_experience_years: number | null;
  leadership_experience_years: number | null; professional_summary: string; preferred_designations: string[];
  current_ctc_lpa: number | null; target_ctc_min_lpa: number | null; target_ctc_max_lpa: number | null;
  notice_period_days: number | null; preferred_locations: string[]; preferred_work_modes: string[];
  education: string[]; certifications: string[]; achievements: string[];
  needs_confirmation: { field: string; message: string }[]; skills: Skill[]; employment: Employment[]; projects: Project[];
  updated_at: string;
}

export type ResumeCategory = "master" | "flutter_lead" | "mobile_architect" | "engineering_leadership" | "tailored";
export interface Resume {
  id: number; name: string; category: ResumeCategory; version: number; parent_id: number | null; job_id: number | null;
  original_filename: string | null; file_type: string | null; file_size: number | null; has_docx: boolean;
  has_pdf: boolean; has_original: boolean; model: string | null; is_primary: boolean; created_at: string; archived_at: string | null;
}
export interface ResumeContent {
  variant?: string; name: string; headline: string; contact: Record<string, string>; summary: string; skills: string[];
  experience: { company: string; title: string; location: string; dates: string; bullets: string[] }[];
  projects: { name: string; description: string; tech: string[]; metrics: string }[];
  achievements: string[]; certifications: string[]; education: string[];
  tailoring_report?: { method: string; reverted: { field: string; reason: string }[]; dropped_skills: string[]; keywords_missing: string[]; keywords_covered: string[]; note?: string };
}
export interface ResumeDetail extends Resume { content: ResumeContent & { extraction?: unknown }; extracted_text: string }

export type WorkMode = "remote" | "hybrid" | "office" | "unknown";
export interface MatchBrief { overall_score: number; classification: string; explanation: string; reasons_to_apply: string[]; model: string }
export interface Job {
  id: number; title: string; company_name: string; company_id: number | null; location: string; work_mode: WorkMode;
  ctc_min_lpa: number | null; ctc_max_lpa: number | null; currency: string; salary_text: string;
  experience_min_years: number | null; experience_max_years: number | null; url: string | null; apply_url: string | null;
  posted_at: string | null; discovered_at: string; last_verified_at: string | null; status: string; is_manual: boolean;
  source_key: string | null; source_name: string | null; shortlisted_at: string | null; dismissed_at: string | null;
  archived_at: string | null; skills: string[]; match: MatchBrief | null; application_id: number | null;
  application_status: string | null;
}
export interface JobDetail extends Job { description: string; employment_type: string; notes: string }
export interface Match {
  id: number; job_id: number; technical_score: number; leadership_score: number; architecture_score: number;
  compensation_score: number; location_score: number; company_score: number; overall_score: number;
  classification: string; matching_skills: string[]; missing_skills: string[]; experience_gaps: string[];
  leadership_relevance: string; architecture_relevance: string; compensation_compatibility: string;
  reasons_to_apply: string[]; reasons_not_to_apply: string[]; suggested_resume: string; recommended_action: string;
  explanation: string; adjustments: string[]; model: string; prompt_version: string; is_current: boolean; created_at: string;
}
export interface Source {
  id: number; key: string; name: string; kind: string; enabled: boolean; config: Record<string, unknown>; status: string;
  status_detail: string; last_run_at: string | null; last_success_at: string | null; last_error: string; jobs_found_last_run: number;
}
export interface Company {
  id: number; name: string; website: string; industry: string; size: string; headquarters: string; overview: string;
  tech_stack: string[]; funding: string; engineering_culture: string; employee_reviews: string; hiring_activity: string;
  risks: string[]; sources: { url: string; title: string }[]; quality_score: number | null; research_status: string;
  researched_at: string | null; notes: string; open_jobs: number;
}
export interface Recruiter {
  id: number; name: string; designation: string; role_type: string; company_name: string; company_id: number | null;
  linkedin_url: string; email: string; phone: string; source_url: string; source_description: string;
  verification_status: "unverified" | "verified" | "invalid"; discovered_by: string; last_contacted_at: string | null;
  responded_at: string | null; notes: string; created_at: string;
}
export type AppStatus =
  | "discovered" | "shortlisted" | "resume_prepared" | "awaiting_approval" | "applied" | "recruiter_contacted"
  | "screening" | "technical_interview" | "management_interview" | "hr_discussion" | "offer_received" | "rejected" | "on_hold";
export interface Application {
  id: number; job_id: number; status: AppStatus; recruiter_id: number | null; resume_id: number | null;
  cover_letter_id: number | null; approved_at: string | null; applied_at: string | null; expected_ctc_lpa: number | null;
  offered_ctc_lpa: number | null; follow_up_date: string | null; notes: string; created_at: string; updated_at: string;
  job_title: string; company_name: string; location: string; work_mode: string; apply_url: string | null;
  match_score: number | null; recruiter_name: string | null;
}
export interface HistoryItem { id: number; from_status: string | null; to_status: string; note: string; changed_by: string; changed_at: string }
export interface Doc { id: number; job_id: number | null; application_id: number | null; kind: string; title: string; body: string; model: string | null; created_at: string; has_pdf: boolean; has_docx: boolean }
export interface Interview {
  id: number; application_id: number; round_name: string; kind: string; scheduled_at: string; duration_minutes: number;
  mode: string; meeting_link: string; interviewers: string; status: string; outcome: string; feedback: string;
  job_title: string; company_name: string;
}
export interface Outreach {
  id: number; channel: string; recruiter_id: number | null; job_id: number | null; application_id: number | null;
  to_address: string; subject: string; body: string; status: string; approved_at: string | null; sent_at: string | null;
  replied_at: string | null; error: string; model: string | null; created_at: string; recruiter_name: string | null;
}
export interface ApplicationDetail extends Application {
  history: HistoryItem[]; documents: Doc[]; interviews: Interview[]; outreach: Outreach[]; resume_name: string | null;
}
export interface AutomationSettings {
  automation_enabled: boolean; schedule: Record<string, string>; disabled_tasks: string[]; keywords: string[];
  locations: string[]; work_modes: string[]; min_ctc_lpa: number | null; min_match_score: number; posted_within_hours: number;
  max_ai_matches_per_run: number; max_research_per_run: number; auto_prepare_min_score: number; max_auto_prepare_per_run: number; notify_channels: string[]; notify_events: Record<string, boolean>;
}
export interface AutomationTask { name: string; label: string; schedule: string; enabled: boolean; last_run: { status: string; at: string; id: number } | null }
export interface AutomationRun {
  id: number; task_name: string; run_key: string; trigger: string; status: string; attempt: number;
  stats: Record<string, unknown>; log: string[]; error: string; queued_at: string; started_at: string | null; finished_at: string | null;
}
export interface Notification { id: number; kind: string; title: string; body: string; payload: Record<string, unknown>; delivery: Record<string, string>; read_at: string | null; created_at: string }
export interface Integration { key: string; name: string; state: string; detail: string; model?: string }
export interface Summary {
  jobs_discovered: number; shortlisted: number; excellent_matches: number; applications_submitted: number;
  recruiter_responses: number; outreach_sent: number; interviews_scheduled: number; offers: number;
  application_conversion_rate: number; interview_to_offer_rate: number; recruiter_response_rate: number;
}
export interface Overview {
  totals: Summary; last_7_days: Summary;
  recent_jobs: { id: number; title: string; company: string; location: string; discovered_at: string; posted_at: string | null }[];
  top_matches: { id: number; title: string; company: string; score: number; classification: string; location: string; work_mode: string; ctc_min_lpa: number | null; ctc_max_lpa: number | null }[];
  upcoming_interviews: { id: number; round_name: string; scheduled_at: string; company: string; title: string }[];
  pending_follow_ups: { id: number; title: string; company: string; status: string; follow_up_date: string }[];
  recent_activity: { id: number; action: string; summary: string; actor: string; created_at: string }[];
  weekly_jobs: { week: string; count: number }[]; weekly_applications: { week: string; count: number }[];
}
export interface NamedCount { name: string; count: number }
export interface Report {
  summary: Summary; by_source: NamedCount[]; by_location: NamedCount[]; by_designation: NamedCount[]; by_score: NamedCount[];
  by_status: NamedCount[]; weekly_jobs: { week: string; count: number }[]; weekly_applications: { week: string; count: number }[];
  avg_offered_ctc_lpa: number | null; avg_recruiter_response_hours: number | null;
}
export interface Question { id: number; topic: string; subtopic: string; difficulty: string; kind: string; question: string; key_points: string[]; custom: boolean }
export interface MockAnswer { id: number; position: number; topic: string; question: string; answer: string; score: number | null; strengths: string[]; gaps: string[]; suggested_answer: string; feedback: string; evaluated_by: string }
export interface MockSession { id: number; title: string; target_role: string; job_id: number | null; topics: string[]; status: string; overall_score: number | null; summary: string; weaknesses: string[]; created_at: string; completed_at: string | null; answers: MockAnswer[] }
export interface Conversation { id: number; title: string; created_at: string; updated_at: string }
export interface AgentMessage { id: number; role: "user" | "assistant"; content: string; tool_calls: { name: string; input?: unknown; summary: string }[]; created_at: string }
