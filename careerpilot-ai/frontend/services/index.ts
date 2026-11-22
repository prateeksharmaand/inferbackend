/** Typed service modules, one per backend router. All UI data access goes through here. */
import type * as T from "@/types/api";
import { api } from "./client";

type Q = Parameters<typeof api.get>[1];

export const authApi = {
  config: () => api.get<{ registration_open: boolean }>("/api/auth/config"),
  me: () => api.get<T.User>("/api/auth/me"),
  login: (email: string, password: string) => api.post<T.User>("/api/auth/login", { email, password }),
  register: (email: string, password: string, full_name: string) => api.post<T.User>("/api/auth/register", { email, password, full_name }),
  logout: () => api.post("/api/auth/logout"),
  changePassword: (current_password: string, new_password: string) => api.post("/api/auth/change-password", { current_password, new_password }),
};

export const profileApi = {
  get: () => api.get<T.Profile>("/api/profile"),
  update: (b: Partial<T.Profile>) => api.patch<T.Profile>("/api/profile", b),
  addSkill: (b: { name: string; category: string; confirmed: boolean; years?: number | null }) => api.post<T.Skill>("/api/profile/skills", b),
  updateSkill: (id: number, b: { name: string; category: string; confirmed: boolean; years?: number | null }) => api.patch<T.Skill>(`/api/profile/skills/${id}`, b),
  deleteSkill: (id: number) => api.del(`/api/profile/skills/${id}`),
  addEmployment: (b: Omit<T.Employment, "id" | "sort_order">) => api.post<T.Employment>("/api/profile/employment", b),
  updateEmployment: (id: number, b: Omit<T.Employment, "id" | "sort_order">) => api.put<T.Employment>(`/api/profile/employment/${id}`, b),
  deleteEmployment: (id: number) => api.del(`/api/profile/employment/${id}`),
  addProject: (b: Omit<T.Project, "id">) => api.post<T.Project>("/api/profile/projects", b),
  updateProject: (id: number, b: Omit<T.Project, "id">) => api.put<T.Project>(`/api/profile/projects/${id}`, b),
  deleteProject: (id: number) => api.del(`/api/profile/projects/${id}`),
};

export const resumeApi = {
  list: (q?: Q) => api.get<T.Resume[]>("/api/resumes", q),
  get: (id: number) => api.get<T.ResumeDetail>(`/api/resumes/${id}`),
  upload: (file: File, apply: "fill_empty" | "replace" | "none") => {
    const f = new FormData();
    f.append("file", file);
    return api.upload<{ resume: T.Resume; parsed_by: string; profile_update: { changed_fields: string[]; skills_added: number } | null }>(`/api/resumes/upload?apply_to_profile=${apply}`, f);
  },
  variant: (category: string) => api.post<T.Resume>("/api/resumes/variants", { category }),
  update: (id: number, b: { name?: string; content?: unknown; is_primary?: boolean }) => api.patch<T.ResumeDetail>(`/api/resumes/${id}`, b),
  archive: (id: number) => api.del(`/api/resumes/${id}`),
  reparse: (id: number, mode: "fill_empty" | "replace") => api.post(`/api/resumes/${id}/reparse?apply_to_profile=${mode}`),
  downloadUrl: (id: number, fmt: "pdf" | "docx" | "original") => `/api/resumes/${id}/download?fmt=${fmt}`,
};

export const jobsApi = {
  list: (q?: Q) => api.get<T.Page<T.Job>>("/api/jobs", q),
  get: (id: number) => api.get<T.JobDetail>(`/api/jobs/${id}`),
  create: (b: Record<string, unknown>) => api.post<T.JobDetail>("/api/jobs", b),
  update: (id: number, b: Record<string, unknown>) => api.patch<T.JobDetail>(`/api/jobs/${id}`, b),
  importUrl: (url: string) => api.post<{ preview: Record<string, unknown> & { skills: string[] }; duplicate_of: number | null }>("/api/jobs/import-url", { url }),
  shortlist: (id: number) => api.post<T.Job>(`/api/jobs/${id}/shortlist`),
  unshortlist: (id: number) => api.del<T.Job>(`/api/jobs/${id}/shortlist`),
  dismiss: (id: number) => api.post<T.Job>(`/api/jobs/${id}/dismiss`),
  archive: (id: number) => api.del(`/api/jobs/${id}`),
  verify: (id: number) => api.post<T.JobDetail>(`/api/jobs/${id}/verify`),
  tailoredResume: (id: number, variant?: string) => api.post<{ application_id: number; resume_id: number }>(`/api/jobs/${id}/tailored-resume${variant ? `?variant=${variant}` : ""}`),
  coverLetter: (id: number) => api.post<T.Doc>(`/api/jobs/${id}/cover-letter`),
};

