from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import NotFound
from app.core.time import now_utc
from app.models import Notification, User
from app.notifications.service import deliver_notification, notify
from app.schemas.common import ORM, Page

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationOut(ORM):
    id: int
    kind: str
    title: str
    body: str
    payload: dict
    delivery: dict
    read_at: object | None
    created_at: object


@router.get("", response_model=Page[NotificationOut])
def list_notifications(unread: bool = False, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100),
                       user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Notification).where(Notification.user_id == user.id)
    if unread:
        q = q.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.scalars(q.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/unread-count")
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"count": db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id,
                                                                         Notification.read_at.is_(None)))}


@router.post("/read-all")
def read_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=now_utc()))
    db.commit()
    return {"ok": True}


@router.post("/{nid}/read")
def read(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise NotFound("Not found")
    n.read_at = now_utc()
    db.commit()
    return {"ok": True}


@router.post("/test")
def test(user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = notify(db, user.id, "test", "Test notification from CareerPilot AI",
               "If you received this, notifications are working.", dedupe_key=f"test:{user.id}:{now_utc().timestamp()}")
    db.commit()
    return {"delivery": n.delivery if n else {}}


@router.post("/{nid}/resend")
def resend(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise NotFound("Not found")
    res = deliver_notification(db, n)
    db.commit()
    return {"delivery": res}
