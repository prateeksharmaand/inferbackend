import json
import logging
import time

import httpx
from google import genai
from google.genai import errors as gerrors
from google.genai import types

from ..config import settings
from .base import MediaResult, ProviderError, StructuredResult, T, Usage, http_error_message

log = logging.getLogger("ai.gemini")


class GeminiProvider:
    name = "gemini"
    supports_grounding = True

    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise ProviderError("Gemini API key is not configured", code="not_configured")
        self.model = model
        self.client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=settings.REQUEST_TIMEOUT_SEC * 1000))

    def _call(self, **kw):
        try:
            return self.client.models.generate_content(model=self.model, **kw)
        except gerrors.APIError as e:
            msg, retry = http_error_message("Gemini", getattr(e, "code", None), str(e))
            raise ProviderError(msg, retryable=retry) from e
        except (httpx.HTTPError, OSError) as e:
            raise ProviderError(f"Could not reach Gemini ({type(e).__name__})", retryable=True) from e

    @staticmethod
    def _usage(resp) -> Usage:
        u = getattr(resp, "usage_metadata", None)
        if not u:
            return Usage()
        out = (u.candidates_token_count or 0) + (getattr(u, "thoughts_token_count", 0) or 0)  # thinking is billed as output
        return Usage(u.prompt_token_count or 0, out)

    @staticmethod
    def _check(resp):
        if not resp.candidates:
            reason = getattr(getattr(resp, "prompt_feedback", None), "block_reason", None)
            raise ProviderError(f"Gemini returned no answer (blocked: {reason})", code="refused")
        fr = str(resp.candidates[0].finish_reason or "")
        if any(x in fr for x in ("SAFETY", "PROHIBITED", "BLOCKLIST")):
            raise ProviderError(f"Gemini declined the request ({fr})", code="refused")
        if "MAX_TOKENS" in fr:
            raise ProviderError("Gemini response was cut off (max tokens)", retryable=True)

    def structured(self, system, user, schema: type[T], *, max_tokens=12000) -> StructuredResult:
        cfg = types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json",
                                          response_json_schema=schema.model_json_schema(), max_output_tokens=max_tokens,
                                          thinking_config=types.ThinkingConfig(thinking_level="medium"))
        resp = self._call(contents=user, config=cfg)
        self._check(resp)
        try:
            data = schema.model_validate(json.loads(resp.text))
        except Exception as e:
            raise ProviderError(f"Gemini output did not match the schema: {str(e)[:200]}", retryable=True, code="invalid_output") from e
        return StructuredResult(data, self._usage(resp))

    def research(self, system, user, schema: type[T]) -> StructuredResult:
        """Google Search grounding, then extraction restricted to the grounded notes and their sources."""
        cfg = types.GenerateContentConfig(system_instruction=system + "\nCite the source URL next to every factual claim.",
                                          tools=[types.Tool(google_search=types.GoogleSearch())],
                                          thinking_config=types.ThinkingConfig(thinking_level="medium"))
        resp = self._call(contents=user, config=cfg)
        self._check(resp)
        usage = self._usage(resp)
        gm = getattr(resp.candidates[0], "grounding_metadata", None)
        sources, seen = [], set()
        for ch in (getattr(gm, "grounding_chunks", None) or [])[:25]:
            web = getattr(ch, "web", None)
            if web and web.uri and web.uri not in seen:
                seen.add(web.uri)
                sources.append({"url": _resolve(web.uri), "title": web.title or ""})
        listing = "\n".join(f"- {s['url']} ({s['title']})" for s in sources)
        out = self.structured(system + "\nUse ONLY facts in the research notes. Evidence URLs must be from the source list.",
                              f"<research_notes>\n{resp.text or ''}\n</research_notes>\n<sources>\n{listing}\n</sources>\n\n{user}", schema)
        out.usage.add(usage)
        out.sources = sources
        return out

    def image(self, prompt, *, size="1024x1024", n=1) -> MediaResult:
        aspect = {"1024x1024": "1:1", "1024x1792": "9:16", "1792x1024": "16:9", "1080x1920": "9:16", "1200x628": "16:9"}.get(size, "1:1")
        cfg = types.GenerateContentConfig(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio=aspect))
        items, usage = [], Usage()
        for _ in range(max(1, min(n, 4))):
            resp = self._call(contents=prompt, config=cfg)
            self._check(resp)
            usage.add(self._usage(resp))
            for part in resp.candidates[0].content.parts or []:
                if getattr(part, "inline_data", None) and part.inline_data.data:
                    items.append((part.inline_data.data, part.inline_data.mime_type or "image/png"))
        if not items:
            raise ProviderError("Gemini returned no image", code="invalid_output")
        return MediaResult(items, usage, len(items))

    def video(self, prompt, *, aspect_ratio="9:16", seconds=8) -> MediaResult:
        """Veo via the Gemini API: long-running operation, polled until done (called from a background job)."""
        try:
            op = self.client.models.generate_videos(model=self.model, prompt=prompt,
                                                    config=types.GenerateVideosConfig(aspect_ratio=aspect_ratio, number_of_videos=1))
            deadline = time.time() + 600
            while not op.done:
                if time.time() > deadline:
                    raise ProviderError("Video generation timed out", retryable=True)
                time.sleep(10)
                op = self.client.operations.get(op)
            if op.error:
                raise ProviderError(f"Video generation failed: {op.error}", code="refused")
            vids = op.response.generated_videos if op.response else []
            if not vids:
                raise ProviderError("No video returned (it may have been filtered)", code="refused")
            data = self.client.files.download(file=vids[0].video)
            return MediaResult([(data, "video/mp4")], Usage(), seconds)
        except gerrors.APIError as e:
            msg, retry = http_error_message("Gemini (Veo)", getattr(e, "code", None), str(e))
            raise ProviderError(msg, retryable=retry) from e


def _resolve(url: str) -> str:
    """Grounding returns redirect links; follow one hop to the real page."""
    if "grounding-api-redirect" not in url:
        return url
    try:
        with httpx.Client(timeout=8, follow_redirects=False) as c:
            return c.get(url).headers.get("location") or url
    except httpx.HTTPError:
        return url
