from datetime import date, datetime, time, timedelta, timezone

from app.core.config import settings


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_local() -> datetime:
    return datetime.now(settings.tz)


def local_today() -> date:
    return now_local().date()


def local_time_to_utc(d: date, hhmm: str) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return datetime.combine(d, time(h, m), tzinfo=settings.tz).astimezone(timezone.utc)


def fmt_local(dt: datetime | None) -> str:
    if not dt:
        return "—"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(settings.tz).strftime("%d %b %Y, %I:%M %p IST")


def days_ago(n: int) -> datetime:
    return now_utc() - timedelta(days=n)
