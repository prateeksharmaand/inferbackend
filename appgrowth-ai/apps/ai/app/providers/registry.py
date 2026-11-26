from ..config import settings
from .anthropic_provider import AnthropicProvider
from .base import Provider, ProviderError
from .gemini import GeminiProvider
from .ollama import OllamaProvider
from .openai_provider import OpenAIProvider

DEFAULT_MODELS = {"gemini": lambda: settings.GEMINI_MODEL, "anthropic": lambda: settings.ANTHROPIC_MODEL,
                  "openai": lambda: settings.OPENAI_MODEL, "ollama": lambda: settings.OLLAMA_MODEL}
ENV_KEYS = {"gemini": lambda: settings.GEMINI_API_KEY, "anthropic": lambda: settings.ANTHROPIC_API_KEY,
            "openai": lambda: settings.OPENAI_API_KEY, "ollama": lambda: settings.OLLAMA_BASE_URL}

# Tests register fakes here; production never does.
OVERRIDES: dict[str, type] = {}


def get_provider(name: str | None, model: str | None = None, api_key: str | None = None, base_url: str | None = None) -> Provider:
    """Selects a provider by configuration. No provider is hard-wired: the API passes the Super Admin's choice."""
    name = (name or settings.AI_DEFAULT_PROVIDER).lower()
    if name in OVERRIDES:
        return OVERRIDES[name](api_key or "test", model or "fake-model")
    if name not in DEFAULT_MODELS:
        raise ProviderError(f"Unknown AI provider '{name}'", code="not_configured")
    model = model or DEFAULT_MODELS[name]()
    if name == "ollama":
        return OllamaProvider(base_url or api_key or ENV_KEYS["ollama"](), model)
    key = api_key or ENV_KEYS[name]()
    return {"gemini": GeminiProvider, "anthropic": AnthropicProvider, "openai": OpenAIProvider}[name](key, model)


def configured() -> dict[str, bool]:
    return {n: bool(k()) for n, k in ENV_KEYS.items()}
