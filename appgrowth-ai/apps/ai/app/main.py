import base64
import hmac
import logging
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .agents.runner import run_agent
from .agents.schemas import AGENT_SCHEMAS
from .config import settings
from .providers.base import ProviderError
from .providers.registry import configured, get_provider

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ai")
app = FastAPI(title="AppGrowth AI service", version="1.0", docs_url=None, redoc_url=None, openapi_url=None)


def auth(authorization: str = Header("")):
    """Internal service: only the AppGrowth API (shared bearer token on the private Docker network) may call it."""
    want = settings.AI_SERVICE_TOKEN
    if not want or not hmac.compare_digest(authorization.encode(), f"Bearer {want}".encode()):
        raise HTTPException(401, "unauthorized")


@app.exception_handler(ProviderError)
async def provider_error(_: Request, e: ProviderError):
    status = 503 if e.code == "not_configured" else 422 if e.code in ("refused", "unsupported", "unknown_agent") else 502
    return JSONResponse(status_code=status, content={"error": {"code": e.code, "message": str(e), "retryable": e.retryable}})


class Prices(BaseModel):
    input_per_mtok: float = 0  # USD per million tokens
    output_per_mtok: float = 0
    per_unit: float = 0        # USD per image / per video second


class ProviderSel(BaseModel):
    provider: str | None = None
    model: str | None = None
    api_key: str | None = Field(None, repr=False)
    base_url: str | None = None
    prices: Prices = Prices()


class AgentRun(ProviderSel):
    context: dict[str, Any]
    grounded: bool | None = None
    instructions: str = ""


def cost_micros(p: Prices, input_tokens: int, output_tokens: int, units: int = 0) -> int:
    return round((input_tokens * p.input_per_mtok + output_tokens * p.output_per_mtok) + units * p.per_unit * 1_000_000)


@app.get("/health")
def health():
    return {"status": "ok", "providers_with_env_keys": configured(), "agents": sorted(AGENT_SCHEMAS)}


@app.post("/v1/agents/{key}/run", dependencies=[Depends(auth)])
async def run(key: str, body: AgentRun):
    r = await run_in_threadpool(run_agent, key, body.context, provider=body.provider, model=body.model, api_key=body.api_key,
                                base_url=body.base_url, grounded=body.grounded, instructions=body.instructions)
    log.info("agent=%s provider=%s model=%s in=%d out=%d ms=%d", key, r.provider, r.model, r.usage.input_tokens, r.usage.output_tokens, r.duration_ms)
    return {"output": r.output, "usage": {"input_tokens": r.usage.input_tokens, "output_tokens": r.usage.output_tokens},
            "cost_micros": cost_micros(body.prices, r.usage.input_tokens, r.usage.output_tokens), "sources": r.sources,
            "provider": r.provider, "model": r.model, "grounded": r.grounded, "warnings": r.warnings, "duration_ms": r.duration_ms}


class MediaReq(ProviderSel):
    kind: Literal["image", "video"]
    prompt: str = Field(min_length=10, max_length=4000)
    size: str = "1024x1024"
    n: int = Field(1, ge=1, le=4)
    aspect_ratio: str = "9:16"
    seconds: int = Field(8, ge=4, le=16)


@app.post("/v1/media", dependencies=[Depends(auth)])
async def media(body: MediaReq):
    p = get_provider(body.provider, body.model, body.api_key, body.base_url)
    safe_prompt = body.prompt + "\nShow the product honestly. No text overlays with claims, no fake ratings, no real people's likenesses."
    if body.kind == "image":
        r = await run_in_threadpool(p.image, safe_prompt, size=body.size, n=body.n)
    else:
        r = await run_in_threadpool(p.video, safe_prompt, aspect_ratio=body.aspect_ratio, seconds=body.seconds)
    return {"items": [{"mime": m, "base64": base64.b64encode(b).decode()} for b, m in r.items], "units": r.units,
            "usage": {"input_tokens": r.usage.input_tokens, "output_tokens": r.usage.output_tokens},
            "cost_micros": cost_micros(body.prices, r.usage.input_tokens, r.usage.output_tokens, r.units), "provider": p.name, "model": p.model}


@app.post("/v1/providers/check", dependencies=[Depends(auth)])
async def check(body: ProviderSel):
    """Cheap connectivity check used by the Super Admin AI settings page."""
    class Ping(BaseModel):
        ok: bool

    p = get_provider(body.provider, body.model, body.api_key, body.base_url)
    r = await run_in_threadpool(p.structured, "Reply with ok=true.", "ping", Ping, max_tokens=2048)  # room for model reasoning tokens
    return {"ok": bool(r.data.ok), "provider": p.name, "model": p.model, "usage": {"input_tokens": r.usage.input_tokens, "output_tokens": r.usage.output_tokens}}
