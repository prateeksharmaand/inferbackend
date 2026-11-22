"""Job ↔ candidate matching.

Weights (sum 100): technical 25 · seniority/leadership 20 · architecture/Flutter 20 · compensation 15 ·
location/work-mode 10 · company 10.  Classification: ≥85 Excellent · 70–84 Strong · 55–69 Potential · <55 Low.

Claude produces category scores + reasoning (structured output, validated by Pydantic). The server then
applies guardrails so AI can't invent facts or inflate scores:
  - matching_skills must be skills the candidate has CONFIRMED; others are removed
  - each category is clamped to its max; overall is recomputed as the sum (AI's own total is ignored)
  - compensation/location are capped by hard facts (known CTC below target, non-preferred city, ...)
  - company score is capped at 7/10 until the company has been researched
All corrections are stored in job_matches.adjustments. Without an API key, `rules-v1` scores deterministically.
"""
import re
from dataclasses import dataclass

from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import CandidateProfile, Company, Job, JobMatch
from app.models.enums import Classification
from app.services import ai
from app.services.profile_service import confirmed_skills, profile_fact_text
from app.services.salary import fmt_lpa
from app.services.skills_catalog import find_skills, norm

PROMPT_VERSION = "match-v1"
MAX = {"technical": 25, "leadership": 20, "architecture": 20, "compensation": 15, "location": 10, "company": 10}
RESUME_KINDS = ("master", "flutter_lead", "mobile_architect", "engineering_leadership")


def classify(score: int) -> str:
    if score >= 85:
        return Classification.excellent
    if score >= 70:
        return Classification.strong
    if score >= 55:
        return Classification.potential
    return Classification.low


class MatchAI(BaseModel):
    technical_score: int = Field(description="0-25: overlap of required technical skills with CONFIRMED skills")
    leadership_score: int = Field(description="0-20: seniority/leadership fit vs the candidate's actual roles")
    architecture_score: int = Field(description="0-20: architecture & Flutter relevance of the role and candidate")
    compensation_score: int = Field(description="0-15: fit with target CTC; 8 if salary not disclosed")
    location_score: int = Field(description="0-10: fit with preferred locations / work modes")
    company_score: int = Field(description="0-10: company quality from the info given; 5 if unknown")
    matching_skills: list[str] = Field(description="Job requirements the candidate demonstrably has (from confirmed skills)")
    missing_skills: list[str] = Field(description="Job requirements not evidenced in the candidate profile")
    experience_gaps: list[str]
    leadership_relevance: str
    architecture_relevance: str
    compensation_compatibility: str
    reasons_to_apply: list[str]
    reasons_not_to_apply: list[str]
    suggested_resume: str = Field(description="one of master|flutter_lead|mobile_architect|engineering_leadership")
    recommended_action: str
    explanation: str = Field(description="2-4 sentence summary of the match")


SYSTEM = f"""You are a meticulous technical recruiter evaluating ONE job against ONE candidate.
Score strictly from the evidence provided. Rules:
- Use only facts in <candidate> and <job>. Never assume experience, skills, salary or company facts that are
  not stated. If the job does not state something (salary, work mode), say it's unknown.
- matching_skills must come from the candidate's "Confirmed skills" and also be relevant to the job.
- Be conservative: a high score must be justified by explicit overlap. A generic "Senior Engineer" role with
  little mobile content should not score highly on architecture/Flutter relevance.
- Category maxima: technical {MAX['technical']}, leadership {MAX['leadership']}, architecture {MAX['architecture']},
  compensation {MAX['compensation']}, location {MAX['location']}, company {MAX['company']}.
- Salary figures are INR lakhs per annum (LPA).
- Refer to the candidate by first name or as "the candidate"; never use gendered pronouns or assume gender.
Prompt version: {PROMPT_VERSION}."""


def job_text(job: Job, company: Company | None) -> str:
    comp = ""
    if company and company.research_status == "done":
        comp = (f"\nCompany research: {company.overview[:800]} | size: {company.size} | industry: {company.industry}"
                f" | risks: {'; '.join(company.risks or [])[:400]}")
    return (f"Title: {job.title}\nCompany: {job.company_name}\nLocation: {job.location or 'not stated'}\n"
            f"Work mode: {job.work_mode}\nCTC: {fmt_lpa(job.ctc_min_lpa, job.ctc_max_lpa)}\n"
            f"Experience required: {job.experience_min_years or '?'}–{job.experience_max_years or '?'} years\n"
            f"Detected skills: {', '.join(s.name for s in job.skills)}{comp}\n\nDescription:\n{job.description[:12000]}")


