from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import AppError, NotFound
from app.core.time import now_utc
from app.models import Resume, User
from app.models.enums import ResumeCategory
from app.schemas.profile import ResumeDetail, ResumeOut, ResumeUpdate, VariantIn
from app.services import documents, resume_parser, storage
from app.services.audit import log_activity
from app.services.profile_service import apply_extraction, get_or_create_profile
from app.services.resume_builder import VARIANTS, build_content

router = APIRouter(prefix="/api/resumes", tags=["resumes"])


def to_out(r: Resume, detail: bool = False):
    cls = ResumeDetail if detail else ResumeOut
    return cls.model_validate(r).model_copy(update={
        "has_docx": bool(r.docx_path), "has_pdf": bool(r.pdf_path), "has_original": bool(r.file_path)})


def _owned(db: Session, user: User, rid: int) -> Resume:
    r = db.get(Resume, rid)
    if not r or r.user_id != user.id:
        raise NotFound("Resume not found")
    return r


def _next_version(db: Session, user_id: int, category: str) -> int:
    return (db.scalar(select(func.max(Resume.version)).where(Resume.user_id == user_id,
                                                              Resume.category == category)) or 0) + 1


@router.get("", response_model=list[ResumeOut])
def list_resumes(category: str | None = None, include_archived: bool = False, job_id: int | None = None,
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Resume).where(Resume.user_id == user.id)
    if category:
        q = q.where(Resume.category == category)
    if job_id:
        q = q.where(Resume.job_id == job_id)
    if not include_archived:
        q = q.where(Resume.archived_at.is_(None))
    return [to_out(r) for r in db.scalars(q.order_by(Resume.created_at.desc()))]


@router.post("/upload", status_code=201)
async def upload(file: UploadFile = File(...), apply_to_profile: str = Query("fill_empty",
                 pattern="^(fill_empty|replace|none)$"), user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    data = await file.read()
    ftype = storage.validate_upload(file.filename or "resume", data)
    try:
        text = resume_parser.extract_text(data, ftype)
    except Exception as e:  # corrupt file
        raise AppError("Could not read this file. Is it a valid PDF/DOCX?") from e
    if len(text) < 200:
        raise AppError("Very little text was found. Scanned/image PDFs are not supported; upload a text PDF or DOCX.")
    rel, sha = storage.save_bytes(user.id, "resumes", file.filename or f"resume.{ftype}", data)
    extraction, method = resume_parser.structure(text)
    is_first = not db.scalar(select(Resume.id).where(Resume.user_id == user.id, Resume.category == "master").limit(1))
    r = Resume(user_id=user.id, name=file.filename or "Uploaded resume", category=ResumeCategory.master,
               version=_next_version(db, user.id, "master"), original_filename=file.filename, file_path=rel,
               file_type=ftype, file_size=len(data), sha256=sha, extracted_text=text,
               content={"extraction": extraction.model_dump()}, model=method, is_primary=is_first)
    db.add(r)
    db.flush()
    applied = None
    if apply_to_profile != "none":
        p = get_or_create_profile(db, user)
        applied = apply_extraction(db, p, extraction, replace=apply_to_profile == "replace", resume_id=r.id)
        db.flush()
        r.content = {**build_content(p, "master"), "extraction": extraction.model_dump()}
    log_activity(db, user.id, "resume.uploaded", f"Uploaded {file.filename} (parsed by {method})",
                 entity_type="resume", entity_id=r.id)
    db.commit()
    return {"resume": to_out(r), "parsed_by": method, "profile_update": applied,
            "extraction": extraction.model_dump()}


@router.post("/variants", response_model=ResumeOut, status_code=201)
def create_variant(body: VariantIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_or_create_profile(db, user)
    if not p.employment:
        raise AppError("Your profile has no employment history yet. Upload a resume or add experience first.")
    content = build_content(p, body.category)
    version = _next_version(db, user.id, body.category)
    r = Resume(user_id=user.id, name=body.name or f"{VARIANTS[body.category]['label']} v{version}",
               category=body.category, version=version, content=content, model="profile-builder",
               extracted_text="")
    db.add(r)
    db.flush()
    r.docx_path, r.pdf_path = documents.render_resume(user.id, content, f"{body.category}_v{version}")
    log_activity(db, user.id, "resume.variant_created", r.name, entity_type="resume", entity_id=r.id)
    db.commit()
    return to_out(r)


@router.get("/{rid}", response_model=ResumeDetail)
def get_resume(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return to_out(_owned(db, user, rid), detail=True)


@router.patch("/{rid}", response_model=ResumeDetail)
def update_resume(rid: int, body: ResumeUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _owned(db, user, rid)
    if body.name is not None:
        r.name = body.name
    if body.is_primary:
        for other in db.scalars(select(Resume).where(Resume.user_id == user.id, Resume.category == r.category)):
            other.is_primary = False
        r.is_primary = True
    if body.content is not None:
        # Edits create a new version; the old one is kept for history.
        new = Resume(user_id=user.id, name=r.name, category=r.category, version=_next_version(db, user.id, r.category),
                     parent_id=r.id, job_id=r.job_id, content=body.content, model="user-edit", extracted_text="")
        db.add(new)
        db.flush()
        new.docx_path, new.pdf_path = documents.render_resume(user.id, body.content, f"{r.category}_v{new.version}")
        db.commit()
        return to_out(new, detail=True)
    db.commit()
    return to_out(r, detail=True)


@router.delete("/{rid}", status_code=204)
def archive_resume(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _owned(db, user, rid)
    r.archived_at = now_utc()
    db.commit()


@router.post("/{rid}/reparse")
def reparse(rid: int, apply_to_profile: str = Query("fill_empty", pattern="^(fill_empty|replace)$"),
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _owned(db, user, rid)
    if not r.extracted_text:
        raise AppError("This resume has no extracted text to parse")
    extraction, method = resume_parser.structure(r.extracted_text)
    p = get_or_create_profile(db, user)
    applied = apply_extraction(db, p, extraction, replace=apply_to_profile == "replace", resume_id=r.id)
    r.model = method
    db.commit()
    return {"parsed_by": method, "profile_update": applied, "extraction": extraction.model_dump()}


@router.get("/{rid}/download")
def download(rid: int, fmt: str = Query("pdf", pattern="^(pdf|docx|original)$"), user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    r = _owned(db, user, rid)
    rel = {"pdf": r.pdf_path, "docx": r.docx_path, "original": r.file_path}[fmt]
    if not rel:
        raise NotFound(f"No {fmt} file for this resume")
    ext = r.file_type if fmt == "original" else fmt
    name = f"{storage.safe_name(r.name).removesuffix('.' + (ext or ''))}.{ext}"
    return FileResponse(storage.abs_path(rel), filename=name)
