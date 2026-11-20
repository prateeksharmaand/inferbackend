from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import AppError, Conflict, NotFound
from app.core.time import now_utc
from app.models import (Application, ApplicationDocument, Interview, Job, JobMatch, OutreachMessage, Recruiter,
                        Resume, User)
from app.models.enums import ApplicationStatus
from app.schemas.apps import (ApplicationCreate, ApplicationDetail, ApplicationOut, ApplicationUpdate, DocumentOut,
                              InterviewIn, InterviewOut, OutreachOut, PrepareIn, StatusChange)
from app.schemas.common import Page
from app.services import documents, storage, tailoring
from app.services.applications import active_application, change_status, ensure_application
from app.services.audit import log_activity
from app.services.profile_service import get_or_create_profile
from app.services.resume_builder import VARIANTS

router = APIRouter(tags=["applications"])


def _owned(db, user, aid) -> Application:
    a = db.get(Application, aid)
    if not a or a.user_id != user.id or a.archived_at:
        raise NotFound("Application not found")
    return a


def to_out(db, apps: list[Application]) -> list[ApplicationOut]:
    ids = [a.job_id for a in apps]
    scores = dict(db.execute(select(JobMatch.job_id, JobMatch.overall_score).where(JobMatch.job_id.in_(ids),
                                                                                 JobMatch.is_current)).all())
    out = []
    for a in apps:
        out.append(ApplicationOut.model_validate(a).model_copy(update={
            "job_title": a.job.title, "company_name": a.job.company_name, "location": a.job.location,
            "work_mode": a.job.work_mode, "apply_url": a.job.apply_url or a.job.url,
            "match_score": scores.get(a.job_id), "recruiter_name": a.recruiter.name if a.recruiter else None}))
    return out


def doc_out(d: ApplicationDocument) -> DocumentOut:
    return DocumentOut.model_validate(d).model_copy(update={"has_pdf": bool(d.pdf_path), "has_docx": bool(d.docx_path)})


