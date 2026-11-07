"""Publish map 1.1.0 — transparent bg + configurable land color.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-04
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BUILTIN = Path(__file__).resolve().parents[2] / "app" / "modules" / "components" / "builtin"
DEF_ID = "01929f3a-1000-7000-8000-000000000005"
VER_ID = "01929f3a-1001-7000-8000-000000000015"


def upgrade() -> None:
    spec = json.loads((BUILTIN / "map@1.1.0.json").read_text(encoding="utf-8"))
    major, minor, patch = (int(x) for x in spec["version"].split("."))
    canonical = json.dumps(spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    now = datetime.now(UTC)
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
    op.bulk_insert(versions, [{
        "id": uuid.UUID(VER_ID),
        "definition_id": uuid.UUID(DEF_ID),
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
    op.execute(
        sa.text(
            "UPDATE component_versions SET status = 'deprecated' "
            "WHERE definition_id = :d AND version = '1.0.0' AND status = 'published'"
        ).bindparams(d=uuid.UUID(DEF_ID))
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE component_versions SET status = 'published' "
            "WHERE definition_id = :d AND version = '1.0.0'"
        ).bindparams(d=uuid.UUID(DEF_ID))
    )
    op.execute(sa.text("DELETE FROM component_versions WHERE id = :id").bindparams(id=uuid.UUID(VER_ID)))
