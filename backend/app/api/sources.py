from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.ats import _ATSBase
from app.connectors.base import SearchQuery, SourceUnavailable
from app.connectors.registry import connector_for, ensure_sources
from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import AppError, NotFound
from app.models import JobSource, User
from app.schemas.jobs import SourceOut, SourceUpdate
from app.services.discovery import settings_for

router = APIRouter(prefix="/api/sources", tags=["jobs"])


@router.get("", response_model=list[SourceOut])
def list_sources(user: User = Depends(current_user), db: Session = Depends(get_db)):
    srcs = ensure_sources(db)
    for s in srcs:
        if s.status in ("unknown", "awaiting_credentials", "unavailable", "configured"):
            st = connector_for(s).get_source_status()
            s.status, s.status_detail = (st.state, st.detail) if s.enabled or st.state == "unavailable" else ("disabled", st.detail)
    db.commit()
    return srcs


@router.patch("/{key}", response_model=SourceOut)
def update_source(key: str, body: SourceUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_sources(db)
    s = db.scalar(select(JobSource).where(JobSource.key == key))
    if not s:
        raise NotFound("Source not found")
    if body.enabled is not None:
        if s.kind == "restricted" and body.enabled:
            raise AppError(f"{s.name} has no authorised API and can't be enabled for automated search. "
                           "Use JSearch or import posting URLs.")
        s.enabled = body.enabled
    if body.config is not None:
        boards = body.config.get("boards")
        if boards is not None and (not isinstance(boards, list) or not all(
                isinstance(b, dict) and str(b.get("token", "")).replace("-", "").isalnum() for b in boards)):
            raise AppError("boards must be a list of {token, company} with alphanumeric tokens")
        s.config = {**s.config, **body.config}
    s.status = "unknown"
    db.commit()
    return s


@router.post("/{key}/test")
def test_source(key: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_sources(db)
    s = db.scalar(select(JobSource).where(JobSource.key == key))
    if not s:
        raise NotFound("Source not found")
    conn = connector_for(s)
    if isinstance(conn, _ATSBase):
        results = {b["token"]: conn.test_board(b) for b in conn.boards}
        ok = any(v[0] for v in results.values())
        s.status = "connected" if ok else "failing"
        s.status_detail = "; ".join(f"{k}: {'ok, ' if v[0] else ''}{v[1]}" for k, v in results.items())[:1000]
        db.commit()
        return {"ok": ok, "detail": s.status_detail}
    st = settings_for(db, user.id)
    try:
        jobs = conn.search_jobs(SearchQuery(keywords=st.keywords[:1], locations=st.locations[:1],
                                            posted_within_hours=168, max_results=5))
        s.status, s.status_detail = "connected", f"Test search returned {len(jobs)} jobs"
        ok = True
    except SourceUnavailable as e:
        s.status, s.status_detail, ok = conn.get_source_status().state, str(e), False
    except Exception as e:  # noqa: BLE001
        s.status, s.status_detail, ok = "failing", f"{type(e).__name__}: {e}"[:500], False
    db.commit()
    return {"ok": ok, "detail": s.status_detail}
