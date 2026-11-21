"""Application settings, loaded from environment variables / .env.

Conventions used across the codebase:
- All timestamps are stored in UTC (timezone-aware). APP_TIMEZONE is used only for display
  and for interpreting automation schedules ("08:00" means 08:00 Asia/Kolkata).
- All salary values are stored in INR lakhs per annum (LPA) as Numeric(6,2).
  e.g. ₹28,50,000/yr -> 28.50. Converters live in app.services.salary.
"""
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    APP_ENV: str = "development"
    APP_NAME: str = "CareerPilot AI"
    APP_TIMEZONE: str = "Asia/Kolkata"
    APP_BASE_URL: str = "http://localhost:3000"

    DATABASE_URL: str = "postgresql+psycopg://localhost/careerpilot"
    REDIS_URL: str = "redis://localhost:6379/0"

    # AI provider: "anthropic" (Claude) or "gemini". "auto" picks whichever key is set (Claude first).
    AI_PROVIDER: str = "auto"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-opus-5-5"
    AI_EFFORT: str = "medium"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash"

    JWT_SECRET: str = "dev-only-change-me-dev-only-change-me"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 14
    ENCRYPTION_KEY: str = ""  # Fernet key; generate with app.core.crypto.generate_key()
    ALLOW_REGISTRATION: bool = True  # set False after creating your account
    COOKIE_SECURE: bool | None = None  # default: True when APP_ENV=production. Requires HTTPS.

    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    NOTIFY_EMAIL_TO: str = ""

    GMAIL_CLIENT_ID: str = ""
    GMAIL_CLIENT_SECRET: str = ""

    # Adzuna (https://developer.adzuna.com) as "app_id:app_key"
    JOB_SEARCH_API_KEY: str = ""
    # JSearch on RapidAPI (aggregates Google for Jobs: LinkedIn, Indeed, Naukri, Foundit ...)
    SEARCH_PROVIDER_API_KEY: str = ""

    STORAGE_PATH: str = "../storage"
    MAX_UPLOAD_MB: int = 10
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    HTTP_USER_AGENT: str = "CareerPilotAI/1.0 (personal job-search assistant)"

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.APP_TIMEZONE)

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def cookie_secure(self) -> bool:
        return self.is_production if self.COOKIE_SECURE is None else self.COOKIE_SECURE

    @property
    def ai_provider(self) -> str | None:
        p = self.AI_PROVIDER.lower()
        if p == "anthropic":
            return "anthropic" if self.ANTHROPIC_API_KEY else None
        if p == "gemini":
            return "gemini" if self.GEMINI_API_KEY else None
        return "anthropic" if self.ANTHROPIC_API_KEY else ("gemini" if self.GEMINI_API_KEY else None)

    @property
    def ai_configured(self) -> bool:
        return self.ai_provider is not None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
