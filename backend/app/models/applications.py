from datetime import date, datetime

from sqlalchemy import (CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
                        text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, utcnow
from app.models.enums import ApplicationStatus, OutreachChannel, OutreachStatus, check_in
from app.models.jobs import Job, Recruiter


class Application(TimestampMixin, Base):
    __tablename__ = "applications"
    __table_args__ = (
        # One active application per job (archived ones don't block a fresh attempt)
        Index("uq_application_job", "user_id", "job_id", unique=True, postgresql_where=text("archived_at IS NULL")),
        CheckConstraint(check_in("status", ApplicationStatus), name="status"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int | None] = mapped_column(ForeignKey("candidate_profiles.id", ondelete="SET NULL"))
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    recruiter_id: Mapped[int | None] = mapped_column(ForeignKey("recruiters.id", ondelete="SET NULL"))
    resume_id: Mapped[int | None] = mapped_column(ForeignKey("resumes.id", ondelete="SET NULL"))
    cover_letter_id: Mapped[int | None] = mapped_column(ForeignKey("application_documents.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(24), default=ApplicationStatus.shortlisted, index=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expected_ctc_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    offered_ctc_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    follow_up_date: Mapped[date | None] = mapped_column(Date, index=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    job: Mapped[Job] = relationship()
    recruiter: Mapped[Recruiter | None] = relationship()
    history: Mapped[list["ApplicationStatusHistory"]] = relationship(
        cascade="all, delete-orphan", order_by="ApplicationStatusHistory.changed_at")


class ApplicationDocument(Base):
    """Generated cover letters (and other per-application docs). Tailored resumes live in `resumes`."""
    __tablename__ = "application_documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"), index=True)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("applications.id", ondelete="SET NULL",
                                                                   use_alter=True), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="cover_letter")
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    docx_path: Mapped[str | None] = mapped_column(String(500))
    pdf_path: Mapped[str | None] = mapped_column(String(500))
    source_resume_id: Mapped[int | None] = mapped_column(ForeignKey("resumes.id", ondelete="SET NULL"))
    model: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ApplicationStatusHistory(Base):
    __tablename__ = "application_status_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(24))
    to_status: Mapped[str] = mapped_column(String(24))
    note: Mapped[str] = mapped_column(Text, default="")
    changed_by: Mapped[str] = mapped_column(String(20), default="user")
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Interview(TimestampMixin, Base):
    __tablename__ = "interviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    round_name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(30), default="technical")  # screening|technical|managerial|hr|other
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    mode: Mapped[str] = mapped_column(String(20), default="video")
    meeting_link: Mapped[str] = mapped_column(String(1000), default="")
    interviewers: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled|completed|cancelled
    outcome: Mapped[str] = mapped_column(String(20), default="pending")   # pending|passed|failed
    feedback: Mapped[str] = mapped_column(Text, default="")
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    application: Mapped[Application] = relationship()


class OutreachMessage(TimestampMixin, Base):
    __tablename__ = "outreach_messages"
    __table_args__ = (
        CheckConstraint(check_in("channel", OutreachChannel), name="channel"),
        CheckConstraint(check_in("status", OutreachStatus), name="status"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    recruiter_id: Mapped[int | None] = mapped_column(ForeignKey("recruiters.id", ondelete="SET NULL"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    application_id: Mapped[int | None] = mapped_column(ForeignKey("applications.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(String(24))
    to_address: Mapped[str] = mapped_column(String(255), default="")
    subject: Mapped[str] = mapped_column(String(255), default="")
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default=OutreachStatus.draft, index=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str | None] = mapped_column(String(60))
    recruiter: Mapped[Recruiter | None] = relationship()
