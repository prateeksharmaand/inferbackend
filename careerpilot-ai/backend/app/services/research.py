"""Company and recruiter research using Claude with the server-side web_search tool.

Grounding rules enforced in code (not just in the prompt):
- Company `sources` are only URLs actually returned by web search in this call.
- A recruiter is kept only if its source_url was returned by web search (or is a LinkedIn profile URL that
  appeared in results). Everyone is stored as verification_status="unverified" until the user verifies.
- An email is kept only if we can fetch the cited public page ourselves and the exact address appears in
  it. Pattern-guessed addresses (firstname.lastname@...) are therefore never stored.
"""
import re

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.base import http_client
from app.core.time import now_utc
from app.models import Company, Recruiter
from app.services import ai
from app.services.audit import log_activity


class CompanyResearch(BaseModel):
    website: str = ""
    industry: str = ""
    size: str = Field("", description="e.g. '1,000–5,000 employees' as published")
    headquarters: str = ""
    overview: str = ""
    tech_stack: list[str] = []
    funding: str = Field("", description="Funding/growth facts with dates, only if published")
    engineering_culture: str = ""
    employee_reviews: str = Field("", description="Summary of public review themes with source names; empty if none found")
    hiring_activity: str = ""
    risks: list[str] = Field(default_factory=list, description="Layoffs, funding trouble, legal issues etc. with dates")
    quality_score: int = Field(description="0-10 overall employer quality for a senior mobile engineer; 5 if little info")


class Contact(BaseModel):
    name: str
    designation: str
    role_type: str = Field(description="recruiter|talent_acquisition|hr_manager|hiring_manager|engineering_manager|"
                                       "engineering_director|cto|founder|other")
    linkedin_url: str = ""
    email: str = Field("", description="ONLY an address explicitly published on the source page; never guess")
    source_url: str = Field(description="URL of the public page where this person and role were found")
    evidence: str = Field(description="Short quote/paraphrase from the source showing their current role")


class ContactList(BaseModel):
    contacts: list[Contact]
    notes: str = ""


COMPANY_SYSTEM = """You research employers for a senior mobile engineering candidate in India.
Use web search. Report only facts you found in search results, with dates where relevant.
If something isn't found, leave it empty — do not guess or generalise. Keep each text field concise."""

CONTACT_SYSTEM = """You find people involved in hiring at a company, for a candidate's job search in India:
recruiters, talent acquisition, HR, engineering managers/directors, CTOs, founders.
Strict rules:
- Only include people whose CURRENT role at this company is shown in a public search result.
- source_url must be the exact URL of that result.
- Never construct or guess email addresses. Include an email only if it is explicitly published.
- Prefer people connected to mobile/engineering hiring. Return at most 6 people. An empty list is fine."""


def research_company(db: Session, company: Company, user_id: int) -> Company:
    try:
        r, sources = ai.research(COMPANY_SYSTEM, f"Research the company '{company.name}'"
                                 f"{' (website ' + company.website + ')' if company.website else ''}. Focus on its "
                                 "India engineering presence, products, tech stack, funding/growth, culture, employee "
                                 "reviews, current hiring and risks.", CompanyResearch)
    except ai.AIUnavailable as e:
        company.research_status = "failed"
        company.notes = (company.notes + f"\nResearch failed: {e}").strip()[:4000]
        return company
    for f in ("industry", "size", "headquarters", "overview", "funding", "engineering_culture", "employee_reviews",
              "hiring_activity"):
        setattr(company, f, getattr(r, f)[:4000] if f not in ("industry", "size", "headquarters") else getattr(r, f)[:120])
    if r.website and not company.website:
        company.website = r.website[:255]
    company.tech_stack = r.tech_stack[:30]
    company.risks = r.risks[:10]
    company.quality_score = max(0, min(10, r.quality_score))
    company.sources = sources[:20]
    company.research_status = "done" if sources else "failed"
    if not sources:
        company.notes = (company.notes + "\nNo web sources returned; research not trusted.").strip()
    company.researched_at = now_utc()
    log_activity(db, user_id, "company.researched", company.name, entity_type="company", entity_id=company.id,
                 actor="agent", details={"sources": len(sources)})
    return company


def _email_in_page(email: str, url: str) -> bool:
    if not email or not url or "linkedin.com" in url:
        return False
    try:
        with http_client(15) as c:
            r = c.get(url)
        return r.status_code == 200 and email.lower() in r.text.lower()
    except httpx.HTTPError:
        return False


def discover_contacts(db: Session, company: Company, user_id: int, job_title: str = "") -> dict:
    try:
        r, sources = ai.research(CONTACT_SYSTEM, f"Company: {company.name}"
                                 f"{' (' + company.website + ')' if company.website else ''}. "
                                 f"Role being applied for: {job_title or 'Mobile Technical Lead / Mobile Architect'}. "
                                 "Find recruiters/TA and engineering leaders relevant to this hire in India.",
                                 ContactList, max_searches=8)
    except ai.AIUnavailable as e:
        return {"added": 0, "skipped": [], "error": str(e)}
    returned = {s["url"].rstrip("/") for s in sources}
    added, skipped = 0, []
    for c in r.contacts:
        src = c.source_url.rstrip("/")
        if src not in returned and c.linkedin_url.rstrip("/") not in returned:
            skipped.append(f"{c.name}: source not among search results")
            continue
        email = c.email.strip() if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", c.email.strip(), re.I) else ""
        email_note = ""
        if email and not _email_in_page(email, c.source_url):
            email_note = f" Email '{email}' was dropped: it could not be found on the cited page."
            email = ""
        li = c.linkedin_url.strip() if "linkedin.com/in/" in c.linkedin_url else ""
        exists = db.scalar(select(Recruiter).where(Recruiter.user_id == user_id, (
            (Recruiter.linkedin_url == li) if li else (Recruiter.name == c.name) & (Recruiter.company_id == company.id))))
        if exists:
            skipped.append(f"{c.name}: already saved")
            continue
        db.add(Recruiter(user_id=user_id, company_id=company.id, company_name=company.name, name=c.name[:160],
                         designation=c.designation[:160], role_type=c.role_type if c.role_type in {
                             "recruiter", "talent_acquisition", "hr_manager", "hiring_manager", "engineering_manager",
                             "engineering_director", "cto", "founder"} else "other",
                         linkedin_url=li[:255], email=email[:255], source_url=c.source_url[:1000],
                         source_description=(c.evidence + email_note)[:2000], verification_status="unverified",
                         discovered_by="agent"))
        added += 1
    db.flush()
    log_activity(db, user_id, "recruiters.discovered", f"{added} contacts at {company.name}", entity_type="company",
                 entity_id=company.id, actor="agent", details={"skipped": skipped})
    return {"added": added, "skipped": skipped, "notes": r.notes}