@dataclass
class Facts:
    comp_cap: int | None
    comp_note: str
    loc_cap: int | None
    loc_note: str
    company_cap: int


def hard_facts(job: Job, p: CandidateProfile, company: Company | None) -> Facts:
    tmin = float(p.target_ctc_min_lpa) if p.target_ctc_min_lpa else None
    jmax = float(job.ctc_max_lpa) if job.ctc_max_lpa else None
    comp_cap, comp_note = None, ""
    if tmin and jmax:
        if jmax < tmin * 0.8:
            comp_cap, comp_note = 3, f"Posted max {jmax:g} LPA is well below target {tmin:g} LPA"
        elif jmax < tmin:
            comp_cap, comp_note = 8, f"Posted max {jmax:g} LPA is below target {tmin:g} LPA"
    elif tmin and not jmax:
        comp_cap, comp_note = 10, "Salary not disclosed"
    prefs = [l.lower() for l in (p.preferred_locations or [])]
    modes = p.preferred_work_modes or ["remote", "hybrid", "office"]
    loc = (job.location or "").lower()
    in_pref_city = any(c.split()[0] in loc for c in prefs if c and "remote" not in c) or \
        ("bangalore" in loc and any("bengaluru" in c for c in prefs)) or \
        ("gurgaon" in loc and any("gurugram" in c for c in prefs))
    loc_cap, loc_note = None, ""
    if job.work_mode == "remote":
        if "remote" not in modes:
            loc_cap, loc_note = 4, "Remote role but remote is not a preferred work mode"
    elif job.work_mode in ("office", "hybrid") and job.work_mode not in modes:
        loc_cap, loc_note = 3, f"{job.work_mode.title()} role but not a preferred work mode"
    elif loc and prefs and not in_pref_city and job.work_mode != "remote":
        loc_cap, loc_note = 4, f"Location '{job.location}' is not in preferred locations"
    company_cap = 10 if company and company.research_status == "done" else 7
    return Facts(comp_cap, comp_note, loc_cap, loc_note, company_cap)


def guard(m: MatchAI, job: Job, p: CandidateProfile, company: Company | None) -> tuple[dict, list[str]]:
    adj: list[str] = []
    mine = {norm(s): s for s in confirmed_skills(p)}
    kept, dropped = [], []
    for s in m.matching_skills:
        (kept if norm(s) in mine or any(norm(x) in mine for x in find_skills(s)) else dropped).append(s)
    if dropped:
        adj.append(f"Removed unconfirmed matching skills: {', '.join(dropped)}")
    scores = {"technical": m.technical_score, "leadership": m.leadership_score,
              "architecture": m.architecture_score, "compensation": m.compensation_score,
              "location": m.location_score, "company": m.company_score}
    for k, v in scores.items():
        c = max(0, min(MAX[k], int(v)))
        if c != v:
            adj.append(f"{k} score {v} clamped to {c}")
        scores[k] = c
    f = hard_facts(job, p, company)
    for key, cap, note in (("compensation", f.comp_cap, f.comp_note), ("location", f.loc_cap, f.loc_note),
                           ("company", f.company_cap, "Company not yet researched")):
        if cap is not None and scores[key] > cap:
            adj.append(f"{key} capped {scores[key]}→{cap}: {note}")
            scores[key] = cap
    # Technical score can't exceed what verified overlap supports
    job_sk = {norm(s.name) for s in job.skills}
    if job_sk:
        overlap = len(job_sk & set(mine)) / len(job_sk)
        cap = round(MAX["technical"] * min(1.0, overlap + 0.35))
        if scores["technical"] > cap:
            adj.append(f"technical capped {scores['technical']}→{cap}: only {overlap:.0%} of detected job skills confirmed")
            scores["technical"] = cap
    data = m.model_dump()
    data["matching_skills"] = kept
    if data["suggested_resume"] not in RESUME_KINDS:
        data["suggested_resume"] = "master"
    return {**data, **{f"{k}_score": v for k, v in scores.items()}}, adj


