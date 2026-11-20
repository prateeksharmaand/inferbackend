from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import AppError, NotFound
from app.core.time import now_utc
from app.interview.service import TOPICS, build_session, evaluate, finish, seed_bank
from app.models import InterviewQuestion, Job, MockInterviewAnswer, MockInterviewSession, User
from app.schemas.common import ORM

router = APIRouter(prefix="/api/interview-coach", tags=["interview coach"])


class QuestionOut(ORM):
    id: int
    topic: str
    subtopic: str
    difficulty: str
    kind: str
    question: str
    key_points: list[str]
    custom: bool = False


class QuestionIn(BaseModel):
    topic: str = Field(pattern="^(" + "|".join(TOPICS) + ")$")
    subtopic: str = ""
    kind: str = Field("technical", pattern="^(technical|scenario|behavioral)$")
    difficulty: str = Field("senior", pattern="^(mid|senior|lead)$")
    question: str = Field(min_length=10)
    key_points: list[str] = []


class AnswerOut(ORM):
    id: int
    position: int
    topic: str
    question: str
    answer: str
    score: float | None
    strengths: list[str]
    gaps: list[str]
    suggested_answer: str
    feedback: str
    evaluated_by: str


class SessionOut(ORM):
    id: int
    title: str
    target_role: str
    job_id: int | None
    topics: list[str]
    status: str
    overall_score: float | None
    summary: str
    weaknesses: list[str]
    created_at: object
    completed_at: object | None
    answers: list[AnswerOut] = []


class SessionIn(BaseModel):
    topics: list[str] = []
    count: int = Field(6, ge=1, le=20)
    job_id: int | None = None
    target_role: str = "Flutter Technical Lead"


class AnswerIn(BaseModel):
    answer: str = Field(min_length=1, max_length=10000)


@router.get("/topics")
def topics():
    return TOPICS


@router.get("/questions", response_model=list[QuestionOut])
def questions(topic: str | None = None, kind: str | None = None, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    seed_bank(db)
    db.commit()
    q = select(InterviewQuestion).where((InterviewQuestion.user_id.is_(None)) | (InterviewQuestion.user_id == user.id))
    if topic:
        q = q.where(InterviewQuestion.topic == topic)
    if kind:
        q = q.where(InterviewQuestion.kind == kind)
    return [QuestionOut.model_validate(x).model_copy(update={"custom": x.user_id is not None})
            for x in db.scalars(q.order_by(InterviewQuestion.topic, InterviewQuestion.id))]


@router.post("/questions", response_model=QuestionOut, status_code=201)
def add_question(body: QuestionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = InterviewQuestion(user_id=user.id, **body.model_dump())
    db.add(q)
    db.commit()
    return QuestionOut.model_validate(q).model_copy(update={"custom": True})


@router.get("/sessions", response_model=list[SessionOut])
def sessions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(MockInterviewSession).where(MockInterviewSession.user_id == user.id)
                      .order_by(MockInterviewSession.created_at.desc()).limit(50)).all()


@router.post("/sessions", response_model=SessionOut, status_code=201)
def start(body: SessionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = None
    if body.job_id:
        job = db.get(Job, body.job_id)
        if not job or job.user_id != user.id:
            raise NotFound("Job not found")
    title = f"Mock interview — {job.title + ' @ ' + job.company_name if job else body.target_role}"
    s = build_session(db, user.id, title=title, topics=body.topics, count=body.count, job=job,
                      target_role=body.target_role)
    db.commit()
    return s


def _session(db, user, sid) -> MockInterviewSession:
    s = db.get(MockInterviewSession, sid)
    if not s or s.user_id != user.id:
        raise NotFound("Session not found")
    return s


@router.get("/sessions/{sid}", response_model=SessionOut)
def get_session(sid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _session(db, user, sid)


@router.post("/sessions/{sid}/answers/{aid}", response_model=AnswerOut)
def answer(sid: int, aid: int, body: AnswerIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _session(db, user, sid)
    a = next((x for x in s.answers if x.id == aid), None)
    if not a:
        raise NotFound("Question not in session")
    if s.status == "completed":
        raise AppError("Session already completed")
    a.answer, a.answered_at = body.answer, now_utc()
    kp = []
    if a.question_id:
        qq = db.get(InterviewQuestion, a.question_id)
        kp = qq.key_points if qq else []
    elif a.suggested_answer.startswith("Key points: "):
        kp = a.suggested_answer.removeprefix("Key points: ").split("; ")
    evaluate(a, kp)
    db.commit()
    return a


@router.post("/sessions/{sid}/complete", response_model=SessionOut)
def complete(sid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _session(db, user, sid)
    finish(db, s)
    db.commit()
    return s


@router.get("/progress")
def progress(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(MockInterviewAnswer.topic, func.avg(MockInterviewAnswer.score),
                             func.count(MockInterviewAnswer.id)).join(MockInterviewSession)
                      .where(MockInterviewSession.user_id == user.id, MockInterviewAnswer.score.is_not(None))
                      .group_by(MockInterviewAnswer.topic)).all()
    trend = db.execute(select(MockInterviewSession.completed_at, MockInterviewSession.overall_score)
                       .where(MockInterviewSession.user_id == user.id, MockInterviewSession.status == "completed")
                       .order_by(MockInterviewSession.completed_at)).all()
    return {"by_topic": [{"topic": t, "avg_score": round(float(a), 1), "answers": n} for t, a, n in rows],
            "trend": [{"date": d, "score": s} for d, s in trend],
            "sessions_completed": len(trend)}
