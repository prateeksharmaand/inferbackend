"""Test setup: a dedicated Postgres database (careerpilot_test), migrated with Alembic once per session,
and truncated between tests. AI is disabled unless a test patches app.services.ai."""
import io
import os

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", f"postgresql+psycopg://{os.environ.get('USER', 'postgres')}@localhost/careerpilot_test")
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["REDIS_URL"] = "redis://localhost:6399/0"  # unreachable on purpose -> in-memory rate limiter
os.environ["STORAGE_PATH"] = "/tmp/careerpilot-test-storage"
os.environ["SMTP_HOST"] = ""
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["SEARCH_PROVIDER_API_KEY"] = ""
os.environ["JOB_SEARCH_API_KEY"] = ""

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from docx import Document  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core import ratelimit  # noqa: E402
from app.core.db import Base, SessionLocal, engine  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated():
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
    os.environ["ALEMBIC_DATABASE_URL"] = os.environ["DATABASE_URL"]
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_db():
    yield
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as c:
        c.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    ratelimit._local.clear()


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


class Client(TestClient):
    """TestClient that echoes the CSRF cookie like the real frontend does."""

    def request(self, method, url, **kw):
        if method.upper() not in ("GET", "HEAD", "OPTIONS"):
            headers = dict(kw.pop("headers", None) or {})
            csrf = self.cookies.get("cp_csrf")
            if csrf and "x-csrf-token" not in {k.lower() for k in headers}:
                headers["X-CSRF-Token"] = csrf
            kw["headers"] = headers
        return super().request(method, url, **kw)


@pytest.fixture
def client():
    from app.main import app
    with Client(app) as c:
        yield c


@pytest.fixture
def auth_client(client):
    r = client.post("/api/auth/register", json={"email": "me@example.com", "password": "correct-horse-1",
                                                "full_name": "Test Candidate"})
    assert r.status_code == 201, r.text
    return client


SAMPLE_RESUME_LINES = [
    "Asha Verma",
    "Pune, Maharashtra",
    "Phone 9876543210 • Email asha.verma@example.com • LinkedIn https://www.linkedin.com/in/asha-verma",
    "PROFILE SUMMARY",
    "Mobile Architect with 11+ years of experience building Flutter and Android apps for fintech.",
    "KEY SKILLS",
    "Flutter, Dart, BLoC, Riverpod, Clean Architecture, Firebase, CI/CD with Codemagic, Git, Kotlin",
    "WORK EXPERIENCE",
    "Flutter Experience With Dart: 5 Year",
    "Android Experience: 9 Years",
    "Acme Payments Pvt Ltd\tJanuary 2021 – Present",
    "Mobile Technical Lead (Bengaluru)",
    "Led a team of 8 engineers delivering the Acme Pay Flutter app to 3M users.",
    "Designed a modular Clean Architecture with BLoC and offline-first sync.",
    "Beta Labs\tJune 2015 – December 2020",
    "Senior Android Engineer (Pune)",
    "Built the Beta Wallet Android app in Kotlin with SSL pinning and encrypted storage.",
    "Reduced cold start time by 40% through performance optimization.",
    "CERTIFICATIONS",
    "Google Associate Android Developer",
    "EDUCATION",
    "B.Tech Computer Science, Pune University, 2014",
]


def make_docx(lines=SAMPLE_RESUME_LINES) -> bytes:
    d = Document()
    for ln in lines:
        d.add_paragraph(ln)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


@pytest.fixture
def sample_docx():
    return make_docx()
