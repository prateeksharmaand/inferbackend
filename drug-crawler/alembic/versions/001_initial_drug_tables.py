"""Initial drug crawler tables

Revision ID: 001
Revises:
Create Date: 2026-06-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── prefix_status_enum ────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE prefix_status_enum AS ENUM ('pending', 'processing', 'done', 'failed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    # ── drugs ─────────────────────────────────────────────────────────────────
    op.create_table(
        "drugs",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("name", sa.Text()),
        sa.Column("manufacturer_name", sa.Text()),
        sa.Column("product_type", sa.String(64)),
        sa.Column("product_sku", sa.String(128)),
        sa.Column("generic_name", sa.Text()),
        sa.Column("generic_id", sa.String(128)),
        sa.Column("dosage_form", sa.String(128)),
        sa.Column("raw_json", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_drugs_name", "drugs", ["name"], if_not_exists=True)
    op.create_index("idx_drugs_manufacturer", "drugs", ["manufacturer_name"], if_not_exists=True)
    op.create_index("idx_drugs_generic_id", "drugs", ["generic_id"], if_not_exists=True)
    op.create_index("idx_drugs_product_type", "drugs", ["product_type"], if_not_exists=True)

    # ── crawl_prefixes ────────────────────────────────────────────────────────
    op.create_table(
        "crawl_prefixes",
        sa.Column("prefix", sa.String(64), primary_key=True),
        sa.Column("depth", sa.Integer(), default=0),
        sa.Column("result_count", sa.Integer(), default=0),
        sa.Column(
            "status",
            sa.Enum("pending", "processing", "done", "failed", name="prefix_status_enum"),
            default="pending",
        ),
        sa.Column("last_attempt", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer(), default=0),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_prefix_status", "crawl_prefixes", ["status"], if_not_exists=True)
    op.create_index("idx_prefix_depth", "crawl_prefixes", ["depth"], if_not_exists=True)

    # ── crawl_stats ───────────────────────────────────────────────────────────
    op.create_table(
        "crawl_stats",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("total_drugs", sa.BigInteger(), default=0),
        sa.Column("total_prefixes", sa.BigInteger(), default=0),
        sa.Column("done_prefixes", sa.BigInteger(), default=0),
        sa.Column("requests_sent", sa.BigInteger(), default=0),
        sa.Column("api_errors", sa.BigInteger(), default=0),
        sa.Column("new_drugs_this_run", sa.BigInteger(), default=0),
        sa.Column("requests_per_minute", sa.Float(), default=0.0),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("crawl_stats")
    op.drop_index("idx_prefix_depth", "crawl_prefixes")
    op.drop_index("idx_prefix_status", "crawl_prefixes")
    op.drop_table("crawl_prefixes")
    op.drop_index("idx_drugs_product_type", "drugs")
    op.drop_index("idx_drugs_generic_id", "drugs")
    op.drop_index("idx_drugs_manufacturer", "drugs")
    op.drop_index("idx_drugs_name", "drugs")
    op.drop_table("drugs")
    op.execute("DROP TYPE prefix_status_enum")
