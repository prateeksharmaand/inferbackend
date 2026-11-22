"""Boards without a public/authorised job-search API for individuals.

Automated searching of these sites would require logging in, scraping behind access controls or
violating their terms, so these adapters do NOT search. Coverage comes from:
  1. JSearch (Google for Jobs) which indexes their public postings, and
  2. Manual URL import: paste a posting URL; we fetch that one public page (no login) and read its
     schema.org JobPosting data. If the page is gated, paste the description instead.
"""
from app.connectors.base import BaseConnector, RawJob, SearchQuery, SourceStatus, SourceUnavailable

RESTRICTED = {
    "linkedin": ("LinkedIn Jobs", "https://www.linkedin.com/jobs", ["linkedin.com"]),
    "naukri": ("Naukri", "https://www.naukri.com", ["naukri.com"]),
    "indeed": ("Indeed", "https://in.indeed.com", ["indeed.com"]),
    "foundit": ("Foundit", "https://www.foundit.in", ["foundit.in", "monsterindia.com"]),
    "instahyre": ("Instahyre", "https://www.instahyre.com", ["instahyre.com"]),
    "wellfound": ("Wellfound", "https://wellfound.com", ["wellfound.com", "angel.co"]),
    "cutshort": ("Cutshort", "https://cutshort.io", ["cutshort.io"]),
    "hirist": ("Hirist", "https://www.hirist.tech", ["hirist.tech", "hirist.com"]),
}


class RestrictedConnector(BaseConnector):
    kind = "restricted"

    def __init__(self, key: str, config: dict | None = None):
        super().__init__(config)
        self.key = key
        self.name, self.homepage, self.domains = RESTRICTED[key]

    def search_jobs(self, query: SearchQuery) -> list[RawJob]:
        raise SourceUnavailable(f"{self.name} has no authorised search API. Its postings arrive via JSearch, "
                                "or import a posting URL manually.")

    def get_source_status(self) -> SourceStatus:
        return SourceStatus("unavailable", "No authorised API. Covered via JSearch + manual URL import.")


def source_for_url(url: str) -> str | None:
    u = url.lower()
    for key, (_, _, domains) in RESTRICTED.items():
        if any(d in u for d in domains):
            return key
    for ats, marker in (("greenhouse", "greenhouse.io"), ("lever", "lever.co"), ("ashby", "ashbyhq.com")):
        if marker in u:
            return ats
    return None
