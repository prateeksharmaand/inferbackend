from datetime import timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.time import now_utc
from app.models import (Application, ApplicationStatusHistory, Interview, Job, JobMatch, JobSource, OutreachMessage,
                        Recruiter)
from app.models.enums import APPLIED_OR_LATER, INTERVIEW_STAGES

APPLIED = [s.value for s in APPLIED_OR_LATER]


def _pct(a, b) -> float:
    return round(100 * a / b, 1) if b else 0.0


def summary(db: Session, user_id: int, days: int | None = None) -> dict:
    since = now_utc() - timedelta(days=days) if days else None

    def w(col):
        return col >= since if since else True

    jobs = db.scalar(select(func.count(Job.id)).where(Job.user_id == user_id, w(Job.discovered_at)))
    shortlisted = db.scalar(select(func.count(Job.id)).where(Job.user_id == user_id, Job.shortlisted_at.is_not(None),
                                                             w(Job.shortlisted_at)))
    excellent = db.scalar(select(func.count(JobMatch.id)).join(Job, Job.id == JobMatch.job_id).where(
        Job.user_id == user_id, JobMatch.is_current, JobMatch.overall_score >= 85, w(JobMatch.created_at)))
    apps = db.scalars(select(Application).where(Application.user_id == user_id, Application.archived_at.is_(None))).all()
    submitted = [a for a in apps if a.applied_at and (not since or a.applied_at >= since)]
    reached_interview = {h.application_id for h in db.scalars(select(ApplicationStatusHistory).join(
        Application, Application.id == ApplicationStatusHistory.application_id).where(
        Application.user_id == user_id, ApplicationStatusHistory.to_status.in_([s.value for s in INTERVIEW_STAGES])))}
    offers = [a for a in apps if a.status == "offer_received"]
    responses = db.scalar(select(func.count(OutreachMessage.id)).where(
        OutreachMessage.user_id == user_id, OutreachMessage.replied_at.is_not(None), w(OutreachMessage.replied_at)))
    sent = db.scalar(select(func.count(OutreachMessage.id)).where(
        OutreachMessage.user_id == user_id, OutreachMessage.sent_at.is_not(None), w(OutreachMessage.sent_at)))
    interviews = db.scalar(select(func.count(Interview.id)).where(Interview.user_id == user_id,
                                                                  Interview.status != "cancelled", w(Interview.created_at)))
    applied_ids = {a.id for a in submitted}
    return {
        "jobs_discovered": jobs, "shortlisted": shortlisted, "excellent_matches": excellent,
        "applications_submitted": len(submitted), "recruiter_responses": responses, "outreach_sent": sent,
        "interviews_scheduled": interviews, "offers": len([a for a in offers if not since or a.updated_at >= since]),
        "application_conversion_rate": _pct(len(applied_ids & reached_interview), len(applied_ids)),
        "interview_to_offer_rate": _pct(len(offers), len(reached_interview)),
        "recruiter_response_rate": _pct(responses, sent),
    }


def breakdowns(db: Session, user_id: int, since=None, until=None) -> dict:
    conds = [Job.user_id == user_id]
    if since:
        conds.append(Job.discovered_at >= since)
    if until:
        conds.append(Job.discovered_at < until)
    by_source = db.execute(select(func.coalesce(JobSource.name, "Manual"), func.count(Job.id)).outerjoin(
        JobSource, JobSource.id == Job.source_id).where(*conds).group_by(JobSource.name)).all()
    loc = func.coalesce(func.nullif(func.split_part(Job.location, ",", 1), ""), "Unknown")
    by_location = db.execute(select(loc, func.count(Job.id)).where(*conds).group_by(loc)
                             .order_by(func.count(Job.id).desc()).limit(12)).all()
    designation = func.lower(Job.title)
    buckets = {"Flutter Lead/Architect": "%flutter%", "Mobile Architect": "%architect%", "Mobile/Tech Lead": "%lead%",
               "Engineering Manager": "%manager%"}
    by_designation = [(k, db.scalar(select(func.count(Job.id)).where(*conds, designation.like(v)))) for k, v in buckets.items()]
    score_bucket = func.width_bucket(JobMatch.overall_score, 0, 100, 10)
    by_score = db.execute(select(score_bucket, func.count(JobMatch.id)).join(Job, Job.id == JobMatch.job_id)
                          .where(*conds, JobMatch.is_current).group_by(score_bucket).order_by(score_bucket)).all()
    by_status = db.execute(select(Application.status, func.count(Application.id)).where(
        Application.user_id == user_id, Application.archived_at.is_(None)).group_by(Application.status)).all()
    weekly = db.execute(select(func.date_trunc("week", Job.discovered_at).label("w"), func.count(Job.id)).where(*conds)
                        .group_by("w").order_by("w")).all()
    weekly_apps = db.execute(select(func.date_trunc("week", Application.applied_at).label("w"), func.count(Application.id))
                             .where(Application.user_id == user_id, Application.applied_at.is_not(None))
                             .group_by("w").order_by("w")).all()
    offered = db.scalar(select(func.avg(Application.offered_ctc_lpa)).where(Application.user_id == user_id,
                                                                            Application.offered_ctc_lpa.is_not(None)))
    resp_time = db.scalar(select(func.avg(func.extract("epoch", OutreachMessage.replied_at - OutreachMessage.sent_at)))
                          .where(OutreachMessage.user_id == user_id, OutreachMessage.replied_at.is_not(None),
                                 OutreachMessage.sent_at.is_not(None)))
    return {
        "by_source": [{"name": n, "count": c} for n, c in by_source],
        "by_location": [{"name": n, "count": c} for n, c in by_location],
        "by_designation": [{"name": n, "count": c} for n, c in by_designation],
        "by_score": [{"name": f"{(b - 1) * 10}-{b * 10 - 1 if b < 10 else 100}", "count": c} for b, c in by_score if b],
        "by_status": [{"name": s, "count": c} for s, c in by_status],
        "weekly_jobs": [{"week": w.date().isoformat(), "count": c} for w, c in weekly],
        "weekly_applications": [{"week": w.date().isoformat(), "count": c} for w, c in weekly_apps],
        "avg_offered_ctc_lpa": round(float(offered), 2) if offered else None,
        "avg_recruiter_response_hours": round(resp_time / 3600, 1) if resp_time else None,
    }


__all__ = ["summary", "breakdowns", "and_", "Recruiter", "APPLIED"]
