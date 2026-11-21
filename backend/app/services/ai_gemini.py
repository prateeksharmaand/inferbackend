"""Google Gemini provider (google-genai SDK). Same contract as the Claude path in app.services.ai:
structured() / research() / chat_turn() / status(), raising ai.AIUnavailable on any failure."""
import base64
import json
import logging
import uuid
from types import SimpleNamespace

import httpx
from google import genai
from google.genai import errors as gerrors
from google.genai import types

from app.core.config import settings

log = logging.getLogger("careerpilot.ai.gemini")
_client: genai.Client | None = None


def _ai():
    from app.services import ai
    return ai


def client() -> genai.Client:
    global _client
    if not settings.GEMINI_API_KEY:
        raise _ai().AIUnavailable("GEMINI_API_KEY is not configured")
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY,
                               http_options=types.HttpOptions(timeout=180_000))
    return _client


def _wrap(fn):
    def inner(*a, **kw):
        AIUnavailable = _ai().AIUnavailable
        try:
            return fn(*a, **kw)
        except AIUnavailable:
            raise
        except gerrors.APIError as e:
            code = getattr(e, "code", None)
            msg = {400: "Gemini rejected the request", 401: "Gemini API key was rejected",
                   403: "Gemini API key lacks permission", 404: f"Model '{settings.GEMINI_MODEL}' not found",
                   429: "Gemini rate limit / quota reached; try again later"}.get(code, f"Gemini API error {code}")
            log.error("Gemini error %s: %s", code, str(e)[:300])
            raise AIUnavailable(f"{msg}: {str(e)[:160]}") from e
        except (httpx.HTTPError, OSError) as e:
            raise AIUnavailable(f"Could not reach the Gemini API ({type(e).__name__})") from e
        except Exception as e:  # noqa: BLE001 - JSON/validation of model output
            log.exception("Gemini call failed")
            raise AIUnavailable(f"AI response could not be used: {e}") from e
    return inner


def _thinking(effort: str | None):
    level = {"low": "low", "medium": "medium", "high": "high", "xhigh": "high", "max": "high"}.get(
        effort or settings.AI_EFFORT, "medium")
    return types.ThinkingConfig(thinking_level=level)


def _check(resp):
    AIUnavailable = _ai().AIUnavailable
    if not resp.candidates:
        reason = getattr(getattr(resp, "prompt_feedback", None), "block_reason", None)
        raise AIUnavailable(f"Gemini returned no answer (blocked: {reason})")
    fr = str(resp.candidates[0].finish_reason or "")
    if "SAFETY" in fr or "PROHIBITED" in fr or "BLOCKLIST" in fr:
        raise AIUnavailable(f"Gemini declined the request ({fr})")
    if "MAX_TOKENS" in fr:
        raise AIUnavailable("Gemini response was cut off (max tokens)")


@_wrap
def structured(system, user, schema, *, max_tokens=16000, effort=None):
    text = user if isinstance(user, str) else "\n".join(b.get("text", "") for b in user if isinstance(b, dict))
    cfg = types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json",
                                      response_schema=schema, max_output_tokens=max_tokens,
                                      thinking_config=_thinking(effort))
    try:
        resp = client().models.generate_content(model=settings.GEMINI_MODEL, contents=text, config=cfg)
    except gerrors.ClientError as e:
        if getattr(e, "code", None) != 400:
            raise
        # Some schemas use JSON-Schema features the typed schema path doesn't accept; retry with raw JSON schema.
        cfg.response_schema = None
        cfg.response_json_schema = schema.model_json_schema()
        resp = client().models.generate_content(model=settings.GEMINI_MODEL, contents=text, config=cfg)
    _check(resp)
    if getattr(resp, "parsed", None) is not None:
        data = resp.parsed.model_dump() if hasattr(resp.parsed, "model_dump") else resp.parsed
    else:
        data = json.loads(resp.text)
    return schema.model_validate(data)


def _resolve(url: str) -> str:
    """Grounding returns vertexaisearch redirect links; follow them to the real page URL."""
    if "grounding-api-redirect" not in url:
        return url
    try:
        with httpx.Client(timeout=10, follow_redirects=False) as c:
            r = c.get(url)
            loc = r.headers.get("location")
            return loc or url
    except httpx.HTTPError:
        return url


