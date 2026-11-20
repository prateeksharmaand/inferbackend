from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORM


class MatchBrief(ORM):
    overall_score: int
    classification: str
    explanation: str
    reasons_to_apply: list[str]
    model: str


class JobOut(ORM):
    id: int
    title: str
    company_name: str
    company_id: int | None
    location: str
    work_mode: str
    ctc_min_lpa: float | None
    ctc_max_lpa: float | None
    currency: str
    salary_text: str
    experience_min_years: float | None
    experience_max_years: float | None
    url: str | None
    apply_url: str | None
    posted_at: datetime | None
    discovered_at: datetime
    last_verified_at: datetime | None
    status: str
    is_manual: bool
    source_key: str | None = None
    source_name: str | None = None
    shortlisted_at: datetime | None
    dismissed_at: datetime | None
    archived_at: datetime | None
    skills: list[str] = []
    match: MatchBrief | None = None
    application_id: int | None = None
    application_status: str | None = None


class JobDetail(JobOut):
    description: str
    employment_type: str
    notes: str


class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    company_name: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=50000)
    url: str | None = Field(None, max_length=1000)
    location: str = Field("", max_length=255)
    work_mode: str = Field("unknown", pattern="^(remote|hybrid|office|unknown)$")
    ctc_min_lpa: float | None = Field(None, ge=0, le=1000)
    ctc_max_lpa: float | None = Field(None, ge=0, le=1000)
    posted_at: datetime | None = None
    notes: str = ""

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v or None


class JobUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    location: str | None = None
    work_mode: str | None = Field(None, pattern="^(remote|hybrid|office|unknown)$")
    ctc_min_lpa: float | None = Field(None, ge=0, le=1000)
    ctc_max_lpa: float | None = Field(None, ge=0, le=1000)
    description: str | None = None
    status: str | None = Field(None, pattern="^(active|expired|unverified)$")
    notes: str | None = None


class ImportUrlIn(BaseModel):
    url: str = Field(max_length=1000)


class SourceOut(ORM):
    id: int
    key: str
    name: str
    kind: str
    enabled: bool
    config: dict
    status: str
    status_detail: str
    last_run_at: datetime | None
    last_success_at: datetime | None
    last_error: str
    jobs_found_last_run: int


class SourceUpdate(BaseModel):
    enabled: bool | None = None
    config: dict | None = None


class CompanyOut(ORM):
    id: int
    name: str
    website: str
    industry: str
    size: str
    headquarters: str
    overview: str
    tech_stack: list[str]
    funding: str
    engineering_culture: str
    employee_reviews: str
    hiring_activity: str
    risks: list[str]
    sources: list[dict]
    quality_score: int | None
    research_status: str
    researched_at: datetime | None
    notes: str
    open_jobs: int = 0


class CompanyUpdate(BaseModel):
    website: str | None = None
    industry: str | None = None
    size: str | None = None
    notes: str | None = None
    quality_score: int | None = Field(None, ge=0, le=10)
