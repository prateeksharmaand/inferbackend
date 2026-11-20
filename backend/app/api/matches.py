from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, selectinload

from app.api.jobs import owned_job, serialize
from app.automation.runner import create_run  # noqa: F401
from app.core.db import get_db
from app.core.deps import current_user
from app.matching.engine import score_job, unscored_job_ids
from app.models import Job, JobMatch, User
from app.schemas.apps import MatchOut, MatchRunIn
from app.schemas.common import Page
from app.schemas.jobs import JobOut
from app.services.profile_service import get_or_create_profile

router = APIRouter(prefix="/api/matches", tags=["matching"])


@router.get("/shortlist", response_model=Page[JobOut])
def ai_shortlist(min_score: int = Query(55, ge=0, le=100), classification: str | None = None,
                 page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = (select(Job).join(JobMatch, and_(JobMatch.job_id == Job.id, JobMatch.is_current))
         .where(Job.user_id == user.id, Job.archived_at.is_(None), Job.dismissed_at.is_(None),
                Job.status != "expired", JobMatch.overall_score >= min_score))
    if classification:
        q = q.where(JobMatch.classification == classification)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    jobs = db.scalars(q.order_by(JobMatch.overall_score.desc(), Job.posted_at.desc().nulls_last())
                      .offset((page - 1) * page_size).limit(page_size)
                      .options(selectinload(Job.skills), selectinload(Job.source))).all()
    return Page(items=serialize(db, list(jobs)), total=total, page=page, page_size=page_size)


@router.get("/job/{job_id}", response_model=list[MatchOut])
def match_history(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_job(db, user, job_id)
    return db.scalars(select(JobMatch).where(JobMatch.job_id == job_id).order_by(JobMatch.created_at.desc())).all()


@router.post("/job/{job_id}", response_model=MatchOut)
def match_one(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = owned_job(db, user, job_id)
    m = score_job(db, job, get_or_create_profile(db, user))
    db.commit()
    return m


@router.post("/run")
def run_matching(body: MatchRunIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_or_create_profile(db, user)
    ids = body.job_ids or unscored_job_ids(db, user.id, body.limit)
    results = []
    for jid in ids[: body.limit]:
        job = owned_job(db, user, jid)
        m = score_job(db, job, p)
        db.commit()
        results.append({"job_id": jid, "score": m.overall_score, "model": m.model})
    return {"scored": len(results), "results": results}


__all__ = ["JobOut"]
