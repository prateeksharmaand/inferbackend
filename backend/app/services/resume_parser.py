"""Resume text extraction (PDF/DOCX) and structuring.

Structuring prefers Claude (strictly extractive prompt + schema). Without an API key, or if the call
fails, a deterministic heuristic parser runs instead. Either way the result is a `ResumeExtraction`.
Nothing is inferred beyond what the document states; unknowns stay null/empty.
"""
import io
import re
from datetime import date

import pymupdf
from docx import Document
from pydantic import BaseModel, Field

from app.services import ai
from app.services.skills_catalog import find_skills


# ---------- schema ----------
class ExtractedJob(BaseModel):
    company: str
    title: str = ""
    location: str = ""
    start_date: str = Field("", description="YYYY-MM if stated, else empty")
    end_date: str = Field("", description="YYYY-MM, or empty if current/unknown")
    is_current: bool = False
    description: str = ""
    highlights: list[str] = []
    projects: list[str] = Field(default_factory=list, description="Project names worked on at this employer")


class ExtractedProject(BaseModel):
    name: str
    employer: str = ""
    tech_stack: list[str] = []
    description: str = ""
    metrics: str = Field("", description="Stated metrics only, e.g. '12M downloads, 1.5M DAU'")


class ExtractedSkill(BaseModel):
    name: str
    category: str = Field("technical", description="technical|platform|tool|leadership|domain")


