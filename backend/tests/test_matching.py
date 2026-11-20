from app.matching.engine import MatchAI, classify
from tests.helpers import add_job, setup_candidate


def test_classification_thresholds():
    assert [classify(s) for s in (90, 85, 84, 70, 69, 55, 54)] == [
        "Excellent Match", "Excellent Match", "Strong Match", "Strong Match", "Potential Match", "Potential Match",
        "Low Priority"]


def test_rules_matching_without_ai(auth_client):
    setup_candidate(auth_client)
    good = add_job(auth_client)
    low = add_job(auth_client, title="Junior Web Developer", company_name="Zeta", location="Kolkata",
                  work_mode="office", ctc_min_lpa=6, ctc_max_lpa=8, description="PHP and jQuery websites.")
    a = auth_client.post(f"/api/matches/job/{good}").json()
    b = auth_client.post(f"/api/matches/job/{low}").json()
    assert a["model"] == "rules-v1" and a["prompt_version"] == "match-v1"
    assert a["overall_score"] == sum(a[f"{k}_score"] for k in (
        "technical", "leadership", "architecture", "compensation", "location", "company"))
    assert a["overall_score"] > b["overall_score"]
    assert b["compensation_score"] <= 3 and b["location_score"] <= 4
    assert "Flutter" in a["matching_skills"]
    shortlist = auth_client.get("/api/matches/shortlist?min_score=0").json()
    assert shortlist["items"][0]["id"] == good


def test_ai_guardrails(auth_client, monkeypatch):
    """AI output that invents skills and inflates scores is corrected server-side."""
    from app.core.config import settings
    from app.services import ai
    setup_candidate(auth_client)
    jid = add_job(auth_client, ctc_min_lpa=15, ctc_max_lpa=18, location="Kolkata", work_mode="office")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test")
    fake = MatchAI(technical_score=40, leadership_score=20, architecture_score=20, compensation_score=15,
                   location_score=10, company_score=10, matching_skills=["Flutter", "Kubernetes", "Swift"],
                   missing_skills=[], experience_gaps=[], leadership_relevance="", architecture_relevance="",
                   compensation_compatibility="", reasons_to_apply=["x"], reasons_not_to_apply=[],
                   suggested_resume="nonsense", recommended_action="apply", explanation="great")
    monkeypatch.setattr(ai, "structured", lambda *a, **k: fake)
    m = auth_client.post(f"/api/matches/job/{jid}").json()
    assert m["model"] == settings.ANTHROPIC_MODEL
    assert m["matching_skills"] == ["Flutter"]
    assert m["technical_score"] <= 25
    assert m["compensation_score"] <= 3       # 18 LPA max vs 25 target
    assert m["location_score"] <= 4           # Kolkata not preferred
    assert m["company_score"] <= 7            # company not researched
    assert m["suggested_resume"] == "master"
    assert m["overall_score"] < 100 and any("Removed unconfirmed" in x for x in m["adjustments"])
    # history keeps previous versions; only one current
    auth_client.post(f"/api/matches/job/{jid}")
    hist = auth_client.get(f"/api/matches/job/{jid}").json()
    assert len(hist) == 2 and sum(h["is_current"] for h in hist) == 1


def test_ai_failure_falls_back(auth_client, monkeypatch):
    from app.core.config import settings
    from app.services import ai
    setup_candidate(auth_client)
    jid = add_job(auth_client)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test")

    def boom(*a, **k):
        raise ai.AIUnavailable("rate limited")
    monkeypatch.setattr(ai, "structured", boom)
    m = auth_client.post(f"/api/matches/job/{jid}").json()
    assert m["model"] == "rules-v1" and any("AI unavailable" in x for x in m["adjustments"])


def test_research_endpoints_require_ai(auth_client):
    add_job(auth_client)
    cid = auth_client.get("/api/companies").json()["items"][0]["id"]
    assert auth_client.post(f"/api/companies/{cid}/research").status_code == 503


def test_contact_grounding(db, monkeypatch):
    """Contacts whose source isn't in web results are dropped; unverifiable emails are stripped."""
    from app.models import Company, Recruiter, User
    from app.services import ai, research
    u = User(email="g@example.com", password_hash="x")
    db.add(u)
    db.flush()
    c = Company(user_id=u.id, name="Acme", normalized_name="acme")
    db.add(c)
    db.flush()
    contacts = research.ContactList(contacts=[
        research.Contact(name="Real Person", designation="TA Lead", role_type="talent_acquisition",
                         linkedin_url="https://www.linkedin.com/in/real", email="real.person@acme.com",
                         source_url="https://acme.com/team", evidence="Listed as TA Lead"),
        research.Contact(name="Made Up", designation="CTO", role_type="cto", source_url="https://nowhere.example/x",
                         evidence="?"),
    ])
    monkeypatch.setattr(ai, "research", lambda *a, **k: (contacts, [{"url": "https://acme.com/team", "title": "Team"}]))
    monkeypatch.setattr(research, "_email_in_page", lambda email, url: False)
    res = research.discover_contacts(db, c, u.id)
    assert res["added"] == 1 and any("Made Up" in s for s in res["skipped"])
    r = db.query(Recruiter).one()
    assert r.email == "" and "dropped" in r.source_description and r.verification_status == "unverified"
