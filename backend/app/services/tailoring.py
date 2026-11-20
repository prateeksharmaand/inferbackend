"""Tailored resumes, cover letters and outreach drafts for a specific job.

Claude may re-word, re-order and select, but never add facts. After generation, code re-checks every
rewritten bullet, summary and letter against the profile (factcheck); anything that introduces a number
or technical skill not present in the source is reverted (bullets) or reported (letters), and the
report is stored with the document."""
import re

from pydantic import BaseModel, Field

from app.models import CandidateProfile, Job
from app.services import ai
from app.services.factcheck import check_text, unsupported_numbers, unsupported_skills
from app.services.profile_service import confirmed_skills, profile_fact_text
from app.services.resume_builder import build_content
from app.services.salary import fmt_lpa
from app.services.skills_catalog import norm


class TailoredBullet(BaseModel):
    source_index: int = Field(description="index of the original bullet this rewrites")
    text: str


class TailoredRole(BaseModel):
    company: str
    bullets: list[TailoredBullet]


class TailoredResume(BaseModel):
    headline: str
    summary: str
    skills: list[str] = Field(description="Ordered subset of the candidate's confirmed skills, most relevant first")
    experience: list[TailoredRole]
    keywords_covered: list[str]
    keywords_missing: list[str] = Field(description="Important job keywords the candidate genuinely lacks")


TAILOR_SYSTEM = """You tailor a candidate's resume to one job description for ATS and recruiter review.
Hard rules — violating any of them makes the output unusable:
- Use ONLY facts present in the candidate's resume content. Do not add employers, titles, dates, metrics,
  numbers, technologies, certifications or achievements that are not already there.
- You may: rewrite bullets for clarity and to surface job-relevant keywords the candidate truly has, reorder
  bullets and skills, tighten the summary, and choose a headline that is consistent with the candidate's
  actual titles.
- Every rewritten bullet must cite source_index of the original bullet it rewrites, and keep its meaning.
- skills must be chosen from the provided confirmed skills list only.
- List genuinely missing job keywords in keywords_missing instead of claiming them."""


def _base_and_source(p: CandidateProfile, variant: str):
    content = build_content(p, variant)
    return content, profile_fact_text(p)


def tailor_resume(p: CandidateProfile, job: Job, variant: str) -> tuple[dict, dict]:
    """Returns (content, report)."""
    content, source = _base_and_source(p, variant)
    confirmed = confirmed_skills(p)
    report = {"method": "rules-v1", "reverted": [], "dropped_skills": [], "keywords_missing": [],
              "keywords_covered": []}
    job_sk = [s.name for s in job.skills]
    mine = {norm(s) for s in confirmed}
    report["keywords_covered"] = [s for s in job_sk if norm(s) in mine]
    report["keywords_missing"] = [s for s in job_sk if norm(s) not in mine]
    try:
        payload = {"headline": content["headline"], "summary": content["summary"], "skills": confirmed,
                   "experience": [{"company": e["company"], "title": e["title"], "dates": e["dates"],
                                   "bullets": [{"index": i, "text": b} for i, b in enumerate(e["bullets"])]}
                                  for e in content["experience"]]}
        out = ai.structured(TAILOR_SYSTEM, f"<resume_content>\n{payload}\n</resume_content>\n\n<job>\nTitle: "
                            f"{job.title}\nCompany: {job.company_name}\n\n{job.description[:10000]}\n</job>",
                            TailoredResume, max_tokens=12000)
    except ai.AIUnavailable as e:
        report["note"] = f"AI unavailable ({e}); skills and bullets re-ordered by job relevance only."
        return _rules_tailor(content, job), report
    report["method"] = ai.model_name()
    # headline/summary: accept only if no unsupported numbers/skills
    for field in ("headline", "summary"):
        new = getattr(out, field)
        issues = check_text(new, source, confirmed)
        if issues:
            report["reverted"].append({"field": field, "reason": "; ".join(issues)})
        else:
            content[field] = new
    allowed = {norm(s): s for s in confirmed}
    skills = [allowed[norm(s)] for s in out.skills if norm(s) in allowed]
    report["dropped_skills"] = [s for s in out.skills if norm(s) not in allowed]
    content["skills"] = list(dict.fromkeys(skills + [s for s in confirmed if s not in skills]))
    by_company = {r.company.strip().lower(): r for r in out.experience}
    for e in content["experience"]:
        r = by_company.get(e["company"].strip().lower())
        if not r:
            continue
        new_bullets = []
        for b in r.bullets:
            if not 0 <= b.source_index < len(e["bullets"]):
                report["reverted"].append({"field": f"{e['company']} bullet", "reason": "no valid source bullet"})
                continue
            orig = e["bullets"][b.source_index]
            nums = unsupported_numbers(b.text, orig)
            sk = unsupported_skills(b.text, confirmed)
            if nums or sk:
                report["reverted"].append({"field": f"{e['company']} bullet {b.source_index}",
                                           "reason": f"introduced {', '.join(sorted(nums | sk))}"})
                new_bullets.append(orig)
            else:
                new_bullets.append(b.text)
        used = {b.source_index for b in r.bullets}
        e["bullets"] = new_bullets + [x for i, x in enumerate(e["bullets"]) if i not in used]
    report["keywords_missing"] = out.keywords_missing
    report["keywords_covered"] = out.keywords_covered
    return content, report


