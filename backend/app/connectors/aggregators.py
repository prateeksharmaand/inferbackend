"""Licensed job-search APIs.

- JSearch (RapidAPI): aggregates Google for Jobs, which indexes postings from LinkedIn, Indeed, Naukri,
  Foundit, Glassdoor and company sites. This is the authorised way to cover those boards.
  Key: SEARCH_PROVIDER_API_KEY. Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
- Adzuna: official public API with an India endpoint. Key: JOB_SEARCH_API_KEY as "app_id:app_key".
  Docs: https://developer.adzuna.com
"""
from datetime import datetime

import httpx

from app.connectors.base import BaseConnector, RawJob, SearchQuery, SourceStatus, SourceUnavailable, http_client
from app.core.config import settings


def _iso(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
    except ValueError:
        return None


class JSearchConnector(BaseConnector):
    key, name, kind = "jsearch", "JSearch (LinkedIn · Indeed · Naukri · Foundit via Google for Jobs)", "aggregator"
    homepage = "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch"
    HOST = "jsearch.p.rapidapi.com"

    def _headers(self):
        if not settings.SEARCH_PROVIDER_API_KEY:
            raise SourceUnavailable("SEARCH_PROVIDER_API_KEY not set")
        return {"x-rapidapi-key": settings.SEARCH_PROVIDER_API_KEY, "x-rapidapi-host": self.HOST}

    def search_jobs(self, query: SearchQuery) -> list[RawJob]:
        headers = self._headers()
        date_posted = "today" if query.posted_within_hours <= 24 else "3days" if query.posted_within_hours <= 72 \
            else "week" if query.posted_within_hours <= 168 else "month"
        out: list[RawJob] = []
        locs = [l for l in query.locations if "remote" not in l.lower()][: self.config.get("max_locations", 4)]
        searches = [(k, l) for k in query.keywords[: self.config.get("max_keywords", 5)] for l in (locs or ["India"])]
        if any("remote" in l.lower() for l in query.locations):
            searches += [(k, "remote") for k in query.keywords[:3]]
        with http_client(30) as c:
            for kw, loc in searches[: self.config.get("max_requests", 12)]:
                params = {"query": f"{kw} in {loc}" if loc != "remote" else kw, "page": 1, "num_pages": 1,
                          "country": "in", "date_posted": date_posted}
                if loc == "remote":
                    params["work_from_home"] = "true"
                try:
                    r = c.get(f"https://{self.HOST}/search", params=params, headers=headers)
                except httpx.HTTPError as e:
                    raise SourceUnavailable(f"JSearch network error: {e}") from e
                if r.status_code in (401, 403):
                    raise SourceUnavailable("JSearch rejected the API key")
                if r.status_code == 429:
                    break  # quota hit; keep what we have
                r.raise_for_status()
                out += [self._raw(j) for j in r.json().get("data", [])]
                if len(out) >= query.max_results:
                    break
        return out

    def _raw(self, j: dict) -> RawJob:
        loc = ", ".join(x for x in [j.get("job_city"), j.get("job_state"), j.get("job_country")] if x)
        exp = (j.get("job_required_experience") or {}).get("required_experience_in_months")
        return RawJob(
            source_key=self.key, external_id=j.get("job_id"), title=j.get("job_title", ""),
            company=j.get("employer_name", ""), url=j.get("job_google_link") or j.get("job_apply_link"),
            apply_url=j.get("job_apply_link"), description=j.get("job_description", ""), location=loc,
            posted_at=_iso(j.get("job_posted_at_datetime_utc")), salary_min=j.get("job_min_salary"),
            salary_max=j.get("job_max_salary"), salary_currency=j.get("job_salary_currency"),
            salary_period=(j.get("job_salary_period") or "").lower() or None, is_remote=j.get("job_is_remote"),
            employment_type=j.get("job_employment_type") or "", experience_months=exp,
            company_website=j.get("employer_website") or "",
            raw={"publisher": j.get("job_publisher"), "job_id": j.get("job_id")})

    def fetch_job_details(self, ref: str) -> RawJob | None:
        with http_client(30) as c:
            r = c.get(f"https://{self.HOST}/job-details", params={"job_id": ref, "country": "in"},
                      headers=self._headers())
            r.raise_for_status()
            data = r.json().get("data") or []
        return self._raw(data[0]) if data else None

    def get_source_status(self) -> SourceStatus:
        if not settings.SEARCH_PROVIDER_API_KEY:
            return SourceStatus("awaiting_credentials", "Set SEARCH_PROVIDER_API_KEY (RapidAPI JSearch)")
        return SourceStatus("configured", "API key present (use Test to verify)")


class AdzunaConnector(BaseConnector):
    key, name, kind, homepage = "adzuna", "Adzuna India", "api", "https://developer.adzuna.com"

    def _creds(self):
        k = settings.JOB_SEARCH_API_KEY
        if not k or ":" not in k:
            raise SourceUnavailable("JOB_SEARCH_API_KEY not set (format app_id:app_key)")
        return k.split(":", 1)

    def search_jobs(self, query: SearchQuery) -> list[RawJob]:
        app_id, app_key = self._creds()
        days = max(1, round(query.posted_within_hours / 24))
        out: list[RawJob] = []
        locs = [l for l in query.locations if "remote" not in l.lower()][:5] or [""]
        with http_client(30) as c:
            for kw in query.keywords[:6]:
                for loc in locs:
                    params = {"app_id": app_id, "app_key": app_key, "results_per_page": 50, "what": kw,
                              "max_days_old": days, "content-type": "application/json", "sort_by": "date"}
                    if loc:
                        params["where"] = loc
                    r = c.get("https://api.adzuna.com/v1/api/jobs/in/search/1", params=params)
                    if r.status_code in (401, 403):
                        raise SourceUnavailable("Adzuna rejected the credentials")
                    if r.status_code == 429:
                        return out
                    r.raise_for_status()
                    for j in r.json().get("results", []):
                        out.append(RawJob(
                            source_key=self.key, external_id=str(j.get("id")), title=j.get("title", ""),
                            company=(j.get("company") or {}).get("display_name", ""), url=j.get("redirect_url"),
                            apply_url=j.get("redirect_url"), description=j.get("description", ""),
                            location=(j.get("location") or {}).get("display_name", ""), posted_at=_iso(j.get("created")),
                            salary_min=j.get("salary_min"), salary_max=j.get("salary_max"), salary_currency="INR",
                            salary_period="year", employment_type=j.get("contract_time") or "",
                            raw={"id": j.get("id"), "salary_is_predicted": j.get("salary_is_predicted")}))
        return out[: query.max_results]

    def get_source_status(self) -> SourceStatus:
        k = settings.JOB_SEARCH_API_KEY
        if not k or ":" not in k:
            return SourceStatus("awaiting_credentials", "Set JOB_SEARCH_API_KEY=app_id:app_key")
        return SourceStatus("configured", "Credentials present (use Test to verify)")
