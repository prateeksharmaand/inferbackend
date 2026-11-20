"""Ingesting normalized jobs with layered duplicate detection.

A job is a duplicate of an existing (non-archived) job of the same user when ANY of these match:
  1. same source + external_id
  2. same normalized URL (tracking params stripped)
  3. same title+company key seen in the last 45 days (cross-posted on several boards)
  4. same description fingerprint
Duplicates update `last_verified_at`/missing fields on the existing row instead of inserting.
"""
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.time import now_utc
from app.models import Company, Job, JobSkill, JobSource
from app.services.normalize import NormalizedJob, is_relevant, norm_company


@dataclass
class IngestStats:
    received: int = 0
    inserted: int = 0
    duplicates: int = 0
    irrelevant: int = 0
    too_old: int = 0
    job_ids: list[int] = field(default_factory=list)


def get_or_create_company(db: Session, user_id: int, name: str, website: str = "") -> Company:
    key = norm_company(name)[:200]
    c = db.scalar(select(Company).where(Company.user_id == user_id, Company.normalized_name == key))
    if not c:
        c = Company(user_id=user_id, name=name[:200], normalized_name=key, website=website[:255])
        db.add(c)
        db.flush()
    elif website and not c.website:
        c.website = website[:255]
    return c


def find_duplicate(db: Session, user_id: int, n: NormalizedJob, source_id: int | None) -> Job | None:
    conds = [Job.dedup_hash == n.dedup_hash]
    if n.external_id and source_id:
        conds.append((Job.source_id == source_id) & (Job.external_id == n.external_id))
    if n.normalized_url:
        conds.append(Job.normalized_url == n.normalized_url)
    conds.append((Job.title_company_key == n.title_company_key) & (Job.discovered_at > now_utc() - timedelta(days=45)))
    if n.description_fingerprint:
        conds.append(Job.description_fingerprint == n.description_fingerprint)
    return db.scalar(select(Job).where(Job.user_id == user_id, Job.archived_at.is_(None), or_(*conds)).limit(1))


def ingest(db: Session, user_id: int, jobs: list[NormalizedJob], source: JobSource | None, *, manual: bool = False,
           posted_within_hours: int | None = None, require_relevance: bool = True) -> IngestStats:
    st = IngestStats(received=len(jobs))
    seen_in_batch: set[str] = set()
    for n in jobs:
        if require_relevance and not manual and not is_relevant(n.title, n.description):
            st.irrelevant += 1
            continue
        if posted_within_hours and n.posted_at and n.posted_at < now_utc() - timedelta(hours=posted_within_hours * 2):
            st.too_old += 1  # allow 2x window so a missed day still catches up
            continue
        batch_keys = {n.dedup_hash, n.title_company_key} | ({n.normalized_url} if n.normalized_url else set())
        if batch_keys & seen_in_batch:
            st.duplicates += 1
            continue
        seen_in_batch |= batch_keys
        dup = find_duplicate(db, user_id, n, source.id if source else None)
        if dup:
            st.duplicates += 1
            dup.last_verified_at = now_utc()
            if len(n.description) > len(dup.description or ""):
                dup.description = n.description
            if dup.ctc_min_lpa is None and n.ctc_min_lpa:
                dup.ctc_min_lpa, dup.ctc_max_lpa = n.ctc_min_lpa, n.ctc_max_lpa
            if dup.status == "expired":
                dup.status = "active"
            st.job_ids.append(dup.id)
            continue
        company = get_or_create_company(db, user_id, n.company, n.company_website)
        job = Job(user_id=user_id, company_id=company.id, source_id=source.id if source else None, title=n.title,
                  company_name=n.company, description=n.description, external_id=n.external_id, url=n.url,
                  normalized_url=n.normalized_url, apply_url=n.apply_url, location=n.location,
                  work_mode=n.work_mode, ctc_min_lpa=n.ctc_min_lpa, ctc_max_lpa=n.ctc_max_lpa, currency=n.currency,
                  salary_text=n.salary_text, experience_min_years=n.experience_min_years,
                  experience_max_years=n.experience_max_years, employment_type=n.employment_type,
                  posted_at=n.posted_at, status="active" if not manual else "unverified", is_manual=manual,
                  dedup_hash=n.dedup_hash, title_company_key=n.title_company_key,
                  description_fingerprint=n.description_fingerprint, raw=n.raw, last_verified_at=now_utc())
        job.skills = [JobSkill(name=s[:80]) for s in n.skills]
        db.add(job)
        db.flush()
        st.inserted += 1
        st.job_ids.append(job.id)
    return st
