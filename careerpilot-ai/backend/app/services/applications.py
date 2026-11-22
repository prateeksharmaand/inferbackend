from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import now_utc
from app.models import Application, ApplicationStatusHistory, Job, User
from app.models.enums import APPLIED_OR_LATER, ApplicationStatus
from app.services.profile_service import get_or_create_profile


def active_application(db: Session, user_id: int, job_id: int) -> Application | None:
    return db.scalar(select(Application).where(Application.user_id == user_id, Application.job_id == job_id,
                                               Application.archived_at.is_(None)))


def ensure_application(db: Session, user: User, job: Job, *, status: str = "shortlisted", note: str = "",
                       actor: str = "user") -> Application:
    app = active_application(db, user.id, job.id)
    if app:
        return app
    p = get_or_create_profile(db, user)
    app = Application(user_id=user.id, profile_id=p.id, job_id=job.id, status=status,
                      expected_ctc_lpa=p.target_ctc_min_lpa)
    db.add(app)
    db.flush()
    db.add(ApplicationStatusHistory(application_id=app.id, from_status=None, to_status=status, note=note,
                                    changed_by=actor))
    return app


def change_status(db: Session, app: Application, new: str, *, note: str = "", actor: str = "user") -> None:
    new = ApplicationStatus(new)
    if app.status == new:
        return
    if new == ApplicationStatus.applied and not app.approved_at:
        # Marking as applied is itself the candidate's explicit confirmation.
        app.approved_at = now_utc()
    if new in APPLIED_OR_LATER and not app.applied_at:
        app.applied_at = now_utc()
    db.add(ApplicationStatusHistory(application_id=app.id, from_status=app.status, to_status=new, note=note,
                                    changed_by=actor))
    app.status = new
