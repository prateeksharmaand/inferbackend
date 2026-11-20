"""Provider-independent job source contract.

Every connector implements:
  search_jobs(query) -> list[RawJob]      search with keywords/locations/recency
  fetch_job_details(external_id_or_url)   full description for one posting
  normalize_job(raw) -> NormalizedJob     source-specific fields -> common shape (via app.services.normalize)
  verify_job(job) -> VerifyResult          is the listing still live?
  get_source_status() -> SourceStatus      configured / connected / failing / unavailable

Connectors must only use authorised APIs, public feeds or public career pages, respect rate limits,
and never bypass logins, CAPTCHAs or other access controls.
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings


class SourceUnavailable(Exception):
    """Raised when a source can't be used (no credentials, no authorised API, blocked, down)."""


@dataclass
class SearchQuery:
    keywords: list[str]
    locations: list[str] = field(default_factory=list)
    posted_within_hours: int = 72
    remote_ok: bool = True
    max_results: int = 100


@dataclass
class RawJob:
    source_key: str
    external_id: str | None
    title: str
    company: str
    url: str | None
    description: str = ""
    location: str = ""
    posted_at: datetime | None = None
    apply_url: str | None = None
    salary_min: float | None = None   # in `salary_currency` per `salary_period`
    salary_max: float | None = None
    salary_currency: str | None = None
    salary_period: str | None = None  # year | month | hour
    salary_text: str = ""
    is_remote: bool | None = None
    employment_type: str = ""
    experience_months: int | None = None
    company_website: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class VerifyResult:
    status: str  # active | expired | unverified
    detail: str = ""


@dataclass
class SourceStatus:
    state: str   # connected | configured | awaiting_credentials | unavailable | failing | disabled
    detail: str = ""


def http_client(timeout: float = 20.0) -> httpx.Client:
    return httpx.Client(timeout=timeout, follow_redirects=True,
                        headers={"User-Agent": settings.HTTP_USER_AGENT, "Accept": "application/json, text/html"})


class BaseConnector:
    key: str = ""
    name: str = ""
    kind: str = "api"  # api | aggregator | career_page | manual | restricted
    homepage: str = ""

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    # -- contract --
    def search_jobs(self, query: SearchQuery) -> list[RawJob]:
        raise NotImplementedError

    def fetch_job_details(self, ref: str) -> RawJob | None:
        return None

    def normalize_job(self, raw: RawJob):
        from app.services.normalize import normalize
        return normalize(raw)

    def verify_job(self, url: str | None, external_id: str | None = None) -> VerifyResult:
        return verify_url(url)

    def get_source_status(self) -> SourceStatus:
        return SourceStatus("configured")


EXPIRED_MARKERS = ("no longer accepting", "job has expired", "position has been filled", "job is closed",
                   "this job is no longer available", "posting has been closed", "job not found")


def verify_url(url: str | None) -> VerifyResult:
    if not url:
        return VerifyResult("unverified", "No URL")
    try:
        with http_client(15) as c:
            r = c.get(url)
    except httpx.HTTPError as e:
        return VerifyResult("unverified", f"Network error: {type(e).__name__}")
    if r.status_code in (404, 410):
        return VerifyResult("expired", f"HTTP {r.status_code}")
    if r.status_code in (401, 403, 429, 999):
        return VerifyResult("unverified", f"Site blocks automated checks (HTTP {r.status_code})")
    if r.status_code >= 400:
        return VerifyResult("unverified", f"HTTP {r.status_code}")
    body = r.text[:200_000].lower()
    if any(m in body for m in EXPIRED_MARKERS):
        return VerifyResult("expired", "Page says the job is closed")
    return VerifyResult("active", f"HTTP {r.status_code}")
