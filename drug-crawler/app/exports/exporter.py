from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

import orjson
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.drug import Drug
from app.services.drug_service import DrugService

logger = structlog.get_logger(__name__)


class ExportService:
    def __init__(self, session: AsyncSession) -> None:
        self._db = session
        self._drug_svc = DrugService(session)

    async def _fetch_all(self, q: str | None = None) -> list[Drug]:
        drugs = []
        page = 1
        while True:
            batch, total = await self._drug_svc.list_drugs(page=page, page_size=1000, q=q)
            drugs.extend(batch)
            if len(drugs) >= total or not batch:
                break
            page += 1
        return drugs

    def _drug_to_row(self, drug: Drug) -> dict[str, Any]:
        return {
            "id": drug.id,
            "name": drug.name or "",
            "manufacturer_name": drug.manufacturer_name or "",
            "product_type": drug.product_type or "",
            "product_sku": drug.product_sku or "",
            "generic_name": drug.generic_name or "",
            "generic_id": drug.generic_id or "",
            "dosage_form": drug.dosage_form or "",
            "created_at": drug.created_at.isoformat() if drug.created_at else "",
            "updated_at": drug.updated_at.isoformat() if drug.updated_at else "",
        }

    async def export_csv(self, q: str | None = None) -> bytes:
        drugs = await self._fetch_all(q=q)
        buf = io.StringIO()
        if not drugs:
            return b""

        fields = list(self._drug_to_row(drugs[0]).keys())
        writer = csv.DictWriter(buf, fieldnames=fields)
        writer.writeheader()
        for drug in drugs:
            writer.writerow(self._drug_to_row(drug))

        logger.info("csv_exported", count=len(drugs))
        return buf.getvalue().encode("utf-8")

    async def export_json(self, q: str | None = None) -> bytes:
        drugs = await self._fetch_all(q=q)
        rows = [self._drug_to_row(d) for d in drugs]
        logger.info("json_exported", count=len(drugs))
        return orjson.dumps(rows, option=orjson.OPT_INDENT_2)

    async def export_excel(self, q: str | None = None) -> bytes:
        try:
            import pandas as pd
        except ImportError:
            raise RuntimeError("pandas and openpyxl required for Excel export")

        drugs = await self._fetch_all(q=q)
        rows = [self._drug_to_row(d) for d in drugs]
        df = pd.DataFrame(rows)

        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Drugs")
            # Auto-fit column widths
            ws = writer.sheets["Drugs"]
            for col in ws.columns:
                max_len = max(len(str(cell.value or "")) for cell in col)
                ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 60)

        logger.info("excel_exported", count=len(drugs))
        return buf.getvalue()
