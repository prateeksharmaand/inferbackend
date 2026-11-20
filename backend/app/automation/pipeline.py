"""The daily pipeline steps. Each takes (db, user_id, log) and returns a stats dict.
They are safe to re-run (idempotent): discovery dedupes, matching skips already-scored jobs,
notifications dedupe on a per-day key."""
from datetime import timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.connectors.registry import connector_for
from app.core.config import settings as app_settings
from app.core.time import local_today, now_utc
from app.matching.engine import score_job, unscored_job_ids
from app.models import (Application, Company, Interview, Job, JobMatch, OutreachMessage, Recruiter, User)
from app.models.enums import APPLIED_OR_LATER, INTERVIEW_STAGES
from app.notifications.service import notify
from app.notifications.templates import job_lines
from app.services.discovery import run_discovery, settings_for
from app.services.profile_service import get_or_create_profile
from app.services.research import discover_contacts, research_company


def discover_jobs(db: Session, user_id: int, log) -> dict:
    res = run_discovery(db, user_id, log=log)
    return {k: v for k, v in res.items() if k != "new_job_ids"} | {"new_jobs": len(res["new_job_ids"])}


def normalize_dedupe(db: Session, user_id: int, log) -> dict:
    """Verify recent/unverified links, expire dead listings, archive stale ones."""
    jobs = db.scalars(select(Job).where(Job.user_id == user_id, Job.archived_at.is_(None),
                                        Job.status.in_(["active", "unverified"]),
                                        (Job.last_verified_at.is_(None)) |
                                        (Job.last_verified_at < now_utc() - timedelta(days=3)))
                      .order_by(Job.discovered_at.desc()).limit(60)).all()
    expired = verified = 0
    for j in jobs:
        if j.source and j.source.kind == "restricted":
            continue
        conn = connector_for(j.source) if j.source else None
        if not conn:
            continue
        r = conn.verify_job(j.url, j.external_id)
        j.last_verified_at = now_utc()
        if r.status == "expired":
            j.status = "expired"
            expired += 1
        elif r.status == "active":
            j.status = "active"
            verified += 1
    stale = db.scalars(select(Job).where(Job.user_id == user_id, Job.archived_at.is_(None),
                                         Job.shortlisted_at.is_(None), Job.discovered_at < now_utc() - timedelta(days=45),
                                         Job.id.notin_(select(Application.job_id).where(Application.user_id == user_id)))
                       ).all()
    for j in stale:
        j.archived_at = now_utc()
    db.commit()
    log(f"checked {len(jobs)}, {verified} active, {expired} expired, {len(stale)} stale archived")
    return {"checked": len(jobs), "verified": verified, "expired": expired, "archived_stale": len(stale)}


def match_jobs(db: Session, user_id: int, log) -> dict:
    st = settings_for(db, user_id)
    p = get_or_create_profile(db, db.get(User, user_id))
    ids = unscored_job_ids(db, user_id, st.max_ai_matches_per_run)
    scored, excellent = 0, []
    for jid in ids:
        job = db.get(Job, jid)
        m = score_job(db, job, p)
        scored += 1
        if m.overall_score >= 85:
            excellent.append((job, m))
        db.commit()
    for job, m in excellent:
        text, html = job_lines([(job, m)])
        notify(db, user_id, "excellent_match", f"Excellent match: {job.title} at {job.company_name} ({m.overall_score})",
               text, html=html, dedupe_key=f"excellent:{user_id}:{job.id}")
    db.commit()
    log(f"scored {scored} jobs, {len(excellent)} excellent")
    return {"scored": scored, "excellent": len(excellent)}


def research(db: Session, user_id: int, log) -> dict:
    st = settings_for(db, user_id)
    rows = db.execute(
        select(Job, Company).join(JobMatch, and_(JobMatch.job_id == Job.id, JobMatch.is_current))
        .join(Company, Company.id == Job.company_id)
        .where(Job.user_id == user_id, Job.archived_at.is_(None), JobMatch.overall_score >= st.min_match_score,
               Company.research_status != "done")
        .order_by(JobMatch.overall_score.desc()).limit(st.max_research_per_run)).all()
    done, contacts = 0, 0
    seen = set()
    for job, company in rows:
        if company.id in seen:
            continue
        seen.add(company.id)
        research_company(db, company, user_id)
        if company.research_status == "done":
            done += 1
            has_contacts = db.scalar(select(func.count(Recruiter.id)).where(Recruiter.company_id == company.id))
            if not has_contacts:
                contacts += discover_contacts(db, company, user_id, job.title).get("added", 0)
        db.commit()
        log(f"researched {company.name}: {company.research_status}")
    return {"companies_researched": done, "contacts_added": contacts}


