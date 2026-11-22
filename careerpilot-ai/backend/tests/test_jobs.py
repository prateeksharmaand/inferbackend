import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.connectors.base import RawJob
from app.services.normalize import normalize, normalize_url, title_company_key
from app.services.salary import parse_salary_text, to_lpa


@pytest.mark.parametrize("text,expected", [
    ("CTC: 25-35 LPA", (25, 35)),
    ("₹ 28 to 40 Lakhs per annum", (28, 40)),
    ("Salary 32 LPA fixed", (32, 32)),
    ("INR 25,00,000 - 35,00,000 per year", (25, 35)),
    ("1 - 1.5 Cr", (100, 150)),
    ("Competitive salary", (None, None)),
])
def test_parse_salary(text, expected):
    assert parse_salary_text(text) == expected


def test_to_lpa_conventions():
    assert to_lpa(2_850_000, "year", "INR") == 28.5
    assert to_lpa(250_000, "month", "INR") == 30.0
    assert to_lpa(150_000, "year", "USD") is None  # no silent FX conversion
    assert to_lpa(500, "year", "INR") is None      # implausible units rejected


def test_normalize_url_strips_tracking():
    a = normalize_url("https://www.linkedin.com/jobs/view/123/?trk=abc&refId=xyz&utm_source=x")
    b = normalize_url("https://linkedin.com/jobs/view/123")
    assert a == b


def test_title_company_key_ignores_noise():
    assert title_company_key("Sr. Flutter Lead (Remote)", "Acme Technologies Pvt Ltd") == \
        title_company_key("Senior Flutter Lead", "ACME")


def raw(**kw):
    base = dict(source_key="jsearch", external_id="x1", title="Flutter Technical Lead", company="Acme Pvt Ltd",
                url="https://jobs.example.com/1?utm_source=a",
                description="We need 8-12 years experience. Flutter, Dart, BLoC, Riverpod, CI/CD with Codemagic. "
                            "Hybrid role in Bengaluru. " + "Lead a team of mobile engineers. " * 10,
                location="Bengaluru, Karnataka", posted_at=datetime.now(timezone.utc) - timedelta(hours=5),
                salary_text="30-40 LPA")
    base.update(kw)
    return RawJob(**base)


def test_normalize_fields():
    n = normalize(raw())
    assert n.work_mode == "hybrid"
    assert (n.ctc_min_lpa, n.ctc_max_lpa) == (30, 40)
    assert (n.experience_min_years, n.experience_max_years) == (8, 12)
    assert {"Flutter", "BLoC", "Riverpod", "Codemagic", "CI/CD"} <= set(n.skills)
    assert "utm_source" not in n.normalized_url


def test_ingest_dedupes_across_sources(db):
    from app.connectors.registry import ensure_sources
    from app.models import Job, JobSource, User
    from app.services.job_service import ingest
    u = User(email="d@example.com", password_hash="x")
    db.add(u)
    db.flush()
    ensure_sources(db)
    js = db.query(JobSource).filter_by(key="jsearch").one()
    ad = db.query(JobSource).filter_by(key="adzuna").one()
    s1 = ingest(db, u.id, [normalize(raw())], js)
    # same posting, same source & id
    s2 = ingest(db, u.id, [normalize(raw())], js)
    # cross-posted on another board: different id & url, same title+company
    s3 = ingest(db, u.id, [normalize(raw(source_key="adzuna", external_id="zz", url="https://adzuna.in/x/9",
                                         company="ACME Private Limited", title="Sr Flutter Technical Lead"))], ad)
    # irrelevant role is filtered out
    s4 = ingest(db, u.id, [normalize(raw(external_id="q", url="https://e.com/q", title="Accounts Payable Manager",
                                         company="Other", description="Finance role. " * 30))], js)
    db.commit()
    assert (s1.inserted, s2.duplicates, s3.duplicates, s4.irrelevant) == (1, 1, 1, 1)
    assert db.query(Job).count() == 1


def mock_transport(routes: dict):
    def handler(request: httpx.Request):
        for prefix, payload in routes.items():
            if str(request.url).startswith(prefix):
                status, body = payload if isinstance(payload, tuple) else (200, payload)
                return httpx.Response(status, json=body)
        return httpx.Response(404, json={})
    return httpx.MockTransport(handler)


@pytest.fixture
def fake_http(monkeypatch):
    def install(routes):
        def factory(timeout=20.0):
            return httpx.Client(transport=mock_transport(routes), follow_redirects=True)
        for mod in ("app.connectors.ats", "app.connectors.aggregators", "app.connectors.base",
                    "app.connectors.manual"):
            monkeypatch.setattr(f"{mod}.http_client", factory)
    return install


