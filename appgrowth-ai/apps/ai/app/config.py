from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Provider keys may come from env (defaults) or per request from the API (keys configured by the Super Admin)."""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    AI_SERVICE_TOKEN: str = ""
    AI_DEFAULT_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-5-5"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = ""  # set explicitly; no guessed default
    OLLAMA_BASE_URL: str = ""
    OLLAMA_MODEL: str = "llama3.1:8b"
    REQUEST_TIMEOUT_SEC: int = 180


settings = Settings()
