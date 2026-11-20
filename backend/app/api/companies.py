from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import NotFound
from app.models import Company, Job, User
from app.schemas.common import Page
from app.schemas.jobs import CompanyOut, CompanyUpdate

router = APIRouter(prefix="/api/companies", tags=["companies"])


def _owned(db, user, cid) -> Company:
    c = db.get(Company, cid)
    if not c or c.user_id != user.id:
        raise NotFound("Company not found")
    return c


@router.get("", response_model=Page[CompanyOut])
def list_companies(page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), search: str | None = None,
                   researched: bool | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    open_jobs = (select(Job.company_id, func.count(Job.id).label("n")).where(Job.user_id == user.id,
                 Job.archived_at.is_(None), Job.status != "expired").group_by(Job.company_id).subquery())
    q = (select(Company, func.coalesce(open_jobs.c.n, 0)).outerjoin(open_jobs, open_jobs.c.company_id == Company.id)
         .where(Company.user_id == user.id, Company.archived_at.is_(None)))
    if search:
        q = q.where(Company.name.ilike(f"%{search}%"))
    if researched is not None:
        q = q.where((Company.research_status == "done") if researched else (Company.research_status != "done"))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(func.coalesce(open_jobs.c.n, 0).desc(), Company.name)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    items = [CompanyOut.model_validate(c).model_copy(update={"open_jobs": n}) for c, n in rows]
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{cid}", response_model=CompanyOut)
def get_company(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _owned(db, user, cid)


@router.patch("/{cid}", response_model=CompanyOut)
def update_company(cid: int, body: CompanyUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned(db, user, cid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    return c
