"""Symmetric encryption for secrets stored in the DB (e.g. OAuth tokens). Uses Fernet."""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings


def generate_key() -> str:
    return Fernet.generate_key().decode()


def _fernet() -> Fernet:
    key = settings.ENCRYPTION_KEY
    if not key:
        if settings.is_production:
            raise RuntimeError("ENCRYPTION_KEY must be set in production")
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.JWT_SECRET.encode()).digest()).decode()
    return Fernet(key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
