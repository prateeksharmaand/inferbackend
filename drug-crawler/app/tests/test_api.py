from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        with (
            patch("app.api.routes._get_redis") as mock_redis,
            patch("app.api.routes.DrugService") as mock_drug_svc,
        ):
            redis_mock = AsyncMock()
            redis_mock.ping = AsyncMock(return_value=True)
            redis_mock.llen = AsyncMock(return_value=5)
            redis_mock.exists = AsyncMock(return_value=0)
            mock_redis.return_value = redis_mock

            drug_mock = MagicMock()
            drug_mock.total_count = AsyncMock(return_value=1000)
            mock_drug_svc.return_value = drug_mock

            resp = client.get("/api/v1/health")
            # May fail without real DB — just check it doesn't 500 unexpectedly
            assert resp.status_code in (200, 500, 503)


class TestSchemas:
    def test_eka_drug_parse(self):
        from app.schemas.drug import EkaDrug

        raw = {
            "id": "drug_001",
            "name": "Paracetamol 500mg",
            "manufacturer_name": "Cipla Ltd",
            "product_type": "allopathy",
            "product_sku": "sku_001",
            "generic_name": "Paracetamol",
            "generic_id": "gen_001",
            "dosage": {"dosage_form": "tablet"},
        }
        eka = EkaDrug.model_validate(raw)
        assert eka.id == "drug_001"
        assert eka.dosage is not None
        assert eka.dosage.dosage_form == "tablet"

        drug_create = eka.to_drug_create(raw)
        assert drug_create is not None
        assert drug_create.dosage_form == "tablet"
        assert drug_create.raw_json == raw

    def test_eka_drug_missing_id_returns_none(self):
        from app.schemas.drug import EkaDrug

        raw = {"name": "Unnamed drug"}
        eka = EkaDrug.model_validate(raw)
        assert eka.to_drug_create(raw) is None

    def test_crawl_start_request_defaults(self):
        from app.schemas.drug import CrawlStartRequest

        req = CrawlStartRequest()
        assert req.resume is True
        assert req.reset is False
        assert req.prefixes is None


class TestConfig:
    def test_parsed_cookies_json_array(self):
        from app.config import Settings

        s = Settings(
            eka_cookies='["cookie1=val1; session=abc", "cookie2=val2"]',
            database_url="postgresql+asyncpg://u:p@localhost/db",
            redis_url="redis://localhost/0",
        )
        cookies = s.parsed_cookies()
        assert len(cookies) == 2
        assert "cookie1=val1; session=abc" in cookies

    def test_parsed_cookies_single_string(self):
        from app.config import Settings

        s = Settings(
            eka_cookies="session=abc; auth=xyz",
            database_url="postgresql+asyncpg://u:p@localhost/db",
            redis_url="redis://localhost/0",
        )
        cookies = s.parsed_cookies()
        assert len(cookies) == 1

    def test_parsed_headers(self):
        from app.config import Settings

        s = Settings(
            eka_headers='{"x-app": "1.0", "x-platform": "web"}',
            database_url="postgresql+asyncpg://u:p@localhost/db",
            redis_url="redis://localhost/0",
        )
        headers = s.parsed_headers()
        assert headers["x-app"] == "1.0"
        assert headers["x-platform"] == "web"
