"""Run bookkeeping shared by Celery tasks and the in-process fallback."""
import logging
import threading
import traceback
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.automation.pipeline import STEPS
from app.core.db import SessionLocal
from app.core.time import now_utc
from app.models import AutomationRun

log = logging.getLogger("careerpilot.automation")


def create_run(db: Session, user_id: int, task: str, run_key: str, trigger: str, attempt: int = 1) -> AutomationRun | None:
    """Insert a run; returns None if run_key already exists (idempotency)."""
    rid = db.scalar(insert(AutomationRun).values(user_id=user_id, task_name=task, run_key=run_key, trigger=trigger,
                                                 attempt=attempt, status="queued", stats={}, log=[], error="",
                                                 queued_at=now_utc())
                    .on_conflict_do_nothing(index_elements=["run_key"]).returning(AutomationRun.id))
    db.commit()
    return db.get(AutomationRun, rid) if rid else None


def execute_run(run_id: int) -> None:
    db = SessionLocal()
    try:
        run = db.get(AutomationRun, run_id)
        if not run or run.status not in ("queued", "failed"):
            return
        run.status, run.started_at = "running", now_utc()
        db.commit()
        lines: list[str] = []

        def logline(msg: str):
            lines.append(f"{datetime.now():%H:%M:%S} {msg}")

        try:
            stats = STEPS[run.task_name](db, run.user_id, logline)
            db.rollback()  # discard any uncommitted leftovers from the step
            run = db.get(AutomationRun, run_id)
            run.status, run.stats = "success", stats or {}
        except Exception as e:  # noqa: BLE001
            db.rollback()
            run = db.get(AutomationRun, run_id)
            run.status, run.error = "failed", f"{type(e).__name__}: {e}\n{traceback.format_exc()[-2000:]}"
            log.exception("automation step %s failed", run.task_name)
            from app.notifications.service import notify
            notify(db, run.user_id, "automation_failure", f"Automation step failed: {run.task_name}",
                   f"{type(e).__name__}: {e}\nOpen Agent Automation to view logs and retry.",
                   dedupe_key=f"autofail:{run.id}")
        run.log, run.finished_at = lines[-500:], now_utc()
        db.commit()
    finally:
        db.close()


def dispatch(run_id: int) -> str:
    """Send to Celery if a broker is reachable, else run in a background thread (dev / no worker)."""
    try:
        from app.automation.celery_app import celery
        conn = celery.connection_for_write()
        conn.ensure_connection(max_retries=0, timeout=1)
        conn.release()
        from app.automation.tasks import run_step
        run_step.delay(run_id)
        return "celery"
    except Exception:  # noqa: BLE001
        threading.Thread(target=execute_run, args=(run_id,), daemon=True).start()
        return "thread"
