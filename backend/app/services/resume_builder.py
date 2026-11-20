"""Builds structured resume content from the candidate profile, and the four standard variants.

Variants only *re-order and select* existing facts (headline wording, skill order, which bullets lead).
They never add facts. AI tailoring (app.services.tailoring) works on top of this content and is
validated against it.
"""
from app.models import CandidateProfile
from app.services.profile_service import confirmed_skills

VARIANTS = {
    "master": {
        "label": "Master Resume",
        "skill_priority": [],
        "headline": None,
    },
    "flutter_lead": {
        "label": "Flutter Technical Lead Resume",
        "skill_priority": ["Flutter", "Dart", "BLoC", "Riverpod", "Provider", "Clean Architecture", "Firebase",
                           "Platform Channels", "Team Leadership", "Code Review", "App Store Release", "iOS",
                           "Android"],
        "headline": "Mobile Engineering Lead — Flutter & Android",
    },
    "mobile_architect": {
        "label": "Mobile Architect Resume",
        "skill_priority": ["Mobile Architecture", "SDK Design", "Design Patterns", "Clean Architecture",
                           "Offline-first / Local DB", "REST APIs", "App Security", "SSL Pinning",
                           "Performance Optimization", "Bluetooth LE", "Flutter", "Android", "Kotlin", "Java"],
        "headline": "Mobile Architect — Android & Flutter",
    },
    "engineering_leadership": {
        "label": "Engineering Leadership Resume",
        "skill_priority": ["Team Leadership", "Agile / Scrum", "Code Review", "Estimation & Planning",
                           "Stakeholder Management", "Technical Documentation", "Mentoring", "Hiring",
                           "LiveOps", "Mobile Architecture", "Flutter", "Android"],
        "headline": "Mobile Engineering Lead",
    },
}
LEAD_WORDS = {
    "flutter_lead": ["flutter", "release", "review", "lead", "architect", "ios", "testflight"],
    "mobile_architect": ["architect", "sdk", "design", "scal", "module", "ble", "security", "performance"],
    "engineering_leadership": ["led", "lead", "team", "managing", "collaborat", "review", "process", "document"],
}


def _date_range(e) -> str:
    def fmt(ym: str) -> str:
        if not ym:
            return ""
        parts = ym.split("-")
        if len(parts) == 2:
            import calendar
            return f"{calendar.month_abbr[int(parts[1])]} {parts[0]}"
        return ym
    return f"{fmt(e.start_date)} – {'Present' if e.is_current else fmt(e.end_date)}".strip(" –")


def build_content(p: CandidateProfile, variant: str = "master") -> dict:
    v = VARIANTS.get(variant, VARIANTS["master"])
    skills = confirmed_skills(p)
    pri = {s.lower(): i for i, s in enumerate(v["skill_priority"])}
    skills.sort(key=lambda s: (pri.get(s.lower(), 999), s))
    words = LEAD_WORDS.get(variant, [])

    def order(bullets: list[str]) -> list[str]:
        if not words:
            return list(bullets)
        return sorted(bullets, key=lambda b: -sum(w in b.lower() for w in words))

    by_cat: dict[str, list[str]] = {}
    for s in p.skills:
        if s.confirmed:
            by_cat.setdefault(s.category, []).append(s.name)
    return {
        "variant": variant,
        "name": p.full_name,
        "headline": v["headline"] or p.headline,
        "contact": {"email": p.email, "phone": p.phone, "linkedin": p.linkedin_url, "location": p.location},
        "summary": p.professional_summary,
        "skills": skills,
        "skills_by_category": by_cat,
        "experience": [{"company": e.company, "title": e.title, "location": e.location, "dates": _date_range(e),
                        "bullets": order(e.highlights)} for e in p.employment],
        "projects": [{"name": pr.name, "description": pr.description, "tech": pr.tech_stack,
                      "metrics": pr.metrics} for pr in p.projects],
        "achievements": list(p.achievements or []),
        "certifications": list(p.certifications or []),
        "education": list(p.education or []),
    }


def content_to_text(c: dict) -> str:
    out = [c.get("name", ""), c.get("headline", ""), " | ".join(v for v in c.get("contact", {}).values() if v), "",
           "SUMMARY", c.get("summary", ""), "", "SKILLS", ", ".join(c.get("skills", [])), "", "EXPERIENCE"]
    for e in c.get("experience", []):
        out.append(f"{e['title']} — {e['company']} ({e['dates']})")
        out += [f"• {b}" for b in e.get("bullets", [])]
    if c.get("projects"):
        out += ["", "PROJECTS"]
        for pr in c["projects"]:
            out.append(f"{pr['name']}: {pr['description']} {pr.get('metrics', '')}")
    for key, title in (("achievements", "ACHIEVEMENTS"), ("certifications", "CERTIFICATIONS"),
                       ("education", "EDUCATION")):
        if c.get(key):
            out += ["", title] + [f"• {x}" for x in c[key]]
    return "\n".join(out)