export const sourcesApi = {
  list: () => api.get<T.Source[]>("/api/sources"),
  update: (key: string, b: { enabled?: boolean; config?: Record<string, unknown> }) => api.patch<T.Source>(`/api/sources/${key}`, b),
  test: (key: string) => api.post<{ ok: boolean; detail: string }>(`/api/sources/${key}/test`),
};

export const matchApi = {
  shortlist: (q?: Q) => api.get<T.Page<T.Job>>("/api/matches/shortlist", q),
  history: (jobId: number) => api.get<T.Match[]>(`/api/matches/job/${jobId}`),
  score: (jobId: number) => api.post<T.Match>(`/api/matches/job/${jobId}`),
  run: (b: { job_ids?: number[]; limit?: number }) => api.post<{ scored: number }>("/api/matches/run", b),
};

export const companyApi = {
  list: (q?: Q) => api.get<T.Page<T.Company>>("/api/companies", q),
  get: (id: number) => api.get<T.Company>(`/api/companies/${id}`),
  update: (id: number, b: Partial<T.Company>) => api.patch<T.Company>(`/api/companies/${id}`, b),
  research: (id: number) => api.post<T.Company>(`/api/companies/${id}/research`),
  discoverContacts: (id: number, jobId?: number) => api.post<{ added: number; skipped: string[]; error?: string }>(`/api/companies/${id}/discover-contacts${jobId ? `?job_id=${jobId}` : ""}`),
};

export const recruiterApi = {
  list: (q?: Q) => api.get<T.Page<T.Recruiter>>("/api/recruiters", q),
  create: (b: Partial<T.Recruiter>) => api.post<T.Recruiter>("/api/recruiters", b),
  update: (id: number, b: Partial<T.Recruiter>) => api.patch<T.Recruiter>(`/api/recruiters/${id}`, b),
  responded: (id: number) => api.post<T.Recruiter>(`/api/recruiters/${id}/responded`),
  archive: (id: number) => api.del(`/api/recruiters/${id}`),
};

export const appApi = {
  list: (q?: Q) => api.get<T.Page<T.Application>>("/api/applications", q),
  get: (id: number) => api.get<T.ApplicationDetail>(`/api/applications/${id}`),
  create: (job_id: number) => api.post<T.Application>("/api/applications", { job_id }),
  update: (id: number, b: Record<string, unknown>) => api.patch<T.Application>(`/api/applications/${id}`, b),
  status: (id: number, status: T.AppStatus, note = "") => api.post<T.Application>(`/api/applications/${id}/status`, { status, note }),
  prepare: (id: number, b: { variant?: string; cover_letter: boolean }) => api.post<T.ApplicationDetail>(`/api/applications/${id}/prepare`, b),
  approve: (id: number) => api.post<T.Application>(`/api/applications/${id}/approve`),
  archive: (id: number) => api.del(`/api/applications/${id}`),
};

export const docApi = {
  list: () => api.get<T.Doc[]>("/api/documents"),
  update: (id: number, b: { title: string; body: string }) => api.patch<T.Doc>(`/api/documents/${id}`, b),
  downloadUrl: (id: number, fmt: "pdf" | "docx") => `/api/documents/${id}/download?fmt=${fmt}`,
};

export const interviewApi = {
  list: (q?: Q) => api.get<T.Interview[]>("/api/interviews", q),
  create: (b: Record<string, unknown>) => api.post<T.Interview>("/api/interviews", b),
  update: (id: number, b: Record<string, unknown>) => api.put<T.Interview>(`/api/interviews/${id}`, b),
  remove: (id: number) => api.del(`/api/interviews/${id}`),
};

