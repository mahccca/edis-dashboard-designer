"""Seed builtin gauge + image component definitions.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-04
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BUILTIN = Path(__file__).resolve().parents[2] / "app" / "modules" / "components" / "builtin"
SEEDS = [
    ("gauge@1.0.0.json", "01929f3a-1000-7000-8000-000000000002", "01929f3a-1001-7000-8000-000000000002"),
    ("image@1.0.0.json", "01929f3a-1000-7000-8000-000000000003", "01929f3a-1001-7000-8000-000000000003"),
]


def upgrade() -> None:
    import uuid

    definitions = sa.table(
        "component_definitions",
        sa.column("id", sa.Uuid),
        sa.column("project_id", sa.Uuid),
        sa.column("key", sa.Text),
        sa.column("category", sa.Text),
        sa.column("name", postgresql.JSONB),
        sa.column("status", sa.Text),
    )
    versions = sa.table(
        "component_versions",
        sa.column("id", sa.Uuid),
        sa.column("definition_id", sa.Uuid),
        sa.column("version", sa.Text),
        sa.column("major", sa.Integer),
        sa.column("minor", sa.Integer),
        sa.column("patch", sa.Integer),
        sa.column("status", sa.Text),
        sa.column("schema_version", sa.Integer),
        sa.column("renderer_id", sa.Text),
        sa.column("spec", postgresql.JSONB),
        sa.column("spec_hash", sa.LargeBinary),
        sa.column("lock_version", sa.Integer),
        sa.column("published_at", sa.DateTime(timezone=True)),
    )
    now = datetime.now(UTC)
    for filename, def_id, ver_id in SEEDS:
        spec = json.loads((BUILTIN / filename).read_text(encoding="utf-8"))
        major, minor, patch = (int(x) for x in spec["version"].split("."))
        canonical = json.dumps(spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        op.bulk_insert(definitions, [{
            "id": uuid.UUID(def_id),
            "project_id": None,
            "key": spec["key"],
            "category": spec["category"],
            "name": spec["name"],
            "status": "active",
        }])
        op.bulk_insert(versions, [{
            "id": uuid.UUID(ver_id),
            "definition_id": uuid.UUID(def_id),
            "version": spec["version"],
            "major": major,
            "minor": minor,
            "patch": patch,
            "status": "published",
            "schema_version": spec["schemaVersion"],
            "renderer_id": spec["rendererId"],
            "spec": spec,
            "spec_hash": hashlib.sha256(canonical).digest(),
            "lock_version": 1,
            "published_at": now,
        }])


def downgrade() -> None:
    import uuid

    for _, def_id, ver_id in SEEDS:
        op.execute(sa.text("DELETE FROM component_versions WHERE id = :id").bindparams(id=uuid.UUID(ver_id)))
        op.execute(sa.text("DELETE FROM component_definitions WHERE id = :id").bindparams(id=uuid.UUID(def_id)))
