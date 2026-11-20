from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import NotFound
from app.models import CandidateProject, CandidateSkill, EmploymentHistory, User
from app.schemas.profile import (EmploymentIn, EmploymentOut, ProfileOut, ProfileUpdate, ProjectIn, ProjectOut,
                                 SkillIn, SkillOut)
from app.services.audit import log_activity
from app.services.profile_service import compute_confirmations, get_or_create_profile
from app.services.skills_catalog import canonical, norm

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _refresh(db, p):
    p.needs_confirmation = compute_confirmations(p, [n for n in [] if n])
    db.commit()
    db.refresh(p)
    return p


@router.get("", response_model=ProfileOut)
def get_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_or_create_profile(db, user)
    db.commit()
    return p


@router.patch("", response_model=ProfileOut)
def update_profile(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_or_create_profile(db, user)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    log_activity(db, user.id, "profile.updated", f"Updated {', '.join(data)}", entity_type="profile", entity_id=p.id)
    return _refresh(db, p)


@router.post("/skills", response_model=SkillOut, status_code=201)
def add_skill(body: SkillIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_or_create_profile(db, user)
    name = canonical(body.name)
    existing = next((s for s in p.skills if norm(s.name) == norm(name)), None)
    if existing:
        existing.category, existing.years, existing.confirmed = body.category, body.years, body.confirmed
        s = existing
    else:
        s = CandidateSkill(name=name[:80], category=body.category, years=body.years, source="user",
                           confirmed=body.confirmed)
        p.skills.append(s)
    _refresh(db, p)
    return s


@router.patch("/skills/{skill_id}", response_model=SkillOut)
def update_skill(skill_id: int, body: SkillIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_or_create_profile(db, user)
    s = next((s for s in p.skills if s.id == skill_id), None)
    if not s:
        raise NotFound("Skill not found")
    s.name, s.category, s.years, s.confirmed = canonical(body.name)[:80], body.category, body.years, body.confirmed
    _refresh(db, p)
    return s


@router.delete("/skills/{skill_id}", status_code=204)
def delete_skill(skill_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_or_create_profile(db, user)
    s = next((s for s in p.skills if s.id == skill_id), None)
    if not s:
        raise NotFound("Skill not found")
    p.skills.remove(s)
    _refresh(db, p)


def _crud_child(kind, model, schema_in, schema_out, attr):
    @router.post(f"/{kind}", response_model=schema_out, status_code=201, name=f"add_{kind}")
    def add(body: schema_in, user: User = Depends(current_user), db: Session = Depends(get_db)):
        p = get_or_create_profile(db, user)
        obj = model(**body.model_dump(), sort_order=len(getattr(p, attr)))
        getattr(p, attr).append(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @router.put(f"/{kind}/{{item_id}}", response_model=schema_out, name=f"update_{kind}")
    def update(item_id: int, body: schema_in, user: User = Depends(current_user), db: Session = Depends(get_db)):
        p = get_or_create_profile(db, user)
        obj = next((x for x in getattr(p, attr) if x.id == item_id), None)
        if not obj:
            raise NotFound("Not found")
        for k, v in body.model_dump().items():
            setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        return obj

    @router.delete(f"/{kind}/{{item_id}}", status_code=204, name=f"delete_{kind}")
    def delete(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        p = get_or_create_profile(db, user)
        obj = next((x for x in getattr(p, attr) if x.id == item_id), None)
        if not obj:
            raise NotFound("Not found")
        getattr(p, attr).remove(obj)
        db.commit()


_crud_child("employment", EmploymentHistory, EmploymentIn, EmploymentOut, "employment")
_crud_child("projects", CandidateProject, ProjectIn, ProjectOut, "projects")