@router.get("/api/applications", response_model=Page[ApplicationOut])
def list_applications(status: str | None = None, search: str | None = None, follow_up_due: bool = False,
                      page: int = Query(1, ge=1), page_size: int = Query(200, ge=1, le=500),
                      sort: str = Query("-updated", pattern="^-?(updated|applied|score|company|follow_up)$"),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = (select(Application).join(Job, Job.id == Application.job_id)
         .outerjoin(JobMatch, and_(JobMatch.job_id == Job.id, JobMatch.is_current))
         .where(Application.user_id == user.id, Application.archived_at.is_(None)))
    if status:
        q = q.where(Application.status.in_(status.split(",")))
    if search:
        q = q.where(Job.title.ilike(f"%{search}%") | Job.company_name.ilike(f"%{search}%"))
    if follow_up_due:
        from app.core.time import local_today
        q = q.where(Application.follow_up_date <= local_today())
    cols = {"updated": Application.updated_at, "applied": Application.applied_at, "score": JobMatch.overall_score,
            "company": Job.company_name, "follow_up": Application.follow_up_date}
    col = cols[sort.lstrip("-")]
    q = q.order_by(col.desc().nulls_last() if sort.startswith("-") else col.asc().nulls_last())
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    apps = db.scalars(q.offset((page - 1) * page_size).limit(page_size)
                      .options(selectinload(Application.job), selectinload(Application.recruiter))).all()
    return Page(items=to_out(db, list(apps)), total=total, page=page, page_size=page_size)


@router.post("/api/applications", response_model=ApplicationOut, status_code=201)
def create_application(body: ApplicationCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = db.get(Job, body.job_id)
    if not job or job.user_id != user.id:
        raise NotFound("Job not found")
    if active_application(db, user.id, job.id):
        raise Conflict("You already have an application for this job")
    if body.status in (ApplicationStatus.applied,):
        raise AppError("Create the application first, then mark it applied after you have submitted it.")
    a = ensure_application(db, user, job, status=body.status, note="Created")
    a.notes = body.notes
    job.shortlisted_at = job.shortlisted_at or now_utc()
    db.commit()
    return to_out(db, [a])[0]


@router.get("/api/applications/{aid}", response_model=ApplicationDetail)
def get_application(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _owned(db, user, aid)
    base = to_out(db, [a])[0]
    docs = db.scalars(select(ApplicationDocument).where(ApplicationDocument.user_id == user.id,
                                                        (ApplicationDocument.application_id == a.id) |
                                                        (ApplicationDocument.job_id == a.job_id),
                                                        ApplicationDocument.archived_at.is_(None))
                      .order_by(ApplicationDocument.created_at.desc())).all()
    ivs = db.scalars(select(Interview).where(Interview.application_id == a.id).order_by(Interview.scheduled_at)).all()
    outs = db.scalars(select(OutreachMessage).where(OutreachMessage.user_id == user.id,
                                                    (OutreachMessage.application_id == a.id) |
                                                    (OutreachMessage.job_id == a.job_id))
                      .order_by(OutreachMessage.created_at.desc())).all()
    resume = db.get(Resume, a.resume_id) if a.resume_id else None
    return ApplicationDetail(**base.model_dump(), history=a.history, documents=[doc_out(d) for d in docs],
                             interviews=[iv_out(i) for i in ivs], outreach=[outreach_out(o) for o in outs],
                             resume_name=resume.name if resume else None)


@router.patch("/api/applications/{aid}", response_model=ApplicationOut)
def update_application(aid: int, body: ApplicationUpdate, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    a = _owned(db, user, aid)
    data = body.model_dump(exclude_unset=True)
    for fk, model in (("recruiter_id", Recruiter), ("resume_id", Resume), ("cover_letter_id", ApplicationDocument)):
        if data.get(fk):
            obj = db.get(model, data[fk])
            if not obj or obj.user_id != user.id:
                raise NotFound(f"{fk.replace('_id', '')} not found")
    for k, v in data.items():
        setattr(a, k, v)
    db.commit()
    return to_out(db, [a])[0]


@router.post("/api/applications/{aid}/status", response_model=ApplicationOut)
def set_status(aid: int, body: StatusChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.notifications.service import notify
    a = _owned(db, user, aid)
    old = a.status
    change_status(db, a, body.status, note=body.note)
    log_activity(db, user.id, "application.status", f"{a.job.company_name}: {old} → {body.status}",
                 entity_type="application", entity_id=a.id)
    if old != body.status:
        notify(db, user.id, "status_change", f"{a.job.title} at {a.job.company_name}: {body.status.replace('_', ' ')}",
               body.note or f"Status changed from {old} to {body.status}.",
               dedupe_key=f"status:{a.id}:{body.status}:{now_utc():%Y%m%d%H%M%S}", deliver=False)
    db.commit()
    return to_out(db, [a])[0]


@router.post("/api/applications/{aid}/prepare", response_model=ApplicationDetail)
def prepare_package(aid: int, body: PrepareIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Generate a tailored resume (+ cover letter) for this job. Moves the application to
    'awaiting_approval'. Nothing is ever submitted to the employer by the system."""
    a = _owned(db, user, aid)
    p = get_or_create_profile(db, user)
    if not p.employment:
        raise AppError("Complete your profile (upload your resume) before generating documents.")
    job = a.job
    m = db.scalar(select(JobMatch).where(JobMatch.job_id == job.id, JobMatch.is_current))
    variant = body.variant or (m.suggested_resume if m else "master")
    content, report = tailoring.tailor_resume(p, job, variant)
    version = (db.scalar(select(func.max(Resume.version)).where(Resume.user_id == user.id,
                                                                Resume.category == "tailored")) or 0) + 1
    r = Resume(user_id=user.id, name=f"{VARIANTS[variant]['label']} — {job.company_name}", category="tailored",
               version=version, job_id=job.id, content={**content, "tailoring_report": report},
               model=report["method"], extracted_text="")
    db.add(r)
    db.flush()
    base = f"{storage.safe_name(p.full_name or 'resume')}_{storage.safe_name(job.company_name)}_v{version}"
    r.docx_path, r.pdf_path = documents.render_resume(user.id, content, base)
    a.resume_id = r.id
    if body.cover_letter:
        subject, letter, meta = tailoring.cover_letter(p, job)
        d = ApplicationDocument(user_id=user.id, job_id=job.id, application_id=a.id, kind="cover_letter",
                                title=subject, body=letter, source_resume_id=r.id, model=meta["method"])
        db.add(d)
        db.flush()
        d.docx_path, d.pdf_path = documents.render_letter(user.id, subject, letter, {
            "name": p.full_name, "email": p.email, "phone": p.phone}, f"cover_{base}")
        a.cover_letter_id = d.id
    if a.status in ("discovered", "shortlisted", "resume_prepared"):
        change_status(db, a, "awaiting_approval", note=f"Package prepared ({report['method']})", actor="agent")
    log_activity(db, user.id, "application.prepared", f"Prepared package for {job.company_name}",
                 entity_type="application", entity_id=a.id, actor="agent", details=report)
    db.commit()
    return get_application(aid, user, db)


@router.post("/api/applications/{aid}/approve", response_model=ApplicationOut)
def approve(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Candidate approves the prepared package. The candidate then applies on the employer's site
    (apply_url) and marks the application as applied."""
    a = _owned(db, user, aid)
    a.approved_at = now_utc()
    log_activity(db, user.id, "application.approved", a.job.company_name, entity_type="application", entity_id=a.id)
    db.commit()
    return to_out(db, [a])[0]


@router.delete("/api/applications/{aid}", status_code=204)
def archive_application(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _owned(db, user, aid).archived_at = now_utc()
    db.commit()


# ---- documents (cover letters) ----
@router.get("/api/documents", response_model=list[DocumentOut])
def list_documents(kind: str = "cover_letter", user: User = Depends(current_user), db: Session = Depends(get_db)):
    docs = db.scalars(select(ApplicationDocument).where(ApplicationDocument.user_id == user.id,
                                                        ApplicationDocument.kind == kind,
                                                        ApplicationDocument.archived_at.is_(None))
                      .order_by(ApplicationDocument.created_at.desc())).all()
    return [doc_out(d) for d in docs]


@router.post("/api/jobs/{job_id}/cover-letter", response_model=DocumentOut, status_code=201)
def generate_cover_letter(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise NotFound("Job not found")
    p = get_or_create_profile(db, user)
    subject, letter, meta = tailoring.cover_letter(p, job)
    a = active_application(db, user.id, job.id)
    d = ApplicationDocument(user_id=user.id, job_id=job.id, application_id=a.id if a else None, kind="cover_letter",
                            title=subject, body=letter, model=meta["method"])
    db.add(d)
    db.flush()
    d.docx_path, d.pdf_path = documents.render_letter(user.id, subject, letter, {
        "name": p.full_name, "email": p.email, "phone": p.phone}, f"cover_{storage.safe_name(job.company_name)}_{d.id}")
    db.commit()
    return doc_out(d)


@router.post("/api/jobs/{job_id}/tailored-resume")
def generate_tailored_resume(job_id: int, variant: str | None = Query(None, pattern="^(master|flutter_lead|mobile_architect|engineering_leadership)$"),
                             user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise NotFound("Job not found")
    a = ensure_application(db, user, job, status="shortlisted", note="Created to hold tailored resume")
    job.shortlisted_at = job.shortlisted_at or now_utc()
    db.flush()
    detail = prepare_package(a.id, PrepareIn(variant=variant, cover_letter=False), user, db)
    return {"application_id": a.id, "resume_id": detail.resume_id}


@router.patch("/api/documents/{doc_id}", response_model=DocumentOut)
def edit_document(doc_id: int, body: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = db.get(ApplicationDocument, doc_id)
    if not d or d.user_id != user.id:
        raise NotFound("Document not found")
    if "body" in body:
        p = get_or_create_profile(db, user)
        d.title = str(body.get("title", d.title))[:255]
        d.body = str(body["body"])[:20000]
        d.model = "user-edit"
        d.docx_path, d.pdf_path = documents.render_letter(user.id, d.title, d.body, {
            "name": p.full_name, "email": p.email, "phone": p.phone}, f"cover_edit_{d.id}")
    db.commit()
    return doc_out(d)


@router.get("/api/documents/{doc_id}/download")
def download_document(doc_id: int, fmt: str = Query("pdf", pattern="^(pdf|docx)$"), user: User = Depends(current_user),
                      db: Session = Depends(get_db)):
    d = db.get(ApplicationDocument, doc_id)
    if not d or d.user_id != user.id:
        raise NotFound("Document not found")
    rel = d.pdf_path if fmt == "pdf" else d.docx_path
    if not rel:
        raise NotFound("File not generated")
    return FileResponse(storage.abs_path(rel), filename=f"{storage.safe_name(d.title)}.{fmt}")


# ---- interviews ----
def iv_out(i: Interview) -> InterviewOut:
    return InterviewOut.model_validate(i).model_copy(update={"job_title": i.application.job.title,
                                                             "company_name": i.application.job.company_name})


@router.get("/api/interviews", response_model=list[InterviewOut])
def list_interviews(start: datetime | None = None, end: datetime | None = None, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    q = select(Interview).where(Interview.user_id == user.id)
    if start:
        q = q.where(Interview.scheduled_at >= start)
    if end:
        q = q.where(Interview.scheduled_at < end)
    return [iv_out(i) for i in db.scalars(q.order_by(Interview.scheduled_at))]


@router.post("/api/interviews", response_model=InterviewOut, status_code=201)
def create_interview(body: InterviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.notifications.service import notify
    a = _owned(db, user, body.application_id)
    i = Interview(user_id=user.id, **body.model_dump())
    db.add(i)
    db.flush()
    stage = {"screening": "screening", "technical": "technical_interview", "managerial": "management_interview",
             "hr": "hr_discussion"}.get(body.kind)
    if stage and a.status in ("applied", "recruiter_contacted", "screening", "awaiting_approval", "shortlisted"):
        change_status(db, a, stage, note=f"Interview scheduled: {body.round_name}")
    notify(db, user.id, "interview", f"Interview scheduled: {a.job.company_name} — {body.round_name}",
           f"{body.round_name} ({body.kind}) on {body.scheduled_at.isoformat()}", dedupe_key=f"iv:{i.id}", deliver=True)
    db.commit()
    return iv_out(i)


@router.put("/api/interviews/{iid}", response_model=InterviewOut)
def update_interview(iid: int, body: InterviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    i = db.get(Interview, iid)
    if not i or i.user_id != user.id:
        raise NotFound("Interview not found")
    for k, v in body.model_dump().items():
        setattr(i, k, v)
    db.commit()
    return iv_out(i)


@router.delete("/api/interviews/{iid}", status_code=204)
def delete_interview(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    i = db.get(Interview, iid)
    if not i or i.user_id != user.id:
        raise NotFound("Interview not found")
    db.delete(i)
    db.commit()


def outreach_out(o: OutreachMessage) -> OutreachOut:
    return OutreachOut.model_validate(o).model_copy(update={"recruiter_name": o.recruiter.name if o.recruiter else None})
