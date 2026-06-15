from __future__ import annotations

import asyncio
from typing import Annotated

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.crawler.engine import (
    REDIS_QUEUE_KEY,
    REDIS_RUNNING_KEY,
    CrawlEngine,
)
from app.database.session import get_db
from app.exports.exporter import ExportService
from app.schemas.drug import (
    CrawlPrefixRead,
    CrawlStartRequest,
    CrawlStatsRead,
    DrugListResponse,
    DrugRead,
    HealthResponse,
)
from app.services.crawl_service import CrawlService
from app.services.drug_service import DrugService

logger = structlog.get_logger(__name__)
router = APIRouter()

# Global crawl task reference (single-process mode)
_crawl_task: asyncio.Task | None = None
_engine: CrawlEngine | None = None


def _get_redis() -> aioredis.Redis:
    from app.main import get_redis
    return get_redis()


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse, tags=["monitoring"])
async def health(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HealthResponse:
    redis = _get_redis()
    db_ok = "ok"
    try:
        await db.execute(__import__("sqlalchemy").text("SELECT 1"))
    except Exception:
        db_ok = "error"

    redis_ok = "ok"
    try:
        await redis.ping()
    except Exception:
        redis_ok = "error"

    queue_size = await redis.llen(REDIS_QUEUE_KEY)
    running = bool(await redis.exists(REDIS_RUNNING_KEY))

    svc = DrugService(db)
    total = await svc.total_count()

    return HealthResponse(
        status="ok" if db_ok == "ok" and redis_ok == "ok" else "degraded",
        db=db_ok,
        redis=redis_ok,
        queue_size=queue_size,
        active_workers=1 if running else 0,
        total_drugs=total,
    )


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", tags=["monitoring"])
async def stats(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    redis = _get_redis()
    crawl_svc = CrawlService(db)
    db_stats = await crawl_svc.get_stats()

    queue_size = await redis.llen(REDIS_QUEUE_KEY)
    running = bool(await redis.exists(REDIS_RUNNING_KEY))

    # Live stats from Redis
    live = await redis.hgetall("crawler:live_stats")
    live_decoded = {k.decode(): v.decode() for k, v in live.items()} if live else {}

    return {
        "running": running,
        "queue_size": queue_size,
        "live": live_decoded,
        "db": CrawlStatsRead.model_validate(db_stats).model_dump() if db_stats else None,
    }


# ── Drugs ─────────────────────────────────────────────────────────────────────

@router.get("/drugs", response_model=DrugListResponse, tags=["drugs"])
async def list_drugs(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    q: str | None = Query(default=None),
    product_type: str | None = Query(default=None),
) -> DrugListResponse:
    svc = DrugService(db)
    drugs, total = await svc.list_drugs(page=page, page_size=page_size, q=q, product_type=product_type)
    return DrugListResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=[DrugRead.model_validate(d) for d in drugs],
    )


@router.get("/search", response_model=DrugListResponse, tags=["drugs"])
async def search_drugs(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(..., min_length=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
) -> DrugListResponse:
    return await list_drugs(db=db, page=page, page_size=page_size, q=q, product_type=None)


# ── Prefixes ──────────────────────────────────────────────────────────────────

@router.get("/prefixes", tags=["crawl"])
async def list_prefixes(
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=1000),
) -> dict:
    svc = CrawlService(db)
    rows, total = await svc.list_prefixes(status=status, page=page, page_size=page_size)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [CrawlPrefixRead.model_validate(r).model_dump() for r in rows],
    }


# ── Crawl control ─────────────────────────────────────────────────────────────

@router.post("/crawl/start", tags=["crawl"])
async def start_crawl(
    body: CrawlStartRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    global _crawl_task, _engine

    redis = _get_redis()
    running = bool(await redis.exists(REDIS_RUNNING_KEY))
    if running:
        return {"status": "already_running", "message": "Crawler is already running"}

    drug_svc = DrugService(db)
    crawl_svc = CrawlService(db)
    _engine = CrawlEngine(drug_service=drug_svc, crawl_service=crawl_svc, redis=redis)

    _crawl_task = asyncio.create_task(
        _engine.start(
            resume=body.resume,
            reset=body.reset,
            seed_prefixes=body.prefixes,
        )
    )

    logger.info("crawl_started_via_api", resume=body.resume, reset=body.reset)
    return {"status": "started", "resume": body.resume, "reset": body.reset}


@router.post("/crawl/stop", tags=["crawl"])
async def stop_crawl() -> dict:
    global _engine, _crawl_task
    redis = _get_redis()

    if _engine:
        await _engine.stop()
    if _crawl_task and not _crawl_task.done():
        _crawl_task.cancel()
        try:
            await _crawl_task
        except asyncio.CancelledError:
            pass

    await redis.delete(REDIS_RUNNING_KEY)
    return {"status": "stopped"}


# ── Exports ───────────────────────────────────────────────────────────────────

@router.get("/export/csv", tags=["export"])
async def export_csv(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = Query(default=None),
) -> Response:
    svc = ExportService(db)
    data = await svc.export_csv(q=q)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=drugs.csv"},
    )


@router.get("/export/json", tags=["export"])
async def export_json_file(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = Query(default=None),
) -> Response:
    svc = ExportService(db)
    data = await svc.export_json(q=q)
    return Response(
        content=data,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=drugs.json"},
    )


@router.get("/export/excel", tags=["export"])
async def export_excel(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = Query(default=None),
) -> Response:
    svc = ExportService(db)
    data = await svc.export_excel(q=q)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=drugs.xlsx"},
    )
