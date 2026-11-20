from datetime import datetime

from sqlalchemy import (Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String,
                        Text, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.models.enums import ResumeCategory, check_in


class CandidateProfile(TimestampMixin, Base):
    __tablename__ = "candidate_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    full_name: Mapped[str] = mapped_column(String(160), default="")
    headline: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    linkedin_url: Mapped[str] = mapped_column(String(255), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    total_experience_years: Mapped[float | None] = mapped_column(Numeric(4, 1))
    flutter_experience_years: Mapped[float | None] = mapped_column(Numeric(4, 1))
    android_experience_years: Mapped[float | None] = mapped_column(Numeric(4, 1))
    leadership_experience_years: Mapped[float | None] = mapped_column(Numeric(4, 1))
    professional_summary: Mapped[str] = mapped_column(Text, default="")
    preferred_designations: Mapped[list] = mapped_column(JSONB, default=list)
    # Salary convention: INR LPA (lakhs per annum)
    current_ctc_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    target_ctc_min_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    target_ctc_max_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    notice_period_days: Mapped[int | None] = mapped_column(Integer)
    preferred_locations: Mapped[list] = mapped_column(JSONB, default=list)
    preferred_work_modes: Mapped[list] = mapped_column(JSONB, default=list)
    education: Mapped[list] = mapped_column(JSONB, default=list)
    certifications: Mapped[list] = mapped_column(JSONB, default=list)
    achievements: Mapped[list] = mapped_column(JSONB, default=list)
    # Fields extracted with low confidence or claimed outside the resume; the UI asks the user to confirm.
    needs_confirmation: Mapped[list] = mapped_column(JSONB, default=list)
    extracted_from_resume_id: Mapped[int | None] = mapped_column(Integer)

    skills: Mapped[list["CandidateSkill"]] = relationship(back_populates="profile", cascade="all, delete-orphan",
                                                          order_by="CandidateSkill.name")
    employment: Mapped[list["EmploymentHistory"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan", order_by="EmploymentHistory.sort_order")
    projects: Mapped[list["CandidateProject"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan", order_by="CandidateProject.sort_order")


class CandidateSkill(Base):
    __tablename__ = "candidate_skills"
    __table_args__ = (Index("uq_candidate_skill_name", "profile_id", text("lower(name)"), unique=True),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(40), default="technical")  # technical|platform|tool|leadership|domain
    years: Mapped[float | None] = mapped_column(Numeric(4, 1))
    source: Mapped[str] = mapped_column(String(20), default="resume")  # resume | user
    confirmed: Mapped[bool] = mapped_column(Boolean, default=True)
    profile: Mapped[CandidateProfile] = relationship(back_populates="skills")


class EmploymentHistory(Base):
    __tablename__ = "employment_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(String(160))
    title: Mapped[str] = mapped_column(String(160), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    start_date: Mapped[str] = mapped_column(String(20), default="")  # "YYYY-MM"
    end_date: Mapped[str] = mapped_column(String(20), default="")    # "YYYY-MM" or ""
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(Text, default="")
    highlights: Mapped[list] = mapped_column(JSONB, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    profile: Mapped[CandidateProfile] = relationship(back_populates="employment")


class CandidateProject(Base):
    __tablename__ = "candidate_projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    employer: Mapped[str] = mapped_column(String(160), default="")
    tech_stack: Mapped[list] = mapped_column(JSONB, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    metrics: Mapped[str] = mapped_column(String(255), default="")
    url: Mapped[str] = mapped_column(String(255), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    profile: Mapped[CandidateProfile] = relationship(back_populates="projects")


class Resume(TimestampMixin, Base):
    __tablename__ = "resumes"
    __table_args__ = (CheckConstraint(check_in("category", ResumeCategory), name="category"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(30), default=ResumeCategory.master)
    version: Mapped[int] = mapped_column(Integer, default=1)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("resumes.id", ondelete="SET NULL"))
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"), index=True)
    original_filename: Mapped[str | None] = mapped_column(String(255))
    file_path: Mapped[str | None] = mapped_column(String(500))  # relative to STORAGE_PATH
    docx_path: Mapped[str | None] = mapped_column(String(500))
    pdf_path: Mapped[str | None] = mapped_column(String(500))
    file_type: Mapped[str | None] = mapped_column(String(10))
    file_size: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64))
    extracted_text: Mapped[str] = mapped_column(Text, default="")
    # Structured resume content (summary, skills, experience, projects ...) used for generation
    content: Mapped[dict] = mapped_column(JSONB, default=dict)
    model: Mapped[str | None] = mapped_column(String(60))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
