from tests.helpers import add_job, setup_candidate


def test_full_application_workflow(auth_client):
    setup_candidate(auth_client)
    jid = add_job(auth_client)
    auth_client.post(f"/api/matches/job/{jid}")
    app = auth_client.post(f"/api/jobs/{jid}/shortlist").json()
    aid = app["application_id"]
    # duplicate application prevented
    assert auth_client.post("/api/applications", json={"job_id": jid}).status_code == 409
    d = auth_client.post(f"/api/applications/{aid}/prepare", json={"cover_letter": True}).json()
    assert d["status"] == "awaiting_approval" and d["resume_id"] and d["cover_letter_id"]
    letter = next(x for x in d["documents"] if x["kind"] == "cover_letter")
    assert "Acme" in letter["body"] and letter["has_pdf"]
    # tailored resume: rule-based reorders skills by job relevance, never adds
    r = auth_client.get(f"/api/resumes/{d['resume_id']}").json()
    assert r["category"] == "tailored" and r["job_id"] == jid
    profile_skills = {s["name"] for s in auth_client.get("/api/profile").json()["skills"] if s["confirmed"]}
    assert set(r["content"]["skills"]) <= profile_skills
    assert r["content"]["skills"][0] in ("Flutter", "Dart", "BLoC", "Riverpod", "Clean Architecture", "Firebase",
                                         "CI/CD", "Codemagic")
    assert auth_client.get(f"/api/resumes/{d['resume_id']}/download?fmt=pdf").status_code == 200
    # approval then applied, with history
    assert auth_client.post(f"/api/applications/{aid}/approve").json()["approved_at"]
    a = auth_client.post(f"/api/applications/{aid}/status", json={"status": "applied", "note": "Applied on site"}).json()
    assert a["status"] == "applied" and a["applied_at"]
    auth_client.patch(f"/api/applications/{aid}", json={"follow_up_date": "2026-01-01", "offered_ctc_lpa": 33})
    iv = auth_client.post("/api/interviews", json={"application_id": aid, "round_name": "Tech round 1",
                                                   "kind": "technical", "scheduled_at": "2030-01-05T10:00:00+05:30"})
    assert iv.status_code == 201
    detail = auth_client.get(f"/api/applications/{aid}").json()
    assert detail["status"] == "technical_interview"
    assert [h["to_status"] for h in detail["history"]] == ["shortlisted", "awaiting_approval", "applied",
                                                           "technical_interview"]
    assert auth_client.get("/api/applications?follow_up_due=true").json()["total"] == 1
    auth_client.post(f"/api/applications/{aid}/status", json={"status": "offer_received"})
    s = auth_client.get("/api/analytics/overview").json()["totals"]
    assert s["applications_submitted"] == 1 and s["offers"] == 1 and s["application_conversion_rate"] == 100.0


def test_outreach_requires_approval(auth_client, monkeypatch):
    setup_candidate(auth_client)
    jid = add_job(auth_client)
    rec = auth_client.post("/api/recruiters", json={"name": "Priya N", "designation": "TA Lead", "company_name": "Acme",
                                                    "email": "priya@acme.example"}).json()
    o = auth_client.post("/api/outreach", json={"channel": "application_email", "job_id": jid,
                                                "recruiter_id": rec["id"]}).json()
    assert o["status"] == "draft" and o["to_address"] == "priya@acme.example" and "Priya" in o["body"]
    r = auth_client.post(f"/api/outreach/{o['id']}/send")
    assert r.status_code == 400 and r.json()["error"]["code"] == "approval_required"
    auth_client.post(f"/api/outreach/{o['id']}/approve")
    r = auth_client.post(f"/api/outreach/{o['id']}/send")
    assert r.status_code == 503  # SMTP not configured in tests
    sent = []
    from app.api import outreach as mod
    monkeypatch.setattr(mod.channels, "email_configured", lambda: True)
    monkeypatch.setattr(mod.channels, "send_email", lambda *a, **k: sent.append(a))
    r = auth_client.post(f"/api/outreach/{o['id']}/send?attach_resume=false")
    assert r.status_code == 200 and r.json()["status"] == "sent" and len(sent) == 1
    # Editing an approved draft requires re-approval
    o2 = auth_client.post("/api/outreach", json={"channel": "linkedin_connect", "recruiter_id": rec["id"]}).json()
    assert len(o2["body"]) <= 300
    auth_client.post(f"/api/outreach/{o2['id']}/approve")
    e = auth_client.patch(f"/api/outreach/{o2['id']}", json={"body": "Hi Priya"}).json()
    assert e["status"] == "draft"
    assert auth_client.post(f"/api/outreach/{o2['id']}/send").status_code == 400  # LinkedIn never automated
    assert auth_client.post(f"/api/outreach/{o2['id']}/mark-sent").json()["status"] == "sent"
    assert auth_client.post(f"/api/outreach/{o2['id']}/replied").json()["status"] == "replied"


def test_tailoring_reverts_fabrications(auth_client, monkeypatch):
    from app.core.config import settings
    from app.services import ai, tailoring
    setup_candidate(auth_client)
    jid = add_job(auth_client)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test")
    exp = auth_client.get("/api/profile").json()["employment"][0]

    def fake(system, user, schema, **k):
        if schema is tailoring.TailoredResume:
            return tailoring.TailoredResume(
                headline="Mobile Technical Lead", summary="Led 50 engineers across Kubernetes platforms",
                skills=["Flutter", "Kubernetes", "BLoC"],
                experience=[tailoring.TailoredRole(company=exp["company"], bullets=[
                    tailoring.TailoredBullet(source_index=0, text="Led a team of 8 engineers shipping a Flutter app to 3M users."),
                    tailoring.TailoredBullet(source_index=1, text="Designed modular Clean Architecture, cutting crashes by 70%."),
                ])], keywords_covered=["Flutter"], keywords_missing=["Codemagic"])
        return tailoring.Letter(subject="s", body="b")
    monkeypatch.setattr(ai, "structured", fake)
    aid = auth_client.post(f"/api/jobs/{jid}/shortlist").json()["application_id"]
    d = auth_client.post(f"/api/applications/{aid}/prepare", json={"cover_letter": False}).json()
    r = auth_client.get(f"/api/resumes/{d['resume_id']}").json()["content"]
    rep = r["tailoring_report"]
    assert "Kubernetes" not in r["skills"] and "Kubernetes" in rep["dropped_skills"]
    assert r["summary"] != "Led 50 engineers across Kubernetes platforms"
    bullets = r["experience"][0]["bullets"]
    assert "Led a team of 8 engineers shipping a Flutter app to 3M users." in bullets
    assert not any("70%" in b for b in bullets)
    assert any("70" in x["reason"] for x in rep["reverted"])
