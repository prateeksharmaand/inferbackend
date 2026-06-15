from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.drug import Drug
from app.schemas.drug import DrugCreate

logger = structlog.get_logger(__name__)


class DrugService:
    def __init__(self, session: AsyncSession) -> None:
        self._db = session

    async def upsert(self, drug: DrugCreate) -> bool:
        """
        Insert or update a drug. Returns True if this was a new insertion.
        Uses PostgreSQL ON CONFLICT DO UPDATE for atomicity.
        """
        stmt = (
            pg_insert(Drug)
            .values(
                id=drug.id,
                name=drug.name,
                manufacturer_name=drug.manufacturer_name,
                product_type=drug.product_type,
                product_sku=drug.product_sku,
                generic_name=drug.generic_name,
                generic_id=drug.generic_id,
                dosage_form=drug.dosage_form,
                raw_json=drug.raw_json,
                created_at=datetime.now(tz=timezone.utc),
                updated_at=datetime.now(tz=timezone.utc),
            )
            .on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": drug.name,
                    "manufacturer_name": drug.manufacturer_name,
                    "product_type": drug.product_type,
                    "product_sku": drug.product_sku,
                    "generic_name": drug.generic_name,
                    "generic_id": drug.generic_id,
                    "dosage_form": drug.dosage_form,
                    "raw_json": drug.raw_json,
                    "updated_at": datetime.now(tz=timezone.utc),
                },
            )
            .returning(
                text("(xmax = 0) AS inserted")  # xmax=0 means fresh insert
            )
        )

        result = await self._db.execute(stmt)
        await self._db.commit()
        row = result.fetchone()
        return bool(row and row[0])

    async def get(self, drug_id: str) -> Drug | None:
        result = await self._db.execute(select(Drug).where(Drug.id == drug_id))
        return result.scalar_one_or_none()

    async def list_drugs(
        self,
        page: int = 1,
        page_size: int = 50,
        q: str | None = None,
        product_type: str | None = None,
    ) -> tuple[list[Drug], int]:
        query = select(Drug)
        count_query = select(func.count(Drug.id))

        if q:
            pattern = f"%{q}%"
            query = query.where(Drug.name.ilike(pattern))
            count_query = count_query.where(Drug.name.ilike(pattern))

        if product_type:
            query = query.where(Drug.product_type == product_type)
            count_query = count_query.where(Drug.product_type == product_type)

        total_result = await self._db.execute(count_query)
        total = total_result.scalar_one()

        query = query.order_by(Drug.name).offset((page - 1) * page_size).limit(page_size)
        result = await self._db.execute(query)
        drugs = list(result.scalars().all())

        return drugs, total

    async def total_count(self) -> int:
        result = await self._db.execute(select(func.count(Drug.id)))
        return result.scalar_one()

    async def bulk_upsert(self, drugs: list[DrugCreate]) -> int:
        """Batch upsert — returns count of new insertions."""
        if not drugs:
            return 0

        values = [
            {
                "id": d.id,
                "name": d.name,
                "manufacturer_name": d.manufacturer_name,
                "product_type": d.product_type,
                "product_sku": d.product_sku,
                "generic_name": d.generic_name,
                "generic_id": d.generic_id,
                "dosage_form": d.dosage_form,
                "raw_json": d.raw_json,
                "created_at": datetime.now(tz=timezone.utc),
                "updated_at": datetime.now(tz=timezone.utc),
            }
            for d in drugs
        ]

        stmt = (
            pg_insert(Drug)
            .values(values)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": pg_insert(Drug).excluded.name,
                    "manufacturer_name": pg_insert(Drug).excluded.manufacturer_name,
                    "raw_json": pg_insert(Drug).excluded.raw_json,
                    "updated_at": datetime.now(tz=timezone.utc),
                },
            )
            .returning(text("(xmax = 0) AS inserted"))
        )

        result = await self._db.execute(stmt)
        await self._db.commit()
        return sum(1 for row in result.fetchall() if row[0])
