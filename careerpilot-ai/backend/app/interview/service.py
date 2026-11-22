import random

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import now_utc
from app.interview.bank import Q
from app.models import InterviewQuestion, Job, MockInterviewAnswer, MockInterviewSession
from app.services import ai

TOPICS = ["flutter", "architecture", "security", "firebase", "android", "ios", "devops", "leadership"]


def seed_bank(db: Session) -> int:
    if db.scalar(select(func.count(InterviewQuestion.id)).where(InterviewQuestion.user_id.is_(None))):
        return 0
    for topic, sub, kind, diff, q, kp in Q:
        db.add(InterviewQuestion(user_id=None, topic=topic, subtopic=sub, kind=kind, difficulty=diff, question=q,
                                 key_points=kp))
    db.flush()
    return len(Q)


class GeneratedQuestion(BaseModel):
    topic: str
    question: str
    key_points: list[str]


class GeneratedSet(BaseModel):
    questions: list[GeneratedQuestion]


def build_session(db: Session, user_id: int, *, title: str, topics: list[str], count: int, job: Job | None,
                  target_role: str) -> MockInterviewSession:
    seed_bank(db)
    topics = [t for t in topics if t in TOPICS] or TOPICS
    pool = db.scalars(select(InterviewQuestion).where(InterviewQuestion.topic.in_(topics),
                                                      (InterviewQuestion.user_id.is_(None)) |
                                                      (InterviewQuestion.user_id == user_id))).all()
    # Prefer questions not answered recently
    seen = set(db.scalars(select(MockInterviewAnswer.question_id).join(MockInterviewSession).where(
        MockInterviewSession.user_id == user_id)))
    fresh = [q for q in pool if q.id not in seen] or list(pool)
    random.shuffle(fresh)
    picked = fresh[:count]
    s = MockInterviewSession(user_id=user_id, title=title, target_role=target_role, job_id=job.id if job else None,
                             topics=topics)
    db.add(s)
    db.flush()
    extra: list[GeneratedQuestion] = []
    if job:
        try:
            gen = ai.structured("You are a senior interviewer. Write interview questions specific to this job "
                                "description for a Flutter/mobile lead candidate, with the key points a strong "
                                "answer covers.", f"Job: {job.title} at {job.company_name}\n{job.description[:6000]}\n"
                                "Write 3 questions.", GeneratedSet, max_tokens=3000, effort="low")
            extra = gen.questions[:3]
        except ai.AIUnavailable:
            extra = []
    pos = 0
    for q in picked:
        s.answers.append(MockInterviewAnswer(question_id=q.id, position=pos, topic=q.topic, question=q.question))
        pos += 1
    for g in extra:
        s.answers.append(MockInterviewAnswer(position=pos, topic=g.topic or "job", question=g.question,
                                             suggested_answer="Key points: " + "; ".join(g.key_points)))
        pos += 1
    db.flush()
    return s


class Evaluation(BaseModel):
    score: float = Field(description="0-10")
    strengths: list[str]
    gaps: list[str]
    suggested_answer: str = Field(description="A strong model answer, 120-250 words")
    feedback: str = Field(description="2-3 sentences of direct, actionable feedback")


EVAL_SYSTEM = """You are an experienced interviewer for Flutter Technical Lead / Mobile Architect roles in India.
Evaluate the candidate's answer honestly: score 0-10 (7 = solid hire-level answer for a lead, 9+ = exceptional).
Judge only what the answer says. Be specific about missing points. The suggested answer should be what a strong
lead would say; do not claim facts about the candidate's past. Never use gendered pronouns for the candidate."""


def evaluate(ans: MockInterviewAnswer, key_points: list[str]) -> None:
    try:
        r = ai.structured(EVAL_SYSTEM, f"Question: {ans.question}\nKey points expected: {'; '.join(key_points) or 'n/a'}"
                          f"\n\nCandidate answer:\n{ans.answer}", Evaluation, max_tokens=3000, effort="low")
        ans.score = max(0.0, min(10.0, float(r.score)))
        ans.strengths, ans.gaps = r.strengths[:6], r.gaps[:6]
        ans.suggested_answer, ans.feedback, ans.evaluated_by = r.suggested_answer, r.feedback, ai.model_name()
    except ai.AIUnavailable:
        _rules_evaluate(ans, key_points)


def _rules_evaluate(ans: MockInterviewAnswer, key_points: list[str]) -> None:
    text = ans.answer.lower()
    hit, miss = [], []
    for kp in key_points:
        words = [w for w in kp.lower().replace("/", " ").replace("(", " ").replace(")", " ").split() if len(w) > 3]
        (hit if words and sum(w in text for w in words) >= max(1, len(words) // 2) else miss).append(kp)
    coverage = len(hit) / len(key_points) if key_points else 0.5
    length_bonus = min(1.5, len(ans.answer.split()) / 120)
    ans.score = round(min(10.0, coverage * 8.5 + length_bonus), 1)
    ans.strengths = [f"Covered: {k}" for k in hit][:6]
    ans.gaps = [f"Missing: {k}" for k in miss][:6]
    ans.suggested_answer = ans.suggested_answer or ("A strong answer covers: " + "; ".join(key_points))
    ans.feedback = (f"Covered {len(hit)} of {len(key_points)} key points. Keyword-based estimate (Claude unavailable)."
                    if key_points else "Keyword-based estimate (Claude unavailable).")
    ans.evaluated_by = "rules-v1"


def finish(db: Session, s: MockInterviewSession) -> None:
    answered = [a for a in s.answers if a.score is not None]
    s.overall_score = round(sum(a.score for a in answered) / len(answered), 1) if answered else None
    by_topic: dict[str, list[float]] = {}
    for a in answered:
        by_topic.setdefault(a.topic, []).append(a.score)
    weak = sorted(((sum(v) / len(v), t) for t, v in by_topic.items()))
    s.weaknesses = [f"{t} (avg {avg:.1f}/10)" for avg, t in weak if avg < 7][:5]
    gaps = [g for a in answered for g in (a.gaps or [])][:8]
    s.summary = (f"Answered {len(answered)}/{len(s.answers)} questions. Average {s.overall_score}/10. "
                 + (f"Focus areas: {', '.join(s.weaknesses)}. " if s.weaknesses else "No weak topics below 7/10. ")
                 + (f"Common gaps: {'; '.join(gaps[:4])}." if gaps else ""))
    s.status, s.completed_at = "completed", now_utc()
