from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import Forbidden, Unauthorized
from app.core.security import ACCESS_COOKIE, CSRF_COOKIE, decode_access_token
from app.models import User

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    auth = request.headers.get("authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:]
    if not token:
        raise Unauthorized("Not signed in")
    user = db.get(User, decode_access_token(token))
    if not user or not user.is_active:
        raise Unauthorized("Account disabled or missing")
    # CSRF double-submit check for cookie-authenticated, state-changing requests
    if request.method not in SAFE_METHODS and request.cookies.get(ACCESS_COOKIE):
        sent = request.headers.get("x-csrf-token")
        if not sent or sent != request.cookies.get(CSRF_COOKIE):
            raise Forbidden("CSRF token missing or invalid", code="csrf_failed")
    return user


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown"))[:64]
