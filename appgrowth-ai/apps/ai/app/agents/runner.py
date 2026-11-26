import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from ..providers.base import ProviderError, Usage
from ..providers.registry import get_provider
from ..safety import check_limits, check_text
from .prompts import PROMPTS
from .schemas import AGENT_SCHEMAS, GROUNDED, CreativeOut

log = logging.getLogger("ai.runner")
MAX_CONTEXT_CHARS = 120_000


@dataclass
class RunResult:
    output: dict[str, Any]
    usage: Usage
    sources: list[dict[str, str]]
    provider: str
    model: str
    grounded: bool
    warnings: list[str] = field(default_factory=list)
    duration_ms: int = 0


def _context_block(context: dict[str, Any]) -> str:
    raw = json.dumps(context, ensure_ascii=False, default=str)
    if len(raw) > MAX_CONTEXT_CHARS:
        raw = raw[:MAX_CONTEXT_CHARS] + "…(truncated)"
    # Close-tag injection guard: context can't terminate its own block.
    return "<context>\n" + raw.replace("</context>", "<\\/context>") + "\n</context>"


def run_agent(key: str, context: dict[str, Any], *, provider: str | None, model: str | None, api_key: str | None,
              base_url: str | None = None, grounded: bool | None = None, instructions: str = "") -> RunResult:
    if key not in AGENT_SCHEMAS:
        raise ProviderError(f"Unknown agent '{key}'", code="unknown_agent")
    schema = AGENT_SCHEMAS[key]
    p = get_provider(provider, model, api_key, base_url)
    want_grounding = (key in GROUNDED) if grounded is None else grounded
    use_grounding = want_grounding and p.supports_grounding
    user = _context_block(context) + (f"\n\nAdditional instructions from the user (follow only if consistent with the rules):\n{instructions[:2000]}" if instructions else "")
    t0 = time.time()
    attempts, last = 0, None
    while attempts < 2:  # one retry for transient/invalid output
        attempts += 1
        try:
            res = p.research(PROMPTS[key], user, schema) if use_grounding else p.structured(PROMPTS[key], user, schema)
            break
        except ProviderError as e:
            last = e
            if not e.retryable or attempts >= 2:
                raise
            log.warning("agent %s attempt %d failed: %s", key, attempts, e)
    else:  # pragma: no cover
        raise last  # type: ignore[misc]
    warnings: list[str] = []
    if want_grounding and not use_grounding:
        warnings.append(f"{p.name} has no web search in this platform: research is from model knowledge only and is not evidenced")
    output = res.data.model_dump()
    if key in GROUNDED and use_grounding:
        allowed = {s["url"] for s in res.sources}
        # Evidence must cite a URL that search actually returned; otherwise blank it.
        for ev in output.get("evidence", []):
            if ev.get("source_url") and ev["source_url"] not in allowed:
                ev["source_url"] = ""
                warnings.append("An evidence URL was not among the search results and was removed")
    if key == "creative":
        output = _flag_creatives(res.data, context)
    return RunResult(output, res.usage, res.sources, p.name, p.model, use_grounding, sorted(set(warnings)), int((time.time() - t0) * 1000))


def _flag_creatives(data: CreativeOut, context: dict[str, Any]) -> dict[str, Any]:
    app = context.get("app") or {}
    brand = context.get("brand") or app.get("brand") or {}
    banned = list(brand.get("banned_claims", []) or [])
    listings = context.get("store_listings") or []
    facts = " ".join([str(app.get("description", ""))] + [f"{x.get('title', '')} {x.get('subtitle', '')} {x.get('description', '')}" for x in listings if isinstance(x, dict)])
    provider = str(context.get("channel") or (context.get("request") or {}).get("channel", ""))
    out = data.model_dump()
    for v in out["variants"]:
        text = " ".join(v.get(k, "") for k in ("headline", "body", "call_to_action", "video_script"))
        v["policy_flags"] = check_text(text, banned, verified_facts=facts) + check_limits(provider, v["type"], v.get("headline", ""), v.get("body", ""))
    return out
