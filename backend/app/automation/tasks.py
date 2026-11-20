from datetime import timedelta

from sqlalchemy import select

from app.automation.celery_app import celery
from app.automation.runner import create_run, execute_run
from app.core.db import SessionLocal
from app.core.time import local_today, now_local, now_utc
from app.models import AgentSettings, AutomationRun

DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def due_slots(schedule: dict, disabled: list[str], now) -> list[tuple[str, str]]:
    """Return [(task, run_key_suffix)] whose scheduled time (IST) has passed today/this week."""
    out = []
    for task, spec in schedule.items():
        if task in disabled:
            continue
        parts = spec.split()
        if len(parts) == 2:  # weekly "SUN 19:00"
            day, hhmm = parts
            if DAYS[now.weekday()] != day.upper():
                continue
            suffix = f"{now.isocalendar().year}-W{now.isocalendar().week}"
        else:
            hhmm = parts[0]
            suffix = now.date().isoformat()
        h, m = (int(x) for x in hhmm.split(":"))
        if (now.hour, now.minute) >= (h, m) and now.hour - h < 6:  # don't backfill more than 6h late
            out.append((task, suffix))
    return out


@celery.task(name="app.automation.tasks.tick")
def tick():
    db = SessionLocal()
    try:
        now = now_local()
        for st in db.scalars(select(AgentSettings).where(AgentSettings.automation_enabled.is_(True))):
            for task, suffix in due_slots(st.schedule or {}, st.disabled_tasks or [], now):
                run = create_run(db, st.user_id, task, f"{task}:{st.user_id}:{suffix}", "schedule")
                if run:
                    run_step.delay(run.id)
        # Recover runs stuck in "running" (worker died) after 40 minutes
        for r in db.scalars(select(AutomationRun).where(AutomationRun.status == "running",
                                                        AutomationRun.started_at < now_utc() - timedelta(minutes=40))):
            r.status, r.error = "failed", "Timed out / worker lost"
        db.commit()
    finally:
        db.close()
    return local_today().isoformat()


@celery.task(name="app.automation.tasks.run_step", bind=True, acks_late=True)
def run_step(self, run_id: int):
    execute_run(run_id)
