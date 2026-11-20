from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, utcnow

DEFAULT_SCHEDULE = {
    "discover_jobs": "08:00",
    "normalize_dedupe": "08:30",
    "match_jobs": "09:00",
    "research": "09:30",
    "daily_digest": "10:00",
    "follow_ups": "18:00",
    "weekly_report": "SUN 19:00",
}
DEFAULT_KEYWORDS = [
    "Flutter Technical Lead", "Flutter Architect", "Mobile Technical Lead", "Mobile Architect",
    "Mobile Engineering Lead", "Mobile Solutions Architect", "Senior Flutter Engineer",
    "Engineering Manager Mobile", "Technical Lead Android iOS Flutter",
]
DEFAULT_LOCATIONS = ["Jaipur", "Bengaluru", "Hyderabad", "Pune", "Gurugram", "Noida", "Delhi", "Mumbai",
                     "Chennai", "Remote India"]


class AgentSettings(TimestampMixin, Base):
    __tablename__ = "agent_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    automation_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    schedule: Mapped[dict] = mapped_column(JSONB, default=lambda: dict(DEFAULT_SCHEDULE))
    disabled_tasks: Mapped[list] = mapped_column(JSONB, default=list)
    keywords: Mapped[list] = mapped_column(JSONB, default=lambda: list(DEFAULT_KEYWORDS))
    locations: Mapped[list] = mapped_column(JSONB, default=lambda: list(DEFAULT_LOCATIONS))
    work_modes: Mapped[list] = mapped_column(JSONB, default=lambda: ["remote", "hybrid", "office"])
    min_ctc_lpa: Mapped[float | None] = mapped_column(Integer, default=25)
    min_match_score: Mapped[int] = mapped_column(Integer, default=70)
    posted_within_hours: Mapped[int] = mapped_column(Integer, default=72)
    max_ai_matches_per_run: Mapped[int] = mapped_column(Integer, default=40)
    max_research_per_run: Mapped[int] = mapped_column(Integer, default=5)
    notify_channels: Mapped[list] = mapped_column(JSONB, default=lambda: ["email", "telegram"])
    notify_events: Mapped[dict] = mapped_column(JSONB, default=lambda: {
        "daily_digest": True, "excellent_match": True, "recruiter_response": True, "interview": True,
        "follow_up": True, "status_change": True, "automation_failure": True, "weekly_report": True})
    gmail_token_encrypted: Mapped[str | None] = mapped_column(Text)


class AutomationRun(Base):
    __tablename__ = "automation_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_name: Mapped[str] = mapped_column(String(40), index=True)
    # Idempotency key, e.g. "discover_jobs:1:2026-11-20". Unique so a slot runs at most once.
    run_key: Mapped[str] = mapped_column(String(120), unique=True)
    trigger: Mapped[str] = mapped_column(String(12), default="schedule")  # schedule | manual | retry
    status: Mapped[str] = mapped_column(String(12), default="queued", index=True)  # queued|running|success|failed
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    stats: Mapped[dict] = mapped_column(JSONB, default=dict)
    log: Mapped[list] = mapped_column(JSONB, default=list)
    error: Mapped[str] = mapped_column(Text, default="")
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text, default="")
    html: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    dedupe_key: Mapped[str] = mapped_column(String(160), unique=True)  # prevents duplicate notifications
    delivery: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"email": "sent"|"failed: ..."|"skipped"}
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class AgentConversation(TimestampMixin, Base):
    __tablename__ = "agent_conversations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    # Full Messages-API transcript (content blocks), replayed append-only on each turn
    transcript: Mapped[list] = mapped_column(JSONB, default=list)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentMessage(Base):
    """Display-friendly chat log (the transcript above holds raw content blocks)."""
    __tablename__ = "agent_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("agent_conversations.id", ondelete="CASCADE"),
                                                 index=True)
    role: Mapped[str] = mapped_column(String(12))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    tool_calls: Mapped[list] = mapped_column(JSONB, default=list)  # [{"name","input","summary"}]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
