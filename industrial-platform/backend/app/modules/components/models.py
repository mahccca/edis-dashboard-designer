import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, LargeBinary, Text, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, uuid7


class ComponentDefinition(CreatedAt, Base):
    __tablename__ = "component_definitions"
    __table_args__ = (
        Index("uq_component_definitions_project_key", "project_id", "key", unique=True,
              postgresql_where=text("project_id IS NOT NULL")),
        Index("uq_component_definitions_global_key", "key", unique=True,
              postgresql_where=text("project_id IS NULL")),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"), comment="NULL = global built-in library")
    key: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    name: Mapped[Any] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, default="active")


class ComponentVersion(CreatedAt, Base):
    __tablename__ = "component_versions"
    __table_args__ = (UniqueConstraint("definition_id", "major", "minor", "patch"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    definition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("component_definitions.id"), index=True)
    version: Mapped[str] = mapped_column(Text)
    major: Mapped[int] = mapped_column(Integer)
    minor: Mapped[int] = mapped_column(Integer)
    patch: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, default="draft")
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    renderer_id: Mapped[str] = mapped_column(Text)
    spec: Mapped[dict[str, Any]] = mapped_column(JSONB)
    spec_hash: Mapped[bytes] = mapped_column(LargeBinary)
    lock_version: Mapped[int] = mapped_column(Integer, default=1)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
