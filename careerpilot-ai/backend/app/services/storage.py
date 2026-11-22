"""Private file storage. Paths stored in the DB are relative to STORAGE_PATH; files are never served
statically, only through authorized download endpoints."""
import hashlib
import re
import uuid
from pathlib import Path

from app.core.config import settings
from app.core.errors import AppError

ALLOWED = {
    ".pdf": {b"%PDF"},
    ".docx": {b"PK\x03\x04"},
}


def root() -> Path:
    p = Path(settings.STORAGE_PATH).expanduser().resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


def user_dir(user_id: int, sub: str) -> Path:
    d = root() / f"user_{user_id}" / sub
    d.mkdir(parents=True, exist_ok=True)
    return d


def safe_name(name: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")[:80]
    return stem or "file"


def validate_upload(filename: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED:
        raise AppError("Only PDF and DOCX files are allowed", code="unsupported_file")
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise AppError(f"File is larger than {settings.MAX_UPLOAD_MB} MB", code="file_too_large")
    if not any(data.startswith(sig) for sig in ALLOWED[ext]):
        raise AppError("File content does not match its extension", code="unsupported_file")
    return ext[1:]


def save_bytes(user_id: int, sub: str, filename: str, data: bytes) -> tuple[str, str]:
    d = user_dir(user_id, sub)
    name = f"{uuid.uuid4().hex[:10]}_{safe_name(filename)}"
    (d / name).write_bytes(data)
    return str((d / name).relative_to(root())), hashlib.sha256(data).hexdigest()


def abs_path(rel: str) -> Path:
    p = (root() / rel).resolve()
    if root() not in p.parents:
        raise AppError("Invalid file path", status_code=400)
    return p
