from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.base import SearchQuery, SourceUnavailable
from app.connectors.registry import connector_for, ensure_sources
from app.core.time import now_utc
from app.models import AgentSettings, JobSource
from app.services.job_service import ingest


def settings_for(db: Session, user_id: int) -> AgentSettings:
    s = db.scalar(select(AgentSettings).where(AgentSettings.user_id == user_id))
    if not s:
        s = AgentSettings(user_id=user_id)
        db.add(s)
        db.flush()
    return s


def run_discovery(db: Session, user_id: int, *, source_keys: list[str] | None = None, log=None) -> dict:
    log = log or (lambda m: None)
    st = settings_for(db, user_id)
    ensure_sources(db)
    q = SearchQuery(keywords=st.keywords, locations=st.locations, posted_within_hours=st.posted_within_hours)
    totals = {"sources": {}, "inserted": 0, "duplicates": 0, "irrelevant": 0, "received": 0, "new_job_ids": []}
    sources = db.scalars(select(JobSource).where(JobSource.enabled.is_(True),
                                                 JobSource.kind.notin_(["manual", "restricted"]))).all()
    for src in sources:
        if source_keys and src.key not in source_keys:
            continue
        conn = connector_for(src)
        src.last_run_at = now_utc()
        try:
            raws = conn.search_jobs(q)
        except SourceUnavailable as e:
            src.status, src.status_detail = conn.get_source_status().state, str(e)
            if src.status == "configured":
                src.status = "failing"
            src.last_error = str(e)[:1000]
            totals["sources"][src.key] = {"error": str(e)}
            log(f"{src.key}: skipped — {e}")
            continue
        except Exception as e:  # noqa: BLE001
            src.status, src.last_error = "failing", f"{type(e).__name__}: {e}"[:1000]
            totals["sources"][src.key] = {"error": src.last_error}
            log(f"{src.key}: failed — {src.last_error}")
            continue
        normalized = [conn.normalize_job(r) for r in raws]
        res = ingest(db, user_id, normalized, src, posted_within_hours=st.posted_within_hours)
        quota = conn.config.pop("_quota_remaining", None)
        src.status, src.status_detail, src.last_error = "connected", (
            f"{len(raws)} results last run" + (f" · {quota} API requests left this month" if quota is not None else "")), ""
        src.last_success_at, src.jobs_found_last_run = now_utc(), res.inserted
        totals["sources"][src.key] = {"received": res.received, "inserted": res.inserted,
                                      "duplicates": res.duplicates, "irrelevant": res.irrelevant}
        for k in ("inserted", "duplicates", "irrelevant", "received"):
            totals[k] += getattr(res, k)
        totals["new_job_ids"] += res.job_ids[: res.inserted] if res.inserted else []
        log(f"{src.key}: {res.received} received, {res.inserted} new, {res.duplicates} duplicates")
        db.commit()
    db.commit()
    return totals
