from sqlalchemy.orm import Session

from app.models import ActivityLog


def log_activity(db: Session, user_id: int | None, action: str, summary: str = "", *, entity_type: str | None = None,
                 entity_id: int | None = None, actor: str = "user", details: dict | None = None,
                 ip: str | None = None) -> None:
    db.add(ActivityLog(user_id=user_id, action=action, summary=summary[:2000], entity_type=entity_type,
                       entity_id=entity_id, actor=actor, details=details or {}, ip=ip))
