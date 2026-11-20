"""Auth primitives.

- Passwords: Argon2id (argon2-cffi defaults: type ID, RFC 9106 low-memory profile).
- Access token: short-lived JWT (HS256) in an httpOnly cookie.
- Refresh token: opaque random token in an httpOnly cookie scoped to /api/auth, stored hashed,
  rotated on every use; presenting an already-rotated token revokes the whole token family.
- CSRF: double-submit cookie. State-changing requests must send X-CSRF-Token == csrf cookie.
"""
import hashlib
import secrets
import uuid
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Unauthorized
from app.core.time import now_utc
from app.models import RefreshToken

_ph = PasswordHasher()
ACCESS_COOKIE = "cp_access"
REFRESH_COOKIE = "cp_refresh"
CSRF_COOKIE = "cp_csrf"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    return _ph.check_needs_rehash(hashed)


def create_access_token(user_id: int) -> str:
    now = now_utc()
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
               "typ": "access"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> int:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise Unauthorized("Session expired", code="token_expired") from e
    except jwt.PyJWTError as e:
        raise Unauthorized("Invalid session") from e
    if payload.get("typ") != "access":
        raise Unauthorized("Invalid session")
    return int(payload["sub"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_refresh_token(db: Session, user_id: int, *, family_id: str | None = None, user_agent: str = "") -> str:
    token = secrets.token_urlsafe(48)
    db.add(RefreshToken(user_id=user_id, token_hash=_hash_token(token), family_id=family_id or str(uuid.uuid4()),
                        expires_at=now_utc() + timedelta(days=settings.REFRESH_TOKEN_DAYS),
                        user_agent=user_agent[:255]))
    db.flush()
    return token


def rotate_refresh_token(db: Session, token: str, user_agent: str = "") -> tuple[int, str]:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(token)).with_for_update())
    if row is None:
        raise Unauthorized("Invalid session")
    if row.revoked_at is not None:
        # Reuse of a rotated token => likely theft. Kill the family.
        db.execute(update(RefreshToken).where(RefreshToken.family_id == row.family_id,
                                              RefreshToken.revoked_at.is_(None)).values(revoked_at=now_utc()))
        db.commit()
        raise Unauthorized("Session revoked. Please sign in again.", code="token_reused")
    if row.expires_at < now_utc():
        raise Unauthorized("Session expired", code="token_expired")
    new_token = issue_refresh_token(db, row.user_id, family_id=row.family_id, user_agent=user_agent)
    new_row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(new_token)))
    row.revoked_at = now_utc()
    row.replaced_by_id = new_row.id
    return row.user_id, new_token


def revoke_refresh_token(db: Session, token: str) -> None:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(token)))
    if row:
        db.execute(update(RefreshToken).where(RefreshToken.family_id == row.family_id,
                                              RefreshToken.revoked_at.is_(None)).values(revoked_at=now_utc()))


def new_csrf_token() -> str:
    return secrets.token_urlsafe(24)
