"""Seed a DEMO account with fictional data for product screenshots.

Everything here is fictional (candidate, companies, jobs, recruiters). It drives the real API, so scores,
tailored resumes and evaluations are produced by the app itself (with an AI key set, by the AI provider).

Usage (against a throwaway database!):
    DATABASE_URL=postgresql+psycopg://$USER@localhost/careerpilot_demo uv run uvicorn app.main:app --port 8010
    uv run python scripts/seed_demo.py http://localhost:8010
"""
import io
import sys
from datetime import datetime, timedelta, timezone

import httpx
from docx import Document

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
EMAIL, PASSWORD = "demo@example.com", "demo-password-2026"

RESUME = [
    "Rohan Malhotra", "Pune, Maharashtra",
    "Phone 9800000000 • Email rohan.malhotra@example.com • LinkedIn https://www.linkedin.com/in/rohan-malhotra-demo",
    "PROFILE SUMMARY",
    "Mobile Architect with 12+ years of experience building Flutter and Android apps for fintech and healthcare, "
    "leading teams of up to 10 engineers and owning releases to the App Store and Google Play.",
    "KEY SKILLS",
    "Flutter, Dart, BLoC, Riverpod, Clean Architecture, Kotlin, Android, iOS, Firebase, REST APIs, CI/CD, "
    "Codemagic, Git, SSL Pinning, Performance Optimization, Team Leadership, Code Review, Agile / Scrum",
    "WORK EXPERIENCE",
    "Flutter Experience With Dart: 5 Year",
    "Android Experience: 10 Years",
    "Northwind Payments Pvt Ltd\tApril 2021 – Present",
    "Mobile Technical Lead (Pune)",
    "Led a team of 8 engineers delivering the Northwind Pay Flutter app to 3M users.",
    "Designed a modular Clean Architecture with BLoC and offline-first sync for 40+ screens.",
    "Introduced Codemagic CI/CD, cutting release time from 2 days to 3 hours.",
    "Implemented SSL pinning and encrypted storage to pass RBI security audits.",
    "Bluefin Health Labs\tJune 2016 – March 2021",
    "Senior Android Engineer (Bengaluru)",
    "Built the Bluefin patient app in Kotlin used by 400 clinics.",
    "Reduced cold start time by 40% through performance optimization.",
    "Mentored 4 junior engineers and ran weekly code reviews.",
    "Brightline Software\tJuly 2013 – May 2016",
    "Android Developer (Pune)",
    "Developed e-commerce Android apps with REST APIs and Google Maps.",
    "CERTIFICATIONS", "Google Associate Android Developer",
    "EDUCATION", "B.Tech Computer Science, Pune University, 2013",
]

