from datetime import datetime

from app.automation.tasks import due_slots
from tests.helpers import add_job, setup_candidate


def test_due_slots():
    from zoneinfo import ZoneInfo
    sched = {"discover_jobs": "08:00", "daily_digest": "10:00", "weekly_report": "SUN 19:00"}
    tz = ZoneInfo("Asia/Kolkata")
    at = datetime(2026, 11, 22, 9, 0, tzinfo=tz)  # Sunday 09:00
    assert [t for t, _ in due_slots(sched, [], at)] == ["discover_jobs"]
    at = datetime(2026, 11, 22, 19, 30, tzinfo=tz)
    assert "weekly_report" in [t for t, _ in due_slots(sched, [], at)]
    assert due_slots(sched, ["discover_jobs"], datetime(2026, 11, 22, 9, 0, tzinfo=tz)) == []
    assert due_slots(sched, [], datetime(2026, 11, 22, 23, 0, tzinfo=tz)) == [("weekly_report", "2026-W47")]


def test_runs_are_idempotent_and_logged(auth_client, db):
    from app.automation.runner import create_run, execute_run
    from app.models import AutomationRun
    setup_candidate(auth_client)
    add_job(auth_client)
    r1 = create_run(db, 1, "match_jobs", "match_jobs:1:2026-11-20", "schedule")
    r2 = create_run(db, 1, "match_jobs", "match_jobs:1:2026-11-20", "schedule")
    assert r1 and r2 is None
    execute_run(r1.id)
    db.expire_all()
    run = db.get(AutomationRun, r1.id)
    assert run.status == "success" and run.stats["scored"] == 1 and run.log


def test_failed_run_notifies_and_retries(auth_client, db, monkeypatch):
    from app.automation import pipeline, runner
    from app.models import AutomationRun, Notification

    def boom(db, uid, log):
        raise RuntimeError("source exploded")
    monkeypatch.setitem(pipeline.STEPS, "discover_jobs", boom)
    monkeypatch.setitem(runner.STEPS, "discover_jobs", boom)
    run = runner.create_run(db, 1, "discover_jobs", "discover_jobs:1:x", "manual")
    runner.execute_run(run.id)
    db.expire_all()
    assert db.get(AutomationRun, run.id).status == "failed"
    assert db.query(Notification).filter_by(kind="automation_failure").count() == 1
    monkeypatch.setattr(runner, "dispatch", lambda rid: "thread")
    from app.api import automation as api_auto
    monkeypatch.setattr(api_auto, "dispatch", lambda rid: "thread")
    r = auth_client.post(f"/api/automation/runs/{run.id}/retry")
    assert r.status_code == 200 and r.json()["attempt"] == 2 and r.json()["trigger"] == "retry"


def test_digest_dedupes(auth_client, db):
    from app.automation.pipeline import daily_digest
    from app.models import Notification
    setup_candidate(auth_client)
    jid = add_job(auth_client)
    auth_client.post(f"/api/matches/job/{jid}")
    auth_client.patch("/api/automation/settings", json={"min_match_score": 0})
    a = daily_digest(db, 1, lambda m: None)
    b = daily_digest(db, 1, lambda m: None)
    assert a["sent"] and not b["sent"]
    n = db.query(Notification).filter_by(kind="daily_digest").one()
    assert "Flutter Technical Lead" in n.body and "AI score" in n.body
    assert n.delivery["email"].startswith("skipped")


def test_settings_validation(auth_client):
    assert auth_client.patch("/api/automation/settings", json={"schedule": {"discover_jobs": "25:00"}}).status_code == 422
    r = auth_client.patch("/api/automation/settings", json={"schedule": {"discover_jobs": "07:30"},
                                                            "automation_enabled": True})
    assert r.json()["schedule"]["discover_jobs"] == "07:30" and r.json()["schedule"]["daily_digest"] == "10:00"


