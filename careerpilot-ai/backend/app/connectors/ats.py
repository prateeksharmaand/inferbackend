"""Public company career-page APIs (Greenhouse, Lever, Ashby). These are documented public job-board
endpoints that companies publish for exactly this purpose. Configure the list of company boards in
job_sources.config["boards"]."""
from datetime import datetime, timezone

import httpx

from app.connectors.base import (BaseConnector, RawJob, SearchQuery, SourceStatus, SourceUnavailable, VerifyResult,
                                 http_client)
from app.services.normalize import html_to_text, title_matches


def _ts(ms: int | None) -> datetime | None:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc) if ms else None


def _iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


class _ATSBase(BaseConnector):
    kind = "career_page"

    @property
    def boards(self) -> list[dict]:
        # [{"token": "groww", "company": "Groww"}]
        return self.config.get("boards", [])

    def _fetch_board(self, c: httpx.Client, board: dict) -> list[RawJob]:
        raise NotImplementedError

    def search_jobs(self, query: SearchQuery) -> list[RawJob]:
        if not self.boards:
            raise SourceUnavailable("No company boards configured")
        out, errors = [], []
        with http_client() as c:
            for b in self.boards:
                try:
                    jobs = self._fetch_board(c, b)
                except (httpx.HTTPError, ValueError) as e:
                    errors.append(f"{b.get('token')}: {e}")
                    continue
                out += [j for j in jobs if title_matches(j.title, query.keywords)]
        if errors and not out and len(errors) == len(self.boards):
            raise SourceUnavailable("; ".join(errors)[:500])
        return out[: query.max_results]

    def get_source_status(self) -> SourceStatus:
        if not self.boards:
            return SourceStatus("awaiting_credentials", "Add company boards in Settings → Job sources")
        return SourceStatus("configured", f"{len(self.boards)} company boards")

    def test_board(self, board: dict) -> tuple[bool, str]:
        try:
            with http_client() as c:
                jobs = self._fetch_board(c, board)
            return True, f"{len(jobs)} open roles"
        except Exception as e:  # noqa: BLE001
            return False, str(e)[:200]


class GreenhouseConnector(_ATSBase):
    key, name, homepage = "greenhouse", "Company career pages (Greenhouse)", "https://boards.greenhouse.io"

    def _fetch_board(self, c, b):
        r = c.get(f"https://boards-api.greenhouse.io/v1/boards/{b['token']}/jobs", params={"content": "true"})
        r.raise_for_status()
        out = []
        for j in r.json().get("jobs", []):
            out.append(RawJob(
                source_key=self.key, external_id=f"{b['token']}:{j['id']}", title=j.get("title", ""),
                company=b.get("company") or b["token"].title(), url=j.get("absolute_url"),
                description=html_to_text(j.get("content", ""), unescape_first=True),
                location=(j.get("location") or {}).get("name", ""), posted_at=_iso(j.get("first_published")
                                                                                    or j.get("updated_at")),
                apply_url=j.get("absolute_url"), raw={"id": j["id"], "board": b["token"]}))
        return out

    def verify_job(self, url, external_id=None):
        if external_id and ":" in external_id:
            board, jid = external_id.split(":", 1)
            try:
                with http_client() as c:
                    r = c.get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{jid}")
                return VerifyResult("active" if r.status_code == 200 else "expired", f"API {r.status_code}")
            except httpx.HTTPError as e:
                return VerifyResult("unverified", str(e))
        return super().verify_job(url)


class LeverConnector(_ATSBase):
    key, name, homepage = "lever", "Company career pages (Lever)", "https://jobs.lever.co"

    def _fetch_board(self, c, b):
        r = c.get(f"https://api.lever.co/v0/postings/{b['token']}", params={"mode": "json"})
        r.raise_for_status()
        out = []
        for j in r.json():
            cats = j.get("categories") or {}
            desc = j.get("descriptionPlain") or html_to_text(j.get("description", ""))
            for lst in j.get("lists", []):
                desc += f"\n\n{lst.get('text', '')}\n{html_to_text(lst.get('content', ''))}"
            sal = j.get("salaryRange") or {}
            out.append(RawJob(
                source_key=self.key, external_id=f"{b['token']}:{j['id']}", title=j.get("text", ""),
                company=b.get("company") or b["token"].title(), url=j.get("hostedUrl"), description=desc,
                location=cats.get("location", ""), posted_at=_ts(j.get("createdAt")), apply_url=j.get("applyUrl"),
                salary_min=sal.get("min"), salary_max=sal.get("max"), salary_currency=sal.get("currency"),
                salary_period={"per-year-salary": "year", "per-month-salary": "month"}.get(sal.get("interval"), None),
                is_remote=(j.get("workplaceType") == "remote") if j.get("workplaceType") else None,
                employment_type=cats.get("commitment", ""), raw={"id": j["id"], "workplaceType": j.get("workplaceType")}))
        return out


class AshbyConnector(_ATSBase):
    key, name, homepage = "ashby", "Company career pages (Ashby)", "https://jobs.ashbyhq.com"

    def _fetch_board(self, c, b):
        r = c.get(f"https://api.ashbyhq.com/posting-api/job-board/{b['token']}",
                  params={"includeCompensation": "true"})
        r.raise_for_status()
        out = []
        for j in r.json().get("jobs", []):
            if not j.get("isListed", True):
                continue
            out.append(RawJob(
                source_key=self.key, external_id=f"{b['token']}:{j['id']}", title=j.get("title", ""),
                company=b.get("company") or b["token"].title(), url=j.get("jobUrl"),
                description=j.get("descriptionPlain") or html_to_text(j.get("descriptionHtml", "")),
                location=j.get("location", ""), posted_at=_iso(j.get("publishedAt")), apply_url=j.get("applyUrl"),
                is_remote=j.get("isRemote"), employment_type=j.get("employmentType", ""),
                salary_text=((j.get("compensation") or {}).get("compensationTierSummary") or ""),
                raw={"id": j["id"], "workplaceType": j.get("workplaceType")}))
        return out