class ResumeExtraction(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    linkedin_url: str = ""
    location: str = ""
    headline: str = ""
    professional_summary: str = ""
    total_experience_years: float | None = None
    flutter_experience_years: float | None = None
    android_experience_years: float | None = None
    leadership_experience_years: float | None = Field(
        None, description="Only if derivable from roles titled Lead/Manager with stated dates")
    skills: list[ExtractedSkill] = []
    employment: list[ExtractedJob] = []
    projects: list[ExtractedProject] = []
    education: list[str] = []
    certifications: list[str] = []
    achievements: list[str] = []
    notes: list[str] = Field(default_factory=list, description="Ambiguities or inconsistencies found in the document")


# ---------- text extraction ----------
def extract_text(data: bytes, file_type: str) -> str:
    if file_type == "pdf":
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            text = "\n".join(page.get_text("text", sort=True) for page in doc)
    elif file_type == "docx":
        text = _docx_text(data)
    else:
        raise ValueError(f"Unsupported file type {file_type}")
    text = re.sub(r"[  ]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _docx_text(data: bytes) -> str:
    doc = Document(io.BytesIO(data))
    lines: list[str] = []
    body = doc.element.body
    # Walk paragraphs and tables in document order (python-docx doesn't do this natively).
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            lines.append(_para_text(child))
        elif tag == "tbl":
            for row in child.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tr"):
                cells = []
                for cell in row.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc"):
                    cells.append(" ".join(_para_text(p) for p in cell.iter(
                        "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")).strip())
                lines.append("\t".join(c for c in cells if c))
    return "\n".join(lines)


def _para_text(p) -> str:
    out = []
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for el in p.iter():
        if el.tag == ns + "t" and el.text:
            out.append(el.text)
        elif el.tag == ns + "tab":
            out.append("\t")
        elif el.tag in (ns + "br", ns + "cr"):
            out.append("\n")
    # drop drawing anchor junk like "1270116510012701165100"
    return re.sub(r"(?<!\d)\d{12,}(?!\d)", "", "".join(out)).rstrip()


# ---------- structuring ----------
SYSTEM = """You extract structured data from a candidate's resume for a job-search tool.
Rules:
- Extract ONLY what the document states. Never infer, embellish or add employers, dates, skills,
  certifications, metrics or achievements that are not written in the text.
- If a value is not stated, leave it empty or null. Do not estimate leadership years unless roles with
  lead/manager titles have explicit dates.
- Dates: convert to YYYY-MM when month and year are given; "Present" => is_current=true, end_date "".
- Skills: list skills that literally appear in the document; normalise spelling only.
- Put any ambiguities or internal inconsistencies (e.g. overlapping dates, conflicting experience figures)
  in `notes`."""


def structure(text: str) -> tuple[ResumeExtraction, str]:
    """Returns (extraction, method) where method is the model name or 'heuristic-v1'."""
    try:
        result = ai.structured(SYSTEM, f"<resume>\n{text}\n</resume>", ResumeExtraction, effort="medium")
        result = _ground(result, text)
        return result, ai.model_name()
    except ai.AIUnavailable:
        return heuristic_parse(text), "heuristic-v1"


def _ground(r: ResumeExtraction, text: str) -> ResumeExtraction:
    """Drop AI-extracted skills/companies that don't literally appear in the source text."""
    low = text.lower()
    r.skills = [s for s in r.skills if s.name.lower() in low or find_skills(s.name)
                and any(k.lower() in low for k in find_skills(s.name)) or _any_alias_in(s.name, text)]
    r.employment = [e for e in r.employment if e.company and e.company.split()[0].lower() in low]
    return r


def _any_alias_in(name: str, text: str) -> bool:
    found = find_skills(name)
    return bool(found) and bool(set(found) & set(find_skills(text)))


HEADINGS = {
    "summary": r"(profile|professional)?\s*summary|objective|about me",
    "highlights": r"(career )?highlights( and achievements)?|achievements|awards",
    "skills": r"(key |technical )?skills|core competencies",
    "experience": r"(work |professional )?experience|employment( history)?",
    "certifications": r"certifications?|courses|training",
    "projects": r"projects?( summary)?",
    "education": r"education|academics?|qualifications?",
    "personal": r"personal details|interests|hobbies",
}
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
DATE_RANGE = re.compile(
    r"([A-Za-z]{3,9})\.?\s+(\d{4})\s*[–—-]+\s*(present|current|now|([A-Za-z]{3,9})\.?\s+(\d{4}))", re.I)


def _ym(mon: str, year: str) -> str:
    m = MONTHS.get(mon[:3].lower())
    return f"{year}-{m:02d}" if m else year


def _years(pattern: str, text: str) -> float | None:
    m = re.search(pattern, text, re.I)
    return float(m.group(1)) if m else None


def heuristic_parse(text: str) -> ResumeExtraction:
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    # Split "HEADING<TAB>content" lines (common in table-based layouts) into two lines.
    split_lines: list[str] = []
    for ln in lines:
        m = re.match(r"^([A-Z][A-Z &]{3,40}?)(?:\t+| {2,})(.+)$", ln)
        if m and any(re.fullmatch(rf"(?:{pat})", m.group(1).strip(), re.I) for pat in HEADINGS.values()):
            split_lines += [m.group(1).strip(), m.group(2).strip()]
        else:
            split_lines.append(ln)
    lines = split_lines
    r = ResumeExtraction()
    if lines:
        r.full_name = lines[0][:160] if len(lines[0].split()) <= 5 else ""
    em = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", text)
    r.email = em.group(0) if em else ""
    ph = re.search(r"(\+?\(?\+?91\)?[\s-]*)?\b[6-9]\d{4}[\s-]?\d{5}\b", text)
    r.phone = re.sub(r"\s+", " ", ph.group(0)).strip() if ph else ""
    li = re.search(r"https?://[\w.]*linkedin\.com/in/[\w-]+/?", text)
    r.linkedin_url = li.group(0) if li else ""
    if len(lines) > 1 and "@" not in lines[1] and len(lines[1]) < 60:
        r.location = re.sub(r"\s*[•|]\s*\d{6}\s*$", "", lines[1]).strip(" •")

    r.total_experience_years = _years(r"(\d+(?:\.\d+)?)\+?\s*years? of experience", text)
    r.flutter_experience_years = _years(r"flutter experience[^:\n]*:\s*(\d+(?:\.\d+)?)", text)
    r.android_experience_years = _years(r"android experience[^:\n]*:\s*(\d+(?:\.\d+)?)", text)

    # Section split
    sections: dict[str, list[str]] = {}
    current = "header"

    def heading_key(ln: str) -> str | None:
        cand = ln.strip(" \t:")
        return next((k for k, pat in HEADINGS.items() if re.fullmatch(rf"\s*(?:{pat})\s*", cand, re.I)), None)

    # If the document uses ALL-CAPS headings, only accept ALL-CAPS lines as headings
    # (so an inline "Projects" label inside a job entry doesn't start a new section).
    caps_style = sum(1 for ln in lines if heading_key(ln) and ln.strip(" \t:").isupper()) >= 3
    for ln in lines:
        key = heading_key(ln)
        if key and caps_style and not ln.strip(" \t:").isupper():
            key = None
        if key and len(ln) < 50:
            current = key
            continue
        sections.setdefault(current, []).append(ln)

    r.professional_summary = " ".join(sections.get("summary", []))[:2000]
    r.achievements = [s.strip("•-* ") for s in sections.get("highlights", [])][:15]
    cert = sections.get("certifications", [])
    r.certifications = [" — ".join(cert[i:i + 2]) for i in range(0, len(cert), 2)][:10]
    r.education = sections.get("education", [])[:6]
    if r.professional_summary:
        m = re.match(r"([A-Z][\w /&-]{3,60}?) with \d", r.professional_summary)
        r.headline = m.group(1).strip() if m else ""

    # Employment: a line containing a date range starts a role; company = text before the range
    exp_lines = sections.get("experience", [])
    jobs: list[ExtractedJob] = []
    for i, ln in enumerate(exp_lines):
        m = DATE_RANGE.search(ln)
        if not m:
            continue
        company = ln[: m.start()].strip(" \t|,-")
        if not company:
            continue
        current_role = m.group(3).lower() in ("present", "current", "now")
        start = _ym(m.group(1), m.group(2))
        end = "" if current_role else _ym(m.group(4), m.group(5))
        title, loc = "", ""
        if i + 1 < len(exp_lines):
            nxt = re.sub(r"\s*Projects?\s*$", "", exp_lines[i + 1])
            tm = re.match(r"(.+?)\s*\(([^)]+)\)\s*$", nxt)
            if tm and not find_skills(tm.group(2)):
                title, loc = tm.group(1).strip(), tm.group(2).strip()
            else:
                title = nxt.strip()
            title = title[:160]
        jobs.append(ExtractedJob(company=company[:160], title=title, location=loc, start_date=start,
                                 end_date=end, is_current=current_role))
    # Attach responsibilities (bullet-ish lines) between role headers
    idx = [i for i, ln in enumerate(exp_lines) if DATE_RANGE.search(ln)]
    for j, start_i in enumerate(idx[: len(jobs)]):
        end_i = idx[j + 1] if j + 1 < len(idx) else len(exp_lines)
        body = exp_lines[start_i + 2:end_i]
        jobs[j].highlights = [b.strip("•-* ") for b in body if 25 < len(b) < 300 and not b.lower().startswith(
            ("total downloads", "dau", "responsibilities", "projects"))][:12]
        jobs[j].description = " ".join(body)[:3000]
    r.employment = jobs
    if jobs:
        lead = [j for j in jobs if re.search(r"lead|manager|head|architect", j.title, re.I) and j.start_date]
        r.leadership_experience_years = round(sum(_span_years(j) for j in lead), 1) or None

    # Projects
    proj_lines = sections.get("projects", [])
    projects: list[ExtractedProject] = []
    cur: ExtractedProject | None = None
    for ln in proj_lines:
        if ln.lower().startswith("framework:"):
            if cur:
                cur.tech_stack = [t.strip() for t in ln.split(":", 1)[1].split(",") if t.strip()]
            continue
        if ln.lower().startswith("description:"):
            if cur:
                cur.description = ln.split(":", 1)[1].strip()
            continue
        if ln.lower().startswith("total downloads"):
            if cur:
                cur.metrics = ln.strip()
            continue
        if len(ln) < 60 and not ln.endswith(".") and not ln.lower().startswith("total"):
            cur = ExtractedProject(name=ln.strip(" \t"))
            projects.append(cur)
        elif cur:
            cur.description = (cur.description + " " + ln).strip()
    r.projects = [p for p in projects if p.description or p.tech_stack][:20]

    r.skills = [ExtractedSkill(name=n, category=c) for n, c in find_skills(text).items()]
    r.notes = ["Parsed without AI (heuristic parser). Please review every field."]
    return r


def _span_years(j: ExtractedJob) -> float:
    def to_date(s: str) -> date | None:
        try:
            y, m = s.split("-")
            return date(int(y), int(m), 1)
        except ValueError:
            return None
    start = to_date(j.start_date)
    end = date.today() if j.is_current else to_date(j.end_date)
    if not start or not end or end < start:
        return 0.0
    return (end - start).days / 365.25
