from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import AppError, Conflict, NotFound
from app.core.time import now_utc
from app.models import Company, Job, Recruiter, User
from app.schemas.apps import RecruiterIn, RecruiterOut
from app.schemas.common import Page
from app.schemas.jobs import CompanyOut
from app.services.audit import log_activity
from app.services.job_service import get_or_create_company
from app.services.research import discover_contacts, research_company

router = APIRouter(tags=["recruiters"])


def _owned(db, user, rid) -> Recruiter:
    r = db.get(Recruiter, rid)
    if not r or r.user_id != user.id:
        raise NotFound("Contact not found")
    return r


@router.get("/api/recruiters", response_model=Page[RecruiterOut])
def list_recruiters(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), search: str | None = None,
                    company_id: int | None = None, verification: str | None = None,
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Recruiter).where(Recruiter.user_id == user.id, Recruiter.archived_at.is_(None))
    if search:
        q = q.where(or_(Recruiter.name.ilike(f"%{search}%"), Recruiter.company_name.ilike(f"%{search}%"),
                        Recruiter.designation.ilike(f"%{search}%")))
    if company_id:
        q = q.where(Recruiter.company_id == company_id)
    if verification:
        q = q.where(Recruiter.verification_status == verification)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.scalars(q.order_by(Recruiter.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("/api/recruiters", response_model=RecruiterOut, status_code=201)
def create_recruiter(body: RecruiterIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    data = body.model_dump()
    if body.company_name and not body.company_id:
        data["company_id"] = get_or_create_company(db, user.id, body.company_name).id
    if body.linkedin_url and db.scalar(select(Recruiter).where(Recruiter.user_id == user.id,
                                                              Recruiter.linkedin_url == body.linkedin_url)):
        raise Conflict("A contact with this LinkedIn URL already exists")
    r = Recruiter(user_id=user.id, discovered_by="user", **data)
    db.add(r)
    log_activity(db, user.id, "recruiter.created", r.name, entity_type="recruiter")
    db.commit()
    return r


@router.patch("/api/recruiters/{rid}", response_model=RecruiterOut)
def update_recruiter(rid: int, body: RecruiterIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _owned(db, user, rid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    return r


@router.post("/api/recruiters/{rid}/responded", response_model=RecruiterOut)
def mark_responded(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.notifications.service import notify
    r = _owned(db, user, rid)
    r.responded_at = now_utc()
    notify(db, user.id, "recruiter_response", f"{r.name} ({r.company_name}) responded",
           f"Logged a response from {r.name}, {r.designation} at {r.company_name}.",
           dedupe_key=f"resp:{r.id}:{r.responded_at:%Y%m%d%H%M}", deliver=False)
    db.commit()
    return r


@router.delete("/api/recruiters/{rid}", status_code=204)
def archive_recruiter(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _owned(db, user, rid).archived_at = now_utc()
    db.commit()


def _company(db, user, cid) -> Company:
    c = db.get(Company, cid)
    if not c or c.user_id != user.id:
        raise NotFound("Company not found")
    return c


@router.post("/api/companies/{cid}/research", response_model=CompanyOut)
def research(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not settings.ai_configured:
        raise AppError("Company research needs the Claude API (set ANTHROPIC_API_KEY).", status_code=503,
                       code="ai_unavailable")
    c = research_company(db, _company(db, user, cid), user.id)
    db.commit()
    return c


@router.post("/api/companies/{cid}/discover-contacts")
def discover(cid: int, job_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not settings.ai_configured:
        raise AppError("Recruiter discovery needs the Claude API (set ANTHROPIC_API_KEY).", status_code=503,
                       code="ai_unavailable")
    c = _company(db, user, cid)
    title = ""
    if job_id:
        j = db.get(Job, job_id)
        title = j.title if j and j.user_id == user.id else ""
    res = discover_contacts(db, c, user.id, title)
    db.commit()
    return res