export const outreachApi = {
  list: (q?: Q) => api.get<T.Page<T.Outreach>>("/api/outreach", q),
  create: (b: Record<string, unknown>) => api.post<T.Outreach>("/api/outreach", b),
  update: (id: number, b: { subject?: string; body?: string; to_address?: string }) => api.patch<T.Outreach>(`/api/outreach/${id}`, b),
  approve: (id: number) => api.post<T.Outreach>(`/api/outreach/${id}/approve`),
  send: (id: number) => api.post<T.Outreach>(`/api/outreach/${id}/send`),
  markSent: (id: number) => api.post<T.Outreach>(`/api/outreach/${id}/mark-sent`),
  replied: (id: number) => api.post<T.Outreach>(`/api/outreach/${id}/replied`),
  archive: (id: number) => api.del(`/api/outreach/${id}`),
};

export const automationApi = {
  settings: () => api.get<T.AutomationSettings>("/api/automation/settings"),
  updateSettings: (b: Partial<T.AutomationSettings>) => api.patch<T.AutomationSettings>("/api/automation/settings", b),
  tasks: () => api.get<T.AutomationTask[]>("/api/automation/tasks"),
  run: (task: string) => api.post<T.AutomationRun>(`/api/automation/run/${task}`),
  retry: (id: number) => api.post<T.AutomationRun>(`/api/automation/runs/${id}/retry`),
  runs: (q?: Q) => api.get<T.Page<T.AutomationRun>>("/api/automation/runs", q),
};

export const notificationApi = {
  list: (q?: Q) => api.get<T.Page<T.Notification>>("/api/notifications", q),
  unread: () => api.get<{ count: number }>("/api/notifications/unread-count"),
  readAll: () => api.post("/api/notifications/read-all"),
  read: (id: number) => api.post(`/api/notifications/${id}/read`),
  test: () => api.post<{ delivery: Record<string, string> }>("/api/notifications/test"),
};

export const analyticsApi = {
  overview: () => api.get<T.Overview>("/api/analytics/overview"),
  report: (q?: Q) => api.get<T.Report>("/api/analytics/report", q),
  exportUrl: (dataset: string, start?: string, end?: string) =>
    `/api/analytics/export/${dataset}${start || end ? `?${new URLSearchParams({ ...(start ? { start } : {}), ...(end ? { end } : {}) })}` : ""}`,
};

export const settingsApi = {
  integrations: (check_ai = false) => api.get<T.Integration[]>("/api/settings/integrations", { check_ai }),
  exportUrl: "/api/settings/export",
  deleteAccount: (password: string) => api.post("/api/settings/delete-account", { password, confirm: "DELETE" }),
};

export const coachApi = {
  topics: () => api.get<string[]>("/api/interview-coach/topics"),
  questions: (q?: Q) => api.get<T.Question[]>("/api/interview-coach/questions", q),
  addQuestion: (b: Record<string, unknown>) => api.post<T.Question>("/api/interview-coach/questions", b),
  sessions: () => api.get<T.MockSession[]>("/api/interview-coach/sessions"),
  session: (id: number) => api.get<T.MockSession>(`/api/interview-coach/sessions/${id}`),
  start: (b: { topics: string[]; count: number; job_id?: number | null; target_role: string }) => api.post<T.MockSession>("/api/interview-coach/sessions", b),
  answer: (sid: number, aid: number, answer: string) => api.post<T.MockAnswer>(`/api/interview-coach/sessions/${sid}/answers/${aid}`, { answer }),
  complete: (sid: number) => api.post<T.MockSession>(`/api/interview-coach/sessions/${sid}/complete`),
  progress: () => api.get<{ by_topic: { topic: string; avg_score: number; answers: number }[]; trend: { date: string; score: number }[]; sessions_completed: number }>("/api/interview-coach/progress"),
};

export const agentApi = {
  conversations: () => api.get<T.Conversation[]>("/api/agent/conversations"),
  messages: (id: number) => api.get<T.AgentMessage[]>(`/api/agent/conversations/${id}/messages`),
  chat: (message: string, conversation_id?: number | null) => api.post<{ conversation_id: number; message: T.AgentMessage }>("/api/agent/chat", { message, conversation_id }),
  archive: (id: number) => api.del(`/api/agent/conversations/${id}`),
};
