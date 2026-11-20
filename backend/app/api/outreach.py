from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.applications import outreach_out
from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import AppError, NotFound
from app.core.time import now_utc
from app.models import Application, Job, OutreachMessage, Recruiter, Resume, User
from app.notifications import channels
from app.schemas.apps import OutreachCreate, OutreachOut, OutreachUpdate
from app.schemas.common import Page
from app.services import storage, tailoring
from app.services.applications import change_status
from app.services.audit import log_activity
from app.services.profile_service import get_or_create_profile

router = APIRouter(prefix="/api/outreach", tags=["outreach"])


def _owned(db, user, oid) -> OutreachMessage:
    o = db.get(OutreachMessage, oid)
    if not o or o.user_id != user.id:
        raise NotFound("Message not found")
    return o


@router.get("", response_model=Page[OutreachOut])
def list_outreach(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(OutreachMessage).where(OutreachMessage.user_id == user.id)
    if status:
        q = q.where(OutreachMessage.status.in_(status.split(",")))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.scalars(q.order_by(OutreachMessage.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=[outreach_out(o) for o in items], total=total, page=page, page_size=page_size)


@router.post("", response_model=OutreachOut, status_code=201)
def create_draft(body: OutreachCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rec = job = None
    if body.recruiter_id:
        rec = db.get(Recruiter, body.recruiter_id)
        if not rec or rec.user_id != user.id:
            raise NotFound("Contact not found")
    if body.job_id:
        job = db.get(Job, body.job_id)
        if not job or job.user_id != user.id:
            raise NotFound("Job not found")
    if body.application_id:
        a = db.get(Application, body.application_id)
        if not a or a.user_id != user.id:
            raise NotFound("Application not found")
        job = job or a.job
    model = None
    subject, text = body.subject, body.body
    if body.generate:
        subject, text, meta = tailoring.outreach(get_or_create_profile(db, user), body.channel, job, rec)
        model = meta["method"]
    if not text:
        raise AppError("Message body is empty")
    o = OutreachMessage(user_id=user.id, recruiter_id=rec.id if rec else None, job_id=job.id if job else None,
                        application_id=body.application_id, channel=body.channel, subject=subject[:255], body=text,
                        to_address=rec.email if rec else "", status="draft", model=model)
    db.add(o)
    db.commit()
    return outreach_out(o)


@router.patch("/{oid}", response_model=OutreachOut)
def edit_draft(oid: int, body: OutreachUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = _owned(db, user, oid)
    if o.status not in ("draft", "approved", "failed"):
        raise AppError("Only drafts can be edited")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(o, k, v)
    if o.channel == "linkedin_connect" and len(o.body) > 300:
        raise AppError("LinkedIn connection notes are limited to 300 characters")
    o.status, o.approved_at = "draft", None  # edits require re-approval
    db.commit()
    return outreach_out(o)


@router.post("/{oid}/approve", response_model=OutreachOut)
def approve(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = _owned(db, user, oid)
    if o.status != "draft":
        raise AppError("Only drafts can be approved")
    o.status, o.approved_at = "approved", now_utc()
    log_activity(db, user.id, "outreach.approved", f"{o.channel} draft #{o.id}", entity_type="outreach", entity_id=o.id)
    db.commit()
    return outreach_out(o)


@router.post("/{oid}/send", response_model=OutreachOut)
def send(oid: int, attach_resume: bool = True, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Send an APPROVED email via SMTP. LinkedIn messages are never automated: copy the text, send it yourself,
    then call /mark-sent."""
    o = _owned(db, user, oid)
    if o.status != "approved" or not o.approved_at:
        raise AppError("Approve the message before sending", code="approval_required")
    if o.channel.startswith("linkedin"):
        raise AppError("LinkedIn messages must be sent by you on LinkedIn. Use 'Mark as sent' afterwards.")
    if not o.to_address:
        raise AppError("Add a recipient email address first")
    if not channels.email_configured():
        raise AppError("Email sending is not configured (SMTP settings)", status_code=503, code="smtp_unconfigured")
    p = get_or_create_profile(db, user)
    try:
        if attach_resume and o.application_id:
            a = db.get(Application, o.application_id)
            r = db.get(Resume, a.resume_id) if a and a.resume_id else None
            _send_with_attachment(o, p, storage.abs_path(r.pdf_path) if r and r.pdf_path else None)
        else:
            channels.send_email(o.to_address, o.subject, o.body, reply_to=p.email or None)
    except channels.ChannelError as e:
        o.status, o.error = "failed", str(e)
        db.commit()
        raise AppError(f"Sending failed: {e}") from e
    _mark_sent(db, o, user)
    db.commit()
    return outreach_out(o)


def _send_with_attachment(o, p, pdf_path):
    import smtplib
    import ssl
    from email.message import EmailMessage
    from app.core.config import settings
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = o.subject, settings.SMTP_FROM or settings.SMTP_USERNAME, o.to_address
    if p.email:
        msg["Reply-To"] = p.email
    msg.set_content(o.body)
    if pdf_path:
        msg.add_attachment(pdf_path.read_bytes(), maintype="application", subtype="pdf",
                           filename=f"{storage.safe_name(p.full_name or 'Resume')}_Resume.pdf")
    try:
        ctx = ssl.create_default_context()
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=ctx, timeout=30) as s:
                s.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as s:
                s.starttls(context=ctx)
                s.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                s.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        raise channels.ChannelError(str(e)) from e


def _mark_sent(db, o, user):
    o.status, o.sent_at, o.error = "sent", now_utc(), ""
    if o.recruiter:
        o.recruiter.last_contacted_at = now_utc()
    if o.application_id:
        a = db.get(Application, o.application_id)
        if a and a.status in ("applied",):
            change_status(db, a, "recruiter_contacted", note=f"{o.channel} sent")
    log_activity(db, user.id, "outreach.sent", f"{o.channel} to {o.to_address or (o.recruiter.name if o.recruiter else '')}",
                 entity_type="outreach", entity_id=o.id)


@router.post("/{oid}/mark-sent", response_model=OutreachOut)
def mark_sent(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = _owned(db, user, oid)
    if o.status not in ("approved", "draft"):
        raise AppError("Message already sent or archived")
    o.approved_at = o.approved_at or now_utc()  # sending it yourself is the approval
    _mark_sent(db, o, user)
    db.commit()
    return outreach_out(o)


@router.post("/{oid}/replied", response_model=OutreachOut)
def mark_replied(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.notifications.service import notify
    o = _owned(db, user, oid)
    o.status, o.replied_at = "replied", now_utc()
    if o.recruiter:
        o.recruiter.responded_at = now_utc()
    notify(db, user.id, "recruiter_response", f"Reply received{' from ' + o.recruiter.name if o.recruiter else ''}",
           o.subject or o.body[:200], dedupe_key=f"reply:{o.id}", deliver=False)
    db.commit()
    return outreach_out(o)


@router.delete("/{oid}", status_code=204)
def archive(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _owned(db, user, oid).status = "archived"
    db.commit()
