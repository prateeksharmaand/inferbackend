import logging

import anthropic

from ..config import settings
from .base import MediaResult, ProviderError, StructuredResult, T, Usage, http_error_message

log = logging.getLogger("ai.anthropic")


class AnthropicProvider:
    name = "anthropic"
    supports_grounding = True

    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise ProviderError("Anthropic API key is not configured", code="not_configured")
        self.model = model
        self.client = anthropic.Anthropic(api_key=api_key, timeout=settings.REQUEST_TIMEOUT_SEC, max_retries=2)

    def _parse(self, **kw):
        try:
            return self.client.messages.parse(model=self.model, **kw)
        except anthropic.APIStatusError as e:
            msg, retry = http_error_message("Anthropic", e.status_code, str(e))
            raise ProviderError(msg, retryable=retry) from e
        except anthropic.APIConnectionError as e:
            raise ProviderError("Could not reach Anthropic", retryable=True) from e

    @staticmethod
    def _usage(resp) -> Usage:
        u = resp.usage
        return Usage((u.input_tokens or 0) + (getattr(u, "cache_read_input_tokens", 0) or 0) + (getattr(u, "cache_creation_input_tokens", 0) or 0), u.output_tokens or 0)

    @staticmethod
    def _check(resp):
        if resp.stop_reason == "refusal":
            raise ProviderError("Claude declined the request", code="refused")
        if resp.stop_reason == "max_tokens":
            raise ProviderError("Claude response was cut off (max tokens)", retryable=True)

    def structured(self, system, user, schema: type[T], *, max_tokens=12000) -> StructuredResult:
        resp = self._parse(max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}], output_format=schema,
                           output_config={"effort": "medium"})
        self._check(resp)
        if resp.parsed_output is None:
            raise ProviderError("Claude returned no structured output", retryable=True, code="invalid_output")
        return StructuredResult(schema.model_validate(resp.parsed_output.model_dump()), self._usage(resp))

    def research(self, system, user, schema: type[T]) -> StructuredResult:
        messages = [{"role": "user", "content": user}]
        tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 6}]
        usage, resp = Usage(), None
        for _ in range(4):  # pause_turn continuations
            resp = self._parse(max_tokens=16000, system=system, messages=messages, tools=tools, output_format=schema, output_config={"effort": "medium"})
            usage.add(self._usage(resp))
            if resp.stop_reason != "pause_turn":
                break
            messages.append({"role": "assistant", "content": resp.content})
        self._check(resp)
        sources, seen = [], set()
        for m in [*messages, {"content": resp.content}]:
            content = m.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if getattr(block, "type", None) == "web_search_tool_result" and isinstance(block.content, list):
                    for r in block.content:
                        url = getattr(r, "url", None)
                        if url and url not in seen:
                            seen.add(url)
                            sources.append({"url": url, "title": getattr(r, "title", "") or ""})
        if resp.parsed_output is None:
            raise ProviderError("Claude returned no structured output", retryable=True, code="invalid_output")
        return StructuredResult(schema.model_validate(resp.parsed_output.model_dump()), usage, sources)

    def image(self, prompt, *, size="1024x1024", n=1) -> MediaResult:
        raise ProviderError("Anthropic does not generate images; configure Gemini or OpenAI for images", code="unsupported")

    def video(self, prompt, *, aspect_ratio="9:16", seconds=8) -> MediaResult:
        raise ProviderError("Anthropic does not generate video; configure Gemini (Veo) for video", code="unsupported")


