import re

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.automation.pipeline import LABELS, STEPS
from app.automation.runner import create_run, dispatch
from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import AppError, NotFound
from app.core.time import now_utc
from app.models import AutomationRun, User
from app.schemas.common import ORM, Page
from app.services.discovery import settings_for

router = APIRouter(prefix="/api/automation", tags=["automation"])
TIME = re.compile(r"^((MON|TUE|WED|THU|FRI|SAT|SUN) )?([01]\d|2[0-3]):[0-5]\d$")


class SettingsOut(ORM):
    automation_enabled: bool
    schedule: dict
    disabled_tasks: list[str]
    keywords: list[str]
    locations: list[str]
    work_modes: list[str]
    min_ctc_lpa: float | None
    min_match_score: int
    posted_within_hours: int
    max_ai_matches_per_run: int
    max_research_per_run: int
    auto_prepare_min_score: int
    max_auto_prepare_per_run: int
    notify_channels: list[str]
    notify_events: dict


class SettingsIn(BaseModel):
    automation_enabled: bool | None = None
    schedule: dict[str, str] | None = None
    disabled_tasks: list[str] | None = None
    keywords: list[str] | None = Field(None, max_length=30)
    locations: list[str] | None = Field(None, max_length=30)
    work_modes: list[str] | None = None
    min_ctc_lpa: float | None = Field(None, ge=0, le=1000)
    min_match_score: int | None = Field(None, ge=0, le=100)
    posted_within_hours: int | None = Field(None, ge=12, le=720)
    max_ai_matches_per_run: int | None = Field(None, ge=1, le=200)
    max_research_per_run: int | None = Field(None, ge=0, le=30)
    auto_prepare_min_score: int | None = Field(None, ge=55, le=100)
    max_auto_prepare_per_run: int | None = Field(None, ge=0, le=10)
    notify_channels: list[str] | None = None
    notify_events: dict[str, bool] | None = None

    @field_validator("schedule")
    @classmethod
    def _sched(cls, v):
        if v is None:
            return v
        for k, t in v.items():
            if k not in STEPS:
                raise ValueError(f"unknown task {k}")
            if not TIME.match(t):
                raise ValueError(f"{k}: use HH:MM or 'SUN HH:MM' (24h, Asia/Kolkata)")
        return v

    @field_validator("notify_channels")
    @classmethod
    def _ch(cls, v):
        if v and any(c not in ("email", "telegram") for c in v):
            raise ValueError("channels: email, telegram")
        return v


class RunOut(ORM):
    id: int
    task_name: str
    run_key: str
    trigger: str
    status: str
    attempt: int
    stats: dict
    log: list[str]
    error: str
    queued_at: object
    started_at: object | None
    finished_at: object | None


@router.get("/settings", response_model=SettingsOut)
def get_settings(user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = settings_for(db, user.id)
    db.commit()
    return s


@router.patch("/settings", response_model=SettingsOut)
def update_settings(body: SettingsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = settings_for(db, user.id)
    data = body.model_dump(exclude_unset=True)
    if "schedule" in data:
        data["schedule"] = {**s.schedule, **data["schedule"]}
    for k, v in data.items():
        setattr(s, k, v)
    db.commit()
    return s


@router.get("/tasks")
def tasks(user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = settings_for(db, user.id)
    last = {}
    for name in STEPS:
        r = db.scalar(select(AutomationRun).where(AutomationRun.user_id == user.id, AutomationRun.task_name == name)
                      .order_by(AutomationRun.queued_at.desc()).limit(1))
        last[name] = {"status": r.status, "at": r.finished_at or r.queued_at, "id": r.id} if r else None
    return [{"name": n, "label": LABELS[n], "schedule": s.schedule.get(n), "enabled": n not in (s.disabled_tasks or []),
             "last_run": last[n]} for n in STEPS]


@router.post("/run/{task}", response_model=RunOut)
def run_now(task: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if task not in STEPS:
        raise NotFound("Unknown task")
    running = db.scalar(select(AutomationRun).where(AutomationRun.user_id == user.id, AutomationRun.task_name == task,
                                                    AutomationRun.status.in_(["queued", "running"])))
    if running:
        raise AppError("This task is already running", status_code=409, code="already_running")
    run = create_run(db, user.id, task, f"{task}:{user.id}:manual:{now_utc():%Y%m%d%H%M%S%f}", "manual")
    run.stats = {"dispatched_via": dispatch(run.id)}
    db.commit()
    return run


@router.post("/runs/{run_id}/retry", response_model=RunOut)
def retry(run_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    old = db.get(AutomationRun, run_id)
    if not old or old.user_id != user.id:
        raise NotFound("Run not found")
    if old.status != "failed":
        raise AppError("Only failed runs can be retried")
    run = create_run(db, user.id, old.task_name, f"{old.run_key}:retry{old.attempt + 1}", "retry", old.attempt + 1)
    if not run:
        raise AppError("A retry for this run already exists", status_code=409)
    dispatch(run.id)
    return run


@router.get("/runs", response_model=Page[RunOut])
def runs(task: str | None = None, status: str | None = None, page: int = Query(1, ge=1),
         page_size: int = Query(30, ge=1, le=100), user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(AutomationRun).where(AutomationRun.user_id == user.id)
    if task:
        q = q.where(AutomationRun.task_name == task)
    if status:
        q = q.where(AutomationRun.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.scalars(q.order_by(AutomationRun.queued_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(AutomationRun, run_id)
    if not r or r.user_id != user.id:
        raise NotFound("Run not found")
    return r
