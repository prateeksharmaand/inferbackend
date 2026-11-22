"""Turn RawJob (any source) into a NormalizedJob with consistent fields."""
import hashlib
import html as htmlmod
import re
from dataclasses import dataclass, field
from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bs4 import BeautifulSoup

from app.services.salary import parse_salary_text, to_lpa
from app.services.skills_catalog import find_skills

TRACKING = re.compile(r"^(utm_|gh_src|ref|refid|trk|trackingid|src|source|lever-origin|lever-source|from|ccid|"
                      r"currentjobid|eboid|recommendedflavor|position|pagenum|origin)", re.I)


@dataclass
class NormalizedJob:
    source_key: str
    external_id: str | None
    title: str
    company: str
    description: str
    url: str | None
    normalized_url: str | None
    apply_url: str | None
    location: str
    work_mode: str
    ctc_min_lpa: float | None
    ctc_max_lpa: float | None
    currency: str
    salary_text: str
    experience_min_years: float | None
    experience_max_years: float | None
    employment_type: str
    posted_at: datetime | None
    skills: list[str]
    dedup_hash: str
    title_company_key: str
    description_fingerprint: str | None
    company_website: str = ""
    raw: dict = field(default_factory=dict)


def html_to_text(s: str, unescape_first: bool = False) -> str:
    if not s:
        return ""
    if unescape_first:
        s = htmlmod.unescape(s)
    if "<" not in s:
        return s.strip()
    soup = BeautifulSoup(s, "html.parser")
    for br in soup.find_all(["br"]):
        br.replace_with("\n")
    for li in soup.find_all("li"):
        li.insert_before("\n• ")
    for blk in soup.find_all(["p", "div", "h1", "h2", "h3", "h4", "ul", "ol"]):
        blk.insert_after("\n")
    text = soup.get_text()
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def normalize_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        p = urlsplit(url.strip())
    except ValueError:
        return None
    if p.scheme not in ("http", "https"):
        return None
    host = p.netloc.lower()
    if host.endswith(("google.com", "google.co.in")) and p.path.startswith("/search"):
        return None  # generic search links don't identify a single posting
    q = urlencode(sorted((k, v) for k, v in parse_qsl(p.query) if not TRACKING.match(k)))
    host = p.netloc.lower().removeprefix("www.").removeprefix("in.")
    return urlunsplit(("https", host, p.path.rstrip("/"), q, ""))


def norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()


def norm_company(name: str) -> str:
    n = norm_text(name)
    n = re.sub(r"\b(private|pvt|limited|ltd|llp|inc|corp|corporation|technologies|technology|tech|india|"
               r"software|solutions|services|labs|the)\b", " ", n)
    return re.sub(r"\s+", " ", n).strip() or norm_text(name)


def title_company_key(title: str, company: str) -> str:
    t = norm_text(title)
    t = re.sub(r"\b(sr|snr)\b", "senior", t)
    t = re.sub(r"\b(remote|hybrid|onsite|urgent|hiring|immediate joiner[s]?)\b", " ", t)
    return hashlib.sha256(f"{re.sub(' +', ' ', t).strip()}|{norm_company(company)}".encode()).hexdigest()


def description_fingerprint(desc: str) -> str | None:
    words = norm_text(desc).split()
    if len(words) < 40:
        return None
    return hashlib.sha256(" ".join(words[:400]).encode()).hexdigest()


def detect_work_mode(raw_remote: bool | None, *texts: str) -> str:
    t = " ".join(x or "" for x in texts).lower()
    if re.search(r"\bhybrid\b", t):
        return "hybrid"
    if raw_remote or re.search(r"\b(fully remote|100% remote|remote[- ]first|work from home|wfh|remote)\b", t):
        return "remote"
    if re.search(r"\b(on-?site|in-?office|work from office|wfo)\b", t):
        return "office"
    return "unknown"


