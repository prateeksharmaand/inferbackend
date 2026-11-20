from tests.conftest import make_docx


def setup_candidate(c):
    """Upload sample resume + set preferences."""
    c.post("/api/resumes/upload", files={"file": ("a.docx", make_docx(), "application/octet-stream")})
    c.patch("/api/profile", json={"target_ctc_min_lpa": 25, "target_ctc_max_lpa": 35, "location": "Jaipur",
                                  "preferred_locations": ["Jaipur", "Bengaluru", "Pune", "Remote India"],
                                  "preferred_work_modes": ["remote", "hybrid", "office"]})


def add_job(c, **kw):
    body = {"title": "Flutter Technical Lead", "company_name": "Acme", "location": "Bengaluru", "work_mode": "hybrid",
            "ctc_min_lpa": 30, "ctc_max_lpa": 40,
            "description": "Lead our Flutter team. Required: Flutter, Dart, BLoC, Riverpod, Clean Architecture, "
                           "Firebase, CI/CD, Codemagic. 8+ years experience. Mentor engineers and own architecture."}
    body.update(kw)
    r = c.post("/api/jobs", json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]