GH = {"jobs": [
    {"id": 11, "title": "Lead Mobile Engineer (Flutter)", "absolute_url": "https://boards.greenhouse.io/acme/jobs/11",
     "location": {"name": "Remote - India"}, "first_published": "2026-11-19T10:00:00Z",
     "content": "&lt;p&gt;Own our Flutter architecture. 10+ years experience.&lt;/p&gt;"},
    {"id": 12, "title": "Accountant", "absolute_url": "https://boards.greenhouse.io/acme/jobs/12",
     "location": {"name": "Pune"}, "content": "Books"},
]}


def test_greenhouse_connector_and_discovery(auth_client, fake_http, db):
    fake_http({"https://boards-api.greenhouse.io/v1/boards/acme/jobs": GH})
    from app.models import JobSource
    auth_client.get("/api/sources")
    r = auth_client.patch("/api/sources/greenhouse", json={"config": {"boards": [{"token": "acme", "company": "Acme"}]}})
    assert r.status_code == 200
    for key in ("lever", "jsearch", "adzuna", "ashby"):
        auth_client.patch(f"/api/sources/{key}", json={"enabled": False})
    from app.services.discovery import run_discovery
    res = run_discovery(db, 1)
    assert res["inserted"] == 1  # accountant filtered by title gate
    jobs = auth_client.get("/api/jobs").json()
    assert jobs["total"] == 1
    j = jobs["items"][0]
    assert j["work_mode"] == "remote" and j["source_key"] == "greenhouse"
    # Running again finds nothing new
    assert run_discovery(db, 1)["inserted"] == 0
    assert db.query(JobSource).filter_by(key="greenhouse").one().status == "connected"


def test_restricted_sources_cannot_be_enabled(auth_client):
    sources = {s["key"]: s for s in auth_client.get("/api/sources").json()}
    assert sources["linkedin"]["kind"] == "restricted" and sources["linkedin"]["status"] == "unavailable"
    r = auth_client.patch("/api/sources/linkedin", json={"enabled": True})
    assert r.status_code == 400


def test_jsearch_awaiting_credentials(auth_client):
    s = {x["key"]: x for x in auth_client.get("/api/sources").json()}["jsearch"]
    assert s["status"] == "awaiting_credentials"


def test_jsearch_parsing(fake_http, monkeypatch):
    from app.connectors.aggregators import JSearchConnector
    from app.connectors.base import SearchQuery
    from app.core.config import settings
    monkeypatch.setattr(settings, "SEARCH_PROVIDER_API_KEY", "k")
    fake_http({"https://jsearch.p.rapidapi.com/search-v2": {"data": {"cursor": "x", "jobs": [{
        "job_id": "abc", "job_title": "Flutter Architect", "employer_name": "Beta", "job_apply_link": "https://b.com/a",
        "job_description": "Flutter architect role", "job_city": "Pune", "job_country": "IN",
        "job_posted_at_datetime_utc": "2026-11-19T08:00:00Z", "job_min_salary": 3000000, "job_max_salary": 4000000,
        "job_salary_currency": "INR", "job_salary_period": "YEAR", "job_is_remote": False, "job_publisher": "LinkedIn"}]}}})
    jobs = JSearchConnector({"max_requests": 1}).search_jobs(SearchQuery(keywords=["Flutter Architect"], locations=["Pune"]))
    n = normalize(jobs[0])
    assert n.title == "Flutter Architect" and (n.ctc_min_lpa, n.ctc_max_lpa) == (30, 40)
    assert jobs[0].raw["publisher"] == "LinkedIn"


def test_manual_job_create_dedupe_filters_and_sort(auth_client):
    r = auth_client.post("/api/jobs", json={"title": "Mobile Architect", "company_name": "Gamma",
                                            "url": "https://gamma.com/careers/1?utm_source=li", "location": "Jaipur",
                                            "work_mode": "office", "ctc_min_lpa": 30, "ctc_max_lpa": 38})
    assert r.status_code == 201, r.text
    assert r.json()["is_manual"] and r.json()["ctc_max_lpa"] == 38
    dup = auth_client.post("/api/jobs", json={"title": "Mobile Architect", "company_name": "Gamma",
                                              "url": "https://gamma.com/careers/1"})
    assert dup.status_code == 409
    auth_client.post("/api/jobs", json={"title": "Flutter Lead", "company_name": "Delta", "work_mode": "remote",
                                        "ctc_min_lpa": 20, "ctc_max_lpa": 24})
    assert auth_client.get("/api/jobs?work_mode=remote").json()["total"] == 1
    assert auth_client.get("/api/jobs?min_ctc=25").json()["total"] == 1
    assert auth_client.get("/api/jobs?location=jaipur").json()["total"] == 1
    assert auth_client.get("/api/jobs?search=delta").json()["total"] == 1
    items = auth_client.get("/api/jobs?sort=ctc").json()["items"]
    assert [i["company_name"] for i in items] == ["Gamma", "Delta"]
    assert auth_client.get("/api/jobs?page_size=1&page=2").json()["items"][0]["company_name"] in ("Gamma", "Delta")


