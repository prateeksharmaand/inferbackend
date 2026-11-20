"""Database-connected tools for the Career Agent.

Safety model: tools only READ data or create INTERNAL drafts (tailored resumes, cover letters, outreach
drafts, automation runs). There is deliberately no tool that sends an email/message or submits an
application — those require the candidate's explicit approval in the UI."""
import json
from datetime import timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.time import local_today, now_utc
from app.matching.engine import score_job
from app.models import Application, Company, Job, JobMatch, MockInterviewSession, OutreachMessage, Recruiter, User
from app.services.analytics import summary
from app.services.profile_service import get_or_create_profile, profile_fact_text
from app.services.salary import fmt_lpa


def _obj(schema_props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": schema_props, "required": required or [], "additionalProperties": False}


TOOLS = [
    {"name": "search_jobs", "description": "Search the candidate's stored jobs (discovered from job sources or added "
     "manually). Use for questions like 'Flutter lead jobs posted today' or 'remote architect roles above 25 LPA'. "
     "Returns real records only.",
     "input_schema": _obj({
         "text": {"type": "string", "description": "keywords matched against title/company/description"},
         "locations": {"type": "array", "items": {"type": "string"}},
         "work_modes": {"type": "array", "items": {"type": "string", "enum": ["remote", "hybrid", "office"]}},
         "min_ctc_lpa": {"type": "number"}, "posted_within_hours": {"type": "integer"},
         "min_score": {"type": "integer"}, "limit": {"type": "integer"}})},
    {"name": "get_job", "description": "Full details of one job, including its current AI match evaluation.",
     "input_schema": _obj({"job_id": {"type": "integer"}}, ["job_id"])},
    {"name": "evaluate_job", "description": "Run (or re-run) the AI matching engine on a job and return the scores.",
     "input_schema": _obj({"job_id": {"type": "integer"}}, ["job_id"])},
    {"name": "companies_hiring", "description": "Companies with open stored jobs matching a role keyword/location, "
     "ranked by number of matching openings.",
     "input_schema": _obj({"role": {"type": "string"}, "location": {"type": "string"}})},
    {"name": "list_applications", "description": "The candidate's applications, optionally filtered by status or "
     "only those whose follow-up is due.",
     "input_schema": _obj({"status": {"type": "string"}, "follow_up_due": {"type": "boolean"}})},
    {"name": "get_profile", "description": "The candidate's confirmed profile facts (experience, skills, preferences).",
     "input_schema": _obj({})},
    {"name": "prepare_application_package", "description": "Create a tailored resume (and optionally a cover letter) "
     "for a job as an internal draft and move the application to 'awaiting approval'. Does NOT apply.",
     "input_schema": _obj({"job_id": {"type": "integer"}, "variant": {"type": "string", "enum": [
         "master", "flutter_lead", "mobile_architect", "engineering_leadership"]},
         "cover_letter": {"type": "boolean"}}, ["job_id"])},
    {"name": "draft_outreach", "description": "Create an outreach DRAFT (not sent) to a recruiter/hiring manager. "
     "The candidate must review and approve it in Outreach before anything is sent.",
     "input_schema": _obj({"channel": {"type": "string", "enum": ["linkedin_connect", "linkedin_dm",
                                                                  "application_email", "followup_email", "intro"]},
                           "job_id": {"type": "integer"}, "recruiter_id": {"type": "integer"}}, ["channel"])},
    {"name": "list_contacts", "description": "Saved recruiters / hiring contacts, optionally for one company.",
     "input_schema": _obj({"company": {"type": "string"}})},
    {"name": "interview_questions", "description": "Questions from the interview question bank for a topic "
     "(flutter, architecture, security, firebase, android, ios, devops, leadership).",
     "input_schema": _obj({"topic": {"type": "string"}, "limit": {"type": "integer"}})},
    {"name": "interview_performance", "description": "Mock interview results: average score by topic and trend.",
     "input_schema": _obj({})},
    {"name": "career_stats", "description": "Funnel stats: jobs discovered, shortlisted, applications, responses, "
     "interviews, offers, conversion rates. Optional window in days.",
     "input_schema": _obj({"days": {"type": "integer"}})},
    {"name": "start_job_search", "description": "Trigger the job discovery automation now (searches configured "
     "sources). Returns a run id; results appear in Discover Jobs when it finishes.",
     "input_schema": _obj({})},
]


def _job_row(j: Job, m: JobMatch | None) -> dict:
    return {"id": j.id, "title": j.title, "company": j.company_name, "location": j.location, "work_mode": j.work_mode,
            "ctc": fmt_lpa(j.ctc_min_lpa, j.ctc_max_lpa), "posted": j.posted_at.isoformat() if j.posted_at else None,
            "status": j.status, "url": j.apply_url or j.url,
            "score": m.overall_score if m else None, "classification": m.classification if m else None}


def run_tool(db: Session, user: User, name: str, args: dict) -> tuple[str, str]:
    """Returns (json result for the model, short human summary)."""
    if name == "search_jobs":
        q = (select(Job, JobMatch).outerjoin(JobMatch, and_(JobMatch.job_id == Job.id, JobMatch.is_current))
             .where(Job.user_id == user.id, Job.archived_at.is_(None), Job.dismissed_at.is_(None), Job.status != "expired"))
        if args.get("text"):
            for w in args["text"].split()[:6]:
                q = q.where((Job.title.ilike(f"%{w}%")) | (Job.description.ilike(f"%{w}%")) | (Job.company_name.ilike(f"%{w}%")))
        if args.get("locations"):
            from sqlalchemy import or_
            q = q.where(or_(*[Job.location.ilike(f"%{l}%") for l in args["locations"]],
                            Job.work_mode == "remote" if any("remote" in l.lower() for l in args["locations"]) else False))
        if args.get("work_modes"):
            q = q.where(Job.work_mode.in_(args["work_modes"]))
        if args.get("min_ctc_lpa") is not None:
            q = q.where(Job.ctc_max_lpa >= args["min_ctc_lpa"])
        if args.get("posted_within_hours"):
            cutoff = now_utc() - timedelta(hours=args["posted_within_hours"])
            q = q.where(func.coalesce(Job.posted_at, Job.discovered_at) >= cutoff)
        if args.get("min_score") is not None:
            q = q.where(JobMatch.overall_score >= args["min_score"])
        rows = db.execute(q.order_by(JobMatch.overall_score.desc().nulls_last(), Job.posted_at.desc().nulls_last())
                          .limit(min(int(args.get("limit") or 10), 25))).all()
        total = db.scalar(select(func.count(Job.id)).where(Job.user_id == user.id, Job.archived_at.is_(None)))
        return json.dumps({"jobs": [_job_row(j, m) for j, m in rows], "total_jobs_in_database": total}), \
            f"Found {len(rows)} jobs"
    if name in ("get_job", "evaluate_job"):
        j = db.get(Job, int(args["job_id"]))
        if not j or j.user_id != user.id:
            return json.dumps({"error": "job not found"}), "Job not found"
        if name == "evaluate_job":
            m = score_job(db, j, get_or_create_profile(db, user))
            db.commit()
        else:
            m = db.scalar(select(JobMatch).where(JobMatch.job_id == j.id, JobMatch.is_current))
        data = _job_row(j, m) | {"description": j.description[:6000], "experience": [j.experience_min_years,
                                                                                    j.experience_max_years]}
        if m:
            data["match"] = {k: getattr(m, k) for k in (
                "technical_score", "leadership_score", "architecture_score", "compensation_score", "location_score",
                "company_score", "overall_score", "matching_skills", "missing_skills", "experience_gaps",
                "reasons_to_apply", "reasons_not_to_apply", "suggested_resume", "recommended_action", "explanation",
                "adjustments", "model")}
        return json.dumps(data, default=str), f"{'Evaluated' if name == 'evaluate_job' else 'Loaded'} job #{j.id}"
    if name == "companies_hiring":
        q = select(Job.company_name, func.count(Job.id), func.max(Job.posted_at)).where(
            Job.user_id == user.id, Job.archived_at.is_(None), Job.status != "expired")
        if args.get("role"):
            q = q.where(Job.title.ilike(f"%{args['role']}%"))
        if args.get("location"):
            q = q.where(Job.location.ilike(f"%{args['location']}%"))
        rows = db.execute(q.group_by(Job.company_name).order_by(func.count(Job.id).desc()).limit(15)).all()
        return json.dumps([{"company": c, "open_jobs": n, "latest_posted": str(p)} for c, n, p in rows]), \
            f"{len(rows)} companies"
    if name == "list_applications":
        q = select(Application).where(Application.user_id == user.id, Application.archived_at.is_(None))
        if args.get("status"):
            q = q.where(Application.status == args["status"])
        if args.get("follow_up_due"):
            q = q.where(Application.follow_up_date <= local_today())
        apps = db.scalars(q.order_by(Application.updated_at.desc()).limit(30)).all()
        return json.dumps([{"id": a.id, "job_id": a.job_id, "title": a.job.title, "company": a.job.company_name,
                            "status": a.status, "applied_at": str(a.applied_at) if a.applied_at else None,
                            "follow_up_date": str(a.follow_up_date) if a.follow_up_date else None} for a in apps]), \
            f"{len(apps)} applications"
    if name == "get_profile":
        return profile_fact_text(get_or_create_profile(db, user)), "Loaded profile"
    if name == "prepare_application_package":
        from app.api.applications import prepare_package
        from app.schemas.apps import PrepareIn
        from app.services.applications import ensure_application
        j = db.get(Job, int(args["job_id"]))
        if not j or j.user_id != user.id:
            return json.dumps({"error": "job not found"}), "Job not found"
        a = ensure_application(db, user, j, status="shortlisted", note="Created by Career Agent", actor="agent")
        j.shortlisted_at = j.shortlisted_at or now_utc()
        db.flush()
        d = prepare_package(a.id, PrepareIn(variant=args.get("variant"), cover_letter=args.get("cover_letter", True)),
                            user, db)
        return json.dumps({"application_id": a.id, "resume_id": d.resume_id, "cover_letter_id": d.cover_letter_id,
                           "status": d.status, "note": "Draft package ready for the candidate's review in Applications. "
                           "Nothing was submitted."}), f"Prepared package for {j.company_name}"
    if name == "draft_outreach":
        from app.api.outreach import create_draft
        from app.schemas.apps import OutreachCreate
        o = create_draft(OutreachCreate(channel=args["channel"], job_id=args.get("job_id"),
                                        recruiter_id=args.get("recruiter_id")), user, db)
        return json.dumps({"draft_id": o.id, "subject": o.subject, "body": o.body, "status": "draft",
                           "note": "Saved as draft; the candidate must approve it in Outreach before sending."}), \
            f"Drafted {args['channel']}"
    if name == "list_contacts":
        q = select(Recruiter).where(Recruiter.user_id == user.id, Recruiter.archived_at.is_(None))
        if args.get("company"):
            q = q.where(Recruiter.company_name.ilike(f"%{args['company']}%"))
        rs = db.scalars(q.limit(30)).all()
        return json.dumps([{"id": r.id, "name": r.name, "designation": r.designation, "company": r.company_name,
                            "linkedin": r.linkedin_url, "email": r.email, "verification": r.verification_status,
                            "source": r.source_url} for r in rs]), f"{len(rs)} contacts"
    if name == "interview_questions":
        from app.interview.service import seed_bank
        from app.models import InterviewQuestion
        seed_bank(db)
        q = select(InterviewQuestion).where(InterviewQuestion.user_id.is_(None) | (InterviewQuestion.user_id == user.id))
        if args.get("topic"):
            q = q.where(InterviewQuestion.topic == args["topic"].lower())
        qs = db.scalars(q.limit(min(int(args.get("limit") or 8), 20))).all()
        return json.dumps([{"question": x.question, "key_points": x.key_points, "topic": x.topic} for x in qs]), \
            f"{len(qs)} questions"
    if name == "interview_performance":
        from app.api.interview_coach import progress
        sessions = db.scalar(select(func.count(MockInterviewSession.id)).where(MockInterviewSession.user_id == user.id))
        return json.dumps(progress(user, db) | {"sessions_total": sessions}, default=str), "Loaded interview stats"
    if name == "career_stats":
        return json.dumps(summary(db, user.id, days=args.get("days"))), "Loaded stats"
    if name == "start_job_search":
        from app.automation.runner import create_run, dispatch
        run = create_run(db, user.id, "discover_jobs", f"discover_jobs:{user.id}:agent:{now_utc():%Y%m%d%H%M%S%f}", "manual")
        dispatch(run.id)
        return json.dumps({"run_id": run.id, "status": "started"}), "Started job discovery"
    return json.dumps({"error": f"unknown tool {name}"}), "Unknown tool"


__all__ = ["TOOLS", "run_tool", "Company", "OutreachMessage"]