def parse_experience(text: str, months: int | None = None) -> tuple[float | None, float | None]:
    if months:
        return round(months / 12, 1), None
    t = (text or "").lower().replace("–", "-")
    m = re.search(r"(\d{1,2})\s*(?:\+|plus)?\s*(?:-|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)", t)
    if m and int(m.group(1)) <= int(m.group(2)) <= 40:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r"(\d{1,2})\s*\+?\s*(?:years|yrs)(?:'|’)?\s*(?:of)?\s*(?:experience|exp|relevant|hands)", t)
    if m and int(m.group(1)) <= 40:
        return float(m.group(1)), None
    m = re.search(r"(?:minimum|min\.?|at least)\s*(\d{1,2})\s*(?:years|yrs)", t)
    if m:
        return float(m.group(1)), None
    return None, None


ROLE_WORDS = re.compile(r"flutter|mobile|android|ios|app(lication)? (developer|engineer|architect)|react native",
                        re.I)
SENIOR_WORDS = re.compile(r"lead|architect|principal|staff|head|manager|director|senior|sr\.?|sde ?(iii|3)|"
                          r"\bvp\b|chief", re.I)


def title_matches(title: str, keywords: list[str]) -> bool:
    """Loose relevance gate applied before storing results from broad sources (career pages)."""
    if not title:
        return False
    if ROLE_WORDS.search(title):
        return True
    t = norm_text(title)
    return any(norm_text(k) in t for k in keywords)


def is_relevant(title: str, description: str) -> bool:
    return bool(ROLE_WORDS.search(title) or (ROLE_WORDS.search(description[:3000] or "")
                                             and SENIOR_WORDS.search(title)))


def _ext_id(v) -> str | None:
    if not v:
        return None
    v = str(v)
    return v if len(v) <= 255 else "sha256:" + hashlib.sha256(v.encode()).hexdigest()


def normalize(raw) -> NormalizedJob:
    desc = html_to_text(raw.description or "")
    title = re.sub(r"\s+", " ", html_to_text(raw.title or "")).strip()[:255]
    company = re.sub(r"\s+", " ", raw.company or "").strip()[:200] or "Unknown company"
    lo = to_lpa(raw.salary_min, raw.salary_period, raw.salary_currency or "INR")
    hi = to_lpa(raw.salary_max, raw.salary_period, raw.salary_currency or "INR")
    if lo is None and hi is None:
        lo, hi = parse_salary_text(f"{raw.salary_text} {title}")
        if lo is None:
            lo, hi = parse_salary_text(desc[:6000])
    currency = (raw.salary_currency or "INR").upper()[:3]
    exp_lo, exp_hi = parse_experience(desc, raw.experience_months)
    url = raw.url or raw.apply_url
    nurl = normalize_url(url)
    tck = title_company_key(title, company)
    if raw.external_id:
        dedup = hashlib.sha256(f"{raw.source_key}|{raw.external_id}".encode()).hexdigest()
    elif nurl:
        dedup = hashlib.sha256(nurl.encode()).hexdigest()
    else:
        dedup = hashlib.sha256(f"{tck}|{description_fingerprint(desc) or ''}".encode()).hexdigest()
    return NormalizedJob(
        source_key=raw.source_key, external_id=_ext_id(raw.external_id),
        title=title, company=company, description=desc[:50000], url=url, normalized_url=nurl,
        apply_url=raw.apply_url or url, location=(raw.location or "").strip()[:255],
        work_mode=detect_work_mode(raw.is_remote, raw.location, title, desc[:4000]),
        ctc_min_lpa=lo, ctc_max_lpa=hi or lo, currency=currency, salary_text=(raw.salary_text or "")[:255],
        experience_min_years=exp_lo, experience_max_years=exp_hi,
        employment_type=(raw.employment_type or "")[:40], posted_at=raw.posted_at,
        skills=sorted(find_skills(f"{title}\n{desc}")), dedup_hash=dedup, title_company_key=tck,
        description_fingerprint=description_fingerprint(desc), company_website=raw.company_website or "",
        raw=raw.raw or {})
