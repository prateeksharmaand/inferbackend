from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://crawler:crawler@localhost:5432/drugdb"
    )

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = Field(default="redis://localhost:6379/0")

    # ── Eka Care API ──────────────────────────────────────────────────────────
    eka_base_url: str = Field(default="https://mdb.eka.care")
    eka_cid: str = Field(default="")
    eka_docid: str = Field(default="")

    # Raw cookie string(s) — JSON array or single string
    eka_cookies: str = Field(default="[]")
    # Raw extra headers — JSON object string
    eka_headers: str = Field(default="{}")

    # ── Crawler ───────────────────────────────────────────────────────────────
    crawler_concurrency: int = Field(default=10, ge=1, le=100)
    crawler_max_depth: int = Field(default=6, ge=1, le=20)
    crawler_request_timeout: float = Field(default=15.0, gt=0)
    crawler_retry_max: int = Field(default=4, ge=0, le=10)
    crawler_retry_min_wait: float = Field(default=1.0, gt=0)
    crawler_retry_max_wait: float = Field(default=30.0, gt=0)
    crawler_api_limit: int = Field(default=8, ge=1)

    # ── Worker ────────────────────────────────────────────────────────────────
    worker_count: int = Field(default=4, ge=1, le=50)

    # ── App ───────────────────────────────────────────────────────────────────
    app_env: str = Field(default="development")
    log_level: str = Field(default="INFO")

    @field_validator("eka_cookies", mode="before")
    @classmethod
    def validate_cookies(cls, v: Any) -> str:
        return str(v) if v is not None else "[]"

    @field_validator("eka_headers", mode="before")
    @classmethod
    def validate_headers(cls, v: Any) -> str:
        return str(v) if v is not None else "{}"

    def parsed_cookies(self) -> list[str]:
        raw = self.eka_cookies.strip()
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(c) for c in parsed if c]
            if isinstance(parsed, str):
                return [parsed] if parsed else []
        except (json.JSONDecodeError, TypeError):
            if raw:
                return [raw]
        return []

    def parsed_headers(self) -> dict[str, str]:
        try:
            parsed = json.loads(self.eka_headers)
            if isinstance(parsed, dict):
                return {str(k): str(v) for k, v in parsed.items()}
        except (json.JSONDecodeError, TypeError):
            pass
        return {}

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