JOBS = [
    dict(title="Flutter Technical Lead", company_name="Lumenpay Fintech", location="Pune, Maharashtra",
         work_mode="hybrid", ctc_min_lpa=30, ctc_max_lpa=38,
         description="Lead a team of 6 Flutter engineers building our payments super-app (5M users). Own the app "
         "architecture with BLoC and Clean Architecture, Firebase, CI/CD with Codemagic, Play Store and App Store "
         "releases, and SSL pinning. 9+ years mobile experience with 2+ years leading teams. Fintech experience a plus."),
    dict(title="Mobile Architect", company_name="Orbit Health Systems", location="Bengaluru, Karnataka",
         work_mode="hybrid", ctc_min_lpa=34, ctc_max_lpa=42,
         description="Define the mobile architecture for our patient and clinician apps (Flutter + native modules). "
         "Modular design, offline-first sync, secure storage, performance budgets and SDK design for partner "
         "integrations. Work with backend, QA and DevOps. 10+ years in mobile, healthcare domain preferred."),
    dict(title="Engineering Manager – Mobile", company_name="Kestrel Logistics", location="Gurugram, Haryana",
         work_mode="office", ctc_min_lpa=40, ctc_max_lpa=50,
         description="Manage two mobile squads (12 engineers) shipping driver and customer apps in Flutter. Hiring, "
         "performance reviews, delivery planning, stakeholder management and architecture reviews. 12+ years "
         "experience, 4+ years managing engineers."),
    dict(title="Senior Flutter Engineer", company_name="Tidewater Retail", location="Remote India",
         work_mode="remote", ctc_min_lpa=24, ctc_max_lpa=30,
         description="Build features in our Flutter shopping app using Riverpod and Firebase. REST APIs, animations, "
         "widget testing. 6+ years experience."),
    dict(title="Mobile Solutions Architect", company_name="Cobalt Insurance Tech", location="Hyderabad, Telangana",
         work_mode="hybrid", ctc_min_lpa=36, ctc_max_lpa=45,
         description="Own solution design for insurance mobile apps across Android, iOS and Flutter. Authentication "
         "with OAuth/OIDC, secure storage, encryption, API integration and presales support. 11+ years experience."),
    dict(title="Lead Android Engineer", company_name="Saffron Media", location="Mumbai, Maharashtra",
         work_mode="office", ctc_min_lpa=26, ctc_max_lpa=32,
         description="Lead Android development in Kotlin and Jetpack Compose for a streaming app. Gradle build "
         "optimisation, release management, mentoring 4 engineers. 8+ years experience."),
    dict(title="Flutter Architect", company_name="Pinecrest EdTech", location="Jaipur, Rajasthan",
         work_mode="hybrid", ctc_min_lpa=28, ctc_max_lpa=35,
         description="Architect our learning apps in Flutter: Clean Architecture, BLoC, platform channels, isolates "
         "for heavy processing, CI/CD and code quality with SonarQube. 9+ years experience."),
    dict(title="iOS Developer", company_name="Maple Travel", location="Chennai, Tamil Nadu", work_mode="office",
         ctc_min_lpa=14, ctc_max_lpa=18, description="Build iOS features in Swift and SwiftUI. 4+ years experience."),
]

CONTACTS = [
    dict(name="Neha Iyer", designation="Senior Talent Acquisition Partner", role_type="talent_acquisition",
         company_name="Lumenpay Fintech", linkedin_url="https://www.linkedin.com/in/neha-iyer-demo",
         source_url="https://example.com/lumenpay/team"),
    dict(name="Vikram Sethi", designation="Director of Engineering", role_type="engineering_director",
         company_name="Orbit Health Systems", linkedin_url="https://www.linkedin.com/in/vikram-sethi-demo",
         source_url="https://example.com/orbit/leadership"),
    dict(name="Ananya Rao", designation="Recruiter – Technology", role_type="recruiter",
         company_name="Kestrel Logistics", email="ananya.rao@example.com", source_url="https://example.com/kestrel/careers"),
]