def _rules_tailor(content: dict, job: Job) -> dict:
    words = {norm(s.name) for s in job.skills}
    jd = job.description.lower()
    content["skills"].sort(key=lambda s: (norm(s) not in words, s.lower() not in jd))
    for e in content["experience"]:
        e["bullets"].sort(key=lambda b: -sum(1 for w in re.findall(r"[a-z]{4,}", b.lower()) if w in jd))
    return content


class Letter(BaseModel):
    subject: str
    body: str


LETTER_SYSTEM = """You write concise, specific cover letters (250-350 words) for a senior mobile engineering
candidate in India. Use ONLY facts from the candidate profile — no invented metrics, employers, tools or
achievements. Reference 2-3 concrete, true overlaps with the job. Plain text, paragraphs separated by a blank
line, no placeholders like [Company]. Sign with the candidate's name."""


def cover_letter(p: CandidateProfile, job: Job) -> tuple[str, str, dict]:
    source = profile_fact_text(p)
    try:
        out = ai.structured(LETTER_SYSTEM, f"<candidate>\n{source}\n</candidate>\n<job>\nTitle: {job.title}\n"
                            f"Company: {job.company_name}\nLocation: {job.location}\n\n{job.description[:8000]}\n</job>",
                            Letter, max_tokens=4000)
        issues = check_text(out.body, source + "\n" + job.description, confirmed_skills(p))
        return out.subject, out.body, {"method": ai.model_name(), "issues": issues}
    except ai.AIUnavailable as e:
        return (f"Application for {job.title}", _template_letter(p, job),
                {"method": "template-v1", "note": f"AI unavailable ({e}); template letter from profile facts."})


def _template_letter(p: CandidateProfile, job: Job) -> str:
    mine = {norm(s): s for s in confirmed_skills(p)}
    overlap = [mine[norm(s.name)] for s in job.skills if norm(s.name) in mine][:6]
    current = next((e for e in p.employment if e.is_current), p.employment[0] if p.employment else None)
    role = f"as {current.title} at {current.company}" if current else ""
    yrs = f"{p.total_experience_years:g}+ years" if p.total_experience_years else "several years"
    para2 = (f"My experience aligns with your requirements in {', '.join(overlap)}."
             if overlap else "I believe my background in mobile engineering aligns well with this role.")
    ach = f" Highlights include: {p.achievements[0]}" if p.achievements else ""
    return (f"Dear Hiring Team,\n\nI am writing to apply for the {job.title} role at {job.company_name}. I bring "
            f"{yrs} of mobile engineering experience and currently work {role}.\n\n{para2}{ach}\n\n"
            f"I would welcome the opportunity to discuss how I can contribute to {job.company_name}'s mobile team.\n\n"
            f"Regards,\n{p.full_name}\n{p.email}\n{p.phone}")


