from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl, field_validator

from app.schemas.common import ORM


class SkillOut(ORM):
    id: int
    name: str
    category: str
    years: float | None
    source: str
    confirmed: bool


class SkillIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str = Field("technical", pattern="^(technical|platform|tool|leadership|domain)$")
    years: float | None = Field(None, ge=0, le=50)
    confirmed: bool = True


class EmploymentIn(BaseModel):
    company: str = Field(min_length=1, max_length=160)
    title: str = Field("", max_length=160)
    location: str = Field("", max_length=120)
    start_date: str = Field("", pattern=r"^(\d{4}(-\d{2})?)?$")
    end_date: str = Field("", pattern=r"^(\d{4}(-\d{2})?)?$")
    is_current: bool = False
    description: str = ""
    highlights: list[str] = []


class EmploymentOut(EmploymentIn, ORM):
    id: int
    sort_order: int


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    employer: str = ""
    tech_stack: list[str] = []
    description: str = ""
    metrics: str = ""
    url: str = ""


class ProjectOut(ProjectIn, ORM):
    id: int


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=160)
    headline: str | None = Field(None, max_length=255)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=40)
    linkedin_url: str | None = Field(None, max_length=255)
    location: str | None = Field(None, max_length=120)
    total_experience_years: float | None = Field(None, ge=0, le=60)
    flutter_experience_years: float | None = Field(None, ge=0, le=60)
    android_experience_years: float | None = Field(None, ge=0, le=60)
    leadership_experience_years: float | None = Field(None, ge=0, le=60)
    professional_summary: str | None = None
    preferred_designations: list[str] | None = None
    current_ctc_lpa: float | None = Field(None, ge=0, le=1000)
    target_ctc_min_lpa: float | None = Field(None, ge=0, le=1000)
    target_ctc_max_lpa: float | None = Field(None, ge=0, le=1000)
    notice_period_days: int | None = Field(None, ge=0, le=365)
    preferred_locations: list[str] | None = None
    preferred_work_modes: list[str] | None = None
    education: list[str] | None = None
    certifications: list[str] | None = None
    achievements: list[str] | None = None

    @field_validator("preferred_work_modes")
    @classmethod
    def _modes(cls, v):
        if v is not None and any(m not in ("remote", "hybrid", "office") for m in v):
            raise ValueError("work modes must be remote, hybrid or office")
        return v


class ProfileOut(ORM):
    id: int
    full_name: str
    headline: str
    email: str
    phone: str
    linkedin_url: str
    location: str
    total_experience_years: float | None
    flutter_experience_years: float | None
    android_experience_years: float | None
    leadership_experience_years: float | None
    professional_summary: str
    preferred_designations: list[str]
    current_ctc_lpa: float | None
    target_ctc_min_lpa: float | None
    target_ctc_max_lpa: float | None
    notice_period_days: int | None
    preferred_locations: list[str]
    preferred_work_modes: list[str]
    education: list[str]
    certifications: list[str]
    achievements: list[str]
    needs_confirmation: list[dict]
    skills: list[SkillOut]
    employment: list[EmploymentOut]
    projects: list[ProjectOut]
    updated_at: datetime


class ResumeOut(ORM):
    id: int
    name: str
    category: str
    version: int
    parent_id: int | None
    job_id: int | None
    original_filename: str | None
    file_type: str | None
    file_size: int | None
    has_docx: bool = False
    has_pdf: bool = False
    has_original: bool = False
    model: str | None
    is_primary: bool
    created_at: datetime
    archived_at: datetime | None


class ResumeDetail(ResumeOut):
    content: dict
    extracted_text: str


class ResumeUpdate(BaseModel):
    name: str | None = Field(None, max_length=160)
    content: dict | None = None
    is_primary: bool | None = None


class VariantIn(BaseModel):
    category: str = Field(pattern="^(master|flutter_lead|mobile_architect|engineering_leadership)$")
    name: str | None = None


__all__ = ["HttpUrl"]
