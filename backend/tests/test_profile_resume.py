from app.services.resume_parser import extract_text, heuristic_parse
from tests.conftest import make_docx


def test_heuristic_parser_extracts_only_stated_facts(sample_docx):
    r = heuristic_parse(extract_text(sample_docx, "docx"))
    assert r.full_name == "Asha Verma"
    assert r.email == "asha.verma@example.com"
    assert r.total_experience_years == 11
    assert r.flutter_experience_years == 5
    assert [e.company for e in r.employment] == ["Acme Payments Pvt Ltd", "Beta Labs"]
    assert r.employment[0].is_current and r.employment[0].start_date == "2021-01"
    assert r.employment[0].title == "Mobile Technical Lead" and r.employment[0].location == "Bengaluru"
    assert r.employment[1].end_date == "2020-12"
    names = {s.name for s in r.skills}
    assert {"Flutter", "BLoC", "Codemagic", "SSL Pinning", "CI/CD"} <= names
    assert "Swift" not in names and "React Native" not in names  # never invented
    assert r.certifications and "Google Associate" in r.certifications[0]


def test_upload_rejects_bad_files(auth_client):
    r = auth_client.post("/api/resumes/upload", files={"file": ("x.exe", b"MZ....", "application/octet-stream")})
    assert r.status_code == 400
    r = auth_client.post("/api/resumes/upload", files={"file": ("fake.pdf", b"not a pdf at all", "application/pdf")})
    assert r.status_code == 400 and "does not match" in r.json()["error"]["message"]


def test_upload_parses_and_fills_profile(auth_client, sample_docx):
    r = auth_client.post("/api/resumes/upload", files={"file": ("asha.docx", sample_docx,
                         "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["parsed_by"] == "heuristic-v1"  # no API key in tests
    assert body["resume"]["is_primary"] is True
    p = auth_client.get("/api/profile").json()
    assert p["full_name"] == "Test Candidate"  # fill_empty keeps the existing name
    assert p["email"] == "me@example.com"
    assert p["total_experience_years"] == 11
    assert len(p["employment"]) == 2
    assert any(s["name"] == "Flutter" and s["confirmed"] for s in p["skills"])
    assert any(n["field"] == "target_ctc_min_lpa" for n in p["needs_confirmation"])


def test_unconfirmed_skill_flow(auth_client, sample_docx):
    auth_client.post("/api/resumes/upload", files={"file": ("a.docx", sample_docx, "application/octet-stream")})
    r = auth_client.post("/api/profile/skills", json={"name": "Fastlane", "category": "tool", "confirmed": False})
    assert r.status_code == 201 and r.json()["source"] == "user" and not r.json()["confirmed"]
    p = auth_client.get("/api/profile").json()
    assert any("Fastlane" in n["message"] for n in p["needs_confirmation"])
    sid = r.json()["id"]
    auth_client.patch(f"/api/profile/skills/{sid}", json={"name": "Fastlane", "category": "tool", "confirmed": True})
    p = auth_client.get("/api/profile").json()
    assert not any("Fastlane" in n["message"] for n in p["needs_confirmation"])


def test_profile_update_validation(auth_client):
    r = auth_client.patch("/api/profile", json={"preferred_work_modes": ["moon"]})
    assert r.status_code == 422
    r = auth_client.patch("/api/profile", json={"target_ctc_min_lpa": 25, "target_ctc_max_lpa": 35,
                                                "preferred_work_modes": ["remote", "hybrid"]})
    assert r.status_code == 200 and r.json()["target_ctc_min_lpa"] == 25


def test_variants_and_downloads(auth_client, sample_docx):
    auth_client.post("/api/resumes/upload", files={"file": ("a.docx", sample_docx, "application/octet-stream")})
    r = auth_client.post("/api/resumes/variants", json={"category": "flutter_lead"})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    detail = auth_client.get(f"/api/resumes/{rid}").json()
    assert detail["content"]["skills"][0] == "Flutter"
    pdf = auth_client.get(f"/api/resumes/{rid}/download?fmt=pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    docx = auth_client.get(f"/api/resumes/{rid}/download?fmt=docx")
    assert docx.status_code == 200 and docx.content.startswith(b"PK")
    # The generated PDF contains no employer that isn't in the profile
    text = extract_text(pdf.content, "pdf")
    assert "Acme Payments" in text and "Beta Labs" in text


def test_resume_edit_creates_new_version(auth_client, sample_docx):
    auth_client.post("/api/resumes/upload", files={"file": ("a.docx", sample_docx, "application/octet-stream")})
    rid = auth_client.post("/api/resumes/variants", json={"category": "master"}).json()["id"]
    c = auth_client.get(f"/api/resumes/{rid}").json()["content"]
    c["summary"] = "Edited summary"
    new = auth_client.patch(f"/api/resumes/{rid}", json={"content": c}).json()
    assert new["id"] != rid and new["parent_id"] == rid and new["content"]["summary"] == "Edited summary"


def test_file_access_is_per_user(client, sample_docx):
    client.post("/api/auth/register", json={"email": "a@example.com", "password": "correct-horse-1"})
    rid = client.post("/api/resumes/upload", files={"file": ("a.docx", sample_docx, "application/octet-stream")}
                      ).json()["resume"]["id"]
    client.post("/api/auth/logout")
    client.cookies.clear()
    client.post("/api/auth/register", json={"email": "b@example.com", "password": "correct-horse-1"})
    assert client.get(f"/api/resumes/{rid}").status_code == 404
    assert client.get(f"/api/resumes/{rid}/download?fmt=original").status_code == 404


def test_real_world_layout_resume():
    """Table/tab-heavy layout like many Indian resumes: heading and content on the same line."""
    lines = ["Ravi Kumar", "Jaipur", "ravi@example.com", "WORK EXPERIENCE",
             "Foo Tech\tMarch 2019 – Present", "Team Lead - Mobile (Flutter, Android)Projects",
             "Managed three Flutter applications across Android and iOS.",
             "CERTIFICATIONS  JUN 2012– OCT 2013 Web designing course, Jaipur", "PROJECTS SUMMARY", "Foo App",
             "Framework: Flutter, Dart", "Description: A thing", "EDUCATION", "B.E."]
    r = heuristic_parse(extract_text(make_docx(lines), "docx"))
    assert [e.company for e in r.employment] == ["Foo Tech"]
    assert r.employment[0].title == "Team Lead - Mobile (Flutter, Android)"
    assert r.certifications
