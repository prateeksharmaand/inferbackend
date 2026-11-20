import csv
import io
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import current_user
from app.core.time import now_utc
from app.models import (ActivityLog, Application, Interview, Job, JobMatch, OutreachMessage, User)
from app.services.analytics import breakdowns, summary

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _range(start: date | None, end: date | None):
    s = datetime.combine(start, time(0), tzinfo=settings.tz).astimezone(timezone.utc) if start else None
    e = datetime.combine(end, time(23, 59, 59), tzinfo=settings.tz).astimezone(timezone.utc) if end else None
    return s, e


@router.get("/overview")
def overview(user: User = Depends(current_user), db: Session = Depends(get_db)):
    totals = summary(db, user.id)
    week = summary(db, user.id, days=7)
    recent = db.scalars(select(Job).where(Job.user_id == user.id, Job.archived_at.is_(None))
                        .order_by(Job.discovered_at.desc()).limit(6)).all()
    top = db.execute(select(Job, JobMatch).join(JobMatch, and_(JobMatch.job_id == Job.id, JobMatch.is_current))
                     .where(Job.user_id == user.id, Job.archived_at.is_(None), Job.dismissed_at.is_(None),
                            Job.status != "expired").order_by(desc(JobMatch.overall_score)).limit(6)).all()
    upcoming = db.scalars(select(Interview).where(Interview.user_id == user.id, Interview.status == "scheduled",
                                                  Interview.scheduled_at >= now_utc())
                          .order_by(Interview.scheduled_at).limit(5)).all()
    from app.core.time import local_today
    followups = db.scalars(select(Application).where(Application.user_id == user.id, Application.archived_at.is_(None),
                                                     Application.follow_up_date <= local_today())
                           .order_by(Application.follow_up_date).limit(8)).all()
    activity = db.scalars(select(ActivityLog).where(ActivityLog.user_id == user.id, ActivityLog.action.notlike("auth.%"))
                          .order_by(ActivityLog.created_at.desc()).limit(12)).all()
    weekly = breakdowns(db, user.id)
    return {
        "totals": totals, "last_7_days": week,
        "recent_jobs": [{"id": j.id, "title": j.title, "company": j.company_name, "location": j.location,
                         "discovered_at": j.discovered_at, "posted_at": j.posted_at} for j in recent],
        "top_matches": [{"id": j.id, "title": j.title, "company": j.company_name, "score": m.overall_score,
                         "classification": m.classification, "location": j.location, "work_mode": j.work_mode,
                         "ctc_min_lpa": j.ctc_min_lpa, "ctc_max_lpa": j.ctc_max_lpa} for j, m in top],
        "upcoming_interviews": [{"id": i.id, "round_name": i.round_name, "scheduled_at": i.scheduled_at,
                                 "company": i.application.job.company_name, "title": i.application.job.title}
                                for i in upcoming],
        "pending_follow_ups": [{"id": a.id, "title": a.job.title, "company": a.job.company_name, "status": a.status,
                                "follow_up_date": a.follow_up_date} for a in followups],
        "recent_activity": [{"id": x.id, "action": x.action, "summary": x.summary, "actor": x.actor,
                             "created_at": x.created_at} for x in activity],
        "weekly_jobs": weekly["weekly_jobs"][-8:], "weekly_applications": weekly["weekly_applications"][-8:],
    }


@router.get("/report")
def report(start: date | None = None, end: date | None = None, user: User = Depends(current_user),
           db: Session = Depends(get_db)):
    s, e = _range(start, end)
    days = (end - start).days + 1 if start and end else None
    return {"summary": summary(db, user.id, days=days) if days else summary(db, user.id),
            **breakdowns(db, user.id, s, e)}


@router.get("/export/{dataset}")
def export_csv(dataset: str, start: date | None = None, end: date | None = None,
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    s, e = _range(start, end)
    buf = io.StringIO()
    w = csv.writer(buf)
    if dataset == "jobs":
        w.writerow(["id", "title", "company", "location", "work_mode", "ctc_min_lpa", "ctc_max_lpa", "posted_at",
                    "discovered_at", "status", "match_score", "classification", "url"])
        q = (select(Job, JobMatch).outerjoin(JobMatch, and_(JobMatch.job_id == Job.id, JobMatch.is_current))
             .where(Job.user_id == user.id))
        if s:
            q = q.where(Job.discovered_at >= s)
        if e:
            q = q.where(Job.discovered_at <= e)
        for j, m in db.execute(q.order_by(Job.discovered_at.desc())):
            w.writerow([j.id, j.title, j.company_name, j.location, j.work_mode, j.ctc_min_lpa, j.ctc_max_lpa,
                        j.posted_at, j.discovered_at, j.status, m.overall_score if m else "",
                        m.classification if m else "", j.url])
    elif dataset == "applications":
        w.writerow(["id", "job", "company", "status", "applied_at", "expected_ctc_lpa", "offered_ctc_lpa",
                    "follow_up_date", "notes"])
        q = select(Application).where(Application.user_id == user.id)
        if s:
            q = q.where(Application.created_at >= s)
        if e:
            q = q.where(Application.created_at <= e)
        for a in db.scalars(q):
            w.writerow([a.id, a.job.title, a.job.company_name, a.status, a.applied_at, a.expected_ctc_lpa,
                        a.offered_ctc_lpa, a.follow_up_date, a.notes])
    elif dataset == "outreach":
        w.writerow(["id", "channel", "recipient", "subject", "status", "sent_at", "replied_at"])
        for o in db.scalars(select(OutreachMessage).where(OutreachMessage.user_id == user.id)):
            w.writerow([o.id, o.channel, o.to_address or (o.recruiter.name if o.recruiter else ""), o.subject,
                        o.status, o.sent_at, o.replied_at])
    else:
        from app.core.errors import NotFound
        raise NotFound("Unknown dataset (jobs, applications, outreach)")
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{dataset}.csv"'})
