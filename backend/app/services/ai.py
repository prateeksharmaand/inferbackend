"""Thin wrapper over the Anthropic Messages API.

- Model comes from ANTHROPIC_MODEL (default claude-opus-5-5); never hard-coded at call sites.
- Structured calls use `messages.parse(output_format=<PydanticModel>)` so responses are schema-valid
  and then re-validated by Pydantic.
- Server-side refusal fallbacks are enabled (beta `server-side-fallback-2026-07-01`, fallbacks="default").
  Set AI_FALLBACKS=false in the environment to disable.
- Every failure is raised as AIUnavailable so callers can degrade to rule-based behaviour
  (the app must keep working when the Claude API is unavailable).
"""
import logging
import os
from typing import TypeVar

import anthropic
from pydantic import BaseModel

from app.core.config import settings

log = logging.getLogger("careerpilot.ai")
T = TypeVar("T", bound=BaseModel)
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AIUnavailable(Exception):
    pass


_client: anthropic.Anthropic | None = None


def _gemini():
    from app.services import ai_gemini
    return ai_gemini


def client() -> anthropic.Anthropic:
    global _client
    if not settings.ANTHROPIC_API_KEY:
        raise AIUnavailable("ANTHROPIC_API_KEY is not configured")
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, max_retries=3, timeout=300.0)
    return _client


def model_name() -> str:
    return settings.GEMINI_MODEL if settings.ai_provider == "gemini" else settings.ANTHROPIC_MODEL


def _require():
    if not settings.ai_configured:
        raise AIUnavailable("No AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)")
    return settings.ai_provider


def _fallback_kwargs() -> dict:
    if os.environ.get("AI_FALLBACKS", "true").lower() == "false":
        return {}
    return {"extra_headers": {"anthropic-beta": FALLBACK_BETA}, "extra_body": {"fallbacks": "default"}}


def _check_stop(resp) -> None:
    if resp.stop_reason == "refusal":
        cat = getattr(getattr(resp, "stop_details", None), "category", None)
        raise AIUnavailable(f"Model declined the request (category: {cat})")
    if resp.stop_reason == "max_tokens":
        raise AIUnavailable("Model response was cut off (max_tokens)")


def _wrap_errors(fn):
    def inner(*a, **kw):
        try:
            return fn(*a, **kw)
        except AIUnavailable:
            raise
        except anthropic.AuthenticationError as e:
            raise AIUnavailable("Anthropic API key was rejected") from e
        except anthropic.NotFoundError as e:
            raise AIUnavailable(f"Model '{model_name()}' not found; check ANTHROPIC_MODEL") from e
        except anthropic.RateLimitError as e:
            raise AIUnavailable("Anthropic rate limit reached; try again later") from e
        except anthropic.BadRequestError as e:
            log.error("Claude bad request: %s", e.message)
            raise AIUnavailable(f"Claude rejected the request: {e.message}") from e
        except anthropic.APIStatusError as e:
            raise AIUnavailable(f"Claude API error {e.status_code}") from e
        except anthropic.APIConnectionError as e:
            raise AIUnavailable("Could not reach the Claude API") from e
        except Exception as e:  # pydantic validation of parsed output, etc.
            log.exception("AI call failed")
            raise AIUnavailable(f"AI response could not be used: {e}") from e
    return inner


def structured(system: str, user: str | list, schema: type[T], *, max_tokens: int = 16000,
               effort: str | None = None) -> T:
    """Single call returning a validated Pydantic object."""
    if _require() == "gemini":
        return _gemini().structured(system, user, schema, max_tokens=max_tokens, effort=effort)
    return _claude_structured(system, user, schema, max_tokens=max_tokens, effort=effort)


@_wrap_errors
def _claude_structured(system, user, schema, *, max_tokens, effort):
    content = user if isinstance(user, list) else [{"type": "text", "text": user}]
    resp = client().messages.parse(
        model=model_name(),
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": content}],
        output_format=schema,
        output_config={"effort": effort or settings.AI_EFFORT},
        **_fallback_kwargs(),
    )
    _check_stop(resp)
    if resp.parsed_output is None:
        raise AIUnavailable("Model returned no structured output")
    return schema.model_validate(resp.parsed_output.model_dump())


def research(system: str, user: str, schema: type[T], *, max_searches: int = 6) -> tuple[T, list[dict]]:
    """Web-grounded call returning (parsed, sources); sources are the URLs actually returned by web search
    (Claude web_search tool, or Gemini Google Search grounding)."""
    if _require() == "gemini":
        return _gemini().research(system, user, schema)
    return _claude_research(system, user, schema, max_searches=max_searches)


@_wrap_errors
def _claude_research(system, user, schema, *, max_searches):
    messages = [{"role": "user", "content": user}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_searches,
              "user_location": {"type": "approximate", "country": "IN"}}]
    resp = None
    for _ in range(4):  # handle pause_turn continuations
        resp = client().messages.parse(
            model=model_name(), max_tokens=16000, system=system, messages=messages, tools=tools,
            output_format=schema, output_config={"effort": effort_for_research()}, **_fallback_kwargs())
        if resp.stop_reason != "pause_turn":
            break
        messages.append({"role": "assistant", "content": resp.content})
    _check_stop(resp)
    sources: list[dict] = []
    for m in [*messages, {"content": resp.content}]:
        content = m.get("content") if isinstance(m, dict) else None
        if not isinstance(content, list):
            continue
        for block in content:
            if getattr(block, "type", None) == "web_search_tool_result" and isinstance(block.content, list):
                for r in block.content:
                    if getattr(r, "url", None):
                        sources.append({"url": r.url, "title": getattr(r, "title", "") or ""})
    if resp.parsed_output is None:
        raise AIUnavailable("Model returned no structured output")
    seen, uniq = set(), []
    for s in sources:
        if s["url"] not in seen:
            seen.add(s["url"])
            uniq.append(s)
    return schema.model_validate(resp.parsed_output.model_dump()), uniq


def effort_for_research() -> str:
    return "medium"


def chat_turn(system: str, messages: list, tools: list, *, max_tokens: int = 16000):
    """One step of the agent loop (caller executes tool_use blocks and loops). Returns an object with
    Anthropic-shaped `stop_reason` and `content` blocks regardless of provider."""
    if _require() == "gemini":
        return _gemini().chat_turn(system, messages, tools, max_tokens=max_tokens)
    return _claude_chat(system, messages, tools, max_tokens=max_tokens)


@_wrap_errors
def _claude_chat(system, messages, tools, *, max_tokens):
    resp = client().messages.create(
        model=model_name(), max_tokens=max_tokens, system=system, messages=messages, tools=tools,
        output_config={"effort": settings.AI_EFFORT}, **_fallback_kwargs())
    if resp.stop_reason == "refusal":
        _check_stop(resp)
    return resp


def status() -> dict:
    if not settings.ai_configured:
        return {"state": "awaiting_credentials", "detail": "Set ANTHROPIC_API_KEY or GEMINI_API_KEY",
                "model": model_name()}
    if settings.ai_provider == "gemini":
        return _gemini().status()
    try:
        client().models.retrieve(model_name())
        return {"state": "connected", "detail": "Model reachable", "model": model_name()}
    except anthropic.AuthenticationError:
        return {"state": "failing", "detail": "API key rejected", "model": model_name()}
    except anthropic.NotFoundError:
        return {"state": "failing", "detail": f"Model {model_name()} not found", "model": model_name()}
    except Exception as e:  # noqa: BLE001
        return {"state": "failing", "detail": str(e)[:200], "model": model_name()}
