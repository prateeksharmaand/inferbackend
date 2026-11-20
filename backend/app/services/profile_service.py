from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import CandidateProfile, CandidateProject, CandidateSkill, EmploymentHistory, User
from app.services.resume_parser import ResumeExtraction
from app.services.skills_catalog import canonical, norm

SCALARS = ["full_name", "email", "phone", "linkedin_url", "location", "headline", "professional_summary",
           "total_experience_years", "flutter_experience_years", "android_experience_years",
           "leadership_experience_years"]


def get_or_create_profile(db: Session, user: User) -> CandidateProfile:
    p = db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == user.id).options(
        selectinload(CandidateProfile.skills), selectinload(CandidateProfile.employment),
        selectinload(CandidateProfile.projects)))
    if p is None:
        p = CandidateProfile(user_id=user.id, full_name=user.full_name, email=user.email)
        db.add(p)
        db.flush()
        db.refresh(p)
    return p


def apply_extraction(db: Session, p: CandidateProfile, ex: ResumeExtraction, *, replace: bool, resume_id: int) -> dict:
    """Merge resume facts into the profile. replace=False only fills empty fields and adds new skills."""
    changed = []
    for f in SCALARS:
        val = getattr(ex, f)
        if val in (None, "", []):
            continue
        if replace or getattr(p, f) in (None, "", []):
            setattr(p, f, val)
            changed.append(f)
    for f in ("education", "certifications", "achievements"):
        val = getattr(ex, f)
        if val and (replace or not getattr(p, f)):
            setattr(p, f, list(val))
            changed.append(f)

    if ex.employment and (replace or not p.employment):
        p.employment.clear()
        db.flush()
        for i, e in enumerate(ex.employment):
            p.employment.append(EmploymentHistory(
                company=e.company, title=e.title, location=e.location, start_date=e.start_date,
                end_date=e.end_date, is_current=e.is_current, description=e.description,
                highlights=e.highlights, sort_order=i))
        changed.append("employment")
    if ex.projects and (replace or not p.projects):
        p.projects.clear()
        db.flush()
        for i, pr in enumerate(ex.projects):
            p.projects.append(CandidateProject(name=pr.name, employer=pr.employer, tech_stack=pr.tech_stack,
                                               description=pr.description, metrics=pr.metrics, sort_order=i))
        changed.append("projects")

    existing = {norm(s.name): s for s in p.skills}
    added = 0
    for s in ex.skills:
        key = norm(s.name)
        if key in existing:
            if existing[key].source == "user" and not existing[key].confirmed:
                existing[key].confirmed = True  # resume now corroborates a user-claimed skill
                existing[key].source = "resume"
            continue
        p.skills.append(CandidateSkill(name=canonical(s.name)[:80], category=s.category, source="resume",
                                       confirmed=True))
        existing[key] = p.skills[-1]
        added += 1
    p.extracted_from_resume_id = resume_id
    p.needs_confirmation = compute_confirmations(p, ex.notes)
    return {"changed_fields": changed, "skills_added": added}


def compute_confirmations(p: CandidateProfile, notes: list[str] | None = None) -> list[dict]:
    """Recompute the 'please confirm' list. Resume-parser notes and manual notes persist until a new
    resume is parsed (notes passed explicitly) or the user edits the profile field they refer to."""
    kept = [i for i in (p.needs_confirmation or []) if i.get("field") in ("resume", "note")] if notes is None else []
    items = []
    for f, label in [("target_ctc_min_lpa", "Target CTC"), ("current_ctc_lpa", "Current CTC"),
                     ("notice_period_days", "Notice period"), ("location", "Current location"),
                     ("leadership_experience_years", "Leadership experience (years)")]:
        if getattr(p, f) in (None, ""):
            items.append({"field": f, "message": f"{label} is missing"})
    for s in p.skills:
        if not s.confirmed:
            items.append({"field": "skills", "message": f"'{s.name}' is not in your resume. Confirm you have "
                          "hands-on experience, or remove it. Unconfirmed skills are excluded from matching "
                          "and generated resumes."})
    for n in notes or []:
        items.append({"field": "resume", "message": n})
    return items + kept


def confirmed_skills(p: CandidateProfile) -> list[str]:
    return [s.name for s in p.skills if s.confirmed]


def profile_fact_text(p: CandidateProfile) -> str:
    """Plain-text fact sheet given to Claude. Only confirmed facts."""
    lines = [
        f"Name: {p.full_name}", f"Headline: {p.headline}", f"Location: {p.location}",
        f"Total experience: {p.total_experience_years} years",
        f"Flutter experience: {p.flutter_experience_years} years",
        f"Android experience: {p.android_experience_years} years",
        f"Leadership experience: {p.leadership_experience_years} years",
        f"Summary: {p.professional_summary}",
        f"Confirmed skills: {', '.join(confirmed_skills(p))}",
        f"Preferred designations: {', '.join(p.preferred_designations or [])}",
        f"Target CTC (INR LPA): {p.target_ctc_min_lpa}–{p.target_ctc_max_lpa}",
        f"Current CTC (INR LPA): {p.current_ctc_lpa}",
        f"Preferred locations: {', '.join(p.preferred_locations or [])}",
        f"Preferred work modes: {', '.join(p.preferred_work_modes or [])}",
        "Employment:",
    ]
    for e in p.employment:
        lines.append(f"- {e.title} at {e.company} ({e.start_date} – {'Present' if e.is_current else e.end_date})"
                     f"{' | ' + e.location if e.location else ''}")
        lines += [f"    • {h}" for h in e.highlights]
    lines.append("Projects:")
    for pr in p.projects:
        lines.append(f"- {pr.name}: {pr.description} [{', '.join(pr.tech_stack)}] {pr.metrics}")
    if p.achievements:
        lines.append("Achievements:")
        lines += [f"- {a}" for a in p.achievements]
    if p.certifications:
        lines.append("Certifications: " + "; ".join(p.certifications))
    if p.education:
        lines.append("Education: " + "; ".join(p.education))
    return "\n".join(lines)