def test_interview_coach(auth_client):
    qs = auth_client.get("/api/interview-coach/questions?topic=security").json()
    assert any("pinning" in q["question"].lower() for q in qs)
    s = auth_client.post("/api/interview-coach/sessions", json={"topics": ["security"], "count": 2}).json()
    assert len(s["answers"]) == 2
    a = s["answers"][0]
    good = auth_client.post(f"/api/interview-coach/sessions/{s['id']}/answers/{a['id']}", json={
        "answer": "Pin the SPKI public key hash with backup pins, use Network Security Config on Android and "
                  "TrustKit or a custom HttpClient on iOS/Flutter, plan rotation before expiry, send failure "
                  "telemetry, and remember pinning does not stop on-device tampering. Store tokens in Keychain/"
                  "Keystore via flutter_secure_storage, never secrets in the binary, encrypt the local DB with "
                  "SQLCipher, clear on logout, exclude from backups, use AES-GCM keys in Keystore."}).json()
    bad = auth_client.post(f"/api/interview-coach/sessions/{s['id']}/answers/{s['answers'][1]['id']}",
                           json={"answer": "Not sure."}).json()
    assert good["score"] > bad["score"] and good["evaluated_by"] == "rules-v1"
    done = auth_client.post(f"/api/interview-coach/sessions/{s['id']}/complete").json()
    assert done["status"] == "completed" and done["overall_score"] is not None
    p = auth_client.get("/api/interview-coach/progress").json()
    assert p["sessions_completed"] == 1 and p["by_topic"][0]["topic"] == "security"


def test_agent_fallback_uses_real_data(auth_client):
    setup_candidate(auth_client)
    add_job(auth_client, title="Flutter Architect", company_name="RemoteCo", work_mode="remote", location="")
    r = auth_client.post("/api/agent/chat", json={"message": "Show remote Flutter jobs above 25 LPA"}).json()
    assert "RemoteCo" in r["message"]["content"]
    r2 = auth_client.post("/api/agent/chat", json={"message": "Find Kotlin Multiplatform jobs in Chennai",
                                                   "conversation_id": r["conversation_id"]}).json()
    assert "No matching jobs" in r2["message"]["content"]
    msgs = auth_client.get(f"/api/agent/conversations/{r['conversation_id']}/messages").json()
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]


def test_agent_tool_loop(auth_client, monkeypatch):
    """Simulate Claude calling search_jobs then answering; verify tool results are real DB rows."""
    from types import SimpleNamespace

    from app.core.config import settings
    from app.services import ai
    setup_candidate(auth_client)
    jid = add_job(auth_client)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test")
    seen = {}

    class Block(SimpleNamespace):
        def model_dump(self, **k):
            return {k2: v for k2, v in vars(self).items()}

    def turn(system, messages, tools, **k):
        if len(messages) == 1:
            return SimpleNamespace(stop_reason="tool_use", content=[
                Block(type="tool_use", id="t1", name="search_jobs", input={"text": "Flutter"})])
        seen["result"] = messages[-1]["content"][0]["content"]
        return SimpleNamespace(stop_reason="end_turn", content=[Block(type="text", text=f"Found (#{jid}).")])
    monkeypatch.setattr(ai, "chat_turn", turn)
    r = auth_client.post("/api/agent/chat", json={"message": "Find Flutter Technical Lead jobs"}).json()
    assert f"#{jid}" in r["message"]["content"]
    assert '"company": "Acme"' in seen["result"]
    assert r["message"]["tool_calls"][0]["name"] == "search_jobs"


def test_notifications_and_csv_and_integrations(auth_client):
    setup_candidate(auth_client)
    add_job(auth_client)
    assert auth_client.post("/api/notifications/test").status_code == 200
    assert auth_client.get("/api/notifications/unread-count").json()["count"] == 1
    auth_client.post("/api/notifications/read-all")
    assert auth_client.get("/api/notifications/unread-count").json()["count"] == 0
    csv = auth_client.get("/api/analytics/export/jobs")
    assert csv.status_code == 200 and "Flutter Technical Lead" in csv.text
    rep = auth_client.get("/api/analytics/report").json()
    assert rep["by_source"] and rep["summary"]["jobs_discovered"] == 1
    integ = {i["key"]: i for i in auth_client.get("/api/settings/integrations").json()}
    assert integ["anthropic"]["state"] == "awaiting_credentials"
    assert integ["source:linkedin"]["state"] == "unavailable"


def test_export_and_delete_account(auth_client, db):
    import io
    import zipfile

    from app.models import Job, User
    setup_candidate(auth_client)
    add_job(auth_client)
    z = zipfile.ZipFile(io.BytesIO(auth_client.get("/api/settings/export").content))
    names = z.namelist()
    assert "jobs.json" in names and "candidate_profiles.json" in names and any(n.startswith("files/") for n in names)
    assert "password_hash" not in z.read("users.json").decode()
    assert auth_client.post("/api/settings/delete-account", json={"password": "wrong", "confirm": "DELETE"}).status_code == 401
    r = auth_client.post("/api/settings/delete-account", json={"password": "correct-horse-1", "confirm": "DELETE"})
    assert r.status_code == 200
    db.expire_all()
    assert db.query(User).count() == 0 and db.query(Job).count() == 0
