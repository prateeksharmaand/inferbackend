"""Create + deliver notifications. `dedupe_key` is unique, so the same event is never notified twice
(e.g. the digest for a given day, an excellent-match alert for a given job)."""
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import AgentSettings, Notification, User
from app.notifications import channels


def notify(db: Session, user_id: int, kind: str, title: str, body: str, *, dedupe_key: str,
           html: str | None = None, payload: dict | None = None, deliver: bool = True) -> Notification | None:
    stmt = insert(Notification).values(user_id=user_id, kind=kind, title=title[:255], body=body, html=html,
                                       payload=payload or {}, dedupe_key=dedupe_key[:160], delivery={}
                                       ).on_conflict_do_nothing(index_elements=["dedupe_key"]).returning(Notification.id)
    nid = db.scalar(stmt)
    if nid is None:
        return None  # already notified
    n = db.get(Notification, nid)
    if deliver:
        deliver_notification(db, n)
    return n


def deliver_notification(db: Session, n: Notification) -> dict:
    st = db.scalar(select(AgentSettings).where(AgentSettings.user_id == n.user_id))
    user = db.get(User, n.user_id)
    wanted = (st.notify_channels if st else ["email", "telegram"])
    events = (st.notify_events if st else {})
    result = {}
    if events and not events.get(n.kind, True):
        result = {"all": "skipped: event disabled"}
    else:
        if "email" in wanted:
            try:
                channels.send_email(channels.settings.NOTIFY_EMAIL_TO or user.email, f"[CareerPilot] {n.title}",
                                    n.body, n.html)
                result["email"] = "sent"
            except channels.ChannelError as e:
                result["email"] = f"failed: {e}" if channels.email_configured() else "skipped: not configured"
        if "telegram" in wanted:
            try:
                channels.send_telegram(f"{n.title}\n\n{n.body}")
                result["telegram"] = "sent"
            except channels.ChannelError as e:
                result["telegram"] = f"failed: {e}" if channels.telegram_configured() else "skipped: not configured"
    n.delivery = result
    return result
