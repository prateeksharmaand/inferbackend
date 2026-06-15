from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ── Drug ──────────────────────────────────────────────────────────────────────

class DrugBase(BaseModel):
    id: str
    name: str | None = None
    manufacturer_name: str | None = None
    product_type: str | None = None
    product_sku: str | None = None
    generic_name: str | None = None
    generic_id: str | None = None
    dosage_form: str | None = None


class DrugCreate(DrugBase):
    raw_json: dict[str, Any] | None = None


class DrugRead(DrugBase):
    model_config = ConfigDict(from_attributes=True)

    raw_json: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class DrugListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[DrugRead]


# ── API response parsing ──────────────────────────────────────────────────────

class EkaDosage(BaseModel):
    dosage_form: str | None = None

    model_config = ConfigDict(extra="allow")


class EkaDrug(BaseModel):
    id: str | None = None
    name: str | None = None
    manufacturer_name: str | None = None
    product_type: str | None = None
    product_sku: str | None = None
    generic_name: str | None = None
    generic_id: str | None = None
    dosage: EkaDosage | None = None

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    def to_drug_create(self, raw: dict[str, Any]) -> DrugCreate | None:
        if not self.id:
            return None
        return DrugCreate(
            id=self.id,
            name=self.name,
            manufacturer_name=self.manufacturer_name,
            product_type=self.product_type,
            product_sku=self.product_sku,
            generic_name=self.generic_name,
            generic_id=self.generic_id,
            dosage_form=self.dosage.dosage_form if self.dosage else None,
            raw_json=raw,
        )


class EkaApiResponse(BaseModel):
    data: list[dict[str, Any]] = Field(default_factory=list)
    total: int | None = None
    page: int | None = None
    limit: int | None = None
    next: str | None = None
    cursor: str | None = None
    offset: int | None = None

    model_config = ConfigDict(extra="allow")


# ── Crawl ─────────────────────────────────────────────────────────────────────

class CrawlPrefixRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    prefix: str
    depth: int
    result_count: int
    status: str
    last_attempt: datetime | None
    attempts: int
    error_message: str | None
    created_at: datetime


class CrawlStatsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    total_drugs: int
    total_prefixes: int
    done_prefixes: int
    requests_sent: int
    api_errors: int
    new_drugs_this_run: int
    requests_per_minute: float
    started_at: datetime | None
    updated_at: datetime


class CrawlStartRequest(BaseModel):
    resume: bool = Field(default=True, description="Resume from last state")
    reset: bool = Field(default=False, description="Full reset — clears all state")
    prefixes: list[str] | None = Field(
        default=None, description="Seed specific prefixes instead of a-z 0-9"
    )


class HealthResponse(BaseModel):
    status: str
    db: str
    redis: str
    queue_size: int
    active_workers: int
    total_drugs: int
