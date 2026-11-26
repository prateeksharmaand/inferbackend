import json

import httpx

from ..config import settings
from .base import MediaResult, ProviderError, StructuredResult, T, Usage, strip_json_fences


class OllamaProvider:
    """Self-hosted inference. Uses Ollama's JSON-schema `format` for structured output."""
    name = "ollama"
    supports_grounding = False

    def __init__(self, base_url: str, model: str):
        if not base_url:
            raise ProviderError("OLLAMA_BASE_URL is not configured", code="not_configured")
        self.base = base_url.rstrip("/")
        self.model = model

    def structured(self, system, user, schema: type[T], *, max_tokens=12000) -> StructuredResult:
        body = {"model": self.model, "stream": False, "format": schema.model_json_schema(), "options": {"num_predict": max_tokens, "temperature": 0.3},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        try:
            r = httpx.post(f"{self.base}/api/chat", json=body, timeout=settings.REQUEST_TIMEOUT_SEC * 2)
        except httpx.HTTPError as e:
            raise ProviderError(f"Could not reach Ollama at {self.base} ({type(e).__name__})", retryable=True) from e
        if r.status_code != 200:
            raise ProviderError(f"Ollama error {r.status_code}: {r.text[:200]}", retryable=r.status_code >= 500)
        j = r.json()
        try:
            data = schema.model_validate(json.loads(strip_json_fences(j.get("message", {}).get("content", ""))))
        except Exception as e:
            raise ProviderError(f"Ollama output did not match the schema: {str(e)[:200]}", retryable=True, code="invalid_output") from e
        return StructuredResult(data, Usage(j.get("prompt_eval_count", 0), j.get("eval_count", 0)))

    def research(self, system, user, schema: type[T]) -> StructuredResult:
        return self.structured(system + "\nYou have no web access. Say so and lower confidence. Leave evidence URLs empty.", user, schema)

    def image(self, prompt, *, size="1024x1024", n=1) -> MediaResult:
        raise ProviderError("Ollama image generation is not supported; configure Gemini or OpenAI for images", code="unsupported")

    def video(self, prompt, *, aspect_ratio="9:16", seconds=8) -> MediaResult:
        raise ProviderError("Ollama video generation is not supported", code="unsupported")
