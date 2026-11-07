import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ARRAY, DateTime, ForeignKey, Integer, Text, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, uuid7


class ObjectType(CreatedAt, Base):
    __tablename__ = "industrial_object_types"
    __table_args__ = (UniqueConstraint("project_id", "key"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"))
    key: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    name: Mapped[Any] = mapped_column(JSONB)


class ObjectTypeVersion(CreatedAt, Base):
    __tablename__ = "industrial_object_type_versions"
    __table_args__ = (UniqueConstraint("type_id", "major", "minor", "patch"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("industrial_object_types.id"), index=True)
    version: Mapped[str] = mapped_column(Text)
    major: Mapped[int] = mapped_column(Integer)
    minor: Mapped[int] = mapped_column(Integer)
    patch: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, default="draft")
    spec: Mapped[dict[str, Any]] = mapped_column(JSONB)
    lock_version: Mapped[int] = mapped_column(Integer, default=1)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class IndustrialObject(CreatedAt, Base):
    __tablename__ = "industrial_objects"
    __table_args__ = (UniqueConstraint("project_id", "key"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"))
    type_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("industrial_object_type_versions.id"), index=True)
    key: Mapped[str] = mapped_column(Text)
    name: Mapped[Any] = mapped_column(JSONB)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("industrial_objects.id"), index=True)
    status: Mapped[str] = mapped_column(Text, default="active")
    parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    variable_sources: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    lock_version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ObjectRelation(CreatedAt, Base):
    __tablename__ = "object_relations"
    __table_args__ = (UniqueConstraint("source_object_id", "relation_key", "target_object_id"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    source_object_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("industrial_objects.id", ondelete="CASCADE"))
    relation_key: Mapped[str] = mapped_column(Text)
    target_object_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("industrial_objects.id"), index=True)
