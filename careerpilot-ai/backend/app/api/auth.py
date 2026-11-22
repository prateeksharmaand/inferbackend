from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import ratelimit
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import client_ip, current_user
from app.core.errors import AppError, Conflict, Forbidden, Unauthorized
from app.core.security import (ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE, create_access_token, hash_password,
                               issue_refresh_token, needs_rehash, new_csrf_token, revoke_refresh_token,
                               rotate_refresh_token, verify_password)
from app.core.time import now_utc
from app.models import AgentSettings, User
from app.schemas.auth import ChangePasswordIn, LoginIn, RegisterIn, UserOut
from app.schemas.common import Msg
from app.services.audit import log_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])
MAX_FAILS = 5
LOCK_MINUTES = 15


def _set_session(resp: Response, access: str, refresh: str) -> None:
    secure = settings.cookie_secure
    resp.set_cookie(ACCESS_COOKIE, access, httponly=True, secure=secure, samesite="lax", path="/",
                    max_age=settings.ACCESS_TOKEN_MINUTES * 60)
    resp.set_cookie(REFRESH_COOKIE, refresh, httponly=True, secure=secure, samesite="strict", path="/api/auth",
                    max_age=settings.REFRESH_TOKEN_DAYS * 86400)
    # CSRF cookie is readable by JS so the SPA can echo it in X-CSRF-Token
    resp.set_cookie(CSRF_COOKIE, new_csrf_token(), httponly=False, secure=secure, samesite="strict", path="/",
                    max_age=settings.REFRESH_TOKEN_DAYS * 86400)


def _clear_session(resp: Response) -> None:
    resp.delete_cookie(ACCESS_COOKIE, path="/")
    resp.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    resp.delete_cookie(CSRF_COOKIE, path="/")


@router.get("/config")
def auth_config(db: Session = Depends(get_db)):
    has_users = db.scalar(select(func.count(User.id))) > 0
    return {"registration_open": settings.ALLOW_REGISTRATION or not has_users}


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ratelimit.hit(f"register:{client_ip(request)}", 5, 3600)
    has_users = db.scalar(select(func.count(User.id))) > 0
    if has_users and not settings.ALLOW_REGISTRATION:
        raise Forbidden("Registration is closed")
    if db.scalar(select(User).where(func.lower(User.email) == body.email.lower())):
        raise Conflict("An account with this email already exists")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name)
    db.add(user)
    db.flush()
    db.add(AgentSettings(user_id=user.id))
    log_activity(db, user.id, "auth.register", "Account created", ip=client_ip(request))
    _set_session(response, create_access_token(user.id),
                 issue_refresh_token(db, user.id, user_agent=request.headers.get("user-agent", "")))
    db.commit()
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = client_ip(request)
    ratelimit.hit(f"login:{ip}", 10, 300)
    ratelimit.hit(f"login-email:{body.email.lower()}", 10, 300)
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if user and user.locked_until and user.locked_until > now_utc():
        raise AppError("Account temporarily locked after repeated failures. Try again later.",
                       status_code=423, code="locked")
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        if user:
            user.failed_logins += 1
            if user.failed_logins >= MAX_FAILS:
                user.locked_until = now_utc() + timedelta(minutes=LOCK_MINUTES)
                user.failed_logins = 0
            log_activity(db, user.id, "auth.login_failed", "Failed sign-in", ip=ip)
            db.commit()
        raise Unauthorized("Incorrect email or password")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = now_utc()
    log_activity(db, user.id, "auth.login", "Signed in", ip=ip)
    _set_session(response, create_access_token(user.id),
                 issue_refresh_token(db, user.id, user_agent=request.headers.get("user-agent", "")))
    db.commit()
    return user


@router.post("/refresh", response_model=Msg)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise Unauthorized("Not signed in")
    ratelimit.hit(f"refresh:{client_ip(request)}", 60, 300)
    user_id, new_refresh = rotate_refresh_token(db, token, request.headers.get("user-agent", ""))
    _set_session(response, create_access_token(user_id), new_refresh)
    db.commit()
    return Msg(message="refreshed")


@router.post("/logout", response_model=Msg)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        revoke_refresh_token(db, token)
        db.commit()
    _clear_session(response)
    return Msg(message="signed out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/change-password", response_model=Msg)
def change_password(body: ChangePasswordIn, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise Unauthorized("Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    log_activity(db, user.id, "auth.password_changed", "Password changed", ip=client_ip(request))
    db.commit()
    return Msg(message="Password updated")
