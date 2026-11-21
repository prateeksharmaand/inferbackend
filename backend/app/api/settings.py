"""Integration status page + account data export/deletion."""
import io
import json
import zipfile

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.registry import connector_for, ensure_sources
from app.core.config import settings
from app.core.db import Base, get_db
from app.core.deps import client_ip, current_user
from app.core.errors import Unauthorized
from app.core.security import verify_password
from app.models import Resume, User
from app.notifications import channels
from app.services import ai, storage

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/integrations")
def integrations(check_ai: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    items = []
    ai_state = ai.status() if check_ai else (
        {"state": "configured", "detail": "Key present (click Test to verify)", "model": ai.model_name()}
        if settings.ai_configured else {"state": "awaiting_credentials",
                                        "detail": "Set ANTHROPIC_API_KEY or GEMINI_API_KEY", "model": ai.model_name()})
    provider = {"anthropic": "Claude API", "gemini": "Google Gemini API"}.get(settings.ai_provider or "", "AI provider")
    items.append({"key": "anthropic", "name": f"AI ({provider})", **ai_state})
    items.append({"key": "smtp", "name": "Email (SMTP / Gmail App Password)",
                  "state": "configured" if channels.email_configured() else "awaiting_credentials",
                  "detail": settings.SMTP_HOST or "Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD"})
    items.append({"key": "telegram", "name": "Telegram bot",
                  "state": "configured" if channels.telegram_configured() else "awaiting_credentials",
                  "detail": "Bot token + chat id set" if channels.telegram_configured()
                  else "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID"})
    items.append({"key": "gmail_api", "name": "Gmail API (OAuth)",
                  "state": "awaiting_credentials" if not settings.GMAIL_CLIENT_ID else "configured",
                  "detail": "Optional. SMTP with a Gmail App Password covers sending. See docs/INTEGRATIONS.md"})
    for s in ensure_sources(db):
        st = connector_for(s).get_source_status()
        state = "disabled" if not s.enabled and st.state != "unavailable" else (
            s.status if s.status in ("connected", "failing") else st.state)
        items.append({"key": f"source:{s.key}", "name": s.name, "state": state,
                      "detail": s.status_detail or st.detail})
    try:
        from app.automation.celery_app import celery
        conn = celery.connection_for_write()
        conn.ensure_connection(max_retries=0, timeout=1)
        conn.release()
        insp = celery.control.inspect(timeout=1).ping() or {}
        items.append({"key": "worker", "name": "Background worker (Celery)",
                      "state": "connected" if insp else "failing",
                      "detail": f"{len(insp)} worker(s) online" if insp else "Redis reachable, no worker responding"})
    except Exception as e:  # noqa: BLE001
        items.append({"key": "worker", "name": "Background worker (Celery)", "state": "failing",
                      "detail": f"Redis not reachable ({type(e).__name__}); manual runs use in-process threads"})
    db.commit()
    return items


@router.get("/export")
def export_data(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """ZIP of every row owned by the user (JSON per table) plus uploaded/generated files."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for table in Base.metadata.sorted_tables:
            if "user_id" not in table.c and table.name != "users":
                continue
            col = table.c.id if table.name == "users" else table.c.user_id
            rows = [dict(r._mapping) for r in db.execute(select(table).where(col == user.id))]
            for r in rows:
                for k in ("password_hash", "token_hash", "gmail_token_encrypted"):
                    r.pop(k, None)
            z.writestr(f"{table.name}.json", json.dumps(rows, default=str, indent=1))
        for r in db.scalars(select(Resume).where(Resume.user_id == user.id)):
            for rel in (r.file_path, r.docx_path, r.pdf_path):
                if rel:
                    try:
                        z.write(storage.abs_path(rel), f"files/{rel.split('/')[-1]}")
                    except (FileNotFoundError, OSError):
                        pass
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="careerpilot-export.zip"'})


class DeleteIn(BaseModel):
    password: str
    confirm: str


@router.post("/delete-account")
def delete_account(body: DeleteIn, request: Request, response: Response, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    if body.confirm != "DELETE" or not verify_password(body.password, user.password_hash):
        raise Unauthorized("Password incorrect or confirmation text missing")
    import shutil
    shutil.rmtree(storage.root() / f"user_{user.id}", ignore_errors=True)
    db.delete(user)  # ON DELETE CASCADE removes all owned rows
    db.commit()
    for c in ("cp_access", "cp_csrf"):
        response.delete_cookie(c, path="/")
    response.delete_cookie("cp_refresh", path="/api/auth")
    return {"ok": True, "ip": client_ip(request)}
