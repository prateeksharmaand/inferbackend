from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.drug import CrawlPrefix, CrawlStats, Drug, PrefixStatus

logger = structlog.get_logger(__name__)


class CrawlService:
    def __init__(self, session: AsyncSession) -> None:
        self._db = session

    # ── Prefix management ─────────────────────────────────────────────────────

    async def upsert_prefix(
        self,
        prefix: str,
        depth: int = 0,
        result_count: int = 0,
        status: str = "pending",
        error: str | None = None,
    ) -> None:
        now = datetime.now(tz=timezone.utc)
        stmt = (
            pg_insert(CrawlPrefix)
            .values(
                prefix=prefix,
                depth=depth,
                result_count=result_count,
                status=status,
                last_attempt=now,
                attempts=1,
                error_message=error,
                created_at=now,
            )
            .on_conflict_do_update(
                index_elements=["prefix"],
                set_={
                    "depth": depth,
                    "result_count": result_count,
                    "status": status,
                    "last_attempt": now,
                    "attempts": CrawlPrefix.attempts + 1,
                    "error_message": error,
                },
            )
        )
        await self._db.execute(stmt)
        await self._db.commit()

    async def get_attempts(self, prefix: str) -> int:
        result = await self._db.execute(
            select(CrawlPrefix.attempts).where(CrawlPrefix.prefix == prefix)
        )
        val = result.scalar_one_or_none()
        return val or 0

    async def list_prefixes(
        self,
        status: str | None = None,
        page: int = 1,
        page_size: int = 100,
    ) -> tuple[list[CrawlPrefix], int]:
        query = select(CrawlPrefix)
        count_query = select(func.count(CrawlPrefix.prefix))

        if status:
            query = query.where(CrawlPrefix.status == status)
            count_query = count_query.where(CrawlPrefix.status == status)

        total = (await self._db.execute(count_query)).scalar_one()
        query = (
            query.order_by(CrawlPrefix.depth, CrawlPrefix.prefix)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = list((await self._db.execute(query)).scalars().all())
        return rows, total

    async def reset_all_prefixes(self) -> None:
        await self._db.execute(
            update(CrawlPrefix).values(status=PrefixStatus.pending, attempts=0)
        )
        await self._db.commit()

    # ── Stats ─────────────────────────────────────────────────────────────────

    async def get_or_create_stats(self) -> CrawlStats:
        result = await self._db.execute(select(CrawlStats).limit(1))
        stats = result.scalar_one_or_none()
        if stats is None:
            stats = CrawlStats()
            self._db.add(stats)
            await self._db.commit()
            await self._db.refresh(stats)
        return stats

    async def mark_started(self) -> None:
        stats = await self.get_or_create_stats()
        stats.started_at = datetime.now(tz=timezone.utc)
        stats.new_drugs_this_run = 0
        await self._db.commit()

    async def update_stats(
        self,
        requests_sent: int,
        api_errors: int,
        new_drugs: int,
        requests_per_minute: float,
    ) -> None:
        stats = await self.get_or_create_stats()

        # Recompute totals from DB
        drug_count = (await self._db.execute(select(func.count(Drug.id)))).scalar_one()
        prefix_count = (
            await self._db.execute(select(func.count(CrawlPrefix.prefix)))
        ).scalar_one()
        done_count = (
            await self._db.execute(
                select(func.count(CrawlPrefix.prefix)).where(
                    CrawlPrefix.status == PrefixStatus.done
                )
            )
        ).scalar_one()

        stats.total_drugs = drug_count
        stats.total_prefixes = prefix_count
        stats.done_prefixes = done_count
        stats.requests_sent = requests_sent
        stats.api_errors = api_errors
        stats.new_drugs_this_run = new_drugs
        stats.requests_per_minute = requests_per_minute
        stats.updated_at = datetime.now(tz=timezone.utc)

        await self._db.commit()

    async def get_stats(self) -> CrawlStats | None:
        result = await self._db.execute(select(CrawlStats).limit(1))
        return result.scalar_one_or_none()
