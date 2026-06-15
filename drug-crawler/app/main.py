from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings
from app.database.session import engine
from app.models.drug import Base
from app.utils.logging import configure_logging

configure_logging()
logger = structlog.get_logger(__name__)
settings = get_settings()

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialized")
    return _redis


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global _redis

    logger.info("app_starting", env=settings.app_env)

    # Create DB tables (idempotent — Alembic handles migrations in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Redis connection
    _redis = aioredis.from_url(settings.redis_url, decode_responses=False)
    await _redis.ping()
    logger.info("redis_connected", url=settings.redis_url)

    yield

    # Cleanup
    if _redis:
        await _redis.aclose()
    await engine.dispose()
    logger.info("app_shutdown")


app = FastAPI(
    title="Eka Drug Crawler",
    description="Autonomous crawler for Eka Care drug database",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/", tags=["root"])
async def root() -> dict:
    return {
        "service": "eka-drug-crawler",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
