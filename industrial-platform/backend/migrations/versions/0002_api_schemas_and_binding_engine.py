"""API samples/schemas + data_sources description/enabled.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-03
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("data_sources", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "data_sources",
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_table(
        "api_response_samples",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("data_source_id", sa.Uuid(), sa.ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("query_key", sa.Text(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("headers", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("body", postgresql.JSONB(), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ok", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
    )
    op.create_index("ix_api_response_samples_ds_query", "api_response_samples", ["data_source_id", "query_key"])
    op.create_table(
        "api_schemas",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("data_source_id", sa.Uuid(), sa.ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("query_key", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("schema", postgresql.JSONB(), nullable=False),
        sa.Column("inferred_from_sample_id", sa.Uuid(), sa.ForeignKey("api_response_samples.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("data_source_id", "query_key", "version", name="uq_api_schemas_ds_query_version"),
    )
    op.create_index("ix_api_schemas_ds_query", "api_schemas", ["data_source_id", "query_key"])


def downgrade() -> None:
    op.drop_index("ix_api_schemas_ds_query", table_name="api_schemas")
    op.drop_table("api_schemas")
    op.drop_index("ix_api_response_samples_ds_query", table_name="api_response_samples")
    op.drop_table("api_response_samples")
    op.drop_column("data_sources", "enabled")
    op.drop_column("data_sources", "description")
