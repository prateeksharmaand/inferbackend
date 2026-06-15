from __future__ import annotations

import asyncio
import time
from collections import deque
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import redis.asyncio as aioredis
import structlog

from app.config import get_settings
from app.crawler.prefix import (
    SEED_PREFIXES,
    children_needed,
    expand_prefix,
    normalize_prefix,
)
from app.schemas.drug import EkaDrug
from app.utils.auth import CookieRotator
from app.utils.http import EkaApiClient, _extract_items

if TYPE_CHECKING:
    from app.services.drug_service import DrugService
    from app.services.crawl_service import CrawlService

logger = structlog.get_logger(__name__)
settings = get_settings()

# Redis key namespaces
REDIS_QUEUE_KEY = "crawler:prefix_queue"
REDIS_PROCESSED_KEY = "crawler:processed_prefixes"
REDIS_RUNNING_KEY = "crawler:running"
REDIS_STATS_KEY = "crawler:live_stats"


class CrawlEngine:
    """
    Agentic prefix-expansion crawler.

    Architecture:
    - Redis LPUSH/BRPOP for crash-safe queue
    - Redis SET for dedup of processed prefixes
    - N concurrent asyncio workers pulling from queue
    - PostgreSQL for persistent drug storage
    """

    def __init__(
        self,
        drug_service: "DrugService",
        crawl_service: "CrawlService",
        redis: aioredis.Redis,
    ) -> None:
        self._drugs = drug_service
        self._crawl = crawl_service
        self._redis = redis
        self._rotator = CookieRotator.from_settings()
        self._client = EkaApiClient(self._rotator)
        self._stop_event = asyncio.Event()
        self._semaphore = asyncio.Semaphore(settings.crawler_concurrency)

        # In-memory metrics
        self._requests_sent: int = 0
        self._api_errors: int = 0
        self._new_drugs: int = 0
        self._start_time: float = time.monotonic()
        self._request_times: deque[float] = deque(maxlen=120)  # rolling 2-min window

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(
        self,
        resume: bool = True,
        reset: bool = False,
        seed_prefixes: list[str] | None = None,
    ) -> None:
        if reset:
            await self._reset_state()

        await self._redis.set(REDIS_RUNNING_KEY, "1")
        await self._crawl.mark_started()

        # Seed queue if empty or forced
        queue_len = await self._redis.llen(REDIS_QUEUE_KEY)
        if not resume or queue_len == 0:
            seeds = seed_prefixes or SEED_PREFIXES
            await self._seed_queue(seeds)
            logger.info("queue_seeded", count=len(seeds))

        logger.info(
            "crawler_started",
            resume=resume,
            queue_size=await self._redis.llen(REDIS_QUEUE_KEY),
            concurrency=settings.crawler_concurrency,
        )

        workers = [
            asyncio.create_task(self._worker(worker_id=i))
            for i in range(settings.crawler_concurrency)
        ]

        stats_task = asyncio.create_task(self._stats_updater())

        try:
            await asyncio.gather(*workers)
        except asyncio.CancelledError:
            pass
        finally:
            stats_task.cancel()
            self._stop_event.set()
            await self._redis.delete(REDIS_RUNNING_KEY)
            await self._client.close()
            await self._flush_stats()
            logger.info("crawler_stopped")

    async def stop(self) -> None:
        self._stop_event.set()
        await self._redis.delete(REDIS_RUNNING_KEY)
        logger.info("stop_requested")

    # ── Workers ───────────────────────────────────────────────────────────────

    async def _worker(self, worker_id: int) -> None:
        log = logger.bind(worker=worker_id)
        log.info("worker_started")

        while not self._stop_event.is_set():
            # BRPOP with 2s timeout — returns (key, value) or None
            item = await self._redis.brpop(REDIS_QUEUE_KEY, timeout=2)
            if item is None:
                # Queue empty — check if we should exit
                queue_len = await self._redis.llen(REDIS_QUEUE_KEY)
                if queue_len == 0:
                    log.info("worker_idle_exit")
                    break
                continue

            _, prefix_bytes = item
            prefix = prefix_bytes.decode() if isinstance(prefix_bytes, bytes) else prefix_bytes

            # Skip already-processed
            already = await self._redis.sismember(REDIS_PROCESSED_KEY, prefix)
            if already:
                continue

            async with self._semaphore:
                await self._process_prefix(prefix, log)

        log.info("worker_done")

    async def _process_prefix(self, prefix: str, log: structlog.BoundLogger) -> None:
        depth = len(prefix)
        if depth > settings.crawler_max_depth:
            log.debug("max_depth_skip", prefix=prefix, depth=depth)
            await self._mark_processed(prefix)
            return

        await self._crawl.upsert_prefix(prefix, depth=depth, status="processing")

        try:
            # Fetch all pages for this prefix
            raw_items = await self._client.search_all_pages(prefix)
            count = len(raw_items)

            self._requests_sent += 1
            self._request_times.append(time.monotonic())

            log.info("prefix_done", prefix=prefix, depth=depth, results=count)

            # Store drugs
            new = await self._store_drugs(raw_items)
            self._new_drugs += new

            # Expand if at API limit
            if children_needed(count, settings.crawler_api_limit) and depth < settings.crawler_max_depth:
                children = expand_prefix(prefix)
                await self._enqueue_prefixes(children)
                log.debug("prefix_expanded", prefix=prefix, children=len(children))

            await self._crawl.upsert_prefix(
                prefix, depth=depth, result_count=count, status="done"
            )
            await self._mark_processed(prefix)

        except Exception as exc:
            self._api_errors += 1
            log.error("prefix_error", prefix=prefix, error=str(exc))
            await self._crawl.upsert_prefix(
                prefix, depth=depth, status="failed", error=str(exc)
            )
            # Re-queue once for transient errors, otherwise give up
            attempts = await self._crawl.get_attempts(prefix)
            if attempts < 3:
                await self._redis.lpush(REDIS_QUEUE_KEY, prefix)

    # ── Drug storage ──────────────────────────────────────────────────────────

    async def _store_drugs(self, raw_items: list[dict]) -> int:
        new_count = 0
        for raw in raw_items:
            try:
                eka = EkaDrug.model_validate(raw)
                drug = eka.to_drug_create(raw)
                if drug:
                    inserted = await self._drugs.upsert(drug)
                    if inserted:
                        new_count += 1
            except Exception as exc:
                logger.warning("drug_parse_error", error=str(exc), raw_id=raw.get("id"))
        return new_count

    # ── Queue helpers ─────────────────────────────────────────────────────────

    async def _seed_queue(self, prefixes: list[str]) -> None:
        if prefixes:
            await self._redis.lpush(REDIS_QUEUE_KEY, *prefixes)

    async def _enqueue_prefixes(self, prefixes: list[str]) -> None:
        # Only enqueue prefixes not already processed
        pipe = self._redis.pipeline()
        for p in prefixes:
            pipe.sismember(REDIS_PROCESSED_KEY, p)
        results = await pipe.execute()

        to_enqueue = [p for p, done in zip(prefixes, results) if not done]
        if to_enqueue:
            await self._redis.lpush(REDIS_QUEUE_KEY, *to_enqueue)

    async def _mark_processed(self, prefix: str) -> None:
        await self._redis.sadd(REDIS_PROCESSED_KEY, prefix)

    # ── State management ──────────────────────────────────────────────────────

    async def _reset_state(self) -> None:
        await self._redis.delete(REDIS_QUEUE_KEY)
        await self._redis.delete(REDIS_PROCESSED_KEY)
        await self._redis.delete(REDIS_RUNNING_KEY)
        await self._crawl.reset_all_prefixes()
        logger.info("state_reset")

    # ── Stats ─────────────────────────────────────────────────────────────────

    async def _stats_updater(self) -> None:
        while not self._stop_event.is_set():
            await asyncio.sleep(15)
            await self._flush_stats()

    async def _flush_stats(self) -> None:
        queue_size = await self._redis.llen(REDIS_QUEUE_KEY)
        processed = await self._redis.scard(REDIS_PROCESSED_KEY)
        rpm = self._compute_rpm()

        await self._crawl.update_stats(
            requests_sent=self._requests_sent,
            api_errors=self._api_errors,
            new_drugs=self._new_drugs,
            requests_per_minute=rpm,
        )

        # Store live stats in Redis for fast dashboard reads
        await self._redis.hset(
            REDIS_STATS_KEY,
            mapping={
                "queue_size": queue_size,
                "processed_prefixes": processed,
                "requests_sent": self._requests_sent,
                "api_errors": self._api_errors,
                "new_drugs": self._new_drugs,
                "rpm": round(rpm, 2),
                "updated_at": datetime.now(tz=timezone.utc).isoformat(),
            },
        )

    def _compute_rpm(self) -> float:
        now = time.monotonic()
        recent = [t for t in self._request_times if now - t <= 60]
        return float(len(recent))

    async def get_live_stats(self) -> dict:
        raw = await self._redis.hgetall(REDIS_STATS_KEY)
        return {k.decode(): v.decode() for k, v in raw.items()} if raw else {}

    async def is_running(self) -> bool:
        return bool(await self._redis.exists(REDIS_RUNNING_KEY))

    async def queue_size(self) -> int:
        return await self._redis.llen(REDIS_QUEUE_KEY)
