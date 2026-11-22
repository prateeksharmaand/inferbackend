from datetime import datetime

from sqlalchemy import (Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
                        UniqueConstraint, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, utcnow
from app.models.enums import JobStatus, VerificationStatus, WorkMode, check_in


class Company(TimestampMixin, Base):
    __tablename__ = "companies"
    __table_args__ = (UniqueConstraint("user_id", "normalized_name"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200))
    website: Mapped[str] = mapped_column(String(255), default="")
    industry: Mapped[str] = mapped_column(String(120), default="")
    size: Mapped[str] = mapped_column(String(60), default="")
    headquarters: Mapped[str] = mapped_column(String(120), default="")
    overview: Mapped[str] = mapped_column(Text, default="")
    tech_stack: Mapped[list] = mapped_column(JSONB, default=list)
    funding: Mapped[str] = mapped_column(Text, default="")
    engineering_culture: Mapped[str] = mapped_column(Text, default="")
    employee_reviews: Mapped[str] = mapped_column(Text, default="")
    hiring_activity: Mapped[str] = mapped_column(Text, default="")
    risks: Mapped[list] = mapped_column(JSONB, default=list)
    sources: Mapped[list] = mapped_column(JSONB, default=list)  # [{"url","title"}]
    quality_score: Mapped[int | None] = mapped_column(Integer)  # 0-10, from research; None = unknown
    research_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|done|failed
    researched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str] = mapped_column(Text, default="")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class JobSource(TimestampMixin, Base):
    __tablename__ = "job_sources"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(20))  # api | aggregator | career_page | manual | restricted
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="unknown")
    status_detail: Mapped[str] = mapped_column(Text, default="")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str] = mapped_column(Text, default="")
    jobs_found_last_run: Mapped[int] = mapped_column(Integer, default=0)


class Job(TimestampMixin, Base):
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("user_id", "dedup_hash"),
        Index("uq_jobs_source_external", "user_id", "source_id", "external_id", unique=True,
              postgresql_where=text("external_id IS NOT NULL")),
        Index("uq_jobs_normalized_url", "user_id", "normalized_url", unique=True,
              postgresql_where=text("normalized_url IS NOT NULL")),
        Index("ix_jobs_user_posted", "user_id", "posted_at"),
        CheckConstraint(check_in("status", JobStatus), name="status"),
        CheckConstraint(check_in("work_mode", WorkMode), name="work_mode"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("job_sources.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    company_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    external_id: Mapped[str | None] = mapped_column(String(255))
    url: Mapped[str | None] = mapped_column(String(1000))
    normalized_url: Mapped[str | None] = mapped_column(String(1000))
    apply_url: Mapped[str | None] = mapped_column(String(1000))
    location: Mapped[str] = mapped_column(String(255), default="")
    work_mode: Mapped[str] = mapped_column(String(10), default=WorkMode.unknown)
    # Salary convention: INR LPA. Non-INR postings keep the original currency and leave *_lpa null
    # unless conversion is explicit (see app.services.salary).
    ctc_min_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    ctc_max_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    salary_text: Mapped[str] = mapped_column(String(255), default="")
    experience_min_years: Mapped[float | None] = mapped_column(Numeric(4, 1))
    experience_max_years: Mapped[float | None] = mapped_column(Numeric(4, 1))
    employment_type: Mapped[str] = mapped_column(String(40), default="")
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(12), default=JobStatus.unverified)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    dedup_hash: Mapped[str] = mapped_column(String(64))
    title_company_key: Mapped[str] = mapped_column(String(64), index=True)
    description_fingerprint: Mapped[str | None] = mapped_column(String(64), index=True)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    shortlisted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str] = mapped_column(Text, default="")

    skills: Mapped[list["JobSkill"]] = relationship(cascade="all, delete-orphan")
    source: Mapped[JobSource | None] = relationship()
    company: Mapped[Company | None] = relationship()


class JobSkill(Base):
    __tablename__ = "job_skills"
    __table_args__ = (UniqueConstraint("job_id", "name"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)


class JobMatch(Base):
    __tablename__ = "job_matches"
    __table_args__ = (
        Index("uq_job_match_current", "job_id", unique=True, postgresql_where=text("is_current")),
        CheckConstraint("overall_score BETWEEN 0 AND 100", name="overall_range"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.id", ondelete="CASCADE"), index=True)
    technical_score: Mapped[int] = mapped_column(Integer)     # /25
    leadership_score: Mapped[int] = mapped_column(Integer)    # /20
    architecture_score: Mapped[int] = mapped_column(Integer)  # /20
    compensation_score: Mapped[int] = mapped_column(Integer)  # /15
    location_score: Mapped[int] = mapped_column(Integer)      # /10
    company_score: Mapped[int] = mapped_column(Integer)       # /10
    overall_score: Mapped[int] = mapped_column(Integer, index=True)
    classification: Mapped[str] = mapped_column(String(20))
    matching_skills: Mapped[list] = mapped_column(JSONB, default=list)
    missing_skills: Mapped[list] = mapped_column(JSONB, default=list)
    experience_gaps: Mapped[list] = mapped_column(JSONB, default=list)
    leadership_relevance: Mapped[str] = mapped_column(Text, default="")
    architecture_relevance: Mapped[str] = mapped_column(Text, default="")
    compensation_compatibility: Mapped[str] = mapped_column(Text, default="")
    reasons_to_apply: Mapped[list] = mapped_column(JSONB, default=list)
    reasons_not_to_apply: Mapped[list] = mapped_column(JSONB, default=list)
    suggested_resume: Mapped[str] = mapped_column(String(30), default="master")
    recommended_action: Mapped[str] = mapped_column(Text, default="")
    explanation: Mapped[str] = mapped_column(Text, default="")
    adjustments: Mapped[list] = mapped_column(JSONB, default=list)  # server-side guardrail corrections
    model: Mapped[str] = mapped_column(String(60))
    prompt_version: Mapped[str] = mapped_column(String(20))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    job: Mapped[Job] = relationship()


class Recruiter(TimestampMixin, Base):
    __tablename__ = "recruiters"
    __table_args__ = (
        Index("uq_recruiter_linkedin", "user_id", "linkedin_url", unique=True,
              postgresql_where=text("linkedin_url <> ''")),
        CheckConstraint(check_in("verification_status", VerificationStatus), name="verification"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    designation: Mapped[str] = mapped_column(String(160), default="")
    role_type: Mapped[str] = mapped_column(String(30), default="recruiter")
    company_name: Mapped[str] = mapped_column(String(200), default="")
    linkedin_url: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    source_url: Mapped[str] = mapped_column(String(1000), default="")
    source_description: Mapped[str] = mapped_column(Text, default="")
    verification_status: Mapped[str] = mapped_column(String(12), default=VerificationStatus.unverified)
    discovered_by: Mapped[str] = mapped_column(String(20), default="user")  # user | agent
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str] = mapped_column(Text, default="")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    company: Mapped[Company | None] = relationship()
