from __future__ import annotations

"""
Worker entry point.

Run with:
    python -m app.workers.tasks

Each worker process starts a CrawlEngine and pulls prefixes from Redis.
Multiple worker processes can run concurrently (distributed).
"""

import asyncio
import os
import sys

import redis.asyncio as aioredis
import structlog

from app.config import get_settings
from app.crawler.engine import CrawlEngine
from app.database.session import AsyncSessionLocal
from app.services.crawl_service import CrawlService
from app.services.drug_service import DrugService
from app.utils.logging import configure_logging

logger = structlog.get_logger(__name__)
settings = get_settings()


async def run_worker(worker_id: int = 0, resume: bool = True) -> None:
    configure_logging()
    log = logger.bind(worker_id=worker_id, pid=os.getpid())
    log.info("worker_process_starting")

    redis_client = aioredis.from_url(settings.redis_url, decode_responses=False)

    async with AsyncSessionLocal() as session:
        drug_svc = DrugService(session)
        crawl_svc = CrawlService(session)

        engine = CrawlEngine(
            drug_service=drug_svc,
            crawl_service=crawl_svc,
            redis=redis_client,
        )

        try:
            await engine.start(resume=resume)
        except KeyboardInterrupt:
            log.info("worker_interrupted")
        except Exception as exc:
            log.error("worker_crashed", error=str(exc), exc_info=True)
            sys.exit(1)
        finally:
            await redis_client.aclose()

    log.info("worker_process_done")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Drug crawler worker")
    parser.add_argument("--worker-id", type=int, default=0)
    parser.add_argument("--no-resume", action="store_true", help="Start fresh (don't resume)")
    args = parser.parse_args()

    asyncio.run(run_worker(worker_id=args.worker_id, resume=not args.no_resume))


if __name__ == "__main__":
    main()
