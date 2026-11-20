from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import ApplicationStatus, OutreachChannel, RecruiterRole
from app.schemas.common import ORM


class MatchOut(ORM):
    id: int
    job_id: int
    technical_score: int
    leadership_score: int
    architecture_score: int
    compensation_score: int
    location_score: int
    company_score: int
    overall_score: int
    classification: str
    matching_skills: list[str]
    missing_skills: list[str]
    experience_gaps: list[str]
    leadership_relevance: str
    architecture_relevance: str
    compensation_compatibility: str
    reasons_to_apply: list[str]
    reasons_not_to_apply: list[str]
    suggested_resume: str
    recommended_action: str
    explanation: str
    adjustments: list[str]
    model: str
    prompt_version: str
    is_current: bool
    created_at: datetime


class MatchRunIn(BaseModel):
    job_ids: list[int] | None = None
    limit: int = Field(20, ge=1, le=200)


class RecruiterIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    designation: str = Field("", max_length=160)
    role_type: RecruiterRole = RecruiterRole.recruiter
    company_name: str = Field("", max_length=200)
    company_id: int | None = None
    linkedin_url: str = Field("", max_length=255, pattern=r"^(https?://([a-z]+\.)?linkedin\.com/.*)?$")
    email: str = Field("", max_length=255, pattern=r"^([^@\s]+@[^@\s]+\.[A-Za-z]{2,})?$")
    phone: str = Field("", max_length=40)
    source_url: str = Field("", max_length=1000)
    source_description: str = ""
    verification_status: str = Field("unverified", pattern="^(unverified|verified|invalid)$")
    notes: str = ""


class RecruiterOut(ORM):
    id: int
    name: str
    designation: str
    role_type: str
    company_name: str
    company_id: int | None
    linkedin_url: str
    email: str
    phone: str
    source_url: str
    source_description: str
    verification_status: str
    discovered_by: str
    last_contacted_at: datetime | None
    responded_at: datetime | None
    notes: str
    created_at: datetime


class HistoryOut(ORM):
    id: int
    from_status: str | None
    to_status: str
    note: str
    changed_by: str
    changed_at: datetime


class DocumentOut(ORM):
    id: int
    job_id: int | None
    application_id: int | None
    kind: str
    title: str
    body: str
    model: str | None
    created_at: datetime
    has_pdf: bool = False
    has_docx: bool = False


class ApplicationOut(ORM):
    id: int
    job_id: int
    status: str
    recruiter_id: int | None
    resume_id: int | None
    cover_letter_id: int | None
    approved_at: datetime | None
    applied_at: datetime | None
    expected_ctc_lpa: float | None
    offered_ctc_lpa: float | None
    follow_up_date: date | None
    notes: str
    created_at: datetime
    updated_at: datetime
    job_title: str = ""
    company_name: str = ""
    location: str = ""
    work_mode: str = ""
    apply_url: str | None = None
    match_score: int | None = None
    recruiter_name: str | None = None


class ApplicationDetail(ApplicationOut):
    history: list[HistoryOut] = []
    documents: list[DocumentOut] = []
    interviews: list["InterviewOut"] = []
    outreach: list["OutreachOut"] = []
    resume_name: str | None = None


class ApplicationCreate(BaseModel):
    job_id: int
    status: ApplicationStatus = ApplicationStatus.shortlisted
    notes: str = ""


class ApplicationUpdate(BaseModel):
    recruiter_id: int | None = None
    resume_id: int | None = None
    cover_letter_id: int | None = None
    expected_ctc_lpa: float | None = Field(None, ge=0, le=1000)
    offered_ctc_lpa: float | None = Field(None, ge=0, le=1000)
    follow_up_date: date | None = None
    notes: str | None = None


class StatusChange(BaseModel):
    status: ApplicationStatus
    note: str = ""


class PrepareIn(BaseModel):
    variant: str | None = Field(None, pattern="^(master|flutter_lead|mobile_architect|engineering_leadership)$")
    cover_letter: bool = True


class InterviewIn(BaseModel):
    application_id: int
    round_name: str = Field(min_length=1, max_length=120)
    kind: str = Field("technical", pattern="^(screening|technical|managerial|hr|other)$")
    scheduled_at: datetime
    duration_minutes: int = Field(60, ge=5, le=600)
    mode: str = Field("video", pattern="^(video|phone|onsite)$")
    meeting_link: str = ""
    interviewers: str = ""
    status: str = Field("scheduled", pattern="^(scheduled|completed|cancelled)$")
    outcome: str = Field("pending", pattern="^(pending|passed|failed)$")
    feedback: str = ""


class InterviewOut(ORM):
    id: int
    application_id: int
    round_name: str
    kind: str
    scheduled_at: datetime
    duration_minutes: int
    mode: str
    meeting_link: str
    interviewers: str
    status: str
    outcome: str
    feedback: str
    job_title: str = ""
    company_name: str = ""


class OutreachCreate(BaseModel):
    channel: OutreachChannel
    recruiter_id: int | None = None
    job_id: int | None = None
    application_id: int | None = None
    generate: bool = True
    subject: str = ""
    body: str = ""


class OutreachUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    to_address: str | None = Field(None, pattern=r"^([^@\s]+@[^@\s]+\.[A-Za-z]{2,})?$")


class OutreachOut(ORM):
    id: int
    channel: str
    recruiter_id: int | None
    job_id: int | None
    application_id: int | None
    to_address: str
    subject: str
    body: str
    status: str
    approved_at: datetime | None
    sent_at: datetime | None
    replied_at: datetime | None
    error: str
    model: str | None
    created_at: datetime
    recruiter_name: str | None = None


ApplicationDetail.model_rebuild()