@_wrap
def research(system, user, schema):
    """Two steps: (1) Google-Search-grounded research notes; (2) structured extraction from those notes only."""
    cfg = types.GenerateContentConfig(
        system_instruction=system + "\nCite the source URL next to every fact and person you mention.",
        tools=[types.Tool(google_search=types.GoogleSearch())], thinking_config=_thinking("medium"))
    resp = client().models.generate_content(model=settings.GEMINI_MODEL, contents=user, config=cfg)
    _check(resp)
    notes = resp.text or ""
    gm = getattr(resp.candidates[0], "grounding_metadata", None)
    sources, seen = [], set()
    for ch in (getattr(gm, "grounding_chunks", None) or [])[:20]:
        web = getattr(ch, "web", None)
        if not web or not web.uri:
            continue
        url = _resolve(web.uri)
        if url not in seen:
            seen.add(url)
            sources.append({"url": url, "title": web.title or ""})
    src_list = "\n".join(f"- {s['url']} ({s['title']})" for s in sources)
    parsed = structured(
        system + "\nExtract ONLY facts present in the research notes. For any source_url field use one of the "
        "listed source URLs exactly. Leave fields empty when the notes don't support them.",
        f"<research_notes>\n{notes}\n</research_notes>\n<sources>\n{src_list}\n</sources>", schema)
    return parsed, sources


# ---------- agent chat (Anthropic-shaped transcript <-> Gemini contents) ----------
class _Block(SimpleNamespace):
    def model_dump(self, **_):
        return {k: v for k, v in vars(self).items() if v is not None}


def _to_contents(messages: list) -> list[types.Content]:
    names = {}
    out = []
    for m in messages:
        role = "model" if m["role"] == "assistant" else "user"
        parts = []
        for b in m["content"] if isinstance(m["content"], list) else [{"type": "text", "text": m["content"]}]:
            t = b.get("type")
            sig = base64.b64decode(b["gemini_signature"]) if b.get("gemini_signature") else None
            if t == "text" and b.get("text"):
                parts.append(types.Part(text=b["text"], thought_signature=sig))
            elif t == "tool_use":
                names[b["id"]] = b["name"]
                parts.append(types.Part(function_call=types.FunctionCall(id=b["id"], name=b["name"],
                                                                         args=b.get("input") or {}),
                                        thought_signature=sig))
            elif t == "tool_result":
                content = b.get("content")
                try:
                    payload = json.loads(content) if isinstance(content, str) else content
                except json.JSONDecodeError:
                    payload = content
                if not isinstance(payload, dict):
                    payload = {"result": payload}
                if b.get("is_error"):
                    payload = {"error": payload}
                parts.append(types.Part(function_response=types.FunctionResponse(
                    id=b["tool_use_id"], name=names.get(b["tool_use_id"], "tool"), response=payload)))
        if parts:
            out.append(types.Content(role=role, parts=parts))
    return out


@_wrap
def chat_turn(system, messages, tools, *, max_tokens=16000):
    decls = [types.FunctionDeclaration(name=t["name"], description=t["description"],
                                       parameters_json_schema=t["input_schema"]) for t in tools]
    cfg = types.GenerateContentConfig(system_instruction=system, tools=[types.Tool(function_declarations=decls)],
                                      automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                                      max_output_tokens=max_tokens, thinking_config=_thinking(None))
    resp = client().models.generate_content(model=settings.GEMINI_MODEL, contents=_to_contents(messages), config=cfg)
    _check(resp)
    blocks = []
    for part in resp.candidates[0].content.parts or []:
        if getattr(part, "thought", False):
            continue
        sig = base64.b64encode(part.thought_signature).decode() if getattr(part, "thought_signature", None) else None
        if part.function_call:
            fc = part.function_call
            blocks.append(_Block(type="tool_use", id=fc.id or f"g_{uuid.uuid4().hex[:12]}", name=fc.name,
                                 input=dict(fc.args or {}), gemini_signature=sig))
        elif part.text:
            blocks.append(_Block(type="text", text=part.text, gemini_signature=sig))
    stop = "tool_use" if any(b.type == "tool_use" for b in blocks) else "end_turn"
    return SimpleNamespace(stop_reason=stop, content=blocks)


def status() -> dict:
    try:
        client().models.get(model=settings.GEMINI_MODEL)
        return {"state": "connected", "detail": "Gemini model reachable", "model": settings.GEMINI_MODEL}
    except gerrors.APIError as e:
        return {"state": "failing", "detail": f"Gemini error {getattr(e, 'code', '')}: {str(e)[:150]}",
                "model": settings.GEMINI_MODEL}
    except Exception as e:  # noqa: BLE001
        return {"state": "failing", "detail": str(e)[:200], "model": settings.GEMINI_MODEL}