def main():
    c = httpx.Client(base_url=BASE, timeout=300)

    def csrf():
        return {"X-CSRF-Token": c.cookies.get("cp_csrf", "")}

    def post(path, body=None, **kw):
        r = c.post(path, json=body if body is not None else {}, headers=csrf(), **kw)
        if r.status_code >= 400:
            print("!!", path, r.status_code, r.text[:300])
        return r

    r = c.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD, "full_name": "Rohan Malhotra"})
    if r.status_code == 409:
        c.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    d = Document()
    for ln in RESUME:
        d.add_paragraph(ln)
    buf = io.BytesIO()
    d.save(buf)
    r = c.post("/api/resumes/upload?apply_to_profile=replace", files={"file": ("rohan_malhotra_resume.docx", buf.getvalue(),
               "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}, headers=csrf())
    print("resume parsed by", r.json().get("parsed_by"))
    c.patch("/api/profile", json={"target_ctc_min_lpa": 30, "target_ctc_max_lpa": 40, "current_ctc_lpa": 27,
                                  "notice_period_days": 60, "location": "Pune",
                                  "preferred_locations": ["Pune", "Bengaluru", "Hyderabad", "Jaipur", "Remote India"],
                                  "preferred_work_modes": ["remote", "hybrid"],
                                  "preferred_designations": ["Flutter Technical Lead", "Mobile Architect",
                                                             "Engineering Manager – Mobile"]}, headers=csrf())
    for v in ("master", "flutter_lead", "mobile_architect"):
        post("/api/resumes/variants", {"category": v})

    ids = []
    now = datetime.now(timezone.utc)
    for i, j in enumerate(JOBS):
        j = dict(j, posted_at=(now - timedelta(hours=6 + 9 * i)).isoformat(),
                 url=f"https://example.com/careers/{j['company_name'].split()[0].lower()}/{i + 1}")
        ids.append(post("/api/jobs", j).json()["id"])
    print("scoring", len(ids), "jobs…")
    post("/api/matches/run", {"job_ids": ids, "limit": len(ids)})
    ranked = sorted(c.get("/api/matches/shortlist", params={"min_score": 0, "page_size": 50}).json()["items"],
                    key=lambda x: -x["match"]["overall_score"])
    for j in ranked:
        print(f"  {j['match']['overall_score']:>3} {j['title']} @ {j['company_name']}")

    apps = {}
    for j in ranked[:5]:
        apps[j["id"]] = post(f"/api/jobs/{j['id']}/shortlist").json()["application_id"]
    top = [j["id"] for j in ranked[:5]]
    print("preparing packages…")
    for jid in top[:3]:
        post(f"/api/applications/{apps[jid]}/prepare", {"cover_letter": True})
    # stages: applied → technical interview, applied → screening, awaiting approval, shortlisted
    a0, a1 = apps[top[0]], apps[top[1]]
    for a in (a0, a1):
        post(f"/api/applications/{a}/approve")
        post(f"/api/applications/{a}/status", {"status": "applied", "note": "Applied on the careers site"})
    post(f"/api/applications/{a1}/status", {"status": "screening", "note": "Recruiter call booked"})
    post("/api/interviews", {"application_id": a0, "round_name": "Technical round 1 – architecture",
                             "kind": "technical", "scheduled_at": (now + timedelta(days=3, hours=4)).isoformat(),
                             "mode": "video", "interviewers": "Engineering Manager, Staff Engineer"})
    c.patch(f"/api/applications/{a1}", json={"follow_up_date": (now - timedelta(days=1)).date().isoformat()},
            headers=csrf())

    rec_ids = [post("/api/recruiters", r).json()["id"] for r in CONTACTS]
    post("/api/outreach", {"channel": "linkedin_connect", "recruiter_id": rec_ids[0], "job_id": top[0]})
    post("/api/outreach", {"channel": "application_email", "recruiter_id": rec_ids[2], "job_id": ids[2]})

    print("mock interview…")
    s = post("/api/interview-coach/sessions", {"topics": ["architecture", "security"], "count": 3,
                                                "target_role": "Mobile Architect"}).json()
    bank = {q["question"]: q["key_points"] for q in c.get("/api/interview-coach/questions").json()}
    for a in s["answers"][:2]:
        # A realistic, mostly-complete answer to the question actually asked (covers all but the last point)
        pts = bank.get(a["question"], [])[:-1]
        text = ("In practice I'd approach it like this. " + " ".join(f"{p[0].upper()}{p[1:]}." for p in pts)
                + " I'd agree these with the team and document the decision.")
        post(f"/api/interview-coach/sessions/{s['id']}/answers/{a['id']}", {"answer": text})
    post(f"/api/interview-coach/sessions/{s['id']}/complete")

    print("agent…")
    post("/api/agent/chat", {"message": "Show remote or hybrid Flutter lead roles above 30 LPA and tell me which to apply to first."})
    print("demo ready:", EMAIL, PASSWORD)


if __name__ == "__main__":
    main()
