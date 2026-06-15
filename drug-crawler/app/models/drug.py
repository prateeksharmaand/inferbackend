from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class PrefixStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"


class Drug(Base):
    __tablename__ = "drugs"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str | None] = mapped_column(Text)
    manufacturer_name: Mapped[str | None] = mapped_column(Text)
    product_type: Mapped[str | None] = mapped_column(String(64))
    product_sku: Mapped[str | None] = mapped_column(String(128))
    generic_name: Mapped[str | None] = mapped_column(Text)
    generic_id: Mapped[str | None] = mapped_column(String(128))
    dosage_form: Mapped[str | None] = mapped_column(String(128))
    raw_json: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_drugs_name", "name"),
        Index("idx_drugs_manufacturer", "manufacturer_name"),
        Index("idx_drugs_generic_id", "generic_id"),
        Index("idx_drugs_product_type", "product_type"),
    )


class CrawlPrefix(Base):
    __tablename__ = "crawl_prefixes"

    prefix: Mapped[str] = mapped_column(String(64), primary_key=True)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[PrefixStatus] = mapped_column(
        Enum(PrefixStatus, name="prefix_status_enum"),
        default=PrefixStatus.pending,
    )
    last_attempt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_prefix_status", "status"),
        Index("idx_prefix_depth", "depth"),
    )


class CrawlStats(Base):
    __tablename__ = "crawl_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    total_drugs: Mapped[int] = mapped_column(BigInteger, default=0)
    total_prefixes: Mapped[int] = mapped_column(BigInteger, default=0)
    done_prefixes: Mapped[int] = mapped_column(BigInteger, default=0)
    requests_sent: Mapped[int] = mapped_column(BigInteger, default=0)
    api_errors: Mapped[int] = mapped_column(BigInteger, default=0)
    new_drugs_this_run: Mapped[int] = mapped_column(BigInteger, default=0)
    requests_per_minute: Mapped[float] = mapped_column(Float, default=0.0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
