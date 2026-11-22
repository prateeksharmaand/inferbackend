from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, utcnow


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # null = built-in
    topic: Mapped[str] = mapped_column(String(40), index=True)
    subtopic: Mapped[str] = mapped_column(String(80), default="")
    difficulty: Mapped[str] = mapped_column(String(10), default="senior")  # mid|senior|lead
    kind: Mapped[str] = mapped_column(String(12), default="technical")  # technical|scenario|behavioral
    question: Mapped[str] = mapped_column(Text)
    key_points: Mapped[list] = mapped_column(JSONB, default=list)


class MockInterviewSession(Base):
    __tablename__ = "mock_interview_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    target_role: Mapped[str] = mapped_column(String(120), default="")
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    topics: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(12), default="in_progress")  # in_progress|completed
    overall_score: Mapped[float | None] = mapped_column()
    summary: Mapped[str] = mapped_column(Text, default="")
    weaknesses: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    answers: Mapped[list["MockInterviewAnswer"]] = relationship(cascade="all, delete-orphan",
                                                                order_by="MockInterviewAnswer.position")


class MockInterviewAnswer(Base):
    __tablename__ = "mock_interview_answers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("mock_interview_sessions.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int | None] = mapped_column(ForeignKey("interview_questions.id", ondelete="SET NULL"))
    position: Mapped[int] = mapped_column(Integer)
    topic: Mapped[str] = mapped_column(String(40))
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
    score: Mapped[float | None] = mapped_column()  # 0-10
    strengths: Mapped[list] = mapped_column(JSONB, default=list)
    gaps: Mapped[list] = mapped_column(JSONB, default=list)
    suggested_answer: Mapped[str] = mapped_column(Text, default="")
    feedback: Mapped[str] = mapped_column(Text, default="")
    evaluated_by: Mapped[str] = mapped_column(String(60), default="")
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
