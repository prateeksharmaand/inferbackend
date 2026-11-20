from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.connectors.base import RawJob, SourceUnavailable
from app.connectors.manual import ManualConnector
from app.connectors.registry import connector_for, ensure_sources
from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import AppError, Conflict, NotFound
from app.core.time import now_utc
from app.models import Application, Job, JobMatch, JobSource, User
from app.schemas.common import Page
from app.schemas.jobs import ImportUrlIn, JobCreate, JobDetail, JobOut, JobUpdate, MatchBrief
from app.services.audit import log_activity
from app.services.job_service import find_duplicate, ingest
from app.services.normalize import normalize

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
SORTS = {"posted": Job.posted_at, "discovered": Job.discovered_at, "score": JobMatch.overall_score,
         "ctc": Job.ctc_max_lpa, "title": Job.title, "company": Job.company_name}


def serialize(db: Session, jobs: list[Job], detail: bool = False) -> list:
    ids = [j.id for j in jobs]
    matches = {m.job_id: m for m in db.scalars(select(JobMatch).where(JobMatch.job_id.in_(ids), JobMatch.is_current))}
    apps = {a.job_id: a for a in db.scalars(select(Application).where(Application.job_id.in_(ids),
                                                                       Application.archived_at.is_(None)))}
    out = []
    for j in jobs:
        cls = JobDetail if detail else JobOut
        base = {c.name: getattr(j, c.name) for c in Job.__table__.columns}
        o = cls.model_validate({**base,
            "skills": [s.name for s in j.skills],
            "source_key": j.source.key if j.source else None,
            "source_name": j.source.name if j.source else None,
            "match": MatchBrief.model_validate(matches[j.id]) if j.id in matches else None,
            "application_id": apps[j.id].id if j.id in apps else None,
            "application_status": apps[j.id].status if j.id in apps else None,
        })
        out.append(o)
    return out


def owned_job(db: Session, user: User, job_id: int) -> Job:
    j = db.get(Job, job_id)
    if not j or j.user_id != user.id:
        raise NotFound("Job not found")
    return j


def apply_filters(q: Select, *, search, location, work_mode, min_ctc, min_score, source, posted_within_hours,
                  status, shortlisted, include_archived, include_dismissed, skill, min_exp, max_exp) -> Select:
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(Job.title.ilike(like), Job.company_name.ilike(like), Job.description.ilike(like)))
    if location:
        q = q.where(or_(*[Job.location.ilike(f"%{l.strip()}%") for l in location.split(",") if l.strip()]))
    if work_mode:
        q = q.where(Job.work_mode.in_(work_mode.split(",")))
    if min_ctc is not None:
        q = q.where(or_(Job.ctc_max_lpa >= min_ctc, Job.ctc_max_lpa.is_(None)))
    if min_score is not None:
        q = q.where(JobMatch.overall_score >= min_score)
    if source:
        q = q.where(JobSource.key.in_(source.split(",")))
    if posted_within_hours:
        cutoff = now_utc() - timedelta(hours=posted_within_hours)
        q = q.where(or_(Job.posted_at >= cutoff, and_(Job.posted_at.is_(None), Job.discovered_at >= cutoff)))
    if status:
        q = q.where(Job.status.in_(status.split(",")))
    if shortlisted:
        q = q.where(Job.shortlisted_at.is_not(None))
    if not include_archived:
        q = q.where(Job.archived_at.is_(None))
    if not include_dismissed:
        q = q.where(Job.dismissed_at.is_(None))
    if skill:
        from app.models import JobSkill
        q = q.where(Job.id.in_(select(JobSkill.job_id).where(JobSkill.name.ilike(f"%{skill}%"))))
    if min_exp is not None:
        q = q.where(or_(Job.experience_max_years.is_(None), Job.experience_max_years >= min_exp))
    if max_exp is not None:
        q = q.where(or_(Job.experience_min_years.is_(None), Job.experience_min_years <= max_exp))
    return q


