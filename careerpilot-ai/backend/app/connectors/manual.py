"""Manual job import: fetch ONE public page the user pasted and read its schema.org JobPosting JSON-LD.
No login, no crawling, no CAPTCHA bypass. If the page is gated or has no structured data, the user is
asked to paste the description."""
import json
import re
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

from app.connectors.base import BaseConnector, RawJob, SourceStatus, SourceUnavailable, http_client
from app.connectors.restricted import source_for_url
from app.services.normalize import html_to_text


class ManualConnector(BaseConnector):
    key, name, kind = "manual", "Manual entry / URL import", "manual"

    def get_source_status(self) -> SourceStatus:
        return SourceStatus("connected", "Always available")

    def fetch_job_details(self, ref: str) -> RawJob | None:
        url = ref.strip()
        if not re.match(r"^https?://", url):
            raise SourceUnavailable("Enter a full http(s) URL")
        via_api = _resolve_ats(url, self.config.get("greenhouse_boards", []))
        if via_api:
            return via_api
        try:
            with http_client(20) as c:
                r = c.get(url, headers={"Accept": "text/html"})
        except httpx.HTTPError as e:
            raise SourceUnavailable(f"Could not fetch the page ({type(e).__name__}). Paste the description instead.") from e
        if r.status_code in (401, 403, 429, 999) or "authwall" in str(r.url) or "login" in str(r.url).lower():
            raise SourceUnavailable("This site requires sign-in or blocks automated access. Paste the job "
                                    "title, company and description instead.")
        if r.status_code >= 400:
            raise SourceUnavailable(f"The page returned HTTP {r.status_code}")
        posting = _jobposting(r.text)
        if not posting:
            soup = BeautifulSoup(r.text, "html.parser")
            title = (soup.find("meta", property="og:title") or {}).get("content") or (soup.title.string if soup.title else "")
            raise SourceUnavailable("No structured job data found on this page. Fill in the details manually"
                                    + (f" (page title: {title.strip()[:120]})" if title else "") + ".")
        return _from_jsonld(posting, str(r.url), source_for_url(url) or "manual")


def _jobposting(html: str) -> dict | None:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                t = item.get("@type")
                if t == "JobPosting" or (isinstance(t, list) and "JobPosting" in t):
                    return item
                stack += item.get("@graph", []) if isinstance(item.get("@graph"), list) else []
    return None


def _from_jsonld(p: dict, url: str, source_key: str) -> RawJob:
    org = p.get("hiringOrganization") or {}
    if isinstance(org, str):
        org = {"name": org}
    locs = p.get("jobLocation") or []
    locs = locs if isinstance(locs, list) else [locs]
    loc_parts = []
    for l in locs:
        a = (l or {}).get("address") or {}
        if isinstance(a, dict):
            loc_parts.append(", ".join(x for x in [a.get("addressLocality"), a.get("addressRegion")] if x))
    sal = p.get("baseSalary") or {}
    val = sal.get("value") if isinstance(sal, dict) else {}
    val = val if isinstance(val, dict) else {"value": val}
    posted = None
    if p.get("datePosted"):
        try:
            posted = datetime.fromisoformat(str(p["datePosted"]).replace("Z", "+00:00"))
            if posted.tzinfo is None:
                from datetime import timezone
                posted = posted.replace(tzinfo=timezone.utc)
        except ValueError:
            posted = None
    exp = p.get("experienceRequirements")
    months = exp.get("monthsOfExperience") if isinstance(exp, dict) else None
    return RawJob(
        source_key=source_key, external_id=str((p.get("identifier") or {}).get("value"))
        if isinstance(p.get("identifier"), dict) and (p.get("identifier") or {}).get("value") else None,
        title=html_to_text(p.get("title", "")), company=org.get("name", ""), url=url,
        apply_url=p.get("url") or url, description=html_to_text(p.get("description", ""), unescape_first=True),
        location="; ".join(x for x in loc_parts if x), posted_at=posted,
        salary_min=val.get("minValue") or val.get("value"), salary_max=val.get("maxValue"),
        salary_currency=sal.get("currency") if isinstance(sal, dict) else None,
        salary_period=(val.get("unitText") or "").lower() or None,
        is_remote=p.get("jobLocationType") == "TELECOMMUTE" or None,
        employment_type=p.get("employmentType") if isinstance(p.get("employmentType"), str) else "",
        experience_months=months, company_website=org.get("sameAs") or org.get("url") or "",
        raw={"jsonld": True})


def _resolve_ats(url: str, known_boards: list[str]) -> RawJob | None:
    """Posting URLs hosted on Greenhouse/Lever (incl. custom career domains with ?gh_jid=) are read via
    the public job-board API instead of the (often JavaScript-rendered) HTML page."""
    from urllib.parse import parse_qs, urlsplit

    from app.connectors.ats import GreenhouseConnector, LeverConnector
    parts = urlsplit(url)
    qs = parse_qs(parts.query)
    path = [p for p in parts.path.split("/") if p]
    candidates: list[tuple[str, str]] = []
    if "greenhouse.io" in parts.netloc and "jobs" in path:
        i = path.index("jobs")
        if i >= 1 and i + 1 < len(path):
            candidates.append((path[i - 1], path[i + 1]))
    if "gh_jid" in qs:
        jid = qs["gh_jid"][0]
        guess = parts.netloc.split(".")[-2] if parts.netloc.count(".") >= 1 else ""
        for b in [*known_boards, guess, qs.get("for", [""])[0]]:
            if b:
                candidates.append((b, jid))
    try:
        with http_client(15) as c:
            for board, jid in candidates:
                r = c.get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{jid}")
                if r.status_code == 200:
                    j = r.json()
                    return RawJob(source_key="greenhouse", external_id=f"{board}:{jid}", title=j.get("title", ""),
                                  company=board.title(), url=j.get("absolute_url") or url,
                                  description=html_to_text(j.get("content", ""), unescape_first=True),
                                  location=(j.get("location") or {}).get("name", ""),
                                  posted_at=_parse_dt(j.get("first_published") or j.get("updated_at")),
                                  apply_url=j.get("absolute_url") or url, raw={"id": jid, "board": board})
            if "lever.co" in parts.netloc and len(path) >= 2:
                r = c.get(f"https://api.lever.co/v0/postings/{path[0]}/{path[1]}")
                if r.status_code == 200:
                    jobs = LeverConnector({"boards": [{"token": path[0]}]})._fetch_board(
                        _OneShot(r.json()), {"token": path[0]})
                    return jobs[0] if jobs else None
    except httpx.HTTPError:
        return None
    _ = GreenhouseConnector  # imported for side-effect-free reference
    return None


class _OneShot:
    """Adapter so LeverConnector._fetch_board can parse a single posting response."""
    def __init__(self, data):
        self.data = data

    def get(self, *a, **k):
        data = self.data

        class R:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return [data]
        return R()


def _parse_dt(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
    except ValueError:
        return None