def rules_score(job: Job, p: CandidateProfile, company: Company | None) -> tuple[dict, list[str]]:
    """Deterministic fallback when Claude is unavailable."""
    mine = {norm(s): s for s in confirmed_skills(p)}
    job_sk = {norm(s.name): s.name for s in job.skills}
    match = [job_sk[k] for k in job_sk if k in mine]
    missing = [job_sk[k] for k in job_sk if k not in mine]
    text = f"{job.title} {job.description}".lower()
    title = job.title.lower()
    technical = round(25 * (len(match) / len(job_sk))) if job_sk else 8
    lead_words = sum(w in title for w in ("lead", "architect", "principal", "head", "manager", "staff"))
    leadership = min(20, 6 + 7 * lead_words + (4 if re.search(r"(lead|mentor|manage) (a |the )?team", text) else 0))
    if p.total_experience_years and job.experience_min_years and float(job.experience_min_years) > float(p.total_experience_years):
        leadership = min(leadership, 8)
    arch = 0
    arch += 8 if "flutter" in text else (4 if re.search(r"android|ios|mobile", text) else 0)
    arch += 6 if re.search(r"architect", text) else 0
    arch += 6 if re.search(r"clean architecture|modular|scalab|system design|sdk", text) else 0
    f = hard_facts(job, p, company)
    comp = f.comp_cap if f.comp_cap is not None else (15 if job.ctc_max_lpa else 8)
    loc = f.loc_cap if f.loc_cap is not None else 10
    comp_score = company.quality_score if company and company.quality_score is not None else 5
    scores = {"technical": technical, "leadership": leadership, "architecture": min(20, arch),
              "compensation": min(15, comp), "location": min(10, loc), "company": min(f.company_cap, comp_score)}
    suggested = ("mobile_architect" if "architect" in title else "engineering_leadership"
                 if re.search(r"manager|head|director", title) else "flutter_lead" if "flutter" in title else "master")
    data = {f"{k}_score": v for k, v in scores.items()}
    data.update(matching_skills=match, missing_skills=missing[:15], experience_gaps=[],
                leadership_relevance=f"Title signals: {lead_words} seniority keyword(s).",
                architecture_relevance="Flutter mentioned." if "flutter" in text else "No explicit Flutter mention.",
                compensation_compatibility=f.comp_note or ("Within/above target" if job.ctc_max_lpa else "Not disclosed"),
                reasons_to_apply=[f"Matches {len(match)} of {len(job_sk)} detected skills"] if job_sk else [],
                reasons_not_to_apply=[x for x in [f.comp_note, f.loc_note] if x],
                suggested_resume=suggested,
                recommended_action="Review the description; AI evaluation pending (rule-based score).",
                explanation="Rule-based estimate (Claude unavailable). Run AI matching for a full evaluation.")
    return data, []


def score_job(db: Session, job: Job, p: CandidateProfile, *, use_ai: bool = True) -> JobMatch:
    company = db.get(Company, job.company_id) if job.company_id else None
    model = "rules-v1"
    if use_ai and settings.ai_configured:
        try:
            m = ai.structured(SYSTEM, f"<candidate>\n{profile_fact_text(p)}\n</candidate>\n\n<job>\n"
                              f"{job_text(job, company)}\n</job>", MatchAI, max_tokens=8000)
            data, adj = guard(m, job, p, company)
            model = ai.model_name()
        except ai.AIUnavailable as e:
            data, adj = rules_score(job, p, company)
            adj.append(f"AI unavailable: {e}")
    else:
        data, adj = rules_score(job, p, company)
    overall = sum(data[f"{k}_score"] for k in MAX)
    db.execute(update(JobMatch).where(JobMatch.job_id == job.id, JobMatch.is_current).values(is_current=False))
    jm = JobMatch(job_id=job.id, profile_id=p.id, overall_score=overall, classification=classify(overall),
                  adjustments=adj, model=model, prompt_version=PROMPT_VERSION, is_current=True,
                  **{k: data[k] for k in (
                      "technical_score", "leadership_score", "architecture_score", "compensation_score",
                      "location_score", "company_score", "matching_skills", "missing_skills", "experience_gaps",
                      "leadership_relevance", "architecture_relevance", "compensation_compatibility",
                      "reasons_to_apply", "reasons_not_to_apply", "suggested_resume", "recommended_action",
                      "explanation")})
    db.add(jm)
    db.flush()
    return jm


def unscored_job_ids(db: Session, user_id: int, limit: int) -> list[int]:
    scored = select(JobMatch.job_id).where(JobMatch.is_current, JobMatch.model != "rules-v1")
    return list(db.scalars(select(Job.id).where(Job.user_id == user_id, Job.archived_at.is_(None),
                                                Job.dismissed_at.is_(None), Job.status != "expired",
                                                Job.id.notin_(scored))
                           .order_by(Job.posted_at.desc().nulls_last(), Job.id.desc()).limit(limit)))