@router.get("", response_model=Page[JobOut])
def list_jobs(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
              sort: str = Query("posted", pattern="^-?(posted|discovered|score|ctc|title|company)$"),
              search: str | None = None, location: str | None = None, work_mode: str | None = None,
              min_ctc: float | None = None, min_score: int | None = None, source: str | None = None,
              posted_within_hours: int | None = None, status: str | None = None, shortlisted: bool = False,
              include_archived: bool = False, include_dismissed: bool = False, skill: str | None = None,
              min_exp: float | None = None, max_exp: float | None = None,
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = (select(Job).outerjoin(JobMatch, and_(JobMatch.job_id == Job.id, JobMatch.is_current))
         .outerjoin(JobSource, JobSource.id == Job.source_id).where(Job.user_id == user.id))
    q = apply_filters(q, search=search, location=location, work_mode=work_mode, min_ctc=min_ctc, min_score=min_score,
                      source=source, posted_within_hours=posted_within_hours, status=status, shortlisted=shortlisted,
                      include_archived=include_archived, include_dismissed=include_dismissed, skill=skill,
                      min_exp=min_exp, max_exp=max_exp)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    desc = not sort.startswith("-")
    col = SORTS[sort.lstrip("-")]
    order = col.desc().nulls_last() if desc else col.asc().nulls_last()
    q = q.order_by(order, Job.discovered_at.desc(), Job.id.desc()).offset((page - 1) * page_size).limit(page_size)
    jobs = db.scalars(q.options(selectinload(Job.skills), selectinload(Job.source))).unique().all()
    return Page(items=serialize(db, list(jobs)), total=total, page=page, page_size=page_size)


@router.post("", response_model=JobDetail, status_code=201)
def create_job(body: JobCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_sources(db)
    src = db.scalar(select(JobSource).where(JobSource.key == "manual"))
    raw = RawJob(source_key="manual", external_id=None, title=body.title, company=body.company_name, url=body.url,
                 description=body.description, location=body.location, posted_at=body.posted_at,
                 salary_min=body.ctc_min_lpa * 100000 if body.ctc_min_lpa else None,
                 salary_max=body.ctc_max_lpa * 100000 if body.ctc_max_lpa else None, salary_currency="INR",
                 salary_period="year", is_remote=body.work_mode == "remote")
    n = normalize(raw)
    if body.work_mode != "unknown":
        n.work_mode = body.work_mode
    if find_duplicate(db, user.id, n, src.id):
        raise Conflict("This job already exists in your list")
    st = ingest(db, user.id, [n], src, manual=True, require_relevance=False)
    job = db.get(Job, st.job_ids[0])
    job.notes = body.notes
    log_activity(db, user.id, "job.created", f"Added {job.title} at {job.company_name}", entity_type="job",
                 entity_id=job.id)
    db.commit()
    return serialize(db, [job], detail=True)[0]


@router.post("/import-url")
def import_url(body: ImportUrlIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Fetch one public posting page and read its structured data. Returns a preview; nothing is saved
    unless `save=true` succeeds via POST /api/jobs with the (possibly edited) fields."""
    ensure_sources(db)
    gh = db.scalar(select(JobSource).where(JobSource.key == "greenhouse"))
    boards = [b["token"] for b in (gh.config.get("boards", []) if gh else [])]
    try:
        raw = ManualConnector({"greenhouse_boards": boards}).fetch_job_details(body.url)
    except SourceUnavailable as e:
        raise AppError(str(e), code="import_failed") from e
    n = normalize(raw)
    dup = find_duplicate(db, user.id, n, None)
    return {"preview": {"title": n.title, "company_name": n.company, "description": n.description, "url": n.url,
                        "location": n.location, "work_mode": n.work_mode, "ctc_min_lpa": n.ctc_min_lpa,
                        "ctc_max_lpa": n.ctc_max_lpa, "posted_at": n.posted_at, "skills": n.skills,
                        "source_key": raw.source_key},
            "duplicate_of": dup.id if dup else None}


@router.get("/{job_id}", response_model=JobDetail)
def get_job(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return serialize(db, [owned_job(db, user, job_id)], detail=True)[0]


@router.patch("/{job_id}", response_model=JobDetail)
def update_job(job_id: int, body: JobUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = owned_job(db, user, job_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(j, k, v)
    db.commit()
    return serialize(db, [j], detail=True)[0]


@router.post("/{job_id}/shortlist", response_model=JobOut)
def shortlist(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.services.applications import ensure_application
    j = owned_job(db, user, job_id)
    j.shortlisted_at = j.shortlisted_at or now_utc()
    j.dismissed_at = None
    ensure_application(db, user, j, status="shortlisted", note="Shortlisted")
    log_activity(db, user.id, "job.shortlisted", f"Shortlisted {j.title} at {j.company_name}", entity_type="job",
                 entity_id=j.id)
    db.commit()
    return serialize(db, [j])[0]


@router.delete("/{job_id}/shortlist", response_model=JobOut)
def unshortlist(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = owned_job(db, user, job_id)
    j.shortlisted_at = None
    db.commit()
    return serialize(db, [j])[0]


@router.post("/{job_id}/dismiss", response_model=JobOut)
def dismiss(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = owned_job(db, user, job_id)
    j.dismissed_at = now_utc()
    db.commit()
    return serialize(db, [j])[0]


@router.delete("/{job_id}", status_code=204)
def archive(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = owned_job(db, user, job_id)
    j.archived_at = now_utc()
    j.status = "archived"
    db.commit()


@router.post("/{job_id}/verify", response_model=JobDetail)
def verify(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = owned_job(db, user, job_id)
    conn = connector_for(j.source) if j.source and j.source.kind != "restricted" else ManualConnector()
    res = conn.verify_job(j.url, j.external_id)
    if res.status != "unverified" or j.status == "unverified":
        j.status = res.status
    j.last_verified_at = now_utc()
    j.raw = {**(j.raw or {}), "last_verify": res.detail}
    db.commit()
    return serialize(db, [j], detail=True)[0]