def test_shortlist_creates_single_application(auth_client):
    jid = auth_client.post("/api/jobs", json={"title": "Flutter Lead", "company_name": "Delta"}).json()["id"]
    a = auth_client.post(f"/api/jobs/{jid}/shortlist").json()
    b = auth_client.post(f"/api/jobs/{jid}/shortlist").json()
    assert a["application_id"] and a["application_id"] == b["application_id"]
    assert a["application_status"] == "shortlisted"


def test_verify_marks_expired(auth_client, fake_http):
    jid = auth_client.post("/api/jobs", json={"title": "Flutter Lead", "company_name": "Delta",
                                              "url": "https://delta.example/jobs/1"}).json()["id"]
    fake_http({"https://delta.example/jobs/1": (404, {})})
    assert auth_client.post(f"/api/jobs/{jid}/verify").json()["status"] == "expired"


def test_import_url_jsonld(auth_client, monkeypatch):
    page = """<html><head><script type="application/ld+json">""" + json.dumps({
        "@context": "https://schema.org", "@type": "JobPosting", "title": "Flutter Technical Lead",
        "hiringOrganization": {"@type": "Organization", "name": "Epsilon"}, "datePosted": "2026-11-18",
        "description": "<p>Lead Flutter team. 9+ years experience.</p>",
        "jobLocation": {"@type": "Place", "address": {"addressLocality": "Hyderabad"}},
        "baseSalary": {"currency": "INR", "value": {"minValue": 3000000, "maxValue": 3600000, "unitText": "YEAR"}}
    }) + "</script></head></html>"

    def factory(timeout=20.0):
        return httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=page)))
    monkeypatch.setattr("app.connectors.manual.http_client", factory)
    r = auth_client.post("/api/jobs/import-url", json={"url": "https://careers.epsilon.example/jobs/9"})
    assert r.status_code == 200, r.text
    p = r.json()["preview"]
    assert p["title"] == "Flutter Technical Lead" and p["company_name"] == "Epsilon"
    assert (p["ctc_min_lpa"], p["ctc_max_lpa"]) == (30, 36) and p["location"] == "Hyderabad"


def test_import_url_gated_site(auth_client, monkeypatch):
    def factory(timeout=20.0):
        return httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(999, text="")))
    monkeypatch.setattr("app.connectors.manual.http_client", factory)
    r = auth_client.post("/api/jobs/import-url", json={"url": "https://www.linkedin.com/jobs/view/1"})
    assert r.status_code == 400 and "sign-in" in r.json()["error"]["message"]


def test_jsearch_daily_rotation_covers_all_keywords():
    from app.connectors.aggregators import JSearchConnector
    from app.connectors.base import SearchQuery
    kws = [f"k{i}" for i in range(9)]
    c = JSearchConnector({"max_requests": 6})
    q = SearchQuery(keywords=kws, locations=["Pune", "Remote India"])
    seen = set()
    for day in range(2):
        plan = c.plan(q, 1000 + day)
        assert len(plan) == 6
        seen |= {k for k, _ in plan}
    assert seen == set(kws)  # every keyword searched within 2 days on a 6-request budget


def test_jsearch_v2_generic_google_links_are_not_duplicates(db):
    """v2 returns the same google search URL for every job; distinct postings must not collapse."""
    from app.connectors.aggregators import JSearchConnector
    from app.connectors.registry import ensure_sources
    from app.models import JobSource, User
    from app.services.job_service import ingest
    u = User(email="v2@example.com", password_hash="x")
    db.add(u)
    db.flush()
    ensure_sources(db)
    src = db.query(JobSource).filter_by(key="jsearch").one()
    g = "https://www.google.com/search?q=jobs&gl=in&hl=en&udm=8#vhid=vt%3D20/docid%3D"
    jobs = [{"job_id": "A" * 400 + str(i), "job_title": t, "employer_name": c, "job_google_link": g + str(i),
             "job_apply_link": f"https://{c.lower()}.example/apply/{i}", "job_description": "Flutter mobile lead role",
             "job_city": "Pune"} for i, (t, c) in enumerate([("Flutter Lead", "Acme"), ("Mobile Architect", "Beta"),
                                                             ("Flutter Architect", "Gamma")])]
    raws = [JSearchConnector()._raw(j) for j in jobs]
    st = ingest(db, u.id, [normalize(r) for r in raws], src)
    assert st.inserted == 3 and st.duplicates == 0
    assert all(len(normalize(r).external_id) <= 255 for r in raws)
    assert normalize_url(g + "1") is None