class Outreach(BaseModel):
    subject: str = ""
    body: str


CHANNEL_RULES = {
    "linkedin_connect": "LinkedIn connection request note. HARD LIMIT 280 characters. No subject.",
    "linkedin_dm": "LinkedIn direct message, 80-150 words. No subject.",
    "application_email": "Email applying for the role with resume attached, 120-200 words, with subject.",
    "followup_email": "Polite follow-up email on an earlier application, 60-120 words, with subject.",
    "intro": "Short introduction message to a recruiter about relevant roles, 80-140 words.",
}
OUTREACH_SYSTEM = """You draft personalised, professional outreach from a senior mobile engineer in India to a
specific person at a company. Use ONLY facts from the candidate profile and the job. Never invent mutual
connections, referrals, prior conversations, metrics or skills. Be specific and brief; no flattery clichés.
Sign with the candidate's first name."""


def outreach(p: CandidateProfile, channel: str, job: Job | None, recruiter=None) -> tuple[str, str, dict]:
    source = profile_fact_text(p)
    who = (f"{recruiter.name}, {recruiter.designation} at {recruiter.company_name}" if recruiter else "the hiring team")
    jtxt = f"Title: {job.title}\nCompany: {job.company_name}\n{job.description[:5000]}" if job else "No specific job."
    try:
        out = ai.structured(OUTREACH_SYSTEM, f"Channel: {CHANNEL_RULES[channel]}\nRecipient: {who}\n<candidate>\n"
                            f"{source}\n</candidate>\n<job>\n{jtxt}\n</job>", Outreach, max_tokens=2000, effort="low")
        body = out.body.strip()
        if channel == "linkedin_connect" and len(body) > 300:
            body = body[:297].rsplit(" ", 1)[0] + "…"
        issues = check_text(body, source + "\n" + (job.description if job else ""), confirmed_skills(p))
        return out.subject, body, {"method": ai.model_name(), "issues": issues}
    except ai.AIUnavailable as e:
        return (*_template_outreach(p, channel, job, recruiter), {"method": "template-v1", "note": str(e)})


def _template_outreach(p, channel, job, recruiter) -> tuple[str, str]:
    first = (recruiter.name.split()[0] if recruiter and recruiter.name else "there")
    me = p.full_name.split()[0] if p.full_name else ""
    yrs = f"{p.total_experience_years:g}+ years" if p.total_experience_years else "years"
    role = job.title if job else "senior mobile roles"
    co = job.company_name if job else (recruiter.company_name if recruiter else "your company")
    if channel == "linkedin_connect":
        return "", f"Hi {first}, I'm a mobile engineering lead ({yrs}, Flutter & Android) interested in the {role} role at {co}. Would love to connect. — {me}"[:300]
    if channel == "followup_email":
        return (f"Following up: {role} application",
                f"Hi {first},\n\nI applied for the {role} position at {co} recently and wanted to follow up. I remain "
                f"very interested and would be glad to share more about my {yrs} in mobile engineering.\n\nThanks,\n{me}")
    return (f"{role} — {p.full_name}",
            f"Hi {first},\n\nI'm {p.full_name}, a mobile engineering lead with {yrs} of experience. I'm interested in "
            f"the {role} role at {co} and believe my background is a strong fit. My resume is attached; happy to "
            f"share more.\n\nBest regards,\n{p.full_name}\n{p.phone}")


def expected_ctc_note(p: CandidateProfile) -> str:
    return fmt_lpa(p.target_ctc_min_lpa, p.target_ctc_max_lpa)