def daily_digest(db: Session, user_id: int, log) -> dict:
    st = settings_for(db, user_id)
    since = now_utc() - timedelta(hours=30)
    rows = db.execute(
        select(Job, JobMatch).join(JobMatch, and_(JobMatch.job_id == Job.id, JobMatch.is_current))
        .where(Job.user_id == user_id, Job.archived_at.is_(None), Job.dismissed_at.is_(None),
               Job.status != "expired", Job.discovered_at >= since, JobMatch.overall_score >= st.min_match_score)
        .order_by(JobMatch.overall_score.desc()).limit(15)).all()
    today = local_today().isoformat()
    if not rows:
        log("no new jobs above threshold; digest not sent")
        return {"jobs": 0, "sent": False}
    text, html = job_lines(rows)
    n = notify(db, user_id, "daily_digest", f"{len(rows)} new matches for {today}",
               f"Top new opportunities (score ≥ {st.min_match_score}):\n\n{text}", html=html,
               dedupe_key=f"digest:{user_id}:{today}", payload={"job_ids": [j.id for j, _ in rows]})
    db.commit()
    log(f"digest with {len(rows)} jobs {'sent' if n else 'already sent today'}")
    return {"jobs": len(rows), "sent": bool(n)}


def follow_ups(db: Session, user_id: int, log) -> dict:
    today = local_today()
    due = db.scalars(select(Application).where(
        Application.user_id == user_id, Application.archived_at.is_(None), Application.follow_up_date <= today,
        Application.status.in_([s.value for s in APPLIED_OR_LATER | INTERVIEW_STAGES]),
        Application.status != "offer_received")).all()
    # Auto-suggest follow-ups for applications with no response in 7 days and no date set
    quiet = db.scalars(select(Application).where(
        Application.user_id == user_id, Application.archived_at.is_(None), Application.status == "applied",
        Application.follow_up_date.is_(None), Application.applied_at < now_utc() - timedelta(days=7))).all()
    for a in quiet:
        a.follow_up_date = today
    soon = db.scalars(select(Interview).where(Interview.user_id == user_id, Interview.status == "scheduled",
                                              Interview.scheduled_at.between(now_utc(), now_utc() + timedelta(hours=36)),
                                              Interview.reminder_sent_at.is_(None))).all()
    lines = [f"• Follow up: {a.job.title} at {a.job.company_name} (status: {a.status})" for a in [*due, *quiet]]
    for iv in soon:
        lines.append(f"• Interview: {iv.round_name} — {iv.application.job.company_name} at "
                     f"{iv.scheduled_at.astimezone(app_settings.tz):%d %b %I:%M %p}")
        iv.reminder_sent_at = now_utc()
    drafts = db.scalar(select(func.count(OutreachMessage.id)).where(OutreachMessage.user_id == user_id,
                                                                    OutreachMessage.status == "draft"))
    if drafts:
        lines.append(f"• {drafts} outreach draft(s) awaiting your approval")
    if lines:
        notify(db, user_id, "follow_up", f"{len(lines)} follow-up item(s) for {today:%d %b}", "\n".join(lines),
               dedupe_key=f"followup:{user_id}:{today.isoformat()}")
    db.commit()
    log(f"{len(due) + len(quiet)} follow-ups, {len(soon)} interviews soon")
    return {"follow_ups": len(due) + len(quiet), "interviews_soon": len(soon), "drafts_pending": drafts or 0}


def weekly_report(db: Session, user_id: int, log) -> dict:
    from app.services.analytics import summary
    s = summary(db, user_id, days=7)
    body = "\n".join([
        f"Jobs discovered: {s['jobs_discovered']}", f"Shortlisted: {s['shortlisted']}",
        f"Excellent matches: {s['excellent_matches']}", f"Applications submitted: {s['applications_submitted']}",
        f"Recruiter responses: {s['recruiter_responses']}", f"Interviews: {s['interviews_scheduled']}",
        f"Offers: {s['offers']}", f"Application→interview conversion: {s['application_conversion_rate']}%",
    ])
    week = local_today().isocalendar()
    notify(db, user_id, "weekly_report", f"Weekly career report — week {week.week}", body,
           dedupe_key=f"weekly:{user_id}:{week.year}-{week.week}", payload=s)
    db.commit()
    return s


STEPS = {
    "discover_jobs": discover_jobs, "normalize_dedupe": normalize_dedupe, "match_jobs": match_jobs,
    "research": research, "daily_digest": daily_digest, "follow_ups": follow_ups, "weekly_report": weekly_report,
}
LABELS = {
    "discover_jobs": "Search for new jobs", "normalize_dedupe": "Verify links & clean up", "match_jobs":
    "AI matching & ranking", "research": "Research companies & recruiters", "daily_digest": "Daily shortlist notification",
    "follow_ups": "Follow-up check", "weekly_report": "Weekly career report",
}
