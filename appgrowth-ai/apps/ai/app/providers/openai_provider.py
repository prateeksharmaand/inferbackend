import base64

import openai

from ..config import settings
from .base import MediaResult, ProviderError, StructuredResult, T, Usage, http_error_message


class OpenAIProvider:
    name = "openai"
    supports_grounding = False

    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise ProviderError("OpenAI API key is not configured", code="not_configured")
        if not model:
            raise ProviderError("No OpenAI model configured (set it in AI provider settings or OPENAI_MODEL)", code="not_configured")
        self.model = model
        self.client = openai.OpenAI(api_key=api_key, timeout=settings.REQUEST_TIMEOUT_SEC, max_retries=2)

    def _wrap(self, fn, *a, **kw):
        try:
            return fn(*a, **kw)
        except openai.APIStatusError as e:
            msg, retry = http_error_message("OpenAI", e.status_code, str(e))
            raise ProviderError(msg, retryable=retry) from e
        except openai.APIConnectionError as e:
            raise ProviderError("Could not reach OpenAI", retryable=True) from e

    def structured(self, system, user, schema: type[T], *, max_tokens=12000) -> StructuredResult:
        resp = self._wrap(self.client.chat.completions.parse, model=self.model, max_completion_tokens=max_tokens, response_format=schema,
                          messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
        choice = resp.choices[0]
        if getattr(choice.message, "refusal", None):
            raise ProviderError(f"OpenAI declined: {choice.message.refusal[:200]}", code="refused")
        if choice.message.parsed is None:
            raise ProviderError("OpenAI returned no structured output", retryable=True, code="invalid_output")
        u = resp.usage
        return StructuredResult(schema.model_validate(choice.message.parsed.model_dump()), Usage(u.prompt_tokens if u else 0, u.completion_tokens if u else 0))

    def research(self, system, user, schema: type[T]) -> StructuredResult:
        # No grounded search through this adapter: answer from model knowledge, flagged by the caller as ungrounded.
        return self.structured(system + "\nYou have no web access. Say so in your notes and lower confidence accordingly. Leave evidence URLs empty.", user, schema)

    def image(self, prompt, *, size="1024x1024", n=1) -> MediaResult:
        size = size if size in ("1024x1024", "1024x1536", "1536x1024") else {"1080x1920": "1024x1536", "1024x1792": "1024x1536", "1200x628": "1536x1024", "1792x1024": "1536x1024"}.get(size, "1024x1024")
        resp = self._wrap(self.client.images.generate, model=self.model, prompt=prompt, size=size, n=max(1, min(n, 4)))
        items = [(base64.b64decode(d.b64_json), "image/png") for d in resp.data if getattr(d, "b64_json", None)]
        if not items:
            raise ProviderError("OpenAI returned no image", code="invalid_output")
        u = getattr(resp, "usage", None)
        return MediaResult(items, Usage(getattr(u, "input_tokens", 0) or 0, getattr(u, "output_tokens", 0) or 0), len(items))

    def video(self, prompt, *, aspect_ratio="9:16", seconds=8) -> MediaResult:
        raise ProviderError("Video generation through OpenAI is not enabled in this adapter; configure Gemini (Veo)", code="unsupported")
